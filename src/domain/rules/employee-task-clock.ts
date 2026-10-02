export type ClockTask = {
  status: string;
  deadlineAt: string | null;
  slaDueAt: string | null;
  startedAt: string | null;
  toleranceMinutes?: number | null;
  elapsedSeconds: number | null;
  timerRunning: boolean;
};

export function taskClock(task: ClockTask, now: number, snapshotAt: number) {
  const terminal = ["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(task.status);
  const deadlines = [task.deadlineAt, task.slaDueAt]
    .filter((value): value is string => !!value)
    .map(value => Date.parse(value)).filter(Number.isFinite);
  const dueAt = terminal || task.status === "BLOCKED" || !deadlines.length ? null : Math.min(...deadlines);
  const toleranceMinutes = task.toleranceMinutes ?? 20;
  const toleranceLimitAt = dueAt !== null ? dueAt + toleranceMinutes * 60 * 1000 : null;

  // Se atingiu o limite de tolerância, a tarefa para de correr o tempo
  const toleranceExceeded = toleranceLimitAt !== null && !terminal && now > toleranceLimitAt;

  let elapsed: number | null = null;
  if (task.startedAt || task.elapsedSeconds !== null) {
    const startTimestamp = task.startedAt ? Date.parse(task.startedAt) : null;
    if (toleranceExceeded && startTimestamp && Number.isFinite(startTimestamp)) {
      // Congela o tempo decorrido no exato instante em que a tolerância esgotou
      elapsed = Math.max(0, Math.floor((toleranceLimitAt - startTimestamp) / 1000));
    } else {
      const baseSeconds = task.elapsedSeconds ?? (startTimestamp ? Math.max(0, Math.floor((snapshotAt - startTimestamp) / 1000)) : 0);
      const isRunning = task.timerRunning && !terminal && !toleranceExceeded;
      elapsed = Math.max(0, baseSeconds + (isRunning ? Math.floor(Math.max(0, now - snapshotAt) / 1000) : 0));
    }
  }

  return {
    elapsed,
    toleranceExceeded,
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
