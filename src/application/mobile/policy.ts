export {
  MAX_TASK_DURATION_MS,
  deadline,
  dayKey,
  columnFor,
  boardState,
} from "@/domain/rules/employee-workflow";
const id = (v: unknown): v is string =>
  typeof v === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(v);
export function parseDestination(data: Record<string, unknown> | null) {
  if (!data || !id(data.organizationId)) return null;
  if (
    (data.taskId != null && !id(data.taskId)) ||
    (data.executionId != null && !id(data.executionId)) ||
    (data.notificationId != null && !id(data.notificationId))
  )
    return null;
  return {
    organizationId: data.organizationId,
    ...(id(data.taskId) ? { taskId: data.taskId } : {}),
    ...(id(data.executionId) ? { executionId: data.executionId } : {}),
    ...(id(data.notificationId) ? { notificationId: data.notificationId } : {}),
  };
}
export function retryDelay(
  attempt: number,
  random: () => number = Math.random,
) {
  return (
    Math.min(3600000, 1000 * 2 ** Math.min(attempt, 12)) *
    (0.75 + random() * 0.5)
  );
}
