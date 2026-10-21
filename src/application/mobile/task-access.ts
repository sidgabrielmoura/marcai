import type { Prisma } from "@prisma/client";
import type { AuthenticatedContext } from "@/application/security/auth-context";
import {
  eligibleMember,
  taskScope,
} from "@/application/security/operational-scope";
import { includeTask, operationGuard } from "./data";
import { fail } from "./http";

export async function mutable(
  tx: Prisma.TransactionClient,
  context: AuthenticatedContext,
  id: string,
) {
  const task = await tx.task.findFirst({
    where: { ...taskScope(context), id, deletedAt: null },
    include: includeTask,
  });
  if (!task)
    fail(404, "TASK_UNAVAILABLE", "Tarefa indisponível no seu acesso.");
  const now = new Date();
  if (
    !(await eligibleMember(
      context.organizationId,
      context.memberId,
      task.locationId,
      task.teamId,
      tx,
      now,
    ))
  )
    fail(403, "ACCESS_CHANGED", "Seu acesso à equipe ou unidade mudou.");
  const permission = operationGuard(
    task,
    now,
    task.assignments.some(
      (assignment) => assignment.memberId === context.memberId,
    ),
  );
  if (!permission.allowed) fail(409, permission.code!, permission.reason!);
  return task;
}
