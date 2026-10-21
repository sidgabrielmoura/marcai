import { z } from "zod";
import type { AuthenticatedContext } from "@/application/security/auth-context";
import { eligibleMember } from "@/application/security/operational-scope";
import { lockTask } from "@/application/tasks/task-lock";
import { taskDetailScope } from "./data";
import { fail } from "./http";
import { idempotent } from "./idempotency";

// Called only by an explicit POST after opening the detail, never by GET/prefetch.
export async function recordTaskView(
  req: Request,
  context: AuthenticatedContext,
  taskId: string,
) {
  z.string().min(1).max(128).parse(taskId);
  if (context.role !== "EMPLOYEE")
    fail(403, "ROLE_UNSUPPORTED", "Somente funcionários registram visualizações.");

  return idempotent(req, context, { operation: "task-view", taskId }, async (tx) => {
    await lockTask(tx, context.organizationId, taskId);
    const task = await tx.task.findFirst({
      where: { ...taskDetailScope(context), id: taskId },
      select: {
        locationId: true,
        teamId: true,
        status: true,
        assignments: {
          where: { removedAt: null, type: "PRIMARY" },
          select: { memberId: true },
        },
      },
    });
    if (!task) fail(404, "TASK_UNAVAILABLE", "Tarefa indisponível no seu acesso.");
    const now = new Date();
    if (!(await eligibleMember(context.organizationId, context.memberId, task.locationId, task.teamId, tx, now)))
      fail(403, "ACCESS_CHANGED", "Seu acesso à equipe ou unidade mudou.");

    const log = await tx.activityLog.create({
      data: {
        organizationId: context.organizationId,
        actorId: context.memberId,
        entityType: "TASK",
        entityId: taskId,
        action: "TASK_VIEWED",
        metadata: {
          actorName: context.userName,
          wasUnassigned: task.assignments.length === 0 && !["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(task.status),
        },
        createdAt: now,
      },
      select: { id: true, createdAt: true },
    });
    return { success: true, id: log.id, viewedAt: log.createdAt.toISOString() };
  });
}
