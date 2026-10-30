import { notificationTransaction } from "@/infrastructure/notifications/transaction";
import { materializeProcessTasks } from "./materialize-tasks";
import type { DispatchNotificationAsyncParams } from "@/infrastructure/notifications/notification-service";
import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import type { AuthenticatedContext } from "@/application/security/auth-context";
import { processScope } from "@/application/security/operational-scope";
import { readProcessDefinition } from "@/domain/rules/process-definition";
import { canGenerateExecutionForRoutine, resolveExecutionInitialStatus } from "@/domain/rules/routine-generator";
import { nextOccurrence } from "@/domain/rules/schedule";


export function routineScheduledAt(routine: {
  updatedAt: Date; recurrenceRule: string; startsAt: Date; endsAt: Date | null; timezone: string;
  process: { updatedAt: Date; validFrom: Date | null; validUntil: Date | null };
}, previous: { scheduledAt: Date } | undefined, now: Date, automatic: boolean, recoverSince?: Date) {
  const recoveryFloor=automatic&&recoverSince?Math.max(recoverSince.getTime(),now.getTime()-86400000):now.getTime()-(automatic?60000:1);
  const floor = new Date(Math.max(recoveryFloor, routine.updatedAt.getTime() - 1, routine.process.updatedAt.getTime() - 1, previous?.scheduledAt.getTime() ?? 0, (routine.process.validFrom?.getTime() ?? 0) - 1));
  const scheduledAt = nextOccurrence(routine.recurrenceRule, routine.startsAt, routine.endsAt, routine.timezone, floor);
  return !scheduledAt || routine.process.validUntil && scheduledAt > routine.process.validUntil ? null : scheduledAt;
}

export async function generateRoutineExecution(routineId: string, context: AuthenticatedContext, now = new Date(), automatic = false, recoverSince?: Date) {
  const notifications: DispatchNotificationAsyncParams[] = [];
  const result = await notificationTransaction(async tx => {
    // Serialize generation by routine so concurrent clicks cannot duplicate occurrences.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${routineId}))`;
    const routine = await tx.routine.findFirst({ where: { id: routineId, process: { ...processScope(context), organization: { status: 'ACTIVE' } } }, include: {
      process: { include: { sourceTemplateVersion: true } },
      executions: { orderBy: { scheduledAt: "desc" }, take: 1 },
    } });
    if (!routine || routine.status !== "ACTIVE" || routine.process.status !== "ACTIVE") return { error: "A rotina e o processo precisam estar ativos." };
    const definition = readProcessDefinition(routine.process.sourceTemplateVersion?.definition);
    if (!definition) return { error: "Este processo ainda não tem etapas configuradas. Abra Editar processo e salve as tarefas antes de gerar uma execução." };
    if (context.role === "MANAGER" && definition.tasks.some(t => !context.scope?.teamIds.includes(t.teamId))) return { error: "O processo contém equipes fora do seu escopo." };
    // Repeated clicks return the already scheduled next occurrence rather than adding more.
    if (routine.executions[0]?.scheduledAt && routine.executions[0].scheduledAt > now) {
      return { success: true, generated: false, data: { id: routine.executions[0].id } };
    }

    const check = canGenerateExecutionForRoutine(routine.pendingPreviousPolicy, routine.executions[0], now);
    if (!check.shouldGenerate) {
      if (check.action === "SKIP") {
        return { success: true, generated: false, skipped: true, reason: check.reason };
      }
      return { error: check.reason || "A execução anterior ainda está pendente. Conclua-a ou altere a regra de pendência na rotina.", blocked: true };
    }
    const scheduledAt = routineScheduledAt(routine, routine.executions[0], now, automatic, recoverSince);
    if (!scheduledAt) return { error: "Não há próxima ocorrência dentro da validade do processo e da rotina." };
    if (automatic && scheduledAt.getTime() > now.getTime() + routine.generationLeadTime * 60000) return { error: "Fora da janela de geração antecipada." };
    const isNowOrPast = scheduledAt <= now;
    const initialStatus = resolveExecutionInitialStatus(scheduledAt, now);
    const execution = await tx.processExecution.create({ data: {
      organizationId: context.organizationId, processId: routine.processId, routineId, locationId: routine.process.locationId,
      scheduledAt, availableAt: scheduledAt, status: initialStatus,
      startedAt: isNowOrPast ? now : null,
      definitionSnapshot: definition as unknown as Prisma.InputJsonValue,
    } });
    notifications.push(...await materializeProcessTasks(tx, context, execution, definition, now, routine.timezone));
    await tx.activityLog.create({ data: { organizationId: context.organizationId, actorId: context.memberId || null, action: "EXECUTION_GENERATED", entityType: "EXECUTION", entityId: execution.id, metadata: { scheduledAt: scheduledAt.toISOString(), templateVersion: routine.process.sourceTemplateVersion?.version ?? 1 } } });
    return { success: true, generated: true, data: { id: execution.id } };
  }, { timeout: 30000 });

  return result;
}
