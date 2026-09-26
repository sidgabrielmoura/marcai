export function taskTiming(task: { status: string; deadlineAt: Date | null; slaDueAt: Date | null; completedAt: Date | null }, now = new Date()) {
  if (["CANCELLED", "NOT_COMPLETED", "BLOCKED"].includes(task.status)) return { isOverdue: false, slaExceeded: false, delayMinutes: 0 };
  const finish = task.completedAt ?? now;
  const slaExceeded = !!task.slaDueAt && finish > task.slaDueAt;
  return { isOverdue: !!task.deadlineAt && finish > task.deadlineAt, slaExceeded, delayMinutes: slaExceeded ? Math.max(0, Math.round((finish.getTime() - task.slaDueAt!.getTime()) / 60000)) : 0 };
}
