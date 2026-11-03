"use client";

import { useState, useEffect } from "react";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { Bell, BellRing } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

export function PushNotificationBanner({ sessionId }: { sessionId?: string }) {
  const { permission, isSubscribing, isSubscribed, subscribe, isSupported, error } =
    usePushNotifications(sessionId);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleActivate = async () => {
    const success = await subscribe();
    if (success) {
      toast.add({
        title: "Notificações ativadas!",
        description: "Você receberá avisos operacionais e de tarefas em tempo real no seu dispositivo.",
        type: "success",
      });
    }
  };

  // Se não montado no cliente, não suportado, negado, ou se já concedido/inscrito (sem erro pendente de ativação), não renderiza banner
  if (
    !mounted ||
    !isSupported ||
    permission === "denied" ||
    isSubscribed ||
    (permission === "granted" && !error && !isSubscribing)
  ) {
    return null;
  }

  return (
    <div className="rounded-[16px] bg-[var(--brand-soft)] border border-[var(--brand-700)]/20 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-[var(--brand-900)] shadow-none">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-white text-[var(--brand-900)] shadow-xs shrink-0 mt-0.5 sm:mt-0">
          <BellRing className="size-4.5 text-[var(--brand-900)]" />
        </div>
        <div>
          <strong className="block text-sm font-semibold text-[var(--brand-900)]">
            Ativar notificações no dispositivo
          </strong>
          <p className="text-[var(--text-secondary)] mt-0.5 leading-relaxed">
            Receba alertas imediatos de novas tarefas atribuídas e avisos operacionais mesmo com o aplicativo fechado.
          </p>
          {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
        </div>
      </div>

      <Button
        type="button"
        size="sm"
        disabled={isSubscribing}
        onClick={handleActivate}
        className="h-9 px-4 rounded-[12px] bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)] shrink-0 self-end sm:self-auto gap-1.5"
      >
        {isSubscribing ? (
          <>
            <Spinner className="size-3.5" aria-hidden="true" />
            <span>Ativando...</span>
          </>
        ) : (
          <>
            <Bell className="size-3.5" />
            <span>{error ? "Tentar novamente" : "Ativar notificações"}</span>
          </>
        )}
      </Button>
    </div>
  );
}
