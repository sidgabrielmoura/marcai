import { Prisma } from "@prisma/client";
import type { ProcessDefinition } from "@/domain/rules/process-definition";
import { eligibleMember } from "@/application/security/operational-scope";
import type { DispatchNotificationAsyncParams } from "@/infrastructure/notifications/notification-service";

// Both immediate and recurring executions use the same immutable task snapshot.
// External deliveries are returned to the caller and dispatched only after commit.
export async function materializeProcessTasks(tx: Prisma.TransactionClient, context: { organizationId: string; memberId: string },
  execution: { id: string; processId: string; locationId: string | null; scheduledAt: Date }, definition: ProcessDefinition, now: Date) {
  const notifications: DispatchNotificationAsyncParams[] = [];
  const taskIds = new Map<string, string>();
  for (const [order, t] of definition.tasks.entries()) {
    const blocked = t.dependsOn.length > 0 && t.dependencyType !== "INFORMATIVE";
    const member = t.primaryMemberId ? await eligibleMember(context.organizationId, t.primaryMemberId, execution.locationId, t.teamId, tx, execution.scheduledAt) : null;
    const started = !blocked && !!member && execution.scheduledAt <= now;
    for (const id of t.approverIds) {
      const approver = await tx.organizationMember.findFirst({ where: { id, organizationId: context.organizationId, status: "ACTIVE", user: { status: "ACTIVE" }, role: { in: ["OWNER", "ADMIN", "MANAGER"] } } });
      if (!approver || approver.role === "MANAGER" && !await eligibleMember(context.organizationId, id, execution.locationId, t.teamId, tx, execution.scheduledAt)) throw new Error("Aprovador indisponível para a execução.");
    }
    const deadline = t.deadlineAt ? new Date(t.deadlineAt) : null;
    const task = await tx.task.create({ data: {
      organizationId: context.organizationId, processId: execution.processId, executionId: execution.id, locationId: execution.locationId,
      origin: "PROCESS", definitionTaskId: t.id, definitionOrder: order, teamId: t.teamId,
      title: t.title, description: t.objective, instructions: t.instructions, taskType: t.taskType,
      formFields: t.formFields as unknown as Prisma.InputJsonValue, required: t.required, priority: t.priority, criticality: t.criticality,
      toleranceMinutes: t.toleranceMinutes, slaDurationMinutes: null, slaStartEvent: "ON_AVAILABLE",
      scheduledDate: execution.scheduledAt, deadlineAt: deadline, slaDueAt: !blocked && execution.scheduledAt <= now ? deadline : null,
      status: blocked ? "BLOCKED" : started ? "IN_PROGRESS" : "AVAILABLE", startedAt: started ? now : null,
      ...(t.taskType !== "FORM" && t.evidenceType ? { evidenceRequirements: { create: { type: t.evidenceType, required: true, minQuantity: 1, maxQuantity: 1 } } } : {}),
      ...(t.approverIds.length ? { approvalWorkflow: { create: { mode: t.approvalMode, steps: { create: t.approverIds.map((id, i) => ({ sequence: i + 1, approverMemberId: id })) } } } } : {}),
    } });
    taskIds.set(t.id, task.id);
    if (member) {
      await tx.taskAssignment.create({ data: { taskId: task.id, memberId: member.id, type: "PRIMARY", assignedBy: context.memberId || null } });
      if (started) await tx.taskExecutionSession.create({ data: { taskId: task.id, memberId: member.id, startedAt: now } });
      if (!blocked) {
        const params: DispatchNotificationAsyncParams = { organizationId: context.organizationId, userIds: [member.userId], type: "TASK_ASSIGNED", priority: t.priority,
          title: execution.scheduledAt <= now ? "Você recebeu uma tarefa de processo" : "Tarefa de processo agendada", message: t.title,
          data: { taskId: task.id, executionId: execution.id }, clickAction: "/tasks/" + task.id, forcePush: true };
        await tx.notification.create({ data: { organizationId: context.organizationId, userId: member.userId, type: params.type, priority: t.priority, title: params.title, message: params.message, data: params.data as Prisma.InputJsonValue } });
        notifications.push(params);
      }
    }
  }
  for (const t of definition.tasks) for (const id of t.dependsOn) await tx.taskDependency.create({ data: { taskId: taskIds.get(t.id)!, dependsOnId: taskIds.get(id)!, type: t.dependencyType, logic: t.dependencyLogic } });
  return notifications;
}
