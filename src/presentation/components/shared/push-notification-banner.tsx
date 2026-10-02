"use client";

import { usePushNotifications } from "@/hooks/use-push-notifications";
import { Bell, BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PushNotificationBanner() {
  const { permission, isSubscribing, isSubscribed, subscribe, isSupported } =
    usePushNotifications();

  if (!isSupported || isSubscribed) {
    return null;
  }

  if (permission === "denied") {
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
        </div>
      </div>

      <Button
        type="button"
        size="sm"
        disabled={isSubscribing}
        onClick={() => subscribe()}
        className="h-9 px-4 rounded-[12px] bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)] shrink-0 self-end sm:self-auto gap-1.5"
      >
        {isSubscribing ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            <span>Ativando...</span>
          </>
        ) : (
          <>
            <Bell className="size-3.5" />
            <span>Ativar notificações</span>
          </>
        )}
      </Button>
    </div>
  );
}
