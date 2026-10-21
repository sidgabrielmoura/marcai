import type { Prisma, ExecutionStatus } from "@prisma/client";
import { evaluateTaskDependencies } from "@/domain/rules/dependency-rules";
import { resolveExecutionStatus } from "@/domain/rules/execution-state";
import { eligibleMember } from "@/application/security/operational-scope";
import { deadline } from "@/domain/rules/employee-workflow";

export async function synchronizeExecution(
  tx: Prisma.TransactionClient,
  organizationId: string,
  executionId: string | null,
  now = new Date(),
  changedTaskId?: string,
) {
  if (executionId)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"execution:" + executionId}))`;
  const where = {
    organizationId,
    deletedAt: null,
    ...(changedTaskId
      ? {
          OR: [
            ...(executionId ? [{ executionId }] : []),
            { dependencies: { some: { dependsOnId: changedTaskId } } },
          ],
        }
      : executionId
        ? { executionId }
        : {}),
  };
  const blocked = await tx.task.findMany({
    where: {
      ...where,
      status: "BLOCKED",
      managementBlocked: false,
      dependencies: {
        some: { type: { in: ["BLOCKING", "APPROVAL_CONDITION"] } },
      },
    },
    include: {
      execution: { select: { status: true } },
      dependencies: {
        include: { dependsOnTask: { include: { approvalWorkflow: true } } },
      },
      assignments: {
        where: { removedAt: null },
        include: { member: { select: { userId: true, status: true } } },
      },
    },
  });

  for (const task of blocked) {
    if (task.managementBlocked) continue;
    if (
      task.execution &&
      ["CANCELLED", "NOT_COMPLETED", "PAUSED"].includes(task.execution.status)
    )
      continue;
    // A manual management block has no operational dependency to release it.
    if (
      !task.dependencies.some((dependency) => dependency.type !== "INFORMATIVE")
    )
      continue;
    const dependency = evaluateTaskDependencies(
      task.dependencies.map((d) => ({
        dependsOnTaskId: d.dependsOnId,
        dependsOnStatus: d.dependsOnTask.status,
        dependsOnApprovalStatus: d.dependsOnTask.approvalWorkflow?.status,
        type: d.type,
        logic: d.logic,
      })),
    );
    if (dependency.isBlocked) continue;
    const eligibility = [];
    for (const assignment of task.assignments)
      eligibility.push(
        await eligibleMember(
          organizationId,
          assignment.memberId,
          task.locationId,
          task.teamId,
          tx,
          now,
        ),
      );
    if (eligibility.some((member) => !member)) continue;

    const timing = deadline(task, now.getTime());

    const released = await tx.task.updateMany({
      where: { id: task.id, organizationId, status: "BLOCKED" },
      data: {
        status: "AVAILABLE",
      },
    });
    if (!released.count) continue;

    for (const assignment of task.assignments) {
      if (
        !timing.scheduled &&
        timing.phase !== "EXCEEDED" &&
        assignment.member?.status === "ACTIVE" &&
        assignment.member.userId
      ) {
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
  const execution = await tx.processExecution.findFirst({
    where: { id: executionId, organizationId },
    include: {
      tasks: {
        where: { deletedAt: null },
        include: { approvalWorkflow: true },
      },
    },
  });
  if (!execution) return;
  const status = resolveExecutionStatus(execution, now) as ExecutionStatus;
  if (status === execution.status) return;

  await tx.processExecution.update({
    where: { id: executionId, organizationId },
    data: {
      status,
      completedAt:
        status === "COMPLETED" ? (execution.completedAt ?? now) : null,
      ...(!execution.startedAt && execution.tasks.some((task) => task.startedAt)
        ? { startedAt: now }
        : {}),
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
            teamMemberships: {
              some: {
                team: { organizationId, status: "ACTIVE" },
                teamId: {
                  in: execution.tasks.flatMap((t) =>
                    t.teamId ? [t.teamId] : [],
                  ),
                },
              },
            },
            ...(execution.locationId
              ? {
                  locationAccesses: {
                    some: {
                      locationId: execution.locationId,
                      AND: [
                        {
                          OR: [{ startsAt: null }, { startsAt: { lte: now } }],
                        },
                        {
                          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                        },
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

    const executors = await tx.taskAssignment.findMany({
      where: {
        removedAt: null,
        task: { executionId, organizationId, deletedAt: null },
      },
      include: {
        task: { select: { locationId: true, teamId: true } },
        member: { select: { userId: true, status: true } },
      },
    });
    const executorUsers = new Set<string>();
    for (const a of executors) {
      if (
        await eligibleMember(
          organizationId,
          a.memberId,
          a.task.locationId,
          a.task.teamId,
          tx,
          now,
        )
      )
        executorUsers.add(a.member.userId);
    }
    if (executorUsers.size)
      await tx.notification.createMany({
        data: [...executorUsers].map((userId) => ({
          organizationId,
          userId,
          type: "EXECUTION_COMPLETED",
          priority: "LOW" as const,
          title: "Etapas obrigatórias concluídas",
          message:
            "As etapas obrigatórias desta execução foram concluídas. Confira o contexto e as etapas opcionais.",
          data: { executionId },
        })),
      });
    const managerUserIds = [...new Set(managers.map((m) => m.userId))];
    if (managerUserIds.length > 0) {
      await tx.notification.createMany({
        data: managerUserIds.map((userId) => ({
          organizationId,
          userId,
          type: "EXECUTION_COMPLETED",
          priority: "LOW" as const,
          title: "Rotina concluída",
          message:
            "As etapas obrigatórias e suas aprovações foram concluídas. Confira as etapas opcionais.",
          data: { executionId },
        })),
      });
    }
  }
}
