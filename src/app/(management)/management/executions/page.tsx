import { getManagementContext } from "@/application/security/auth-context";
import { prisma } from "@/infrastructure/database/prisma";
import { ManagementShell } from "@/presentation/components/mobile/management-shell";
import { ProcessNavTabs } from "@/presentation/components/processes/process-nav-tabs";
import { ExecutionsClient } from "@/presentation/components/processes/executions-client";

export default async function ManagementExecutionsPage({ searchParams }: { searchParams: Promise<{ process?: string }> }) {
  const context = await getManagementContext();
  if (!context) return null;

  const { process } = await searchParams;
  const whereClause: any = {
    ...(process ? { processId: process } : {}),
    organizationId: context.organizationId,
    process: {
      status: { not: "ARCHIVED" },
    },
  };

  if (context.role === "MANAGER" && context.scope) {
    whereClause.locationId = { in: context.scope.locationIds };
    whereClause.tasks = { every: { teamId: { in: context.scope.teamIds } } };
  }

  const executions = await prisma.processExecution.findMany({
    where: whereClause,
    include: {
      process: { select: { name: true } },
      routine: { select: { recurrenceRule: true } },
      location: { select: { name: true } },
      tasks: {
        where: { deletedAt: null },
        select: {
          id: true,
          status: true, title: true, required: true,
          approvalWorkflow: { select: { status: true } },
          _count: { select: { occurrences: true } },
        },
      },
    },
    orderBy: { scheduledAt: "desc" },
  });

  const formatted = executions.map((e) => ({
    id: e.id,
    processName: e.process.name,
    routineRecurrence: e.routine?.recurrenceRule || null,
    locationName: e.location?.name || null,
    status: e.status,
    scheduledAt: e.scheduledAt,
    startedAt: e.startedAt,
    completedAt: e.completedAt,
    reopenedAt: e.reopenedAt,
    reopenReason: e.reopenReason,
    cancellationReason: e.cancellationReason,
    tasks: e.tasks.map(t => ({ id: t.id, title: t.title, status: t.status, required: t.required, approval: t.approvalWorkflow?.status ?? null, occurrences: t._count.occurrences })),
    totalTasks: e.tasks.length,
    completedTasks: e.tasks.filter((t) => t.status === "COMPLETED").length,
  }));

  return (
    <ManagementShell
      userName={context.userName}
      orgName={context.organizationName}
      role={context.role}
    >
      <ProcessNavTabs />
      <ExecutionsClient executions={formatted} userRole={context.role} />
    </ManagementShell>
  );
}
