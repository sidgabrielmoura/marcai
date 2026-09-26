import { taskTiming } from "@/domain/rules/task-metrics";
import { getManagementContext } from "@/application/security/auth-context";
import { prisma } from "@/infrastructure/database/prisma";
import { ManagementShell } from "@/presentation/components/mobile/management-shell";
import {
  OverviewDashboardClient,
  OverviewTask,
} from "@/presentation/components/dashboard/overview-dashboard-client";
import { TaskStatus, Priority, Criticality } from "@/domain/types";

export default async function ManagementOverviewPage() {
  const context = await getManagementContext();
  if (!context) return null;

  // Filtro base multi-tenant
  const whereClause: any = {
    organizationId: context.organizationId,
    deletedAt: null,
    createdAt: { gte: new Date(Date.now() - 90 * 86400000) },
  };

  // Aplicação estrita do escopo de MANAGER (D-06: Interseção AND)
  if (context.role === "MANAGER" && context.scope) {
    whereClause.locationId = { in: context.scope.locationIds };
    whereClause.teamId = { in: context.scope.teamIds };
  }

  const [rawTasks, locations, teams, processes] = await Promise.all([
    prisma.task.findMany({
      where: whereClause,
      include: {
        location: true,
        team: true,
        process: true,
        occurrences: {
          where: { type: "IMPEDIMENT" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        sessions: {
          include: {
            pauses: {
              where: { endedAt: null },
            },
          },
        },
        approvalWorkflow: true,
        assignments: { where: { type: "PRIMARY", removedAt: null }, include: { member: { select: { user: { select: { name: true } } } } } },
      },
      orderBy: { createdAt: "desc" },

    }),
    prisma.location.findMany({
      where: {
        organizationId: context.organizationId,
        ...(context.role === "MANAGER" && context.scope
          ? { id: { in: context.scope.locationIds } }
          : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.team.findMany({
      where: {
        organizationId: context.organizationId,
        ...(context.role === "MANAGER" && context.scope
          ? { id: { in: context.scope.teamIds } }
          : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.process.findMany({
      where: { organizationId: context.organizationId, ...(context.role === "MANAGER" ? { locationId: { in: context.scope?.locationIds ?? [] } } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const now = new Date();

  // Mapeamento estruturado das tarefas com cálculo exato de SLA e atraso (Item 41 & 42)
  const mappedTasks: OverviewTask[] = rawTasks.map((t) => {
    const { isOverdue, slaExceeded, delayMinutes } = taskTiming(t, now);

    const hasActiveImpediment = t.occurrences.length > 0;
    const isPaused =
      t.status === TaskStatus.PAUSED ||
      t.sessions.some((s) => s.pauses.length > 0);

    return {
      id: t.id,
      title: t.title,
      status: t.status as TaskStatus,
      priority: t.priority as Priority,
      criticality: t.criticality as Criticality,
      origin: t.origin,
      locationId: t.locationId,
      teamId: t.teamId,
      processId: t.processId,
      locationName: t.location?.name || "Sem unidade",
      teamName: t.team?.name || "Sem equipe",
      processName: t.process?.name || "Avulsa",
      deadlineAt: t.deadlineAt ? t.deadlineAt.toISOString() : null,
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      createdAt: t.createdAt.toISOString(),
      isOverdue, slaExceeded,
      assigneeName: t.assignments[0]?.member.user.name ?? "Sem responsável",
      estimatedDuration: t.estimatedDuration, actualDuration: t.actualDuration,
      delayMinutes,
      hasActiveImpediment,
      impedimentReason: hasActiveImpediment
        ? t.occurrences[0].reason
        : undefined,
      isPaused,
      pendingApproval: t.status === "SUBMITTED",
    };
  });

  return (
    <ManagementShell
      userName={context.userName}
      orgName={context.organizationName}
      role={context.role}
    >
      <OverviewDashboardClient
        tasks={mappedTasks}
        options={{
          locations,
          teams,
          processes,
        }}
        role={context.role}
        userName={context.userName}
        orgName={context.organizationName}
      />
    </ManagementShell>
  );
}
