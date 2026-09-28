export type ClockTask = {
  status: string;
  deadlineAt: string | null;
  slaDueAt: string | null;
  startedAt: string | null;
  elapsedSeconds: number | null;
  timerRunning: boolean;
};

export function taskClock(task: ClockTask, now: number, snapshotAt: number) {
  const terminal = ["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(task.status);
  const deadlines = [task.deadlineAt, task.slaDueAt]
    .filter((value): value is string => !!value)
    .map(value => Date.parse(value)).filter(Number.isFinite);
  const dueAt = terminal || task.status === "BLOCKED" || !deadlines.length ? null : Math.min(...deadlines);
  return {
    elapsed: task.startedAt && task.elapsedSeconds !== null ? Math.max(0, task.elapsedSeconds + (task.timerRunning && !terminal ? Math.floor(Math.max(0, now - snapshotAt) / 1000) : 0)) : null,
    remaining: dueAt === null ? null : Math.ceil((dueAt - now) / 1000),
    deadlineLabel: dueAt !== null && dueAt === Date.parse(task.slaDueAt ?? "") ? "Limite de SLA" : "Prazo final",
  };
}

export function formatClock(seconds: number) {
  const total = Math.floor(Math.abs(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor(total / 3600) % 24;
  const minutes = Math.floor(total / 60) % 60;
  const rest = total % 60;
  return (days ? days + "d " : "") + [hours, minutes, rest].map(value => String(value).padStart(2, "0")).join(":");
}
