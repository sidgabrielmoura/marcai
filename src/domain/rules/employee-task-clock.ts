import { clock, type WorkflowTask } from "./employee-workflow";
export type ClockTask = WorkflowTask;
export function taskClock(task: ClockTask, now: number, snapshotAt: number) {
  const timing = clock(task, now, snapshotAt);
  return {
    ...timing,
    toleranceExceeded:
      !["COMPLETED", "CANCELLED", "NOT_COMPLETED", "SUBMITTED"].includes(
        task.status,
      ) && timing.phase === "EXCEEDED",
    remaining:
      timing.dueAt === null ? null : Math.ceil((timing.dueAt - now) / 1000),
    deadlineLabel: timing.scheduled
      ? "Horário agendado"
      : timing.dueAt === Date.parse(String(task.slaDueAt))
        ? "Limite de SLA"
        : "Prazo final",
    isScheduled: timing.scheduled,
  };
}
export function formatClock(seconds: number) {
  const total = Math.floor(Math.abs(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor(total / 3600) % 24;
  const minutes = Math.floor(total / 60) % 60;
  return (
    (days ? days + "d " : "") +
    [hours, minutes, total % 60]
      .map((value) => String(value).padStart(2, "0"))
      .join(":")
  );
}
