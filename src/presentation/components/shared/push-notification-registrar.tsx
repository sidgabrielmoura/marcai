"use client";

import { useEffect, useRef, useState } from "react";
import { onForegroundMessage } from "@/infrastructure/firebase/firebase-messaging";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { BellRing, X } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

export function PushNotificationRegistrar({ sessionId }: { sessionId: string }) {
  const { isSupported, permission, isSubscribing, isSubscribed, error, subscribe } =
    usePushNotifications(sessionId);
  const hasAutoRequestedRef = useRef(false);
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | null = null;
    navigator.serviceWorker?.getRegistration("/").then(registration => {
      registration?.active?.postMessage({ type: "PUSH_SESSION_STARTED", sessionId });
    }).catch(() => {});
    onForegroundMessage(async payload => {
      if (disposed || payload.data?.sessionId !== sessionId) return;
      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        if (!disposed) registration?.active?.postMessage({ type: "DISPLAY_PUSH", data: payload.data });
      } catch { /* The subscription UI exposes registration failures. */ }
    }).then(stop => { if (disposed) stop?.(); else unsubscribe = stop; }).catch(() => {});
    return () => {
      disposed = true; unsubscribe?.();
      // Close already displayed alerts when leaving this authenticated layout.
      navigator.serviceWorker?.getRegistration("/").then(async registration => {
        registration?.active?.postMessage({ type: "PUSH_SESSION_ENDED", sessionId });
        const notifications = await registration?.getNotifications();
        notifications?.filter(notification => notification.data?.sessionId === sessionId).forEach(notification => notification.close());
      }).catch(() => {});
    };
  }, [sessionId]);

  useEffect(() => {
    setMounted(true);
    if (typeof Notification === "undefined" || !isSupported) {
      return;
    }

    // Verifica se já foi dispensado temporariamente nesta sessão
    const isDismissed = sessionStorage.getItem("dismiss_push_prompt") === "true";
    if (isDismissed) {
      setDismissed(true);
    }

    // 1. Se o usuário já concedeu permissão anteriormente, sincroniza/renova o token no backend
    if (Notification.permission === "granted" && !hasAutoRequestedRef.current) {
      hasAutoRequestedRef.current = true;
      subscribe();
      return;
    }

  }, [isSupported, subscribe]);

  const handleActivate = async () => {
    const success = await subscribe();
    if (success) {
      toast.add({
        title: "Notificações ativadas!",
        description: "Você receberá avisos operacionais e de tarefas em tempo real.",
        type: "success",
      });
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("dismiss_push_prompt", "true");
    }
  };

  // Se não montado no cliente, não suportado, já concedeu, negou ou foi dispensado na sessão, não renderiza banner
  if (
    !mounted ||
    !isSupported ||
    permission === "denied" ||
    permission === "granted" ||
    isSubscribed ||
    dismissed
  ) {
    return null;
  }

  return (
    <aside
      role="region"
      aria-label="Ativar notificações do sistema"
      className="fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-md z-50 p-4 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-[var(--brand-200,#e2e8f0)] dark:border-slate-800 shadow-xl transition-all animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-xl bg-[var(--brand-soft,#f0fdf4)] text-[var(--brand-900,#166534)] shrink-0">
          <BellRing className="size-5 text-[var(--brand-700,#15803d)] animate-bounce" />
        </div>

        <div className="flex-1 min-w-0 pr-6">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Ativar notificações em tempo real
          </h4>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Receba alertas imediatos de novas tarefas atribuídas, avisos de prazos e aprovações no seu aparelho.
          </p>
          {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}

          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              disabled={isSubscribing}
              onClick={handleActivate}
              className="h-8 px-3 text-xs font-medium rounded-lg bg-[var(--brand-900,#0f172a)] text-white hover:bg-[var(--brand-800,#1e293b)]"
            >
              {isSubscribing ? (
                <>
                  <Spinner className="size-3 mr-1.5" aria-hidden="true" />
                  Ativando...
                </>
              ) : (
                "Ativar notificações"
              )}
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={handleDismiss}
              className="h-8 px-2.5 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400"
            >
              Agora não
            </Button>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Fechar"
        >
          <X className="size-4" />
        </button>
      </div>
    </aside>
  );
}
