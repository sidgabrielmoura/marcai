"use server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import { getAuthenticatedContext } from "@/application/security/auth-context";
import { eligibleMember, isManagement, processScope } from "@/application/security/operational-scope";
import { processDefinitionSchema, readProcessDefinition, scheduleSchema, type ProcessDefinition } from "@/domain/rules/process-definition";
import { generateRoutineExecution } from "@/application/processes/generate-execution";
import { changeExecutionState } from "@/application/processes/execution-lifecycle";
import { dispatchNotificationAsync } from "@/infrastructure/notifications/notification-service";
import { revalidatePath } from "next/cache";
export type ActionResult = { success?: boolean; error?: string; data?: { id: string } };
function refresh() { for (const path of ["/management/processes", "/management/processes/archived", "/management/tasks", "/tasks", "/history", "/overview", "/notifications"]) revalidatePath(path); }

async function createInitialProcessExecution(
  tx: Prisma.TransactionClient,
  context: { organizationId: string; memberId: string },
  process: { id: string; locationId: string | null },
  definition: ProcessDefinition,
  routineId: string | null,
  now = new Date()
) {
  const execution = await tx.processExecution.create({
    data: {
      organizationId: context.organizationId,
      processId: process.id,
      routineId,
      locationId: process.locationId,
      scheduledAt: now,
      availableAt: now,
      startedAt: now,
      status: "IN_PROGRESS",
      definitionSnapshot: definition as unknown as Prisma.InputJsonValue,
    },
  });

  const taskIds = new Map<string, string>();
  for (const t of definition.tasks) {
    const blocked = t.dependsOn.length > 0 && t.dependencyType !== "INFORMATIVE";
    const task = await tx.task.create({
      data: {
        organizationId: context.organizationId,
        processId: process.id,
        executionId: execution.id,
        locationId: process.locationId,
        origin: "PROCESS",
        teamId: t.teamId,
        title: t.title,
        instructions: t.instructions,
        required: t.required,
        criticality: definition.criticality,
        priority: definition.criticality,
        estimatedDuration: t.estimatedDuration,
        slaDurationMinutes: t.slaMinutes,
        slaStartEvent: "ON_AVAILABLE",
        scheduledDate: now,
        deadlineAt: new Date(now.getTime() + t.slaMinutes * 60000),
        slaDueAt: !blocked ? new Date(now.getTime() + t.slaMinutes * 60000) : null,
        status: blocked ? "BLOCKED" : "IN_PROGRESS",
        startedAt: !blocked ? now : null,
        ...(t.evidenceType ? { evidenceRequirements: { create: { type: t.evidenceType, required: true, minQuantity: 1, maxQuantity: 1 } } } : {}),
        ...(t.approverIds.length ? { approvalWorkflow: { create: { mode: t.approvalMode, steps: { create: t.approverIds.map((id, i) => ({ sequence: i + 1, approverMemberId: id })) } } } } : {}),
      },
    });
    taskIds.set(t.id, task.id);

    if (t.primaryMemberId) {
      const member = await tx.organizationMember.findFirst({
        where: {
          id: t.primaryMemberId,
          organizationId: context.organizationId,
          status: "ACTIVE",
          user: { status: "ACTIVE" },
          teamMemberships: { some: { teamId: t.teamId } },
          ...(process.locationId ? {
            locationAccesses: {
              some: {
                locationId: process.locationId,
                AND: [
                  { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
                  { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
                ],
              },
            },
          } : {}),
        },
      });

      if (member) {
        await tx.taskAssignment.create({
          data: {
            taskId: task.id,
            memberId: member.id,
            type: "PRIMARY",
            assignedBy: context.memberId || null,
          },
        });

        if (!blocked) {
          await tx.taskExecutionSession.create({
            data: {
              taskId: task.id,
              memberId: member.id,
              startedAt: now,
            },
          });

          await tx.notification.create({
            data: {
              organizationId: context.organizationId,
              userId: member.userId,
              type: "TASK_ASSIGNED",
              priority: definition.criticality,
              title: "Nova tarefa de processo iniciada",
              message: t.title,
              data: { taskId: task.id, executionId: execution.id },
            },
          });

          void dispatchNotificationAsync({
            organizationId: context.organizationId,
            userIds: [member.userId],
            type: "TASK_ASSIGNED",
            priority: definition.criticality,
            title: "Nova tarefa de processo iniciada",
            message: t.title,
            data: { taskId: task.id, executionId: execution.id },
            clickAction: `/tasks/${task.id}`,
            forcePush: true,
          });
        }
      }
    }
  }

  for (const t of definition.tasks) {
    for (const id of t.dependsOn) {
      const parentTaskId = taskIds.get(id);
      const childTaskId = taskIds.get(t.id);
      if (parentTaskId && childTaskId) {
        await tx.taskDependency.create({
          data: {
            taskId: childTaskId,
            dependsOnId: parentTaskId,
            type: t.dependencyType,
            logic: t.dependencyLogic,
          },
        });
      }
    }
  }

  await tx.activityLog.create({
    data: {
      organizationId: context.organizationId,
      actorId: context.memberId || null,
      action: "EXECUTION_GENERATED",
      entityType: "EXECUTION",
      entityId: execution.id,
      metadata: { scheduledAt: now.toISOString(), immediateOnProcessCreate: true },
    },
  });

  return execution;
}

export async function createProcessAction(formData: FormData): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context || !isManagement(context)) return { error: "Apenas gestores podem salvar processos." };
  let input: unknown;
  try { input = JSON.parse(String(formData.get("definition"))); } catch { return { error: "Revise os dados do processo." }; }
  const parsed = processDefinitionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const definition = parsed.data;
  const existingId = String(formData.get("processId") || "");
  const existing = existingId ? await prisma.process.findFirst({ where: { ...processScope(context), id: existingId }, include: { sourceTemplateVersion: true } }) : null;
  if (existingId && (!existing || existing.status === "ARCHIVED")) return { error: "Processo indisponível para edição. Restaure-o antes de editar." };
  if (existing && context.role === "MANAGER" && readProcessDefinition(existing.sourceTemplateVersion?.definition)?.tasks.some(t => !context.scope?.teamIds.includes(t.teamId))) return { error: "Este processo contém equipes fora do seu escopo." };
  const location = await prisma.location.findFirst({ where: { id: definition.locationId, organizationId: context.organizationId, status: "ACTIVE" } });
  if (!location || context.role === "MANAGER" && !context.scope?.locationIds.includes(location.id)) return { error: "Unidade fora do seu acesso." };
  const teams = await prisma.team.findMany({ where: { organizationId: context.organizationId, status: "ACTIVE", id: { in: definition.tasks.map(t => t.teamId) } }, select: { id: true } });
  for (const task of definition.tasks) {
    if (!teams.some(t => t.id === task.teamId) || context.role === "MANAGER" && !context.scope?.teamIds.includes(task.teamId)) return { error: `Escolha uma equipe permitida para “${task.title}”.` };
    if (task.primaryMemberId && !await eligibleMember(context.organizationId, task.primaryMemberId, location.id, task.teamId)) return { error: `O responsável por “${task.title}” precisa pertencer à equipe e ter acesso à unidade.` };
    for (const id of task.approverIds) {
      const approver = await prisma.organizationMember.findFirst({ where: { id, organizationId: context.organizationId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "MANAGER"] } } });
      if (!approver || approver.role === "MANAGER" && !await eligibleMember(context.organizationId, id, location.id, task.teamId)) return { error: `Aprovador sem acesso à tarefa “${task.title}”.` };
    }
  }
  const result = await prisma.$transaction(async tx => {
    if (existing) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${existing.id}))`;
    const template = existing?.sourceTemplateVersion ? { id: existing.sourceTemplateVersion.templateId } : await tx.processTemplate.create({ data: { organizationId: context.organizationId, name: definition.name } });
    const latest = await tx.processTemplateVersion.findFirst({ where: { templateId: template.id }, orderBy: { version: "desc" } });
    const version = await tx.processTemplateVersion.create({ data: { templateId: template.id, version: (latest?.version ?? 0) + 1, definition: definition as unknown as Prisma.InputJsonValue } });
    const data = { name: definition.name, description: definition.description, locationId: location.id, criticality: definition.criticality, validFrom: definition.validFrom ? new Date(definition.validFrom) : null, validUntil: definition.validUntil ? new Date(`${definition.validUntil}T23:59:59Z`) : null, sourceTemplateVersionId: version.id };
    const process = existing ? await tx.process.update({ where: { id: existing.id, organizationId: context.organizationId }, data }) : await tx.process.create({ data: { ...data, organizationId: context.organizationId, createdBy: context.memberId } });
    const now = new Date();
    let routine = null;
    if (!existing && definition.schedule) {
      const s = definition.schedule;
      routine = await tx.routine.create({ data: { processId: process.id, recurrenceRule: JSON.stringify(s), timezone: s.timezone, startsAt: new Date(s.startsAt), endsAt: s.endsAt ? new Date(`${s.endsAt}T23:59:59Z`) : null, generationLeadTime: s.generationLeadTime, pendingPreviousPolicy: s.pendingPreviousPolicy } });
    }
    if (!existing) {
      await createInitialProcessExecution(tx, context, process, definition, routine ? routine.id : null, now);
    }
    await tx.activityLog.create({ data: { organizationId: context.organizationId, actorId: context.memberId, action: existing ? "PROCESS_UPDATED" : "PROCESS_CREATED", entityType: "PROCESS", entityId: process.id, metadata: { version: version.version, taskCount: definition.tasks.length } } });
    return process;
  });
  refresh(); return { success: true, data: { id: result.id } };
}

export async function toggleProcessStatusAction(processId: string, newStatus: "ACTIVE" | "PAUSED" | "ARCHIVED"): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context || !isManagement(context)) return { error: "Apenas gestores podem alterar processos." };
  if (!z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]).safeParse(newStatus).success) return { error: "Status inválido." };
  const process = await prisma.process.findFirst({ where: { ...processScope(context), id: processId }, include: { sourceTemplateVersion: true } });
  if (!process) return { error: "Processo não encontrado no seu escopo." };
  if (context.role === "MANAGER" && readProcessDefinition(process.sourceTemplateVersion?.definition)?.tasks.some(t => !context.scope?.teamIds.includes(t.teamId))) return { error: "Este processo contém equipes fora do seu escopo." };
  if (process.status === "ARCHIVED" && !["OWNER", "ADMIN"].includes(context.role)) return { error: "Somente proprietários e administradores podem restaurar processos." };
  const target = process.status === "ARCHIVED" ? "PAUSED" : newStatus;
  await prisma.$transaction(async tx => {
    await tx.process.update({ where: { id: process.id, organizationId: context.organizationId }, data: { status: target } });
    await tx.activityLog.create({ data: { organizationId: context.organizationId, actorId: context.memberId, action: `PROCESS_STATUS_${target}`, entityType: "PROCESS", entityId: process.id, metadata: { previousStatus: process.status } } });
  });
  refresh(); return { success: true };
}

export async function createRoutineAction(formData: FormData): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context || !isManagement(context)) return { error: "Apenas gestores podem programar rotinas." };
  let input: unknown;
  try { input = JSON.parse(String(formData.get("schedule"))); } catch { return { error: "Revise a programação." }; }
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const process = await prisma.process.findFirst({ where: { ...processScope(context), id: String(formData.get("processId")), status: "ACTIVE" }, include: { sourceTemplateVersion: true } });
  if (!process) return { error: "Escolha um processo ativo no seu escopo." };
  if (context.role === "MANAGER" && readProcessDefinition(process.sourceTemplateVersion?.definition)?.tasks.some(t => !context.scope?.teamIds.includes(t.teamId))) return { error: "Este processo contém equipes fora do seu escopo." };
  const id = String(formData.get("routineId") || "");
  if (id && !await prisma.routine.findFirst({ where: { id, processId: process.id } })) return { error: "Rotina não encontrada." };
  const s = parsed.data;
  const data = { recurrenceRule: JSON.stringify(s), timezone: s.timezone, startsAt: new Date(s.startsAt), endsAt: s.endsAt ? new Date(`${s.endsAt}T23:59:59Z`) : null, generationLeadTime: s.generationLeadTime, pendingPreviousPolicy: s.pendingPreviousPolicy };
  const routine = await prisma.$transaction(async tx => {
    const r = id ? await tx.routine.update({ where: { id }, data }) : await tx.routine.create({ data: { ...data, processId: process.id } });
    await tx.activityLog.create({ data: { organizationId: context.organizationId, actorId: context.memberId, action: id ? "ROUTINE_UPDATED" : "ROUTINE_CREATED", entityType: "ROUTINE", entityId: r.id } });
    return r;
  });
  refresh(); return { success: true, data: { id: routine.id } };
}

export async function toggleRoutineAction(id: string): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context || !isManagement(context)) return { error: "Acesso negado." };
  const routine = await prisma.routine.findFirst({ where: { id, process: processScope(context) }, include: { process: { include: { sourceTemplateVersion: true } } } });
  if (!routine) return { error: "Rotina não encontrada." };
  if (context.role === "MANAGER" && readProcessDefinition(routine.process.sourceTemplateVersion?.definition)?.tasks.some(t => !context.scope?.teamIds.includes(t.teamId))) return { error: "Equipe fora do seu escopo." };
  await prisma.$transaction(async tx => {
    await tx.routine.update({ where: { id }, data: { status: routine.status === "ACTIVE" ? "PAUSED" : "ACTIVE" } });
    await tx.activityLog.create({ data: { organizationId: context.organizationId, actorId: context.memberId, action: routine.status === "ACTIVE" ? "ROUTINE_PAUSED" : "ROUTINE_ACTIVATED", entityType: "ROUTINE", entityId: id } });
  });
  refresh(); return { success: true };
}

export async function triggerExecutionGenerationAction(routineId: string): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context || !isManagement(context)) return { error: "Apenas gestores podem gerar execuções." };
  try { const result = await generateRoutineExecution(routineId, context); refresh(); return result; }
  catch { return { error: "Não foi possível gerar a execução. Atualize a página e tente novamente." }; }
}

async function updateExecution(executionId: string, operation: "CANCEL" | "REOPEN", reason: string, category = "OPERACIONAL"): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context || !isManagement(context)) return { error: "Apenas gestores podem alterar execuções." };
  const parsed = z.object({ executionId: z.string().min(1).max(128), reason: z.string().trim().min(5).max(1000), category: z.enum(["OPERACIONAL", "PROGRAMACAO", "DUPLICIDADE", "OUTROS"]) }).safeParse({ executionId, reason, category });
  if (!parsed.success) return { error: "Selecione a categoria e descreva o motivo com 5 a 1000 caracteres." };
  const result = await prisma.$transaction(tx => changeExecutionState(tx, context, executionId, operation, parsed.data.reason, category), { timeout: 20000 });
  refresh();
  revalidatePath("/tasks", "layout");
  revalidatePath("/management/tasks", "layout");
  return result;
}

export async function reopenExecutionAction(executionId: string, reason: string): Promise<ActionResult> {
  return updateExecution(executionId, "REOPEN", reason);
}

export async function cancelExecutionAction(executionId: string, reason: string, category: string): Promise<ActionResult> {
  return updateExecution(executionId, "CANCEL", reason, category);
}

/**
 * Instanciar processo a partir de uma versão de template para uma ou mais unidades (Item 8)
 */
export async function instantiateProcessFromTemplateAction(
  templateVersionId: string,
  targetLocationIds: string[],
  overrideName?: string
): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context || !isManagement(context)) return { error: "Apenas gestores podem instanciar processos a partir de templates." };

  const version = await prisma.processTemplateVersion.findFirst({
    where: { id: templateVersionId, template: { organizationId: context.organizationId } },
    include: { template: true },
  });
  if (!version) return { error: "Versão do template não encontrada." };

  const baseDefinition = readProcessDefinition(version.definition);
  if (!baseDefinition) return { error: "Definição do template inválida." };

  const locations = await prisma.location.findMany({
    where: {
      organizationId: context.organizationId,
      status: "ACTIVE",
      id: { in: targetLocationIds },
      ...(context.role === "MANAGER" ? { id: { in: context.scope?.locationIds ?? [] } } : {}),
    },
  });
  if (!locations.length) return { error: "Nenhuma unidade válida selecionada." };

  const createdProcesses = await prisma.$transaction(async (tx) => {
    const list = [];
    for (const loc of locations) {
      const locDefinition = { ...baseDefinition, locationId: loc.id, name: overrideName || baseDefinition.name };
      const proc = await tx.process.create({
        data: {
          organizationId: context.organizationId,
          name: locDefinition.name,
          description: locDefinition.description,
          locationId: loc.id,
          criticality: locDefinition.criticality,
          sourceTemplateVersionId: version.id,
          createdBy: context.memberId,
          status: "ACTIVE",
        },
      });

      let routine = null;
      if (locDefinition.schedule) {
        const s = locDefinition.schedule;
        routine = await tx.routine.create({
          data: {
            processId: proc.id,
            recurrenceRule: JSON.stringify(s),
            timezone: loc.timezone || s.timezone,
            startsAt: new Date(s.startsAt),
            endsAt: s.endsAt ? new Date(`${s.endsAt}T23:59:59Z`) : null,
            generationLeadTime: s.generationLeadTime,
            pendingPreviousPolicy: s.pendingPreviousPolicy,
          },
        });
      }

      await createInitialProcessExecution(tx, context, proc, locDefinition, routine ? routine.id : null);

      await tx.activityLog.create({
        data: {
          organizationId: context.organizationId,
          actorId: context.memberId,
          action: "PROCESS_INSTANTIATED_FROM_TEMPLATE",
          entityType: "PROCESS",
          entityId: proc.id,
          metadata: { templateId: version.templateId, version: version.version, locationId: loc.id },
        },
      });

      list.push(proc);
    }
    return list;
  });

  refresh();
  return { success: true, data: { id: createdProcesses[0]?.id } };
}

/**
 * Adota uma nova versão de template para um processo existente sem retroatividade (Item 8)
 */
export async function updateProcessToTemplateVersionAction(
  processId: string,
  newTemplateVersionId: string
): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context || !isManagement(context)) return { error: "Apenas gestores podem atualizar a versão do processo." };

  const process = await prisma.process.findFirst({
    where: { id: processId, organizationId: context.organizationId },
    include: { sourceTemplateVersion: true },
  });
  if (!process) return { error: "Processo não encontrado." };

  const newVersion = await prisma.processTemplateVersion.findFirst({
    where: { id: newTemplateVersionId, template: { organizationId: context.organizationId } },
  });
  if (!newVersion) return { error: "Versão do template não encontrada." };

  await prisma.$transaction(async (tx) => {
    await tx.process.update({
      where: { id: process.id },
      data: { sourceTemplateVersionId: newVersion.id },
    });
    await tx.activityLog.create({
      data: {
        organizationId: context.organizationId,
        actorId: context.memberId,
        action: "PROCESS_VERSION_ADOPTED",
        entityType: "PROCESS",
        entityId: process.id,
        metadata: {
          previousVersionId: process.sourceTemplateVersionId,
          newVersionId: newVersion.id,
          newVersion: newVersion.version,
        },
      },
    });
  });

  refresh();
  return { success: true };
}
