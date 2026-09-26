import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import type { AuthenticatedContext } from "@/application/security/auth-context";
import { processScope } from "@/application/security/operational-scope";
import { readProcessDefinition } from "@/domain/rules/process-definition";
import { canGenerateExecutionForRoutine, resolveExecutionInitialStatus } from "@/domain/rules/routine-generator";
import { nextOccurrence } from "@/domain/rules/schedule";

export async function generateRoutineExecution(routineId: string, context: AuthenticatedContext, now = new Date(), automatic = false) {
  return prisma.$transaction(async tx => {
    // Serialize generation by routine so concurrent clicks cannot duplicate occurrences.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${routineId}))`;
    const routine = await tx.routine.findFirst({ where: { id: routineId, process: processScope(context) }, include: {
      process: { include: { sourceTemplateVersion: true } },
      executions: { orderBy: { scheduledAt: "desc" }, take: 1 },
    } });
    if (!routine || routine.status !== "ACTIVE" || routine.process.status !== "ACTIVE") return { error: "A rotina e o processo precisam estar ativos." };
    const definition = readProcessDefinition(routine.process.sourceTemplateVersion?.definition);
    if (!definition) return { error: "Este processo ainda não tem etapas configuradas. Abra Editar processo e salve as tarefas antes de gerar uma execução." };
    if (context.role === "MANAGER" && definition.tasks.some(t => !context.scope?.teamIds.includes(t.teamId))) return { error: "O processo contém equipes fora do seu escopo." };
    const check = canGenerateExecutionForRoutine(routine.pendingPreviousPolicy, routine.executions[0]);
    if (!check.shouldGenerate) {
      if (check.action === "SKIP") {
        return { success: true, generated: false, skipped: true, reason: check.reason };
      }
      return { error: check.reason || "A execução anterior ainda está pendente. Conclua-a ou altere a regra de pendência na rotina.", blocked: true };
    }
    const floor = new Date(Math.max(now.getTime() - (automatic ? 60000 : 1), routine.updatedAt.getTime() - 1, routine.process.updatedAt.getTime() - 1, routine.executions[0]?.scheduledAt.getTime() ?? 0, (routine.process.validFrom?.getTime() ?? 0) - 1));
    const scheduledAt = nextOccurrence(routine.recurrenceRule, routine.startsAt, routine.endsAt, routine.timezone, floor);
    if (!scheduledAt || routine.process.validUntil && scheduledAt > routine.process.validUntil) return { error: "Não há próxima ocorrência dentro da validade do processo e da rotina." };
    if (automatic && scheduledAt.getTime() > now.getTime() + routine.generationLeadTime * 60000) return { error: "Fora da janela de geração antecipada." };
    // Repeated clicks return the already scheduled next occurrence rather than adding more.
    if (routine.executions[0]?.scheduledAt && routine.executions[0].scheduledAt > now) return { success: true, generated: false, data: { id: routine.executions[0].id } };
    const execution = await tx.processExecution.create({ data: {
      organizationId: context.organizationId, processId: routine.processId, routineId, locationId: routine.process.locationId,
      scheduledAt, availableAt: scheduledAt, status: resolveExecutionInitialStatus(scheduledAt, now),
      definitionSnapshot: definition as unknown as Prisma.InputJsonValue,
    } });
    const taskIds = new Map<string, string>();
    for (const t of definition.tasks) {
      const blocked = t.dependsOn.length > 0 && t.dependencyType !== "INFORMATIVE";
      const task = await tx.task.create({ data: {
        organizationId: context.organizationId, processId: routine.processId, executionId: execution.id, locationId: routine.process.locationId,
        origin: "PROCESS", teamId: t.teamId, title: t.title, instructions: t.instructions, required: t.required, criticality: definition.criticality, priority: definition.criticality,
        estimatedDuration: t.estimatedDuration, slaDurationMinutes: t.slaMinutes, slaStartEvent: "ON_AVAILABLE",
        scheduledDate: scheduledAt, deadlineAt: new Date(scheduledAt.getTime() + t.slaMinutes * 60000),
        slaDueAt: !blocked && scheduledAt <= now ? new Date(now.getTime() + t.slaMinutes * 60000) : null,
        status: blocked ? "BLOCKED" : "AVAILABLE",
        ...(t.evidenceType ? { evidenceRequirements: { create: { type: t.evidenceType, required: true, minQuantity: 1, maxQuantity: 1 } } } : {}),
        ...(t.approverIds.length ? { approvalWorkflow: { create: { mode: t.approvalMode, steps: { create: t.approverIds.map((id, i) => ({ sequence: i + 1, approverMemberId: id })) } } } } : {}),
      } });
      taskIds.set(t.id, task.id);
      if (t.primaryMemberId) {
        const member = await tx.organizationMember.findFirst({ where: { id: t.primaryMemberId, organizationId: context.organizationId, status: "ACTIVE", user: { status: "ACTIVE" }, teamMemberships: { some: { teamId: t.teamId } }, locationAccesses: { some: { locationId: definition.locationId, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: scheduledAt } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: scheduledAt } }] }] } } } });
        if (member) await tx.taskAssignment.create({ data: { taskId: task.id, memberId: member.id, assignedBy: context.memberId || null } });
      }
    }
    for (const t of definition.tasks) for (const id of t.dependsOn) await tx.taskDependency.create({ data: { taskId: taskIds.get(t.id)!, dependsOnId: taskIds.get(id)!, type: t.dependencyType, logic: t.dependencyLogic } });
    await tx.activityLog.create({ data: { organizationId: context.organizationId, actorId: context.memberId || null, action: "EXECUTION_GENERATED", entityType: "EXECUTION", entityId: execution.id, metadata: { scheduledAt: scheduledAt.toISOString(), templateVersion: routine.process.sourceTemplateVersion?.version ?? 1 } } });
    return { success: true, generated: true, data: { id: execution.id } };
  }, { timeout: 30000 });
}
