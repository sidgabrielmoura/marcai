type ExecutionTask = {
  required: boolean;
  status: string;
  startedAt: Date | null;
  approvalWorkflow?: { status: string } | null;
};

export function resolveExecutionStatus(
  execution: { status: string; availableAt: Date; tasks: ExecutionTask[] },
  now = new Date(),
) {
  if (["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(execution.status)) return execution.status;
  if (execution.availableAt > now && !execution.tasks.some(task => task.startedAt)) return "SCHEDULED";
  const required = execution.tasks.filter(task => task.required);
  if (execution.tasks.length && required.every(task => task.status === "COMPLETED" && (!task.approvalWorkflow || task.approvalWorkflow.status === "APPROVED"))) return "COMPLETED";
  if (required.some(task => task.status === "NEEDS_CORRECTION")) return "NEEDS_CORRECTION";
  if (required.some(task => task.status === "SUBMITTED" || task.status === "COMPLETED" && task.approvalWorkflow && task.approvalWorkflow.status !== "APPROVED")) return "PENDING_REVIEW";
  if (required.some(task => ["CANCELLED", "NOT_COMPLETED"].includes(task.status)) && required.every(task => ["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(task.status))) return "NOT_COMPLETED";
  const running = execution.tasks.filter(task => ["IN_PROGRESS", "PAUSED"].includes(task.status));
  if (running.length && running.every(task => task.status === "PAUSED")) return "PAUSED";
  return execution.tasks.some(task => task.startedAt) ? "IN_PROGRESS" : "AVAILABLE";
}

export function effectiveWorkSeconds(sessions: { startedAt: Date; endedAt: Date | null; pauses: { startedAt: Date; endedAt: Date | null }[] }[], now = new Date()) {
  return Math.round(sessions.reduce((total, session) => {
    const end = (session.endedAt ?? now).getTime();
    const start = session.startedAt.getTime();
    const paused = session.pauses.reduce((sum, pause) => sum + Math.max(0, Math.min(end, (pause.endedAt ?? now).getTime()) - Math.max(start, pause.startedAt.getTime())), 0);
    return total + Math.max(0, end - start - paused) / 1000;
  }, 0));
}
