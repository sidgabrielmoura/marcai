import type { Prisma, ExecutionStatus } from "@prisma/client";
import { evaluateTaskDependencies } from "@/domain/rules/dependency-rules";
import { resolveExecutionStatus } from "@/domain/rules/execution-state";
import { eligibleMember } from "@/application/security/operational-scope";

export async function synchronizeExecution(tx: Prisma.TransactionClient, organizationId: string, executionId: string | null, now = new Date()) {
  const where = { organizationId, deletedAt: null, ...(executionId ? { executionId } : {}) };
  const blocked = await tx.task.findMany({ where: { ...where, status: "BLOCKED" }, include: { execution: { select: { status: true } }, dependencies: { include: { dependsOnTask: { include: { approvalWorkflow: true } } } }, assignments: { where: { removedAt: null } } } });
  for (const task of blocked) {
    if (task.execution && ["CANCELLED", "NOT_COMPLETED"].includes(task.execution.status)) continue;
    const dependency = evaluateTaskDependencies(task.dependencies.map(d => ({ dependsOnTaskId: d.dependsOnId, dependsOnStatus: d.dependsOnTask.status, dependsOnApprovalStatus: d.dependsOnTask.approvalWorkflow?.status, type: d.type, logic: d.logic })));
    if (dependency.isBlocked) continue;
    const eligibility = [];
    for (const assignment of task.assignments) eligibility.push(await eligibleMember(organizationId, assignment.memberId, task.locationId, assignment.type === "COLLABORATOR" ? null : task.teamId, tx, now));
    if (eligibility.some(member => !member)) continue;
    await tx.task.updateMany({ where: { id: task.id, organizationId, status: "BLOCKED" }, data: { status: "AVAILABLE", slaDueAt: task.slaStartEvent === "ON_AVAILABLE" && task.slaDurationMinutes ? new Date(Math.max(now.getTime(), task.scheduledDate?.getTime() ?? 0) + task.slaDurationMinutes * 60000) : null } });
  }
  if (!executionId) return;
  const execution = await tx.processExecution.findFirst({ where: { id: executionId, organizationId }, include: { tasks: { where: { deletedAt: null }, include: { approvalWorkflow: true } } } });
  if (!execution) return;
  const status = resolveExecutionStatus(execution, now) as ExecutionStatus;
  if (status === execution.status) return;
  await tx.processExecution.update({ where: { id: executionId, organizationId }, data: { status, completedAt: status === "COMPLETED" ? execution.completedAt ?? now : null, ...(!execution.startedAt && execution.tasks.some(task => task.startedAt) ? { startedAt: now } : {}) } });
  await tx.activityLog.create({ data: { organizationId, action: "EXECUTION_STATUS_CHANGED", entityType: "EXECUTION", entityId: executionId, metadata: { previousStatus: execution.status, status }, createdAt: now } });
}
