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
    console.warn("[Firebase Messaging] Não suportado neste navegador:", error);
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
      error
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
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("[Firebase Messaging] Permissão de notificação negada:", permission);
      return null;
    }

    const registration = await registerFirebaseServiceWorker();
    const swRegistration = registration || (await navigator.serviceWorker.ready);

    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || undefined;

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
