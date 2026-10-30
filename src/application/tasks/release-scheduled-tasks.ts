import { prisma } from "@/infrastructure/database/prisma";
import { notificationTransaction } from "@/infrastructure/notifications/transaction";
import { lockTask } from "@/application/tasks/task-lock";
import { publishSyncRequired } from "@/infrastructure/realtime/sync";

export interface ReleaseScheduledTasksOptions {
  organizationId?: string;
  now?: Date;
  limit?: number;
}

/**
 * Libera tarefas agendadas que atingiram o horário de início (scheduledDate <= now).
 * Quando a tarefa possui responsável atribuído:
 *  - Atualiza status para IN_PROGRESS
 *  - Registra startedAt e inicia a sessão de execução
 *  - Dispara a notificação push (FCM Web, Native e Ably realtime) para o colaborador
 *  - Registra a liberação em log de auditoria
 */
export async function releaseDueScheduledTasks(
  options: ReleaseScheduledTasksOptions = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 100;

  const dueTasks = await prisma.task.findMany({
    where: {
      deletedAt: null,
      status: "AVAILABLE",
      scheduledDate: { lte: now },
      ...(options.organizationId ? { organizationId: options.organizationId } : {}),
      organization: { status: "ACTIVE" },
    },
    include: {
      assignments: {
        where: { removedAt: null, type: "PRIMARY" },
        include: { member: { select: { id: true, userId: true } } },
      },
    },
    take: limit,
    orderBy: { scheduledDate: "asc" },
  });

  if (!dueTasks.length) return 0;

  let releasedCount = 0;
  const changedOrgs = new Set<string>();

  for (const candidate of dueTasks) {
    try {
      const released = await notificationTransaction(async (tx) => {
        await lockTask(tx, candidate.organizationId, candidate.id);

        // Revalida sob lock para garantir concorrência segura
        const task = await tx.task.findFirst({
          where: {
            id: candidate.id,
            organizationId: candidate.organizationId,
            deletedAt: null,
            status: "AVAILABLE",
            scheduledDate: { lte: now },
          },
          include: {
            assignments: {
              where: { removedAt: null, type: "PRIMARY" },
              include: { member: { select: { id: true, userId: true } } },
            },
          },
        });

        if (!task) return false;

        const hasPrimaryAssignee = task.assignments.length > 0;

        // Se não possui responsável, verifica se já foi registrada a liberação para evitar reprocessamento
        if (!hasPrimaryAssignee) {
          const alreadyLogged = await tx.activityLog.findFirst({
            where: { entityId: task.id, action: "TASK_SCHEDULE_RELEASED" },
            select: { id: true },
          });
          if (alreadyLogged) return false;
        }

        const nextStatus = hasPrimaryAssignee ? "IN_PROGRESS" : "AVAILABLE";

        await tx.task.update({
          where: { id: task.id },
          data: {
            status: nextStatus,
            startedAt: hasPrimaryAssignee ? now : task.startedAt,
          },
        });

        if (hasPrimaryAssignee) {
          for (const assignment of task.assignments) {
            const activeSession = await tx.taskExecutionSession.findFirst({
              where: { taskId: task.id, memberId: assignment.memberId, endedAt: null },
            });
            if (!activeSession) {
              await tx.taskExecutionSession.create({
                data: {
                  taskId: task.id,
                  memberId: assignment.memberId,
                  startedAt: now,
                },
              });
            }

            // Notificação com disparo de push automático (FCM Web e Native App via notificationTransaction)
            await tx.notification.create({
              data: {
                organizationId: task.organizationId,
                userId: assignment.member.userId,
                type: "TASK_ASSIGNED",
                priority: task.priority,
                title: "Tarefa disponível para realização",
                message: `A tarefa “${task.title}” já está liberada para você iniciar.`,
                data: { taskId: task.id },
              },
            });
          }
        }

        await tx.activityLog.create({
          data: {
            organizationId: task.organizationId,
            action: "TASK_SCHEDULE_RELEASED",
            entityType: "TASK",
            entityId: task.id,
            metadata: {
              scheduledDate: task.scheduledDate ? task.scheduledDate.toISOString() : null,
              hasAssignee: hasPrimaryAssignee,
            },
          },
        });

        return true;
      });

      if (released) {
        releasedCount++;
        changedOrgs.add(candidate.organizationId);
      }
    } catch (err) {
      console.error(`[releaseDueScheduledTasks] Erro ao liberar tarefa ${candidate.id}:`, err);
    }
  }

  for (const orgId of changedOrgs) {
    try {
      await publishSyncRequired(orgId, ["TASK_CHANGED"]);
    } catch {}
  }

  return releasedCount;
}
