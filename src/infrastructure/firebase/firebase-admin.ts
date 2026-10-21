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
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim();
      const jsonStr = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf-8");
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("[Firebase Admin] Erro ao ler FIREBASE_SERVICE_ACCOUNT_KEY:", e);
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
      return JSON.parse(raw);
    } catch (e) {
      console.error("[Firebase Admin] Erro ao ler arquivo de credenciais:", e);
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
      projectId: serviceAccount.projectId,
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

  const messaging = getFirebaseAdminMessaging();

  // FCM data só aceita strings
  const stringData: Record<string, string> = {};
  if (payload.data) {
    for (const [key, value] of Object.entries(payload.data)) {
      stringData[key] = String(value);
    }
  }

  const multicastMessage: MulticastMessage = {
    tokens: uniqueTokens,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: stringData,
    android: {
      priority: "high",
      notification: {
        channelId: "marcai-operational",
        icon: "ic_stat_marcai",
        sound: "default",
        priority: "high",
        clickAction: payload.clickAction || undefined,
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
      notification: {
        title: payload.title,
        body: payload.body,
        icon: payload.icon || "/brand-icon.svg",
        badge: "/brand-icon.svg",
        vibrate: [200, 100, 200],
        requireInteraction: false,
      },
      fcmOptions: {
        link: payload.clickAction || "/",
      },
    },
  };

  try {
    const response = await messaging.sendEachForMulticast(multicastMessage);

    const invalidTokens: string[] = [];
    const errors: string[] = [];

    response.responses.forEach((resp: SendResponse, index: number) => {
      if (!resp.success && resp.error) {
        const token = uniqueTokens[index];
        const code = resp.error.code;
        errors.push(`${code}: ${resp.error.message}`);

        // Identifica tokens inválidos/expirados para higienização no banco de dados
        if (
          code === "messaging/invalid-registration-token" ||
          code === "messaging/registration-token-not-registered"
        ) {
          if (token) invalidTokens.push(token);
        }
      }
    });

    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokens,
      errors,
    };
  } catch (error: any) {
    console.error("[Firebase Admin] Erro ao disparar multicast Push:", error);
    return {
      successCount: 0,
      failureCount: uniqueTokens.length,
      invalidTokens: [],
      errors: [error?.message || "Unknown error"],
    };
  }
}
