"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  CalendarClock,
  Sparkles,
  AlertTriangle,
  X,
  ChevronRight,
  MessageSquare,
  Headphones,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { SubscriptionNotice } from "@/application/superadmin/manual-subscription";

interface SubscriptionExpirationCardProps {
  notice?: SubscriptionNotice | null;
  orgName?: string;
  userRole?: string;
  className?: string;
}

function formatDateBr(isoDate: string): string {
  if (!isoDate) return "";
  try {
    const [y, m, d] = isoDate.split("-");
    if (y && m && d) return `${d}/${m}/${y}`;
    return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return isoDate;
  }
}

export function SubscriptionExpirationCard({
  notice,
  orgName = "sua organização",
  userRole = "EMPLOYEE",
  className,
}: SubscriptionExpirationCardProps) {
  const [dismissed, setDismissed] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);

  useEffect(() => {
    if (!notice?.endsOn) return;
    try {
      const stored = sessionStorage.getItem(`tarefai_sub_notice_${notice.endsOn}`);
      if (stored === "dismissed") {
        setDismissed(true);
      }
    } catch {
      // sessionStorage não disponível
    }
  }, [notice?.endsOn]);

  if (!notice) return null;

  // Se já expirou ou vence hoje, não permite dispensar para não perder prazo crítico
  const canDismiss = !notice.isExpired && notice.daysRemaining > 0;
  if (dismissed && canDismiss) return null;

  function handleDismiss() {
    if (!notice?.endsOn) return;
    setDismissed(true);
    try {
      sessionStorage.setItem(`tarefai_sub_notice_${notice.endsOn}`, "dismissed");
    } catch {
      // ignore
    }
  }

  const isManagement = ["OWNER", "ADMIN", "MANAGER"].includes(userRole);
  const formattedEndDate = formatDateBr(notice.endsOn);

  // Determinar texto do tempo restante
  let timeLabel = "";
  if (notice.isExpired) {
    timeLabel = "Vigência encerrada";
  } else if (notice.daysRemaining === 0) {
    timeLabel = "Encerra hoje";
  } else if (notice.daysRemaining === 1) {
    timeLabel = "Encerra amanhã";
  } else {
    timeLabel = `Restam ${notice.daysRemaining} dias`;
  }

  // Severidade visual
  const isUrgent = notice.isExpired || notice.daysRemaining <= 2;
  const isWarning = !isUrgent && notice.daysRemaining <= 5;

  const prefilledMessage = encodeURIComponent(
    `Olá! Gostaria de falar sobre a continuidade do plano "${notice.planName}" da empresa "${orgName}".`
  );

  return (
    <>
      <div
        role="region"
        aria-label="Aviso de vigência do plano"
        className={cn(
          "relative mb-5 w-full rounded-[16px] border p-4 sm:p-4.5 transition-all duration-200 shadow-2xs",
          isUrgent
            ? "bg-rose-50/70 border-rose-200/80 text-rose-950 dark:bg-rose-950/25 dark:border-rose-900/50 dark:text-rose-100"
            : isWarning
            ? "bg-amber-50/80 border-amber-200/80 text-amber-950 dark:bg-amber-950/25 dark:border-amber-900/50 dark:text-amber-100"
            : "bg-[var(--brand-soft)]/65 border-[var(--brand-700)]/20 text-[var(--brand-900)]",
          className
        )}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
          <div className="flex items-start gap-3.5 min-w-0">
            {/* Ícone Minimalista */}
            <div
              className={cn(
                "size-9 sm:size-10 rounded-xl flex items-center justify-center shrink-0 border mt-0.5 sm:mt-0 transition-colors shadow-2xs",
                isUrgent
                  ? "bg-white text-rose-600 border-rose-200 dark:bg-rose-900/50 dark:border-rose-800"
                  : isWarning
                  ? "bg-white text-amber-700 border-amber-200 dark:bg-amber-900/50 dark:border-amber-800"
                  : "bg-white text-[var(--brand-700)] border-[var(--brand-700)]/25 dark:bg-slate-900"
              )}
            >
              {isUrgent ? (
                <AlertTriangle className="size-4.5 stroke-[2]" />
              ) : notice.isTrial ? (
                <Sparkles className="size-4.5 stroke-[2]" />
              ) : (
                <CalendarClock className="size-4.5 stroke-[2]" />
              )}
            </div>

            {/* Conteúdo textual */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold tracking-tight">
                  {notice.isExpired
                    ? "Vigência do plano encerrada"
                    : notice.isTrial
                    ? "Período de avaliação finalizando"
                    : "Renovação contratual próxima"}
                </span>

                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-semibold px-2 py-0.5 rounded-full border shadow-none",
                    isUrgent
                      ? "bg-rose-100/70 border-rose-300 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200"
                      : isWarning
                      ? "bg-amber-100/70 border-amber-300 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
                      : "bg-white/80 border-[var(--brand-700)]/30 text-[var(--brand-900)]"
                  )}
                >
                  {timeLabel}
                </Badge>
              </div>

              <p className="mt-1 text-xs leading-relaxed opacity-90 line-clamp-2 sm:line-clamp-none">
                {notice.isExpired ? (
                  <>
                    O período do plano <strong>{notice.planName}</strong> encerrou em{" "}
                    <strong>{formattedEndDate}</strong>. Regularize para assegurar a continuidade
                    das rotinas e processos da equipe.
                  </>
                ) : notice.isTrial ? (
                  <>
                    O piloto de testes da <strong>{orgName}</strong> ({notice.planName}) encerra em{" "}
                    <strong>{formattedEndDate}</strong> ({timeLabel.toLowerCase()}). Garanta a migração
                    para manter os checklists, unidades e dados ativos sem pausas.
                  </>
                ) : (
                  <>
                    A vigência contratual do plano <strong>{notice.planName}</strong> vence em{" "}
                    <strong>{formattedEndDate}</strong> ({timeLabel.toLowerCase()}).
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Ações / Botões */}
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center pl-12 sm:pl-0">
            {isManagement ? (
              <Button
                type="button"
                size="sm"
                onClick={() => setContactModalOpen(true)}
                className={cn(
                  "h-8 px-3.5 text-xs font-semibold rounded-lg shadow-none gap-1.5 transition-colors",
                  isUrgent
                    ? "bg-rose-600 hover:bg-rose-700 text-white"
                    : "bg-[var(--brand-900)] hover:bg-[var(--brand-700)] text-white"
                )}
              >
                <MessageSquare className="size-3.5" />
                <span>Falar com comercial</span>
              </Button>
            ) : (
              <Link
                href="/account"
                className="text-xs font-medium underline underline-offset-4 opacity-80 hover:opacity-100"
              >
                Avisar administrador
              </Link>
            )}

            {canDismiss && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleDismiss}
                title="Dispensar aviso nesta sessão"
                aria-label="Dispensar aviso nesta sessão"
                className="text-muted-foreground hover:text-foreground size-7 rounded-md"
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Contato / Renovação */}
      <Dialog open={contactModalOpen} onOpenChange={setContactModalOpen}>
        <DialogContent
          className="sm:max-w-md bg-[var(--surface)] text-[var(--text-primary)] rounded-[18px] border border-[var(--border-subtle)] p-6 shadow-[var(--shadow-float)]"
          showCloseButton={true}
        >
          <DialogHeader className="mb-1">
            <div className="size-10 rounded-xl bg-[var(--brand-soft)] border border-[var(--brand-700)]/20 flex items-center justify-center text-[var(--brand-900)] mb-2">
              <Sparkles className="size-5" />
            </div>
            <DialogTitle className="text-base font-bold text-[var(--text-primary)]">
              Continuidade do Plano Tarefaí
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--text-secondary)] mt-1">
              Organização: <strong>{orgName}</strong> · Plano atual:{" "}
              <strong>{notice.planName}</strong> ({timeLabel.toLowerCase()}).
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2.5 pt-2">
            {/* Opção WhatsApp */}
            <a
              href={`https://wa.me/?text=${prefilledMessage}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setContactModalOpen(false)}
              className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] hover:bg-[var(--canvas)] hover:border-[var(--brand-700)] transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30">
                  <MessageSquare className="size-4" />
                </div>
                <div>
                  <strong className="block text-xs font-semibold text-[var(--text-primary)]">
                    Atendimento via WhatsApp
                  </strong>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Fale em tempo real com nossa equipe comercial.
                  </span>
                </div>
              </div>
              <ChevronRight className="size-4 text-muted-foreground group-hover:text-[var(--brand-700)] group-hover:translate-x-0.5 transition-all" />
            </a>

            {/* Opção Email */}
            <a
              href={`mailto:comercial@tarefai.com.br?subject=${encodeURIComponent(
                `Renovação de Plano - ${orgName}`
              )}&body=${prefilledMessage}`}
              onClick={() => setContactModalOpen(false)}
              className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] hover:bg-[var(--canvas)] hover:border-[var(--brand-700)] transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/30">
                  <Mail className="size-4" />
                </div>
                <div>
                  <strong className="block text-xs font-semibold text-[var(--text-primary)]">
                    Contato por E-mail
                  </strong>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Envie os dados de faturamento para comercial@tarefai.com.br
                  </span>
                </div>
              </div>
              <ChevronRight className="size-4 text-muted-foreground group-hover:text-[var(--brand-700)] group-hover:translate-x-0.5 transition-all" />
            </a>

            {/* Link para Configurações */}
            <Link
              href="/management/settings"
              onClick={() => setContactModalOpen(false)}
              className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] hover:bg-[var(--canvas)] hover:border-[var(--brand-700)] transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[var(--brand-soft)] text-[var(--brand-900)]">
                  <ShieldCheck className="size-4" />
                </div>
                <div>
                  <strong className="block text-xs font-semibold text-[var(--text-primary)]">
                    Consultar dados da organização
                  </strong>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Acessar painel de configurações e informações da conta.
                  </span>
                </div>
              </div>
              <ChevronRight className="size-4 text-muted-foreground group-hover:text-[var(--brand-700)] group-hover:translate-x-0.5 transition-all" />
            </Link>
          </div>

          <div className="pt-2 flex justify-end">
            <Button
              variant="outline"
              type="button"
              size="sm"
              onClick={() => setContactModalOpen(false)}
              className="h-8 text-xs font-medium"
            >
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
