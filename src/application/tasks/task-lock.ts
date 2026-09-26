import type { Prisma } from "@prisma/client";

// All task mutations take the execution lock before the task lock. This also
// serializes cancellation/reopening against submissions and approval decisions.
export async function lockTask(tx: Prisma.TransactionClient, organizationId: string, taskId: string) {
  const task = await tx.task.findFirst({ where: { id: taskId, organizationId }, select: { executionId: true } });
  if (task?.executionId) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"execution:" + task.executionId}))`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${taskId}))`;
}
