import { getManagementContext } from "@/application/security/auth-context";
import { prisma } from "@/infrastructure/database/prisma";
import { ManagementShell } from "@/presentation/components/mobile/management-shell";
import {
  ManagementExecutionsClient,
  type ExecutionItem,
} from "@/presentation/components/executions/management-executions-client";
import { formatRoutineRule } from "@/domain/rules/schedule";
import { resolveExecutionStatus } from "@/domain/rules/execution-state";
import { redirect } from "next/navigation";

export default async function ManagementExecutionsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; status?: string; executionId?: string }>;
}) {
  const context = await getManagementContext();
  if (!context) redirect("/tasks");

  const { period = "30", status = "ALL", executionId } = await searchParams;

  const days = ["7", "30", "90", "365"].includes(period) ? Number(period) : 30;
  const since = new Date(Date.now() - days * 86400000);

  const whereClause: any = {
    organizationId: context.organizationId,
    scheduledAt: { gte: since },
  };

  if (context.role === "MANAGER" && context.scope) {
    whereClause.OR = [
      { locationId: { in: context.scope.locationIds } },
      {
        tasks: {
          some: {
            locationId: { in: context.scope.locationIds },
            teamId: { in: context.scope.teamIds },
          },
        },
      },
    ];
  }

  const [rawExecutions, locations, processes] = await Promise.all([
    prisma.processExecution.findMany({
      where: whereClause,
      include: {
        process: { select: { id: true, name: true, criticality: true } },
        location: { select: { id: true, name: true } },
        routine: { select: { id: true, recurrenceRule: true } },
        tasks: {
          where: { deletedAt: null },
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            criticality: true,
            deadlineAt: true,
            completedAt: true,
            startedAt: true,
            required: true,
            approvalWorkflow: { select: { status: true } },
            assignments: {
              where: { removedAt: null },
              select: {
                member: {
                  select: {
                    user: { select: { name: true, avatarUrl: true } },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { scheduledAt: "desc" },
      take: 100,
    }),

    prisma.location.findMany({
      where: {
        organizationId: context.organizationId,
        status: "ACTIVE",
        ...(context.role === "MANAGER" && context.scope
          ? { id: { in: context.scope.locationIds } }
          : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),

    prisma.process.findMany({
      where: {
        organizationId: context.organizationId,
        ...(context.role === "MANAGER" && context.scope
          ? { locationId: { in: context.scope.locationIds } }
          : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const now = new Date();
  const executions: ExecutionItem[] = rawExecutions.map((e) => ({
    id: e.id,
    processId: e.processId,
    processName: e.process?.name || "Processo sem nome",
    processCriticality: e.process?.criticality || "MEDIUM",
    routineName: formatRoutineRule(e.routine?.recurrenceRule),
    locationId: e.locationId,
    locationName: e.location?.name || null,
    status: resolveExecutionStatus(e, now),
    scheduledAt: e.scheduledAt.toISOString(),
    startedAt: e.startedAt ? e.startedAt.toISOString() : null,
    completedAt: e.completedAt ? e.completedAt.toISOString() : null,
    cancelledAt: e.cancelledAt ? e.cancelledAt.toISOString() : null,
    cancellationReason: e.cancellationReason,
    tasks: e.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      criticality: t.criticality,
      deadlineAt: t.deadlineAt ? t.deadlineAt.toISOString() : null,
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      assigneeName: t.assignments[0]?.member.user.name || null,
      assigneeAvatar: t.assignments[0]?.member.user.avatarUrl || null,
    })),
  }));

  return (
    <ManagementShell
      userName={context.userName}
      orgName={context.organizationName}
      role={context.role}
      userId={context.userId}
    >
      <ManagementExecutionsClient
        executions={executions}
        locations={locations}
        processes={processes}
        initialExecutionId={executionId}
        currentPeriod={period}
        currentStatus={status}
      />
    </ManagementShell>
  );
}
