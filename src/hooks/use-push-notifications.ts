"use client";

import { useState, useEffect, useCallback } from "react";
import {
  requestPushNotificationToken,
  onForegroundMessage,
} from "@/infrastructure/firebase/firebase-messaging";
import { saveDeviceTokenAction } from "@/presentation/actions/push-notification-actions";

export type PushPermissionStatus = "default" | "granted" | "denied" | "unsupported";

export function usePushNotifications() {
  const [permission, setPermission] = useState<PushPermissionStatus>("default");
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }

    setPermission(Notification.permission);
    if (Notification.permission === "granted") {
      setIsSubscribed(true);
    }
  }, []);

  // Ouve notificações enquanto o app está aberto em primeiro plano
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    onForegroundMessage((payload) => {
      console.log("[usePushNotifications] Notificação em primeiro plano:", payload);

      const title = payload.notification?.title || payload.data?.title || "Marcaí";
      const body = payload.notification?.body || payload.data?.body || payload.data?.message || "";

      // Se o navegador permitir e estiver em foco, exibe notificação nativa
      if (Notification.permission === "granted") {
        try {
          new Notification(title, {
            body,
            icon: "/brand-icon.svg",
            data: payload.data,
          });
        } catch {
          // Em certos navegadores mobile, Notification constructor pode falhar em primeiro plano
        }
      }
    }).then((unsub) => {
      unsubscribe = unsub;
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const subscribe = useCallback(async () => {
    setIsSubscribing(true);
    try {
      const token = await requestPushNotificationToken();
      if (token) {
        const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : undefined;
        const res = await saveDeviceTokenAction(token, userAgent);
        if (res.success) {
          setIsSubscribed(true);
          setPermission("granted");
          return true;
        }
      }
      if (typeof window !== "undefined" && "Notification" in window) {
        setPermission(Notification.permission);
      }
      return false;
    } catch (error) {
      console.error("[usePushNotifications] Erro ao ativar notificações:", error);
      return false;
    } finally {
      setIsSubscribing(false);
    }
  }, []);

  return {
    permission,
    isSubscribed,
    isSubscribing,
    subscribe,
    isSupported: permission !== "unsupported",
  };
}
