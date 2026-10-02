import { redirect } from "next/navigation";
import { getManagementContext } from "@/application/security/auth-context";
import { readProcessDefinition } from "@/domain/rules/process-definition";
import { prisma } from "@/infrastructure/database/prisma";
import { ManagementShell } from "@/presentation/components/mobile/management-shell";
import { ProcessListClient } from "@/presentation/components/processes/process-list-client";

export default async function ManagementProcessesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  if (tab === "archived") {
    redirect("/management/archived");
  }

  const context = await getManagementContext();
  if (!context) return null;

  const whereClause: any = {
    organizationId: context.organizationId,
    status: { not: "ARCHIVED" },
  };

  if (context.role === "MANAGER" && context.scope) {
    whereClause.locationId = { in: context.scope.locationIds };
  }

  const processes = await prisma.process.findMany({
    where: whereClause,
    include: {
      location: true,
      sourceTemplateVersion: true,
      _count: {
        select: {
          routines: true,
          tasks: { where: { deletedAt: null } },
          executions: true,
        },
      },
    },
    orderBy: [{ criticality: "desc" }, { createdAt: "desc" }],
  });

  const formatted = processes
    .filter(
      (p) =>
        context.role !== "MANAGER" ||
        !readProcessDefinition(p.sourceTemplateVersion?.definition)?.tasks.some(
          (t) => !context.scope?.teamIds.includes(t.teamId),
        ),
    )
    .map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      criticality: p.criticality,
      locationName: p.location?.name || null,
      routinesCount: p._count.routines,
      tasksCount:
        readProcessDefinition(p.sourceTemplateVersion?.definition)?.tasks.length ?? 0,
      executionsCount: p._count.executions,
      validFrom: p.validFrom,
      validUntil: p.validUntil,
    }));

  return (
    <ManagementShell
      userName={context.userName}
      orgName={context.organizationName}
      role={context.role}
    >
      <ProcessListClient processes={formatted} userRole={context.role} />
    </ManagementShell>
  );
}
