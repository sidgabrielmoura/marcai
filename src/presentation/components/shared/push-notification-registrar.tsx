"use client";

import { useEffect, useRef } from "react";
import { usePushNotifications } from "@/hooks/use-push-notifications";

export function PushNotificationRegistrar() {
  const { isSupported, subscribe } = usePushNotifications();
  const hasAttemptedRef = useRef(false);

  useEffect(() => {
    // Se o usuário já concedeu permissão, registra/renova o token automaticamente no backend
    if (
      !hasAttemptedRef.current &&
      isSupported &&
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      hasAttemptedRef.current = true;
      subscribe();
    }
  }, [isSupported, subscribe]);

  return null;
}
