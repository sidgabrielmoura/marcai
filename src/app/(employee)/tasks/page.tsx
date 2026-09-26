import { getAuthenticatedContext } from "@/application/security/auth-context";
import { taskScope } from "@/application/security/operational-scope";
import { prisma } from "@/infrastructure/database/prisma";
import { taskTiming } from "@/domain/rules/task-metrics";
import { EmployeeShell } from "@/presentation/components/mobile/employee-shell";
import { PageHeader } from "@/presentation/components/shared";
import {
  EmployeeKanbanBoard,
  type EmployeeTask,
  type ColumnId,
} from "@/presentation/components/mobile/employee-kanban-board";

export default async function EmployeeTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const context = await getAuthenticatedContext();
  if (!context) return null;

  const params = await searchParams;
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  );

  // Carregar dados de escopo do membro (equipes e acessos a unidades)
  const member = await prisma.organizationMember.findUniqueOrThrow({
    where: { id: context.memberId },
    select: {
      teamMemberships: { select: { teamId: true } },
      locationAccesses: {
        where: {
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          ],
        },
        select: { locationId: true },
      },
    },
  });

  const memberTeamIds = member.teamMemberships.map((t) => t.teamId);
  const memberLocationIds = member.locationAccesses.map((l) => l.locationId);

  const selectFields = {
    id: true,
    title: true,
    description: true,
    status: true,
    priority: true,
    criticality: true,
    origin: true,
    scheduledDate: true,
    deadlineAt: true,
    completedAt: true,
    startedAt: true,
    slaDueAt: true,
    location: { select: { id: true, name: true, timezone: true } },
    team: { select: { id: true, name: true } },
    process: { select: { name: true } },
    execution: { select: { process: { select: { name: true } } } },
    evidenceRequirements: { select: { id: true, required: true } },
    occurrences: {
      where: { type: "IMPEDIMENT" },
      select: { id: true, reason: true },
      take: 1,
    },
  } as const;

  // 1. Tarefas atribuídas ao colaborador
  // Inclui ativas + concluídas hoje para a coluna de Concluídas
  const assigned = await prisma.task.findMany({
    where: {
      ...taskScope(context),
      organizationId: context.organizationId,
      deletedAt: null,
      assignments: { some: { memberId: context.memberId, removedAt: null } },
      OR: [
        { status: { notIn: ["COMPLETED", "CANCELLED", "NOT_COMPLETED"] } },
        { status: "COMPLETED", completedAt: { gte: startOfToday } },
      ],
    },
    select: selectFields,
    orderBy: [
      { priority: "desc" },
      { deadlineAt: "asc" },
      { id: "asc" },
    ],
  });

  // 2. Tarefas disponíveis para assumir (sem responsável atribuído)
  const unassigned = await prisma.task.findMany({
    where: {
      organizationId: context.organizationId,
      deletedAt: null,
      status: { in: ["AVAILABLE", "BLOCKED"] },
      teamId: { in: memberTeamIds },
      locationId: { in: memberLocationIds },
      assignments: { none: { type: "PRIMARY", removedAt: null } },
    },
    select: selectFields,
    orderBy: [
      { priority: "desc" },
      { deadlineAt: "asc" },
      { id: "asc" },
    ],
  });

  function formatTask(t: (typeof assigned)[0], isUnassigned: boolean): EmployeeTask {
    const timing = taskTiming(t, now);
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      criticality: t.criticality,
      origin: t.origin,
      scheduledDate: t.scheduledDate ? t.scheduledDate.toISOString() : null,
      deadlineAt: t.deadlineAt ? t.deadlineAt.toISOString() : null,
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      startedAt: t.startedAt ? t.startedAt.toISOString() : null,
      slaExceeded: timing.slaExceeded,
      delayMinutes: timing.delayMinutes,
      locationName: t.location?.name || null,
      teamName: t.team?.name || null,
      processName: t.process?.name || t.execution?.process?.name || null,
      evidenceCount: t.evidenceRequirements?.length || 0,
      hasImpediment: (t.occurrences?.length || 0) > 0,
      impedimentReason: t.occurrences?.[0]?.reason || undefined,
      isUnassigned,
    };
  }

  const allTasks: EmployeeTask[] = [
    ...assigned.map((t) => formatTask(t, false)),
    ...unassigned.map((t) => formatTask(t, true)),
  ];

  // Identificar coluna inicial conforme parâmetros ou prioridade
  let initialCol: ColumnId = "today";
  if (params.tab === "unassigned") initialCol = "unassigned";
  else if (params.tab === "overdue") initialCol = "overdue";
  else if (params.tab === "in_progress") initialCol = "in_progress";
  else if (params.tab === "completed") initialCol = "completed";
  else if (params.tab === "upcoming") initialCol = "upcoming";
  else {
    // Se houver tarefas em andamento, abrir nelas; se houver atrasadas, abrir nelas
    const hasOverdue = allTasks.some((t) => !t.isUnassigned && t.slaExceeded);
    const hasInProgress = allTasks.some(
      (t) => !t.isUnassigned && (t.status === "IN_PROGRESS" || t.status === "PAUSED"),
    );
    if (hasInProgress) initialCol = "in_progress";
    else if (hasOverdue) initialCol = "overdue";
  }

  return (
    <EmployeeShell
      userName={context.userName}
      orgName={context.organizationName}
      role={context.role}
    >
      <div className="page-stack">
        <PageHeader
          title="Minhas tarefas"
          subtitle="Acompanhe suas atividades no turno e assuma novas tarefas da equipe."
        />

        <EmployeeKanbanBoard tasks={allTasks} initialColumn={initialCol} />
      </div>
    </EmployeeShell>
  );
}
