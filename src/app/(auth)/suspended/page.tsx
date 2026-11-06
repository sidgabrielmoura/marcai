import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/infrastructure/security/session";
import { prisma } from "@/infrastructure/database/prisma";
import { logoutAction } from "@/presentation/actions/auth-actions";
import { Brand } from "@/presentation/components/shared/brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShieldAlert,
  Building2,
  MessageSquare,
  Mail,
  LogOut,
  ArrowRight,
  Headphones,
  Lock,
} from "lucide-react";

export const metadata = {
  title: "Acesso da Empresa Suspenso | Tarefaí",
  description: "O acesso operacional para esta organização está temporariamente suspenso.",
};

export default async function SuspendedOrganizationPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  // Se a organização da sessão estiver ativa, redireciona para a home operacional
  if (session.orgStatus === "ACTIVE") {
    redirect("/");
  }

  // Busca dados da organização e quantidade de outros vínculos ativos do usuário
  const [org, activeMembershipsCount] = await Promise.all([
    session.activeOrgId
      ? prisma.organization.findUnique({
        where: { id: session.activeOrgId },
        select: { id: true, name: true, slug: true, status: true },
      })
      : null,
    prisma.organizationMember.count({
      where: {
        userId: session.userId,
        status: "ACTIVE",
        organization: { status: "ACTIVE" },
      },
    }),
  ]);

  if (org && org.status === "ACTIVE") {
    redirect("/");
  }

  const orgName = org?.name || "Sua Empresa";
  const orgSlug = org?.slug || "";

  const prefilledMessage = encodeURIComponent(
    `Olá! Sou usuário da empresa "${orgName}" (@${orgSlug}) e nosso acesso no Tarefaí está suspenso. Gostaria de solicitar a reabertura imediata do nosso espaço.`
  );

  const supportWhatsAppNumber = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || "";
  const whatsappUrl = supportWhatsAppNumber
    ? `https://wa.me/${supportWhatsAppNumber}?text=${prefilledMessage}`
    : `https://wa.me/?text=${prefilledMessage}`;

  const emailUrl = `mailto:suporte@tarefai.com.br?subject=${encodeURIComponent(
    `Solicitação de Reabertura de Acesso - ${orgName}`
  )}&body=${prefilledMessage}`;

  return (
    <main className="min-h-dvh flex flex-col justify-center items-center bg-canvas p-4 sm:p-6 relative selection:bg-amber-100 selection:text-amber-950">

      <div className="w-full max-w-md bg-surface border border-(--border-subtle) rounded-3xl p-6 sm:p-8 shadow-xl shadow-black/5 flex flex-col items-center text-center">
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-(--text-primary)">
          Acesso da empresa suspenso
        </h1>

        <div className="w-full mt-4 p-3.5 rounded-2xl bg-(--surface-muted) border border-(--border-subtle) flex items-center gap-3 text-left">
          <div className="size-11 rounded-xl bg-(--brand-soft) border border-(--brand-700)/20 flex items-center justify-center text-[var(--brand-900)] shrink-0 font-bold">
            <Building2 className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-semibold text-(--text-secondary) uppercase tracking-wider block">
              Organização
            </span>
            <strong className="text-sm font-bold text-(--text-primary) truncate block">
              {orgName}
            </strong>
            {orgSlug && (
              <span className="text-xs font-mono text-(--text-secondary) block truncate">
                @{orgSlug}
              </span>
            )}
          </div>
        </div>

        <p className="mt-2 text-[11px] sm:text-xs text-(--text-secondary) leading-relaxed">
          Para regularizar a situação e solicitar a reabertura imediata, entre em contato direto com a nossa equipe de suporte.
        </p>

        <div className="w-full mt-6 flex flex-col gap-2.5">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2.5 shadow-sm transition-all cursor-pointer group"
          >
            <MessageSquare className="size-4.5 shrink-0" />
            <span>Falar com suporte no WhatsApp</span>
            <ArrowRight className="size-4 opacity-80 group-hover:translate-x-0.5 transition-transform" />
          </a>

          {/* Botão Secundário Email */}
          <a
            href={emailUrl}
            className="w-full h-11 bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] font-semibold text-xs sm:text-sm rounded-xl border border-[var(--border-subtle)] flex items-center justify-center gap-2 shadow-none transition-colors"
          >
            <Mail className="size-4 text-[var(--text-secondary)] shrink-0" />
            <span>Solicitar reabertura por e-mail</span>
          </a>

          {/* Botão de Trocar de Organização caso o usuário possua outra ativa */}
          {activeMembershipsCount > 0 && (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/select-org" />}
              className="w-full h-11 bg-[var(--surface)] hover:bg-[var(--brand-soft)] text-[var(--brand-900)] font-semibold text-xs sm:text-sm rounded-xl border border-[var(--brand-700)]/30 flex items-center justify-center gap-2 shadow-none transition-colors mt-1"
            >
              <Building2 className="size-4 shrink-0" />
              <span>
                Acessar outra organização ({activeMembershipsCount} ativa
                {activeMembershipsCount > 1 ? "s" : ""})
              </span>
            </Button>
          )}
        </div>

        {/* Divisor */}
        <div className="w-full border-t border-[var(--border-subtle)] mt-6 pt-4 flex flex-col items-center gap-3">
          {/* Formulário de Logout Seguro */}
          <form action={logoutAction} className="w-full">
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="w-full text-xs text-[var(--text-secondary)] hover:text-rose-600 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 rounded-xl flex items-center justify-center gap-1.5 h-9"
            >
              <LogOut className="size-3.5" />
              <span>Sair da conta</span>
            </Button>
          </form>

          {/* Indicador de Proteção */}
          <div className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)] opacity-80">
            <Lock className="size-3 text-amber-600" />
            <span>Ambiente seguro • Proteção e isolamento de dados ativos</span>
          </div>
        </div>
      </div>

      {/* Rodapé Institucional */}
      <footer className="w-full max-w-md text-center py-4 text-xs text-[var(--text-secondary)]">
        <p>Tarefaí • Gestão operacional simplificada e transparente</p>
      </footer>
    </main>
  );
}
