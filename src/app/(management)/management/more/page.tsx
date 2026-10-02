import { getManagementContext } from "@/application/security/auth-context";
import { ManagementShell } from "@/presentation/components/mobile/management-shell";
import { logoutAction } from "@/presentation/actions/auth-actions";
import {
  Users,
  Building2,
  MapPin,
  FileBarChart,
  Settings,
  LogOut,
  ArrowRight,
  ShieldCheck,
  Trash2,
  Bell,
} from "lucide-react";
import Link from "next/link";
import { prisma } from "@/infrastructure/database/prisma";
import { PageHeader } from "@/presentation/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function ManagementMorePage() {
  const context = await getManagementContext();
  if (!context) return null;

  const user = await prisma.user.findUnique({
    where: { id: context.userId },
    select: { platformRole: true },
  });
  const isSuperadmin = user?.platformRole === "SUPERADMIN";

  const menuSections = [
    ...(isSuperadmin
      ? [
        {
          label: "Administração da plataforma",
          desc: "Organizações e indicadores da plataforma",
          icon: ShieldCheck,
          href: "/superadmin",
          badge: "Plataforma",
        },
      ]
      : []),
    {
      label: "Avisos e Notificações",
      desc: "Histórico de alertas e configuração de push",
      icon: Bell,
      href: "/notifications",
    },
    {
      label: "Pessoas e acessos",
      desc: "Pessoas, permissões e convites",
      icon: Users,
      href: "/management/people",
    },
    {
      label: "Equipes",
      desc: "Estrutura por turno e liderança",
      icon: Building2,
      href: "/management/teams",
    },
    {
      label: "Unidades",
      desc: "Locais físicos e horários",
      icon: MapPin,
      href: "/management/locations",
    },
    {
      label: "Lixeira de tarefas",
      desc: "Tarefas descartadas e restauração",
      icon: Trash2,
      href: "/management/tasks/trash",
    },
    {
      label: "Relatórios & Indicadores",
      desc: "Exportação CSV, PDF e métricas consolidadas",
      icon: FileBarChart,
      href: "/overview",
    },
    {
      label: "Configurações",
      desc: "Dados, prazos e permissões",
      icon: Settings,
      href: "/management/settings",
    },
  ];

  return (
    <ManagementShell
      userName={context.userName}
      orgName={context.organizationName}
      role={context.role}
      userId={context.userId}
    >
      <div className="mb-5">
        <PageHeader
          title="Sua organização"
          subtitle="Acesse as pessoas, as unidades e as configurações da organização."
        />
      </div>

      <Card className="p-5 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[length:var(--type-caption)] uppercase tracking-wider font-semibold text-[var(--text-secondary)]">
              Organização atual
            </span>
            <h3 className="text-[var(--text-primary)] mt-0.5 text-[length:var(--type-card-title)] font-bold">
              {context.organizationName}
            </h3>
            <span className="text-[length:var(--type-label)] text-[var(--text-secondary)]">
              Seu acesso:{" "}
              <strong className="text-[var(--brand-900)]">
                {(
                  {
                    OWNER: "Proprietário",
                    ADMIN: "Administrador",
                    MANAGER: "Gestor",
                    EMPLOYEE: "Colaborador",
                    SUPERADMIN: "Superadministrador",
                  } as Record<string, string>
                )[context.role] || context.role}
              </strong>
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href="/select-org" />}
            className="rounded-full text-[length:var(--type-label)] font-semibold text-[var(--brand-900)] hover:bg-[var(--neutral-200)] shadow-none"
          >
            Trocar
          </Button>
        </div>
      </Card>

      <div className="module-grid mb-6">
        {menuSections.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className="block no-underline"
            >
              <Card className="p-4 flex flex-row! items-center justify-between shadow-none cursor-pointer hover:border-brand-700 transition-all">
                <div className="flex items-center gap-3.5">
                  <div className="p-2.5 rounded-xl bg-[var(--brand-soft)] text-[var(--brand-900)]">
                    <Icon className="size-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-[var(--brand-900)] text-[length:var(--type-card-title)] font-bold">
                        {item.label}
                      </h4>
                      {item.badge && (
                        <Badge
                          variant="outline"
                          className="text-[length:var(--type-caption)] bg-emerald-100 text-emerald-900 border-transparent py-0"
                        >
                          {item.badge}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[length:var(--type-caption)] text-[var(--text-secondary)]">
                      {item.desc}
                    </p>
                  </div>
                </div>
                <ArrowRight className="size-4 text-[var(--neutral-300)]" />
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Logout */}
      <form action={logoutAction}>
        <Button
          type="submit"
          variant="outline"
          className="w-full min-h-[50px] bg-red-50 border border-red-200 text-red-700 font-semibold text-[length:var(--type-body)] rounded-[14px] hover:bg-red-100 hover:text-red-800 transition-colors flex items-center justify-center gap-2 shadow-none"
        >
          <LogOut className="size-4" data-icon="inline-start" />
          <span>Sair da conta</span>
        </Button>
      </form>
    </ManagementShell>
  );
}
