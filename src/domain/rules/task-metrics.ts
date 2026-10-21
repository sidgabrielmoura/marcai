import {
  deadline,
  instant,
  taskBadge,
  type WorkflowTask,
} from "./employee-workflow";
export function taskTiming(task: WorkflowTask, now = new Date()) {
  if (["CANCELLED", "NOT_COMPLETED", "BLOCKED"].includes(task.status))
    return { isOverdue: false, slaExceeded: false, delayMinutes: 0 };
  const timing = deadline(task, now.getTime());
  const reference =
    instant(task.endedAt) ?? instant(task.completedAt) ?? now.getTime();
  const slaDueAt = instant(task.slaDueAt);
  const deadlineAt = instant(task.deadlineAt);
  return {
    isOverdue:
      !timing.scheduled && deadlineAt !== null && reference > deadlineAt,
    slaExceeded: !timing.scheduled && slaDueAt !== null && reference > slaDueAt,
    delayMinutes:
      slaDueAt === null
        ? 0
        : Math.max(0, Math.round((reference - slaDueAt) / 60_000)),
  };
}
export type DeadlineStatus = "ON_TIME" | "TOLERANCE" | "OVERDUE";
const badgeClasses = {
  brand: "bg-emerald-50 text-emerald-700 border-emerald-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-800 border-amber-300",
  urgent: "bg-red-50 text-red-700 border-red-200",
  slate: "bg-slate-100 text-slate-700 border-slate-300",
  outline: "bg-slate-100 text-slate-700 border-slate-300",
};
export function getTaskDeadlineStatus(task: WorkflowTask, now: number) {
  const badge = taskBadge(task, now);
  const timing = deadline(task, now);
  const status: DeadlineStatus =
    timing.phase === "EXCEEDED"
      ? "OVERDUE"
      : timing.phase === "TOLERANCE"
        ? "TOLERANCE"
        : "ON_TIME";
  return {
    status,
    label: badge.label,
    badgeClass: badgeClasses[badge.variant],
  };
}
