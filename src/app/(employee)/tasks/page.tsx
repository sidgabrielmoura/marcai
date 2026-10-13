import { getAuthenticatedContext } from "@/application/security/auth-context";
import { taskScope } from "@/application/security/operational-scope";
import { prisma } from "@/infrastructure/database/prisma";
import { effectiveWorkSeconds } from "@/domain/rules/execution-state";
import type { TaskStatus } from "@/domain/types";
import { taskTiming, getTaskDeadlineStatus } from "@/domain/rules/task-metrics";
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
      teamMemberships: {
        where: { team: { organizationId: context.organizationId, status: "ACTIVE" } },
        select: { teamId: true },
      },
      locationAccesses: {
        where: {
          location: { organizationId: context.organizationId, status: "ACTIVE" },
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
    executionId: true,
    title: true,
    description: true,
    status: true,
    priority: true,
    criticality: true,
    origin: true,
    taskType: true,
    scheduledDate: true,
    deadlineAt: true,
    completedAt: true,
    startedAt: true,
    actualDuration: true,
    sessions: { select: { startedAt: true, endedAt: true, pauses: { select: { startedAt: true, endedAt: true } } } },
    slaDueAt: true,
    toleranceMinutes: true,
    createdAt: true,
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

  // 2. Tarefas disponíveis para assumir (sem responsável atribuído na equipe do colaborador)
  const unassigned = memberTeamIds.length === 0 ? [] : await prisma.task.findMany({
    where: {
      organizationId: context.organizationId,
      deletedAt: null,
      status: { notIn: ["COMPLETED", "CANCELLED", "NOT_COMPLETED"] },
      teamId: { in: memberTeamIds },
      ...(memberLocationIds.length > 0
        ? { OR: [{ locationId: null }, { locationId: { in: memberLocationIds } }] }
        : { locationId: null }),
      assignments: { none: { type: "PRIMARY", removedAt: null } },
    },
    select: selectFields,
    orderBy: [
      { priority: "desc" },
      { deadlineAt: "asc" },
      { id: "asc" },
    ],
  });

  const snapshotAt = new Date();

  function formatTask(t: (typeof assigned)[0], isUnassigned: boolean): EmployeeTask {
    const timing = taskTiming(t, now);
    const terminal = ["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(t.status);

    // Se a tarefa possui agendamento futuro no dia, ela não deve correr timer nem iniciar antecipadamente
    const isFutureScheduled = !!t.scheduledDate && new Date(t.scheduledDate) > now;

    // A tarefa só começa a contar a partir do horário agendado (ou startedAt se posterior)
    const effectiveStartedDate = isFutureScheduled
      ? null
      : t.startedAt
        ? new Date(t.startedAt)
        : (!isUnassigned)
          ? (t.scheduledDate ? new Date(t.scheduledDate) : new Date(t.createdAt))
          : null;

    const operationalStatus = isUnassigned
      ? (t.status === "BLOCKED" ? "BLOCKED" : "AVAILABLE")
      : (!isFutureScheduled && t.status === "AVAILABLE" ? "IN_PROGRESS" : t.status);

    // Verificação de estouro do limite de tolerância
    const deadlines = [t.deadlineAt, t.slaDueAt]
      .filter((v): v is Date => !!v)
      .map((d) => d.getTime());
    const dueAt = deadlines.length > 0 ? Math.min(...deadlines) : null;
    const toleranceMinutes = t.toleranceMinutes ?? 20;
    const toleranceLimitAt = dueAt !== null ? dueAt + toleranceMinutes * 60 * 1000 : null;
    const toleranceExceeded = toleranceLimitAt !== null && !terminal && snapshotAt.getTime() > toleranceLimitAt;

    // Tempo decorrido corrido e ininterrupto (para de correr quando atinge o limite de tolerância)
    let elapsedSeconds: number | null = null;
    if (effectiveStartedDate && !isFutureScheduled) {
      if (terminal && t.completedAt) {
        elapsedSeconds = Math.max(0, Math.round((new Date(t.completedAt).getTime() - effectiveStartedDate.getTime()) / 1000));
      } else if (toleranceExceeded && toleranceLimitAt !== null) {
        // Congela no momento exato do esgotamento da tolerância
        elapsedSeconds = Math.max(0, Math.round((toleranceLimitAt - effectiveStartedDate.getTime()) / 1000));
      } else {
        elapsedSeconds = Math.max(0, Math.round((snapshotAt.getTime() - effectiveStartedDate.getTime()) / 1000));
      }
    } else if (t.actualDuration && !isFutureScheduled) {
      elapsedSeconds = t.actualDuration;
    }

    const timerRunning = !terminal && !toleranceExceeded && (operationalStatus === "IN_PROGRESS" || operationalStatus === "PAUSED") && !!effectiveStartedDate && !isFutureScheduled;

    return {
      id: t.id,
      executionId: t.executionId,
      title: t.title,
      description: t.description,
      status: operationalStatus as TaskStatus,
      priority: t.priority,
      criticality: t.criticality,
      origin: t.origin,
      taskType: t.taskType,
      scheduledDate: t.scheduledDate ? t.scheduledDate.toISOString() : null,
      deadlineAt: t.deadlineAt ? t.deadlineAt.toISOString() : null,
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      startedAt: effectiveStartedDate ? effectiveStartedDate.toISOString() : null,
      slaDueAt: t.slaDueAt?.toISOString() ?? null,
      toleranceMinutes,
      elapsedSeconds,
      timerRunning,
      slaExceeded: timing.slaExceeded,
      delayMinutes: timing.delayMinutes,
      locationName: t.location?.name || null,
      teamName: t.team?.name || null,
      processName: t.process?.name || t.execution?.process?.name || null,
      evidenceCount: t.evidenceRequirements?.length || 0,
      hasRequiredEvidence: t.evidenceRequirements?.some((r) => r.required) || false,
      hasImpediment: (t.occurrences?.length || 0) > 0,
      impedimentReason: t.occurrences?.[0]?.reason || undefined,
      isUnassigned,
    };
  }

  const allTasks: EmployeeTask[] = [
    ...assigned.map((t) => formatTask(t, false)),
    ...unassigned.map((t) => formatTask(t, true)),
  ];

  const todayTasks = allTasks.filter((t) => {
    if (t.isUnassigned) return false;
    if (t.status === "COMPLETED") return false;
    if (getTaskDeadlineStatus(t, snapshotAt.getTime()).status === "OVERDUE" || t.slaExceeded) return false;
    const targetDate = t.scheduledDate || t.deadlineAt;
    if (targetDate) {
      const d = new Date(targetDate);
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      if (d > todayEnd) return false;
    }
    return true;
  });

  const overdueTasks = allTasks.filter((t) => {
    if (t.isUnassigned) return false;
    if (t.status === "COMPLETED") return false;
    return getTaskDeadlineStatus(t, snapshotAt.getTime()).status === "OVERDUE" || t.slaExceeded;
  });

  // Identificar coluna inicial conforme parâmetros ou regras de navegação
  let initialCol: ColumnId = "today";
  if (params.tab === "unassigned") initialCol = "unassigned";
  else if (params.tab === "overdue") initialCol = "overdue";
  else if (params.tab === "completed") initialCol = "completed";
  else if (params.tab === "upcoming") initialCol = "upcoming";
  else if (params.tab === "today") initialCol = "today";
  else {
    // Regra: Sempre manter o funcionário na aba "A Fazer (Hoje)".
    // Somente se não houver NENHUMA tarefa a fazer hoje, joga para pendentes/atrasadas.
    if (todayTasks.length > 0) {
      initialCol = "today";
    } else if (overdueTasks.length > 0) {
      initialCol = "overdue";
    } else if (allTasks.some((t) => t.isUnassigned)) {
      initialCol = "unassigned";
    } else {
      initialCol = "today";
    }
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

        <EmployeeKanbanBoard tasks={allTasks} initialColumn={initialCol} snapshotAt={snapshotAt.getTime()} />
      </div>
    </EmployeeShell>
  );
}
