import { app } from "./firebase";
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported,
  type Messaging,
  type MessagePayload,
} from "firebase/messaging";

let messagingInstance: Messaging | null = null;

export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;

  if (messagingInstance) return messagingInstance;

  try {
    const supported = await isSupported();
    if (supported) {
      messagingInstance = getMessaging(app);
      return messagingInstance;
    }
  } catch (error) {
    console.warn("[Firebase Messaging] Não suportado neste navegador:", errorCode(error));
  }

  return null;
}

/**
 * Registra o Service Worker dedicado para Web Push do Firebase.
 */
export async function registerFirebaseServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js",
      { scope: "/" }
    );
    return registration;
  } catch (error) {
    console.error(
      "[Firebase Messaging] Erro ao registrar /firebase-messaging-sw.js:",
      errorCode(error)
    );
    return null;
  }
}

/**
 * Solicita permissão do navegador para notificações e retorna o token FCM gerado.
 */
export async function requestPushNotificationToken(): Promise<string | null> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    console.warn("[Firebase Messaging] Notificações não são suportadas por este dispositivo.");
    return null;
  }

  const messaging = await getFirebaseMessaging();
  if (!messaging) return null;

  try {
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("[Firebase Messaging] Permissão de notificação negada:", permission);
      return null;
    }

    const registration = await registerFirebaseServiceWorker();
    if (!registration) throw new Error("Não foi possível registrar o serviço de notificações.");
    const swRegistration = registration;
    if (!registration.active) await new Promise<void>((resolve, reject) => {
      const worker = registration.installing || registration.waiting;
      if (!worker) return reject(new Error("Serviço de notificações indisponível."));
      const timeout = setTimeout(() => { cleanup(); reject(new Error("O serviço de notificações não ficou pronto.")); }, 15000);
      const cleanup = () => { clearTimeout(timeout); worker.removeEventListener("statechange", check); };
      const check = () => {
        if (worker.state === "activated") { cleanup(); resolve(); }
        else if (worker.state === "redundant") { cleanup(); reject(new Error("Falha na ativação do serviço de notificações.")); }
      };
      worker.addEventListener("statechange", check);
      check();
    });

    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim();
    if (!vapidKey) throw new Error("A chave pública de notificações não foi configurada no build.");

    const token = await getToken(messaging, {
      serviceWorkerRegistration: swRegistration,
      ...(vapidKey ? { vapidKey } : {}),
    });

    return token || null;
  } catch (error) {
    console.error("[Firebase Messaging] Falha ao obter token FCM:", errorCode(error));
    return null;
  }
}

function errorCode(error: unknown): string {
  const code = (error as {code?:unknown})?.code;
  return typeof code === "string" ? code : "messaging/registration-failed";
}

/**
 * Ouve notificações recebidas enquanto a aplicação está em primeiro plano (aberta).
 */
export async function onForegroundMessage(
  callback: (payload: MessagePayload) => void
): Promise<(() => void) | null> {
  const messaging = await getFirebaseMessaging();
  if (!messaging) return null;

  return onMessage(messaging, (payload) => {
    callback(payload);
  });
}
