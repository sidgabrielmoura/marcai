import {
  initializeApp,
  getApps,
  cert,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import {
  getMessaging,
  type Messaging,
  type MulticastMessage,
  type SendResponse,
} from "firebase-admin/messaging";
import fs from "fs";
import path from "path";

let adminApp: App | null = null;

function getServiceAccount(): ServiceAccount | null {
  // 1. Tenta carregar por JSON string ou base64 na variável de ambiente (ideal para Vercel / CI / Produção)
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      let raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim();
      if (
        (raw.startsWith('"') && raw.endsWith('"')) ||
        (raw.startsWith("'") && raw.endsWith("'"))
      ) {
        raw = raw.slice(1, -1).trim();
      }
      const jsonStr = raw.startsWith("{")
        ? raw
        : Buffer.from(raw, "base64").toString("utf-8");
      const parsed = JSON.parse(jsonStr);
      const privateKey = (parsed.privateKey || parsed.private_key || "").replace(
        /\\n/g,
        "\n"
      );
      return {
        ...parsed,
        projectId: parsed.projectId || parsed.project_id,
        project_id: parsed.projectId || parsed.project_id,
        clientEmail: parsed.clientEmail || parsed.client_email,
        client_email: parsed.clientEmail || parsed.client_email,
        privateKey,
        private_key: privateKey,
      };
    } catch (e) {
      console.error("[Firebase Admin] FIREBASE_SERVICE_ACCOUNT_KEY inválida:", e);
    }
  }

  // 2. Tenta carregar pelo caminho do arquivo JSON definido em variável ou padrão local
  const serviceAccountPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    "marcai-a880a-firebase-adminsdk-fbsvc-23b013e242.json";

  const resolvedPath = path.isAbsolute(serviceAccountPath)
    ? serviceAccountPath
    : path.resolve(/*turbopackIgnore: true*/ process.cwd(), serviceAccountPath);

  if (fs.existsSync(resolvedPath)) {
    try {
      const raw = fs.readFileSync(resolvedPath, "utf-8");
      const parsed = JSON.parse(raw);
      const privateKey = (parsed.privateKey || parsed.private_key || "").replace(
        /\\n/g,
        "\n"
      );
      return {
        ...parsed,
        projectId: parsed.projectId || parsed.project_id,
        project_id: parsed.projectId || parsed.project_id,
        clientEmail: parsed.clientEmail || parsed.client_email,
        client_email: parsed.clientEmail || parsed.client_email,
        privateKey,
        private_key: privateKey,
      };
    } catch (e) {
      console.error("[Firebase Admin] Arquivo de credenciais inválido:", e);
    }
  }

  // 3. Tenta carregar pelas variáveis de ambiente individuais (ideal para Vercel / Docker)
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && rawPrivateKey) {
    return {
      projectId,
      clientEmail,
      privateKey: rawPrivateKey.replace(/\\n/g, "\n"),
    };
  }

  return null;
}

export function getFirebaseAdminApp(): App {
  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0]) {
    return existingApps[0];
  }

  if (adminApp) {
    return adminApp;
  }

  const serviceAccount = getServiceAccount();

  if (serviceAccount) {
    adminApp = initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.projectId || (serviceAccount as { project_id?: string }).project_id,
    });
  } else {
    console.warn(
      "[Firebase Admin] Credenciais do Service Account não encontradas. Inicializando com applicationDefault."
    );
    adminApp = initializeApp();
  }

  return adminApp;
}

export function getFirebaseAdminMessaging(): Messaging {
  const app = getFirebaseAdminApp();
  return getMessaging(app);
}

export interface SendPushPayload {
  platform?: "web" | "native";
  addressType?: "token" | "fid";
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, string | number | boolean>;
  icon?: string;
  clickAction?: string;
}

export interface SendPushResult {
  successCount: number;
  failureCount: number;
  invalidTokens: string[];
  errors: string[];
}

/**
 * Envia Push Notification via FCM para múltiplos tokens (Web e Mobile nativo)
 * com sanitização e identificação de tokens inválidos.
 */
export async function sendWebPushNotification(
  payload: SendPushPayload
): Promise<SendPushResult> {
  const uniqueTokens = Array.from(new Set(payload.tokens)).filter(Boolean);

  if (uniqueTokens.length === 0) {
    return { successCount: 0, failureCount: 0, invalidTokens: [], errors: [] };
  }

  // FCM data só aceita strings
  const stringData: Record<string, string> = payload.platform === "web" ? {} : {
    title: payload.title,
    body: payload.body,
    message: payload.body,
    clickAction: payload.clickAction || "",
  };
  if (payload.data) {
    for (const [key, value] of Object.entries(payload.data)) {
      if (payload.platform === "web" && !["notificationId", "changeId", "sessionId"].includes(key)) continue;
      if (value !== undefined && value !== null) {
        stringData[key] = String(value);
      }
    }
  }

  const multicastMessage: MulticastMessage = {
    tokens: uniqueTokens,
    ...(payload.platform === "web" ? {} : { notification: {
      title: payload.title,
      body: payload.body,
    } }),
    data: stringData,
    android: {
      priority: "high",
      notification: {
        channelId: "marcai-operational",
        icon: "ic_stat_marcai",
        sound: "default",
        priority: "high",
        defaultSound: true,
        defaultVibrateTimings: true,
      },
    },
    apns: {
      headers: {
        "apns-push-type": "alert",
        "apns-priority": "10",
      },
      payload: {
        aps: {
          sound: "default",
          badge: 1,
        },
      },
    },
    webpush: {
      headers: { TTL: "300" },
      ...(payload.platform === "web" ? {} : { notification: {
        title: payload.title,
        body: payload.body,
        icon: payload.icon || "/brand-icon.svg",
        badge: "/brand-icon.svg",
        vibrate: [200, 100, 200],
        requireInteraction: false,
      } }),
      ...(payload.platform === "web" ? {} : securePushLink(payload.clickAction)),
    },
  };

  const invalidTokens: string[] = [];
  const errors: string[] = [];
  let successCount = 0;
  let failureCount = 0;
  try {
    const messaging = getFirebaseAdminMessaging();
    for (let offset = 0; offset < uniqueTokens.length; offset += 500) {
    const tokens = uniqueTokens.slice(offset, offset + 500);
    const { tokens: unused, ...baseMessage } = multicastMessage;
    const response = payload.addressType === "fid"
      ? await messaging.sendEach(tokens.map(fid => ({...baseMessage,fid})))
      : await messaging.sendEachForMulticast({ ...multicastMessage, tokens });
    successCount += response.successCount;
    failureCount += response.failureCount;
    response.responses.forEach((resp: SendResponse, index: number) => {
      if (!resp.success && resp.error) {
        const token = tokens[index];
        const code = resp.error.code;
        errors.push(code);

        // Identifica tokens inválidos/expirados para higienização no banco de dados
        if (
          code === "messaging/invalid-registration-token" ||
          code === "messaging/registration-token-not-registered"
        ) {
          if (token) invalidTokens.push(token);
        }
      }
    });
    }

    return {
      successCount,
      failureCount,
      invalidTokens,
      errors,
    };
  } catch (error: any) {
    const isCredentialError =
      error?.message?.includes("Could not load the default credentials") ||
      error?.message?.includes("credential") ||
      error?.code === "app/invalid-credential";
    const code = isCredentialError
      ? "messaging/credentials-missing"
      : typeof error?.code === "string"
      ? error.code
      : "messaging/provider-unavailable";
    console.error("[Firebase Admin] Falha no envio:", code, error?.message || "");
    return {
      successCount,
      failureCount: uniqueTokens.length - successCount,
      invalidTokens,
      errors: [...errors, code],
    };
  }
}

function securePushLink(destination?: string) {
  const base = new URL(process.env.NEXT_PUBLIC_APP_URL || "https://tarefai.com.br");
  const target = new URL(destination || "/notifications", base);
  const safe = target.origin === base.origin ? target : new URL("/notifications", base);
  return safe.protocol === "https:" ? { fcmOptions: { link: safe.href } } : {};
}
