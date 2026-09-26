import type { Prisma } from "@prisma/client";
import type { AuthenticatedContext } from "@/application/security/auth-context";
import { isManagement, taskScope } from "@/application/security/operational-scope";
import { effectiveWorkSeconds } from "@/domain/rules/execution-state";

export async function changeExecutionState(tx: Prisma.TransactionClient, c: AuthenticatedContext, id: string, operation: "CANCEL" | "REOPEN", reason: string, category = "OPERACIONAL") {
  if (!isManagement(c)) return { error: "Apenas gestores podem alterar execuções." };
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"execution:" + id}))`;
  const execution = await tx.processExecution.findFirst({
    where: { id, organizationId: c.organizationId, ...(c.role === "MANAGER" ? { locationId: { in: c.scope?.locationIds ?? [] }, tasks: { every: taskScope(c) } } : {}) },
    include: { tasks: { where: { deletedAt: null }, include: { sessions: { include: { pauses: true } }, assignments: { where: { removedAt: null }, include: { member: { select: { userId: true } } } } } } },
  });
  if (!execution) return { error: "Execução não encontrada no seu escopo." };
  if (operation === "REOPEN" && execution.status !== "COMPLETED") return { error: "Selecione uma execução concluída." };
  if (operation === "CANCEL" && ["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(execution.status)) return { error: "Esta execução já está encerrada." };
  const targets = execution.tasks.filter(task => operation === "REOPEN" ? task.required : !["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(task.status));
  if (operation === "REOPEN" && !targets.length) return { error: "Esta execução contém apenas tarefas opcionais. Consulte e acompanhe essas tarefas individualmente." };
  const now = new Date();
  for (const task of targets.sort((a, b) => a.id.localeCompare(b.id))) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${task.id}))`;
    await tx.taskPause.updateMany({ where: { session: { taskId: task.id }, endedAt: null }, data: { endedAt: now } });
    await tx.taskExecutionSession.updateMany({ where: { taskId: task.id, endedAt: null }, data: { endedAt: now } });
    await tx.task.update({ where: { id: task.id, organizationId: c.organizationId }, data: operation === "REOPEN" ? { status: "NEEDS_CORRECTION", completedAt: null } : { status: "CANCELLED", cancelledAt: now, cancellationReason: `[${category}] ${reason}`, actualDuration: effectiveWorkSeconds(task.sessions, now) } });
    if (operation === "REOPEN") {
      await tx.approvalWorkflow.updateMany({ where: { taskId: task.id }, data: { status: "NEEDS_CORRECTION" } });
      await tx.approvalStep.updateMany({ where: { workflow: { taskId: task.id } }, data: { status: "PENDING" } });
    }
    await tx.activityLog.create({ data: { organizationId: c.organizationId, actorId: c.memberId, entityType: "TASK", entityId: task.id, action: operation === "REOPEN" ? "TASK_CORRECTION_REQUESTED" : "TASK_CANCELLED", metadata: { executionId: id, reason, category }, createdAt: now } });
    for (const userId of new Set(task.assignments.map(assignment => assignment.member.userId))) {
      await tx.notification.create({ data: { organizationId: c.organizationId, userId, type: operation === "REOPEN" ? "TASK_CORRECTION_REQUESTED" : "TASK_CANCELLED", title: operation === "REOPEN" ? "Correção solicitada" : "Execução cancelada", message: `${task.title}: ${reason}`, data: { taskId: task.id, executionId: id } } });
    }
  }
  await tx.processExecution.update({ where: { id, organizationId: c.organizationId }, data: operation === "REOPEN" ? { status: "NEEDS_CORRECTION", reopenedAt: now, reopenedBy: c.memberId, reopenReason: reason, completedAt: null } : { status: "CANCELLED", cancelledAt: now, cancellationReason: `[${category}] ${reason}` } });
  await tx.activityLog.create({ data: { organizationId: c.organizationId, actorId: c.memberId, action: operation === "REOPEN" ? "EXECUTION_REOPENED" : "EXECUTION_CANCELLED", entityType: "EXECUTION", entityId: id, metadata: { reason, category, affectedTasks: targets.length }, createdAt: now } });
  return { success: true };
}
