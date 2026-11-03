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

export const DEFAULT_FIREBASE_VAPID_KEY =
  "BAsywe3apcyAQpc5eg_XR3VPD49vL0dCWTvHXlGXo-rX3_j9B_GVABpEOXLvRH7uEImX9gwG6bvMKMYY7hMF4wc";

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

    let swRegistration = registration;
    if (!registration.active || registration.active.state !== "activated") {
      try {
        const ready = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error("Timeout ao aguardar ativação do serviço de notificações.")), 10000)
          ),
        ]);
        if (ready) swRegistration = ready;
      } catch (err) {
        console.warn("[Firebase Messaging] Aguardando ativação do service worker:", err);
      }
    }

    const vapidKey =
      process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim() ||
      DEFAULT_FIREBASE_VAPID_KEY;

    const token = await getToken(messaging, {
      serviceWorkerRegistration: swRegistration,
      vapidKey,
    });

    return token || null;
  } catch (error) {
    console.error("[Firebase Messaging] Falha ao obter token FCM:", error);
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
