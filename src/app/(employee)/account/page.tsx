import { getAuthenticatedContext } from "@/application/security/auth-context";
import { EmployeeShell } from "@/presentation/components/mobile/employee-shell";
import { logoutAction } from "@/presentation/actions/auth-actions";
import { PageHeader } from "@/presentation/components/shared";
import { Building2, LogOut } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { uiLabel } from "@/presentation/components/shared/ui-labels";
import { prisma } from "@/infrastructure/database/prisma";
import { MemberAvailabilityCard } from "@/presentation/components/mobile/member-availability-card";

export default async function EmployeeAccountPage() {
  const context = await getAuthenticatedContext();
  if (!context) return null;

  const member = await prisma.organizationMember.findUnique({
    where: { id: context.memberId },
    select: { manualAvailability: true, availabilityStatus: true },
  });

  return (
    <EmployeeShell
      userName={context.userName}
      orgName={context.organizationName}
      role={context.role}
    >
      <div className="w-full flex flex-col">
        <PageHeader
          title="Minha conta"
          subtitle="Confira seus dados e a organização que você está acessando."
        />

        <div className="flex flex-col gap-4">
          <Card className="bg-[var(--surface)] rounded-[18px] p-5 shadow-none border border-[var(--border-subtle)] ring-0 flex-row items-center gap-4">
            <Avatar className="size-14 rounded-full bg-[var(--brand-900)] text-white flex items-center justify-center font-semibold text-lg shadow-none">
              <AvatarFallback className="bg-[var(--brand-900)] text-white text-lg font-semibold">
                {context.userName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h3 className="text-[var(--text-primary)] truncate text-[length:var(--type-card-title)] font-bold">
                {context.userName}
              </h3>
              <p className="text-[length:var(--type-label)] text-[var(--text-secondary)] truncate">
                {context.userEmail || "Sem e-mail cadastrado"}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="text-[length:var(--type-caption)] font-semibold px-2.5 py-0.5 rounded-full bg-[var(--sage-400)]/30 text-[var(--brand-900)] border border-[var(--sage-400)]/40 h-auto"
                >
                  {uiLabel(context.role)}
                </Badge>
                {context.employeeCode && (
                  <span className="text-[length:var(--type-label)] font-mono text-[var(--text-secondary)]">
                    Matrícula: {context.employeeCode}
                  </span>
                )}
              </div>
            </div>
          </Card>

          {/* Card de Disponibilidade Operacional Híbrida (Item 35) */}
          <MemberAvailabilityCard
            initialManual={member?.manualAvailability || "AUTO"}
            initialCalculated={member?.availabilityStatus || "AVAILABLE"}
          />

          {/* Card de Organização Ativa */}
          <Card className="bg-[var(--surface)] rounded-[18px] p-5 shadow-none border border-[var(--border-subtle)] ring-0">
            <CardHeader className="p-0 mb-2">
              <CardTitle className="text-[length:var(--type-body)] font-bold text-[var(--text-secondary)] flex items-center gap-1.5">
                <Building2 className="size-4 text-[var(--brand-700)]" />
                <span>Sua organização</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="text-[length:var(--type-body)] font-semibold text-[var(--brand-900)]">
                {context.organizationName}
              </div>
              <div className="text-[length:var(--type-label)] text-[var(--text-secondary)] mt-1">
                Identificador:{" "}
                <code className="bg-[var(--canvas)] px-1.5 py-0.5 rounded font-mono text-[var(--brand-900)] border border-[var(--border-subtle)]">
                  {context.organizationSlug}
                </code>
              </div>
            </CardContent>
          </Card>

          {/* Botão de Encerramento de Sessão */}
          <form action={logoutAction} className="pt-2">
            <Button
              type="submit"
              variant="destructive"
              className="w-full min-h-[48px] bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 hover:text-red-800 font-semibold text-[length:var(--type-label)] rounded-[14px] shadow-none flex items-center justify-center gap-2"
            >
              <LogOut data-icon="inline-start" className="size-4" />
              <span>Sair da conta</span>
            </Button>
          </form>
        </div>
      </div>
    </EmployeeShell>
  );
}
