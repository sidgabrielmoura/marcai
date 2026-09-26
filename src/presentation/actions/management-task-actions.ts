"use server";

import { z } from "zod";
import { taskEditSchema, canEditTaskDefinition } from "@/domain/rules/task-edit";
import type { Prisma } from "@prisma/client";
import { taskScope, isManagement, eligibleMember } from "@/application/security/operational-scope";
import { lockTask } from "@/application/tasks/task-lock";
import { effectiveWorkSeconds } from "@/domain/rules/execution-state";
import { synchronizeExecution } from "@/application/tasks/synchronize-execution";
import { notifyManagers } from "@/application/tasks/notify-managers";
import { prisma } from "@/infrastructure/database/prisma";
import { getAuthenticatedContext } from "@/application/security/auth-context";
import {
  canPauseTask,
  canResumeTask,
  canCancelTask,
  canReportImpediment,
  canEditTask,
} from "@/domain/rules/task-rules";
import { calculateMemberAvailability, sortMembersByAvailability, type MemberAvailability } from "@/domain/rules/member-availability";
import { isLocationOpenAt } from "@/domain/rules/operating-hours";
import { eventBus } from "@/infrastructure/events/event-bus";
import { TaskStatus, Priority, Criticality, EvidenceType, Role } from "@/domain/types";
import { revalidatePath } from "next/cache";

export type ActionResult = {
  success?: boolean;
  error?: string;
  data?: any;
};

// Schema de validação para criação de tarefa
const CreateTaskSchema = z.object({
  title: z.string().min(3, "Título deve ter no mínimo 3 caracteres").max(200),
  description: z.string().max(2000).optional().nullable(),
  instructions: z.string().max(5000).optional().nullable(),
  locationId: z.string().min(1, "Unidade é obrigatória"),
  teamId: z.string().optional().nullable(),
  primaryMemberId: z.string().optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  criticality: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  required: z.boolean().default(true),
  deadlineAt: z.string().optional().nullable(),
  estimatedDuration: z.number().int().positive().optional().nullable(),
  slaDurationMinutes: z.number().int().positive().optional().nullable(),
  evidenceType: z.enum(["PHOTO", "VIDEO", "FILE", "TEXT", "NUMBER", "SIGNATURE", "LOCATION"]).optional().nullable(),
  evidenceRequired: z.boolean().default(true),
});

/**
 * Criação de Tarefa Avulsa no Escopo Autorizado (Item 14, 47)
 */
export async function createAdHocTaskAction(formData: FormData): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context) return { error: "Não autenticado." };

  if (!isManagement(context)) {
    return { error: "Funcionários não possuem permissão para criar tarefas." };
  }

  const rawData = {
    title: formData.get("title"),
    description: formData.get("description") || null,
    instructions: formData.get("instructions") || null,
    locationId: formData.get("locationId"),
    teamId: formData.get("teamId") || null,
    primaryMemberId: formData.get("primaryMemberId") || null,
    priority: formData.get("priority") || "MEDIUM",
    criticality: formData.get("criticality") || "MEDIUM",
    required: formData.get("required") === "true" || formData.get("required") === "on",
    deadlineAt: formData.get("deadlineAt") || null,
    estimatedDuration: formData.get("estimatedDuration") ? Number(formData.get("estimatedDuration")) : null,
    slaDurationMinutes: formData.get("slaDurationMinutes") ? Number(formData.get("slaDurationMinutes")) : null,
    evidenceType: formData.get("evidenceType") || null,
    evidenceRequired: formData.get("evidenceRequired") !== "false",
  };

  const parsed = CreateTaskSchema.safeParse(rawData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }

  const {
    title,
    description,
    instructions,
    locationId,
    teamId,
    primaryMemberId,
    priority,
    criticality,
    required,
    deadlineAt,
    estimatedDuration,
    slaDurationMinutes,
    evidenceType,
    evidenceRequired,
  } = parsed.data;

  // Validação de escopo do MANAGER (Item 6)
  if (context.role === Role.MANAGER && context.scope) {
    if (!context.scope.locationIds.includes(locationId)) {
      return { error: "Você não possui escopo para criar tarefas nesta unidade." };
    }
    if (teamId && !context.scope.teamIds.includes(teamId)) {
      return { error: "Você não possui escopo para criar tarefas nesta equipe." };
    }
  }

  if (!await prisma.location.findFirst({ where: { id: locationId, organizationId: context.organizationId, status: "ACTIVE" } })) return { error: "Unidade inválida." };
  if (teamId && !await prisma.team.findFirst({ where: { id: teamId, organizationId: context.organizationId, status: "ACTIVE" } })) return { error: "Equipe inválida." };
  if (context.role === "MANAGER" && !teamId) return { error: "Escolha uma equipe do seu escopo." };
  if (primaryMemberId && !await eligibleMember(context.organizationId, primaryMemberId, locationId, teamId ?? null)) return { error: "O responsável precisa pertencer à equipe e ter acesso à unidade." };
  const deadlineDate = deadlineAt ? new Date(deadlineAt) : null;
  if (deadlineDate && Number.isNaN(deadlineDate.getTime())) return { error: "Prazo inválido." };
  const slaDueDate = slaDurationMinutes ? new Date(Date.now() + slaDurationMinutes * 60 * 1000) : null;

  const task = await prisma.$transaction(async (tx) => {
    const newTask = await tx.task.create({
      data: {
        organizationId: context.organizationId,
        locationId,
        teamId: teamId || null,
        origin: "AD_HOC",
        title,
        description,
        instructions,
        status: "AVAILABLE",
        priority: priority as Priority,
        criticality: criticality as Criticality,
        required,
        deadlineAt: deadlineDate,
        slaDurationMinutes: slaDurationMinutes || null,
        slaDueAt: slaDueDate,
        estimatedDuration: estimatedDuration || null,
      },
    });

    // Se houver responsável primário indicado
    if (primaryMemberId) {
      await tx.taskAssignment.create({
        data: {
          taskId: newTask.id,
          memberId: primaryMemberId,
          type: "PRIMARY",
          assignedBy: context.memberId,
        },
      });
    }

    // Se houver requisito de evidência configurado
    if (evidenceType) {
      await tx.taskEvidenceRequirement.create({
        data: {
          taskId: newTask.id,
          type: evidenceType as EvidenceType,
          required: evidenceRequired,
          minQuantity: 1,
          maxQuantity: 1,
          executionStage: "COMPLETION",
        },
      });
    }

    // Auditoria append-only
    await tx.activityLog.create({
      data: {
        organizationId: context.organizationId,
        actorId: context.memberId,
        action: "TASK_CREATED",
        entityType: "TASK",
        entityId: newTask.id,
        metadata: {
          title,
          priority,
          criticality,
          assignedTo: primaryMemberId,
        },
      },
    });

    return newTask;
  });

  revalidatePath("/management/tasks");
  revalidatePath("/overview");
  return { success: true, data: { id: task.id } };
}

/**
 * Reatribuição de Responsável (Item 18)
 * Registra quem transferiu, notifica e revoga acesso do anterior
 */
const taskInclude = {
  assignments: { where: { removedAt: null }, include: { member: true } },
  sessions: { include: { pauses: true } },
  approvalWorkflow: { include: { steps: { orderBy: { sequence: "asc" as const } } } },
} satisfies Prisma.TaskInclude;
type OperationalTask = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;
type Context = NonNullable<Awaited<ReturnType<typeof getAuthenticatedContext>>>;

async function operate(taskId: string, management: boolean, fn: (tx: Prisma.TransactionClient, task: OperationalTask, c: Context) => Promise<ActionResult>, deleted = false): Promise<ActionResult> {
  const c = await getAuthenticatedContext();
  if (!c || management && !isManagement(c)) return { error: "Você não tem permissão para esta ação." };
  const result = await prisma.$transaction(async tx => {
    await lockTask(tx, c.organizationId, taskId);
    const task = await tx.task.findFirst({ where: { ...taskScope(c), id: taskId, deletedAt: deleted ? { not: null } : null }, include: taskInclude });
    if (!task) return { error: "Tarefa não encontrada no seu escopo." };
    const result = await fn(tx, task, c);
    if (result.success) await synchronizeExecution(tx, c.organizationId, task.executionId);
    return result;
  }, { timeout: 20000 });
  for (const path of ["/tasks", "/history", "/management/tasks", "/management/tasks/trash", "/management/executions", "/overview", "/notifications", "/tasks/" + taskId, "/management/tasks/" + taskId]) revalidatePath(path);
  return result;
}
async function audit(tx: Prisma.TransactionClient, task: OperationalTask, c: Context, action: string, metadata: Prisma.InputJsonValue = {}) {
  await tx.activityLog.create({ data: { organizationId: c.organizationId, actorId: c.memberId, action, entityType: "TASK", entityId: task.id, metadata } });
}
async function endSessions(tx: Prisma.TransactionClient, task: OperationalTask) {
  const now = new Date();
  await tx.taskPause.updateMany({ where: { session: { taskId: task.id }, endedAt: null }, data: { endedAt: now } });
  await tx.taskExecutionSession.updateMany({ where: { taskId: task.id, endedAt: null }, data: { endedAt: now } });
}
const reasonSchema = z.string().trim().min(3).max(1000);
const terminal = (status: string) => ["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(status);

export async function editTaskAction(taskId: string, input: unknown): Promise<ActionResult> {
  const parsed = taskEditSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  return operate(taskId, true, async (tx, task, c) => {
    if (!canEditTaskDefinition(task)) return { error: "A configuração só pode ser editada antes do primeiro início da tarefa." };
    const data = parsed.data;
    if (task.executionId && task.required !== data.required) {
      const execution = await tx.processExecution.findFirst({ where: { id: task.executionId, organizationId: c.organizationId } });
      if (execution && ["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(execution.status)) return { error: "Não é possível alterar a obrigatoriedade em uma execução encerrada." };
    }
    await tx.task.update({ where: { id: taskId, organizationId: c.organizationId }, data: { ...data, description: data.description || null, instructions: data.instructions || null, deadlineAt: data.deadlineAt ? new Date(data.deadlineAt) : null } });
    await audit(tx, task, c, "TASK_UPDATED", { previous: { title: task.title, description: task.description, instructions: task.instructions, priority: task.priority, criticality: task.criticality, required: task.required, deadlineAt: task.deadlineAt?.toISOString() ?? null, estimatedDuration: task.estimatedDuration }, updated: data });
    return { success: true };
  });
}

export async function transferTaskAction(taskId: string, newMemberId: string, reason?: string): Promise<ActionResult> {
  return operate(taskId, true, async (tx, task, c) => {
    if (terminal(task.status)) return { error: "Tarefas encerradas não podem ser transferidas." };
    const member = await eligibleMember(c.organizationId, newMemberId, task.locationId, task.teamId, tx);
    if (!member) return { error: "Escolha uma pessoa ativa da equipe com acesso à unidade." };
    const current = task.assignments.find(a => a.type === "PRIMARY");
    if (current?.memberId === newMemberId) return { error: "Esta pessoa já é responsável pela tarefa." };
    if (current) {
      await tx.taskAssignment.updateMany({ where: { taskId, memberId: current.memberId, removedAt: null }, data: { removedAt: new Date() } });
      await tx.notification.create({ data: { organizationId: c.organizationId, userId: current.member.userId, type: "TASK_TRANSFERRED_OUT", title: "Tarefa transferida", message: "A tarefa “" + task.title + "” foi transferida para outro responsável." } });
    }
    if (["IN_PROGRESS", "PAUSED"].includes(task.status)) {
      const now = new Date();
      await endSessions(tx, task);
      await tx.task.update({ where: { id: task.id }, data: { status: "AVAILABLE", actualDuration: effectiveWorkSeconds(task.sessions, now) } });
    }
    // Avoid a duplicate collaborator row granting ambiguous ownership.
    await tx.taskAssignment.updateMany({ where: { taskId, memberId: newMemberId, removedAt: null }, data: { removedAt: new Date() } });
    await tx.taskAssignment.create({ data: { taskId, memberId: newMemberId, type: "PRIMARY", assignedBy: c.memberId } });
    await tx.notification.create({ data: { organizationId: c.organizationId, userId: member.userId, type: "TASK_ASSIGNED", title: "Você recebeu uma tarefa", message: task.title, data: { taskId } } });
    await audit(tx, task, c, "TASK_TRANSFERRED", { previousMemberId: current?.memberId ?? null, newMemberId, reason: reason?.slice(0, 1000) ?? "" });
    return { success: true };
  });
}

export async function claimTaskAction(taskId: string): Promise<ActionResult> {
  const c = await getAuthenticatedContext(); if (!c) return { error: "Não autenticado." };
  const result = await prisma.$transaction(async tx => {
    await lockTask(tx, c.organizationId, taskId);
    const task = await tx.task.findFirst({ where: { id: taskId, organizationId: c.organizationId, deletedAt: null }, include: taskInclude });
    if (!task || terminal(task.status)) return { error: "Tarefa indisponível." };
    if (task.assignments.some(a => a.type === "PRIMARY")) return { error: "Outra pessoa já assumiu esta tarefa." };
    if (!task.teamId || !task.locationId || !await eligibleMember(c.organizationId, c.memberId, task.locationId, task.teamId, tx)) return { error: "Apenas membros da equipe com acesso à unidade podem assumir." };
    await tx.taskAssignment.create({ data: { taskId, memberId: c.memberId, type: "PRIMARY", assignedBy: c.memberId } });
    await audit(tx, task, c, "TASK_CLAIMED");
    await synchronizeExecution(tx, c.organizationId, task.executionId);
    return { success: true };
  });
  revalidatePath("/tasks"); revalidatePath("/management/tasks"); return result;
}

export async function pauseTaskAction(taskId: string, category = "OUTROS", note?: string): Promise<ActionResult> {
  return operate(taskId, false, async (tx, task, c) => {
    const check = canPauseTask(task.status);
    if (!check.allowed) return { error: check.reason };
    if (!reasonSchema.safeParse(category).success || note && !reasonSchema.safeParse(note).success) return { error: "Informe um motivo válido para a pausa." };
    const session = task.sessions.find(s => !s.endedAt);
    if (!session) return { error: "Nenhuma sessão em andamento." };
    await tx.taskPause.create({ data: { sessionId: session.id, reasonCategoryId: category, note: note || null } });
    await tx.task.update({ where: { id: task.id }, data: { status: "PAUSED" } });
    await audit(tx, task, c, "TASK_PAUSED", { category, note: note ?? "" });
    return { success: true };
  });
}
export async function resumeTaskAction(taskId: string): Promise<ActionResult> {
  return operate(taskId, false, async (tx, task, c) => {
    const check = canResumeTask(task.status); if (!check.allowed) return { error: check.reason };
    await tx.taskPause.updateMany({ where: { session: { taskId }, endedAt: null }, data: { endedAt: new Date() } });
    await tx.task.update({ where: { id: taskId }, data: { status: "IN_PROGRESS" } });
    await audit(tx, task, c, "TASK_RESUMED"); return { success: true };
  });
}
export async function reportImpedimentAction(taskId: string, category: string, reason: string): Promise<ActionResult> {
  return operate(taskId, false, async (tx, task, c) => {
    const check = canReportImpediment(task.status); if (!check.allowed) return { error: check.reason };
    if (!reasonSchema.safeParse(reason).success || !reasonSchema.safeParse(category).success) return { error: "Informe a categoria e descreva o impedimento." };
    await endSessions(tx, task);
    await tx.taskOccurrence.create({ data: { taskId, type: "IMPEDIMENT", category, reason: reason.trim(), severity: "HIGH", createdBy: c.memberId } });
    await tx.task.update({ where: { id: taskId }, data: { status: "NOT_COMPLETED" } });
    await notifyManagers(tx, task, "Impedimento operacional", task.title + ": " + reason);
    await audit(tx, task, c, "TASK_IMPEDIMENT_REPORTED", { category, reason }); return { success: true };
  });
}
export async function cancelTaskAction(taskId: string, reason: string, category = "OPERACIONAL"): Promise<ActionResult> {
  return operate(taskId, true, async (tx, task, c) => {
    if (terminal(task.status)) return { error: "A tarefa já está encerrada." };
    if (!reasonSchema.safeParse(reason).success || !reasonSchema.safeParse(category).success) return { error: "Informe o motivo do cancelamento (3 a 1000 caracteres)." };
    await endSessions(tx, task);
    await tx.task.update({ where: { id: taskId }, data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: "[" + category + "] " + reason.trim() } });
    await audit(tx, task, c, "TASK_CANCELLED", { category, reason }); return { success: true };
  });
}
export async function trashTaskAction(taskId: string, reason?: string): Promise<ActionResult> {
  return operate(taskId, true, async (tx, task, c) => {
    if (["IN_PROGRESS", "PAUSED", "SUBMITTED", "NEEDS_CORRECTION"].includes(task.status)) return { error: "Cancele ou finalize a tarefa antes de movê-la para a lixeira." };
    await tx.task.update({ where: { id: taskId }, data: { deletedAt: new Date(), deletedBy: c.memberId, deleteReason: reason?.slice(0, 1000) || "Exclusão operacional" } });
    await audit(tx, task, c, "TASK_TRASHED", { reason: reason ?? "" }); return { success: true };
  });
}
export async function restoreTaskAction(taskId: string): Promise<ActionResult> {
  return operate(taskId, true, async (tx, task, c) => {
    await tx.task.update({ where: { id: taskId }, data: { deletedAt: null, deletedBy: null, deleteReason: null } });
    await audit(tx, task, c, "TASK_RESTORED"); return { success: true };
  }, true);
}
export async function purgeTaskAction(taskId: string): Promise<ActionResult> {
  return operate(taskId, true, async (tx, task, c) => {
    if (!["OWNER", "ADMIN"].includes(c.role)) return { error: "Apenas proprietários e administradores podem excluir definitivamente." };
    await audit(tx, task, c, "TASK_PURGED");
    await tx.task.delete({ where: { id: taskId, organizationId: c.organizationId, deletedAt: { not: null } } }); return { success: true };
  }, true);
}

export async function submitApprovalDecisionAction(stepId: string, decision: "APPROVED" | "REJECTED", note?: string): Promise<ActionResult> {
  const c = await getAuthenticatedContext(); if (!c || !isManagement(c)) return { error: "Acesso negado." };
  if (!z.enum(["APPROVED", "REJECTED"]).safeParse(decision).success || note && note.length > 1000) return { error: "Decisão inválida." };
  if (decision === "REJECTED" && !reasonSchema.safeParse(note).success) return { error: "Explique o que precisa ser corrigido." };
  const found = await prisma.approvalStep.findFirst({ where: { id: stepId, workflow: { task: taskScope(c) } }, select: { workflow: { select: { taskId: true } } } });
  if (!found) return { error: "Aprovação não encontrada no seu escopo." };
  return operate(found.workflow.taskId, true, async (tx, task, context) => {
    const workflow = task.approvalWorkflow, step = workflow?.steps.find(s => s.id === stepId);
    if (!workflow || !step || task.status !== "SUBMITTED" || workflow.status !== "PENDING" || step.status !== "PENDING") return { error: "Esta etapa não está aguardando decisão." };
    const teamAccess = step.approverTeamId ? await tx.teamMember.findFirst({ where: { teamId: step.approverTeamId, organizationMemberId: context.memberId, team: { organizationId: context.organizationId } } }) : null;
    const fallback = step.fallbackMemberId === context.memberId && step.deadlineAt && step.deadlineAt <= new Date();
    if (step.approverMemberId !== context.memberId && !teamAccess && !fallback) return { error: "Somente o aprovador designado pode decidir nesta etapa." };
    if (workflow.mode === "SEQUENTIAL" && workflow.steps.some(s => s.sequence < step.sequence && s.status !== "APPROVED")) return { error: "Aguarde a aprovação das etapas anteriores." };
    await tx.approvalDecision.create({ data: { stepId, decidedBy: context.memberId, decision, note: note?.trim() || null } });
    await tx.approvalStep.update({ where: { id: stepId }, data: { status: decision } });
    const allApproved = decision === "APPROVED" && workflow.steps.every(s => s.id === stepId || s.status === "APPROVED");
    await tx.approvalWorkflow.update({ where: { id: workflow.id }, data: { status: decision === "REJECTED" ? "NEEDS_CORRECTION" : allApproved ? "APPROVED" : "PENDING" } });
    if (decision === "REJECTED" || allApproved) {
      await tx.task.update({ where: { id: task.id }, data: { status: allApproved ? "COMPLETED" : "NEEDS_CORRECTION", completedAt: allApproved ? new Date() : null } });
      const owner = task.assignments.find(a => a.type === "PRIMARY");
      if (owner) await tx.notification.create({ data: { organizationId: context.organizationId, userId: owner.member.userId, type: "APPROVAL_UPDATED", title: allApproved ? "Entrega aprovada" : "Correção solicitada", message: task.title + (note ? ": " + note : ""), data: { taskId: task.id } } });
    }
    await audit(tx, task, context, decision === "APPROVED" ? "APPROVAL_APPROVED" : "APPROVAL_REJECTED", { decision, note: note ?? "", stepSequence: step.sequence }); return { success: true };
  });
}

/**
 * Busca membros elegíveis para uma tarefa com status de disponibilidade operacional calculado (Item 18, 35)
 */
export async function getEligibleMembersForTaskAction(taskId: string): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context) return { error: "Não autenticado." };

  const task = await prisma.task.findFirst({
    where: { ...taskScope(context), id: taskId, deletedAt: null },
    include: { location: true },
  });
  if (!task) return { error: "Tarefa não encontrada." };

  const now = new Date();
  const isLocationOpen = task.location ? isLocationOpenAt(task.location, now) : true;

  const members = await prisma.organizationMember.findMany({
    where: {
      organizationId: context.organizationId,
      status: "ACTIVE",
      user: { status: "ACTIVE" },
      ...(task.teamId ? { teamMemberships: { some: { teamId: task.teamId } } } : {}),
      ...(task.locationId
        ? {
            locationAccesses: {
              some: {
                locationId: task.locationId,
                AND: [
                  { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
                  { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
                ],
              },
            },
          }
        : {}),
    },
    include: {
      user: { select: { name: true } },
      taskAssignments: {
        where: { removedAt: null, task: { status: "IN_PROGRESS", deletedAt: null } },
      },
    },
  });

  const formatted = members.map((m) => {
    const availability = calculateMemberAvailability({
      memberStatus: m.status,
      manualSetting: m.manualAvailability,
      inProgressTasksCount: m.taskAssignments.length,
      isWithinOperatingHours: isLocationOpen,
    });
    return {
      id: m.id,
      name: m.user.name,
      role: m.role,
      availability,
    };
  });

  const sorted = sortMembersByAvailability(formatted);
  return { success: true, data: sorted };
}

/**
 * Atualiza o status de disponibilidade do próprio membro (Item 35)
 */
export async function updateMemberAvailabilityAction(manualSetting: "AUTO" | "AVAILABLE" | "UNAVAILABLE"): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context) return { error: "Não autenticado." };
  if (!["AUTO", "AVAILABLE", "UNAVAILABLE"].includes(manualSetting)) {
    return { error: "Opção de disponibilidade inválida." };
  }

  const member = await prisma.organizationMember.findUnique({
    where: { id: context.memberId },
    include: {
      locationAccesses: { include: { location: true } },
      taskAssignments: { where: { removedAt: null, task: { status: "IN_PROGRESS", deletedAt: null } } },
    },
  });
  if (!member) return { error: "Membro não encontrado." };

  const primaryLoc = member.locationAccesses.find(l => l.type === "PRIMARY")?.location;
  const isLocationOpen = primaryLoc ? isLocationOpenAt(primaryLoc, new Date()) : true;

  const availabilityStatus = calculateMemberAvailability({
    memberStatus: member.status,
    manualSetting,
    inProgressTasksCount: member.taskAssignments.length,
    isWithinOperatingHours: isLocationOpen,
  });

  await prisma.organizationMember.update({
    where: { id: context.memberId },
    data: {
      manualAvailability: manualSetting,
      availabilityStatus,
      lastAvailabilityChange: new Date(),
    },
  });

  eventBus.publish("MEMBER_AVAILABILITY_CHANGED", context.organizationId, {
    memberId: context.memberId,
    manualSetting,
    availabilityStatus,
  });

  revalidatePath("/tasks");
  revalidatePath("/management/people");
  return { success: true, data: { availabilityStatus } };
}

