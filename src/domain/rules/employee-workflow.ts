/** Pure employee workflow rules, shared by the native app and the website. */
export type BoardColumn =
  "today" | "overdue" | "unassigned" | "completed" | "upcoming";
export type Timestamp = string | Date | number | null;
export type DeadlinePhase =
  "SCHEDULED" | "NONE" | "ON_TIME" | "TOLERANCE" | "EXCEEDED";
export type BoardSummary = {
  column: BoardColumn;
  attention: boolean;
  anyOverdue: boolean;
  totalTasks: number;
  completedTasks?: number;
  executionStatus?: string;
  requiredTotal?: number;
  requiredCompleted?: number;
  isScheduled?: boolean;
};
export type WorkflowTask = {
  id?: string;
  status: string;
  deadlineAt?: Timestamp;
  slaDueAt?: Timestamp;
  scheduledDate?: Timestamp;
  startedAt?: Timestamp;
  endedAt?: Timestamp;
  completedAt?: Timestamp;
  toleranceMinutes?: number | null;
  maxDuration?: number | null;
  maxDurationMinutes?: number | null;
  elapsedSeconds?: number | null;
  timerRunning?: boolean;
  timezone?: string;
  isUnassigned?: boolean;
  dependencyBlocked?: boolean;
  managementBlocked?: boolean;
  managementBlockReason?: string | null;
  executionStatus?: string | null;
  executionAvailableAt?: Timestamp;
  processSummary?: BoardSummary;
  actions?: {
    complete?: {
      code?: string | null;
      allowed?: boolean;
      reason?: string | null;
    };
  };
  dependencies?: Array<{ type: string; logic: string; satisfied?: boolean }>;
};

export const MAX_TASK_DURATION_MS = 12 * 60 * 60 * 1000;
export const terminal = (status: string) =>
  ["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(status);
export const readOnly = (status: string) =>
  terminal(status) || status === "SUBMITTED";

export function instant(value: Timestamp | undefined): number | null {
  if (value == null) return null;
  const parsed =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function deadline(task: WorkflowTask, now: number) {
  const configured = [instant(task.deadlineAt), instant(task.slaDueAt)].filter(
    (value): value is number => value !== null,
  );
  const toleranceMs = Math.max(0, task.toleranceMinutes ?? 20) * 60_000;
  let dueAt = configured.length ? Math.min(...configured) : null;
  let limitAt = dueAt === null ? null : dueAt + toleranceMs;
  const scheduledAt = instant(task.scheduledDate);
  const executionAvailableAt = instant(task.executionAvailableAt);
  const releaseAt = Math.max(scheduledAt ?? 0, executionAvailableAt ?? 0);
  const recordedStart = instant(task.startedAt);
  const startedAt =
    recordedStart === null ? null : Math.max(recordedStart, releaseAt);
  const configuredMinutes = task.maxDuration ?? task.maxDurationMinutes;
  const durationMs =
    configuredMinutes != null && configuredMinutes > 0
      ? Math.min(MAX_TASK_DURATION_MS, configuredMinutes * 60_000)
      : MAX_TASK_DURATION_MS;

  if (startedAt !== null) {
    const hardLimitAt = startedAt + durationMs;
    if (limitAt === null || hardLimitAt < limitAt) {
      limitAt = hardLimitAt;
      if (dueAt === null || dueAt > hardLimitAt)
        dueAt = Math.max(startedAt, hardLimitAt - toleranceMs);
    }
  }

  const scheduled = !readOnly(task.status) && releaseAt > now;
  const reference = readOnly(task.status)
    ? (instant(task.endedAt) ?? instant(task.completedAt) ?? now)
    : now;
  const phase: DeadlinePhase = scheduled
    ? "SCHEDULED"
    : limitAt === null
      ? "NONE"
      : reference <= (dueAt ?? limitAt)
        ? "ON_TIME"
        : reference <= limitAt
          ? "TOLERANCE"
          : "EXCEEDED";
  return { dueAt, limitAt, scheduled, releaseAt: releaseAt || null, phase };
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
export function dayKey(value: number, timezone = "America/Sao_Paulo"): string {
  let formatter = dateFormatters.get(timezone);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch {
      formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    }
    if (dateFormatters.size >= 64) dateFormatters.clear();
    dateFormatters.set(timezone, formatter);
  }
  const parts = formatter.formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function dependencyBlocked(task: WorkflowTask): boolean {
  if (typeof task.dependencyBlocked === "boolean")
    return task.dependencyBlocked;
  if (task.actions?.complete?.code === "DEPENDENCY") return true;
  const dependencies = (task.dependencies ?? []).filter((dependency) =>
    ["BLOCKING", "APPROVAL_CONDITION"].includes(dependency.type),
  );
  const alternatives = dependencies.filter(
    (dependency) => dependency.logic === "OR",
  );
  return (
    dependencies.some(
      (dependency) => dependency.logic !== "OR" && !dependency.satisfied,
    ) ||
    (alternatives.length > 0 &&
      !alternatives.some((dependency) => dependency.satisfied))
  );
}

export function columnFor(task: WorkflowTask, now: number): BoardColumn {
  if (task.status === "COMPLETED") return "completed";
  // Review is a delivery already made; time spent awaiting approval is not employee delay.
  if (task.status === "SUBMITTED") return "today";
  const timing = deadline(task, now);
  const today = dayKey(now, task.timezone);
  if (
    timing.scheduled &&
    timing.releaseAt !== null &&
    dayKey(timing.releaseAt, task.timezone) > today
  )
    return "upcoming";
  if (timing.scheduled) return "today";
  const scheduledAt =
    instant(task.scheduledDate) ?? instant(task.executionAvailableAt);
  const pastDayWithoutDeadline =
    timing.dueAt === null &&
    scheduledAt !== null &&
    dayKey(scheduledAt, task.timezone) < today;
  if (
    !timing.scheduled &&
    (task.status === "NOT_COMPLETED" ||
      (!terminal(task.status) &&
        ((timing.dueAt !== null && now > timing.dueAt) ||
          timing.phase === "EXCEEDED" ||
          pastDayWithoutDeadline)))
  )
    return "overdue";
  if (task.isUnassigned) return "unassigned";
  // A deadline tomorrow does not prevent working on an already released task today.
  return "today";
}

export function operationPermission(
  task: WorkflowTask,
  now: number,
  assigned: boolean,
  operation: "work" | "claim" = "work",
) {
  const denied = (code: string, reason: string) => ({
    allowed: false,
    code,
    reason,
  });
  if (!assigned || (task.isUnassigned && operation !== "claim"))
    return denied(
      "NOT_ASSIGNED",
      "Assuma a tarefa antes de registrar a entrega.",
    );
  if (["CANCELLED", "NOT_COMPLETED"].includes(task.executionStatus ?? ""))
    return denied("EXECUTION_CLOSED", "A gestão encerrou este processo.");
  if (task.executionStatus === "PAUSED" || task.managementBlocked)
    return denied(
      "MANAGER_BLOCKED",
      task.managementBlockReason
        ? `Bloqueada pela gestão: ${task.managementBlockReason}`
        : "Esta atividade está bloqueada pela gestão.",
    );
  if (dependencyBlocked(task))
    return denied("DEPENDENCY", "Aguarde a conclusão das etapas anteriores.");
  if (task.status === "BLOCKED")
    return denied(
      "MANAGER_BLOCKED",
      "Esta tarefa está bloqueada. Aguarde liberação da gestão.",
    );
  if (
    !["AVAILABLE", "IN_PROGRESS", "PAUSED", "NEEDS_CORRECTION"].includes(
      task.status,
    )
  )
    return denied(
      "TASK_STATE",
      task.status === "SUBMITTED"
        ? "Aguardando aprovação."
        : "Esta tarefa está encerrada ou indisponível.",
    );
  const timing = deadline(task, now);
  if (timing.scheduled)
    return denied("SCHEDULED", "Aguarde o horário agendado.");
  if (timing.phase === "EXCEEDED")
    return denied(
      "TOLERANCE_EXCEEDED",
      "A tolerância terminou. Aguarde atuação da gestão.",
    );
  return { allowed: true, code: null, reason: null };
}

export function clock(task: WorkflowTask, now: number, snapshotAt: number) {
  const timing = deadline(task, now);
  if (
    timing.scheduled ||
    task.status === "BLOCKED" ||
    dependencyBlocked(task) ||
    task.managementBlocked ||
    !task.startedAt
  )
    return { ...timing, elapsed: null, running: false };
  const running =
    !!task.timerRunning && !readOnly(task.status) && task.status !== "PAUSED";
  const recordedStart = instant(task.startedAt);
  const startedAt =
    recordedStart === null
      ? null
      : Math.max(recordedStart, timing.releaseAt ?? 0);
  const end = Math.min(now, timing.limitAt ?? Infinity);
  const maxSeconds =
    startedAt !== null && timing.limitAt !== null
      ? Math.max(0, Math.floor((timing.limitAt - startedAt) / 1000))
      : Infinity;
  const elapsed =
    task.elapsedSeconds == null
      ? null
      : Math.min(
          maxSeconds,
          Math.max(
            0,
            task.elapsedSeconds +
              (running ? Math.floor(Math.max(0, end - snapshotAt) / 1000) : 0),
          ),
        );
  return {
    ...timing,
    elapsed,
    running: running && timing.phase !== "EXCEEDED",
  };
}

export function boardState(tasks: WorkflowTask[], now: number): BoardSummary {
  const summary = tasks.find((task) => task.processSummary)?.processSummary;
  const evaluated = tasks.map((task) => ({
    task,
    column: columnFor(task, now),
  }));
  const active = evaluated.filter(({ task }) => !readOnly(task.status));
  const anyOverdue =
    active.some(({ column }) => column === "overdue") ||
    evaluated.some(
      ({ task }) =>
        task.status === "NOT_COMPLETED" ||
        deadline(task, now).phase === "EXCEEDED",
    );
  const available = active.some(
    ({ task, column }) =>
      column !== "overdue" &&
      operationPermission(task, now, true, task.isUnassigned ? "claim" : "work")
        .allowed,
  );
  const attention = anyOverdue && available;
  const isScheduled =
    active.length > 0 &&
    active.every(({ task }) => deadline(task, now).scheduled);

  let column: BoardColumn;
  if (
    active.length === 0 &&
    evaluated.length > 0 &&
    evaluated.every(({ column: col }) => col === "completed")
  ) {
    column = "completed";
  } else if (isScheduled) {
    column = "upcoming";
  } else if (available) {
    column = attention
      ? "today"
      : evaluated.some((item) => item.column === "today")
        ? "today"
        : (evaluated.find((item) => item.column !== "completed")?.column ??
          "today");
  } else {
    column = "overdue";
  }

  if (summary && tasks.length < summary.totalTasks) return { ...summary };
  if (summary?.executionStatus === "COMPLETED") column = "completed";
  else if (summary?.executionStatus && column === "completed") column = "today";
  return {
    ...summary,
    column,
    attention: column === "completed" ? false : attention,
    anyOverdue,
    totalTasks: summary?.totalTasks ?? tasks.length,
    isScheduled,
  };
}

export function processProgress(tasks: WorkflowTask[], summary?: BoardSummary) {
  const required = (summary?.requiredTotal ?? 0) > 0;
  const total = required
    ? summary!.requiredTotal!
    : (summary?.totalTasks ?? tasks.length);
  const completed = required
    ? (summary?.requiredCompleted ?? 0)
    : (summary?.completedTasks ??
      tasks.filter((task) => task.status === "COMPLETED").length);
  return {
    total,
    completed,
    percent: total ? Math.round((100 * completed) / total) : 0,
    label: `${completed} de ${total} ${required ? "etapas obrigatórias" : "etapas visíveis"} concluídas`,
  };
}

export function processBadge(summary: BoardSummary): {
  label: string;
  variant: "success" | "warning" | "urgent" | "slate" | "outline" | "brand";
} {
  if (summary.column === "completed")
    return { label: "Concluído", variant: "success" };
  if (summary.attention) return { label: "Atenção", variant: "warning" };
  if (summary.column === "overdue")
    return { label: "Atrasado", variant: "urgent" };
  if (summary.isScheduled || summary.column === "upcoming")
    return { label: "Aguardando horário", variant: "slate" };
  if (summary.column === "unassigned")
    return { label: "Para assumir", variant: "warning" };
  if (summary.executionStatus === "PENDING_REVIEW")
    return { label: "Em aprovação", variant: "outline" };
  if (summary.executionStatus === "NEEDS_CORRECTION")
    return { label: "Correção solicitada", variant: "warning" };
  if (summary.executionStatus === "PAUSED")
    return { label: "Bloqueado pela gestão", variant: "warning" };
  return {
    label:
      summary.executionStatus === "IN_PROGRESS" ? "Em andamento" : "A fazer",
    variant: "brand",
  };
}

export function taskBadge(
  task: WorkflowTask,
  now: number,
): {
  label: string;
  variant: "success" | "slate" | "outline" | "warning" | "urgent" | "brand";
} {
  if (task.status === "COMPLETED")
    return { label: "Concluída", variant: "success" };
  if (task.status === "SUBMITTED")
    return { label: "Em aprovação", variant: "outline" };
  if (terminal(task.status))
    return {
      label: task.status === "CANCELLED" ? "Cancelada" : "Não realizada",
      variant: "slate",
    };
  const timing = deadline(task, now);
  if (timing.phase === "EXCEEDED")
    return { label: "Atrasada", variant: "urgent" };
  if (task.managementBlocked || task.executionStatus === "PAUSED")
    return { label: "Bloqueada pela gestão", variant: "warning" };
  if (dependencyBlocked(task))
    return { label: "Aguardando etapa anterior", variant: "warning" };
  if (task.status === "BLOCKED")
    return { label: "Bloqueada pela gestão", variant: "warning" };
  if (timing.scheduled)
    return { label: "Aguardando horário", variant: "slate" };
  if (timing.phase === "TOLERANCE")
    return { label: "Em tolerância", variant: "warning" };
  if (task.isUnassigned) return { label: "Para assumir", variant: "warning" };
  if (task.status === "NEEDS_CORRECTION")
    return { label: "Correção solicitada", variant: "warning" };
  return {
    label: task.status === "IN_PROGRESS" ? "Em andamento" : "Dentro do prazo",
    variant: "brand",
  };
}
