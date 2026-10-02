import type { Prisma, ExecutionStatus } from "@prisma/client";
import { evaluateTaskDependencies } from "@/domain/rules/dependency-rules";
import { resolveExecutionStatus } from "@/domain/rules/execution-state";
import { eligibleMember } from "@/application/security/operational-scope";

export async function synchronizeExecution(tx: Prisma.TransactionClient, organizationId: string, executionId: string | null, now = new Date()) {
  const where = { organizationId, deletedAt: null, ...(executionId ? { executionId } : {}) };
  const blocked = await tx.task.findMany({
    where: { ...where, status: "BLOCKED" },
    include: {
      execution: { select: { status: true } },
      dependencies: { include: { dependsOnTask: { include: { approvalWorkflow: true } } } },
      assignments: {
        where: { removedAt: null },
        include: { member: { select: { userId: true, status: true } } },
      },
    },
  });

  for (const task of blocked) {
    if (task.execution && ["CANCELLED", "NOT_COMPLETED"].includes(task.execution.status)) continue;
    const dependency = evaluateTaskDependencies(task.dependencies.map(d => ({ dependsOnTaskId: d.dependsOnId, dependsOnStatus: d.dependsOnTask.status, dependsOnApprovalStatus: d.dependsOnTask.approvalWorkflow?.status, type: d.type, logic: d.logic })));
    if (dependency.isBlocked) continue;
    const eligibility = [];
    for (const assignment of task.assignments) eligibility.push(await eligibleMember(organizationId, assignment.memberId, task.locationId, assignment.type === "COLLABORATOR" ? null : task.teamId, tx, now));
    if (eligibility.some(member => !member)) continue;

    await tx.task.updateMany({
      where: { id: task.id, organizationId, status: "BLOCKED" },
      data: {
        status: "IN_PROGRESS",
        startedAt: now,
        slaDueAt: task.slaStartEvent === "ON_AVAILABLE" && task.slaDurationMinutes ? new Date(Math.max(now.getTime(), task.scheduledDate?.getTime() ?? 0) + task.slaDurationMinutes * 60000) : null,
      },
    });

    for (const assignment of task.assignments) {
      await tx.taskExecutionSession.create({
        data: { taskId: task.id, memberId: assignment.memberId, startedAt: now },
      });
    }

    for (const assignment of task.assignments) {
      if (assignment.member?.status === "ACTIVE" && assignment.member.userId) {
        await tx.notification.create({
          data: {
            organizationId,
            userId: assignment.member.userId,
            type: "TASK_UNBLOCKED",
            priority: task.priority,
            title: "Tarefa liberada para execução",
            message: `A tarefa “${task.title}” foi desbloqueada e está disponível.`,
            data: { taskId: task.id },
          },
        });
      }
    }
  }

  if (!executionId) return;
  const execution = await tx.processExecution.findFirst({ where: { id: executionId, organizationId }, include: { tasks: { where: { deletedAt: null }, include: { approvalWorkflow: true } } } });
  if (!execution) return;
  const status = resolveExecutionStatus(execution, now) as ExecutionStatus;
  if (status === execution.status) return;

  await tx.processExecution.update({
    where: { id: executionId, organizationId },
    data: {
      status,
      completedAt: status === "COMPLETED" ? execution.completedAt ?? now : null,
      ...(!execution.startedAt && execution.tasks.some(task => task.startedAt) ? { startedAt: now } : {}),
    },
  });

  await tx.activityLog.create({
    data: {
      organizationId,
      action: "EXECUTION_STATUS_CHANGED",
      entityType: "EXECUTION",
      entityId: executionId,
      metadata: { previousStatus: execution.status, status },
      createdAt: now,
    },
  });

  if (status === "COMPLETED") {
    const managers = await tx.organizationMember.findMany({
      where: {
        organizationId,
        status: "ACTIVE",
        user: { status: "ACTIVE" },
        OR: [
          { role: { in: ["OWNER", "ADMIN"] } },
          {
            role: "MANAGER",
            ...(execution.locationId
              ? {
                  locationAccesses: {
                    some: {
                      locationId: execution.locationId,
                      AND: [
                        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
                        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
                      ],
                    },
                  },
                }
              : {}),
          },
        ],
      },
      select: { userId: true },
    });

    const managerUserIds = [...new Set(managers.map(m => m.userId))];
    if (managerUserIds.length > 0) {
      await tx.notification.createMany({
        data: managerUserIds.map(userId => ({
          organizationId,
          userId,
          type: "EXECUTION_COMPLETED",
          priority: "LOW" as const,
          title: "Rotina concluída",
          message: "Todas as tarefas desta execução foram finalizadas com sucesso.",
          data: { executionId },
        })),
      });
    }
  }
}
