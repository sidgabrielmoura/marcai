"use server";
import { notificationTransaction } from "@/infrastructure/notifications/transaction";
import { operate as employeeOperate } from "@/application/mobile/operations";
import {webTaskDetail} from '@/application/mobile/web-task-contract';
import {publishSyncRequired} from '@/infrastructure/realtime/sync';
import {randomUUID} from 'node:crypto';
import { evaluateTaskDependencies } from "@/domain/rules/dependency-rules";
import { deadline } from "@/domain/rules/employee-workflow";

import { z } from "zod";
import {
  taskEditSchema,
  canEditTaskDefinition,
} from "@/domain/rules/task-edit";
import type { Prisma } from "@prisma/client";
import {
  taskScope,
  isManagement,
  eligibleMember,
} from "@/application/security/operational-scope";
import { lockTask } from "@/application/tasks/task-lock";
import { effectiveWorkSeconds } from "@/domain/rules/execution-state";
import { synchronizeExecution } from "@/application/tasks/synchronize-execution";
import {
  notifyManagers,
  notifyTaskAssignees,
  notifyApprovers,
} from "@/application/tasks/notify-managers";

import { prisma } from "@/infrastructure/database/prisma";
import { getAuthenticatedContext } from "@/application/security/auth-context";
import {
  canPauseTask,
  canResumeTask,
  canCancelTask,
  canReportImpediment,
  canEditTask,
} from "@/domain/rules/task-rules";
import {
  calculateMemberAvailability,
  sortMembersByAvailability,
  type MemberAvailability,
} from "@/domain/rules/member-availability";
import { isLocationOpenAt } from "@/domain/rules/operating-hours";
import { eventBus } from "@/infrastructure/events/event-bus";
import {
  TaskStatus,
  Priority,
  Criticality,
  EvidenceType,
  Role,
} from "@/domain/types";
import { revalidatePath } from "@/infrastructure/realtime/revalidate";
import {
  parseLocalDateTimeToUtc,
  formatTimeInTimezone,
  resolveEffectiveTimezone,
} from "@/domain/rules/date-time";

export type ActionResult = {
  success?: boolean;
  error?: string;
  data?: any;
  task?:Awaited<ReturnType<typeof webTaskDetail>>;
  changeId?:string;
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
  scheduledDate: z.string().optional().nullable(),
  deadlineAt: z.string().optional().nullable(),
  toleranceMinutes: z.coerce.number().int().min(0).default(20),
  evidenceType: z
    .enum(["PHOTO", "VIDEO", "FILE", "TEXT", "NUMBER", "SIGNATURE", "LOCATION"])
    .optional()
    .nullable(),
  evidenceRequired: z.boolean().default(true),
  taskType: z.enum(["STANDARD", "FORM"]).default("STANDARD"),
  formFields: z.string().optional().nullable(), // JSON stringified FormFieldDefinition[]
});

/**
 * Criação de Tarefa Avulsa no Escopo Autorizado (Item 14, 47)
 */
export async function createAdHocTaskAction(
  formData: FormData,
): Promise<ActionResult> {
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
    required:
      formData.get("required") === "true" || formData.get("required") === "on",
    scheduledDate: formData.get("scheduledDate") || null,
    deadlineAt: formData.get("deadlineAt") || null,
    toleranceMinutes:
      formData.get("toleranceMinutes") !== null
        ? Number(formData.get("toleranceMinutes"))
        : 20,
    evidenceType: formData.get("evidenceType") || null,
    evidenceRequired: formData.get("evidenceRequired") !== "false",
    taskType: formData.get("taskType") || "STANDARD",
    formFields: formData.get("formFields") || null,
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
    scheduledDate,
    deadlineAt,
    toleranceMinutes,
    evidenceType,
    evidenceRequired,
    taskType,
    formFields,
  } = parsed.data;

  // Validação de escopo do MANAGER (Item 6)
  if (context.role === Role.MANAGER && context.scope) {
    if (!context.scope.locationIds.includes(locationId)) {
      return {
        error: "Você não possui escopo para criar tarefas nesta unidade.",
      };
    }
    if (teamId && !context.scope.teamIds.includes(teamId)) {
      return {
        error: "Você não possui escopo para criar tarefas nesta equipe.",
      };
    }
  }

  const location = await prisma.location.findFirst({
    where: {
      id: locationId,
      organizationId: context.organizationId,
      status: "ACTIVE",
    },
    select: { id: true, timezone: true },
  });
  if (!location)
    return { error: "Unidade inválida." };
  if (
    teamId &&
    !(await prisma.team.findFirst({
      where: {
        id: teamId,
        organizationId: context.organizationId,
        status: "ACTIVE",
      },
    }))
  )
    return { error: "Equipe inválida." };
  if (context.role === "MANAGER" && !teamId)
    return { error: "Escolha uma equipe do seu escopo." };
  if (
    primaryMemberId &&
    !(await eligibleMember(
      context.organizationId,
      primaryMemberId,
      locationId,
      teamId ?? null,
    ))
  )
    return {
      error: "O responsável precisa pertencer à equipe e ter acesso à unidade.",
    };

  const scheduledDateUtc = scheduledDate
    ? parseLocalDateTimeToUtc(scheduledDate, location.timezone)
    : null;
  if (scheduledDate && (!scheduledDateUtc || Number.isNaN(scheduledDateUtc.getTime()))) {
    return { error: "Horário de início agendado inválido." };
  }

  const deadlineDate = deadlineAt
    ? parseLocalDateTimeToUtc(deadlineAt, location.timezone)
    : null;
  if (deadlineAt && (!deadlineDate || Number.isNaN(deadlineDate.getTime())))
    return { error: "Prazo inválido." };

  if (scheduledDateUtc && deadlineDate && deadlineDate <= scheduledDateUtc) {
    return { error: "O prazo final deve ser posterior ao horário de início agendado." };
  }

  const slaDueDate = deadlineDate;
  const now = new Date();
  const isScheduledFuture = !!scheduledDateUtc && scheduledDateUtc > now;
  const isAssigned = !!primaryMemberId;

  const task = await notificationTransaction(async (tx) => {
    const newTask = await tx.task.create({
      data: {
        organizationId: context.organizationId,
        locationId,
        teamId: teamId || null,
        origin: "AD_HOC",
        title,
        description,
        instructions,
        status: isScheduledFuture ? "AVAILABLE" : isAssigned ? "IN_PROGRESS" : "AVAILABLE",
        startedAt: isScheduledFuture ? null : isAssigned ? now : null,
        scheduledDate: scheduledDateUtc,
        priority: priority as Priority,
        criticality: criticality as Criticality,
        required,
        deadlineAt: deadlineDate,
        slaDurationMinutes: null,
        slaDueAt: slaDueDate,
        toleranceMinutes: toleranceMinutes ?? 20,
        taskType: taskType as any,
        formFields:
          taskType === "FORM" && formFields
            ? JSON.parse(formFields)
            : undefined,
      },
    });

    if (primaryMemberId) {
      await tx.taskAssignment.create({
        data: {
          taskId: newTask.id,
          memberId: primaryMemberId,
          type: "PRIMARY",
          assignedBy: context.memberId,
        },
      });

      // Se não for agendada para o futuro, inicia sessão imediatamente e notifica
      if (!isScheduledFuture) {
        await tx.taskExecutionSession.create({
          data: {
            taskId: newTask.id,
            memberId: primaryMemberId,
            startedAt: now,
          },
        });

        const assignedMember = await tx.organizationMember.findFirst({
          where: { id: primaryMemberId, organizationId: context.organizationId },
          select: { userId: true },
        });
        if (assignedMember) {
          await tx.notification.create({
            data: {
              organizationId: context.organizationId,
              userId: assignedMember.userId,
              type: "TASK_ASSIGNED",
              priority: priority as Priority,
              title: "Você recebeu uma nova tarefa",
              message: title,
              data: { taskId: newTask.id },
            },
          });
        }
      }
    }

    // Se a tarefa está agendada para o futuro, registra o sinal operacional para despertar o agendador no horário exato
    if (isScheduledFuture) {
      await tx.operationalSignal.create({
        data: {
          organizationId: context.organizationId,
          phase: "TASKS",
          availableAt: scheduledDateUtc,
        },
      });
    }

    // Se houver requisito de evidência configurado (e não for tarefa com perguntas)
    if (evidenceType && taskType !== "FORM") {
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
          scheduledDate: scheduledDateUtc?.toISOString() ?? null,
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
  location: { select: { id: true, name: true, timezone: true } },
  execution: { select: { routine: { select: { timezone: true } } } },
  dependencies: {
    include: { dependsOnTask: { include: { approvalWorkflow: true } } },
  },
  assignments: { where: { removedAt: null }, include: { member: true } },
  sessions: { include: { pauses: true } },
  approvalWorkflow: {
    include: { steps: { orderBy: { sequence: "asc" as const } } },
  },
} satisfies Prisma.TaskInclude;
type OperationalTask = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;
type Context = NonNullable<Awaited<ReturnType<typeof getAuthenticatedContext>>>;

async function operate(
  taskId: string,
  management: boolean,
  fn: (
    tx: Prisma.TransactionClient,
    task: OperationalTask,
    c: Context,
  ) => Promise<ActionResult>,
  deleted = false,
): Promise<ActionResult> {
  const c = await getAuthenticatedContext();
  if (!c || (management && !isManagement(c)))
    return { error: "Você não tem permissão para esta ação." };
  const result = await notificationTransaction(
    async (tx) => {
      await lockTask(tx, c.organizationId, taskId);
      const task = await tx.task.findFirst({
        where: {
          ...taskScope(c),
          id: taskId,
          deletedAt: deleted ? { not: null } : null,
        },
        include: taskInclude,
      });
      if (!task) return { error: "Tarefa não encontrada no seu escopo." };
      const result = await fn(tx, task, c);
      if (result.success)
        await synchronizeExecution(
          tx,
          c.organizationId,
          task.executionId,
          undefined,
          task.id,
        );
      return result;
    },
    { timeout: 20000 },
  );
  for (const path of [
    "/tasks",
    "/history",
    "/management/tasks",
    "/management/tasks/trash",
    "/overview",
    "/notifications",
    "/tasks/" + taskId,
    "/management/tasks/" + taskId,
  ])
    revalidatePath(path);
  return result;
}
async function audit(
  tx: Prisma.TransactionClient,
  task: OperationalTask,
  c: Context,
  action: string,
  metadata: Prisma.InputJsonValue = {},
) {
  await tx.activityLog.create({
    data: {
      organizationId: c.organizationId,
      actorId: c.memberId,
      action,
      entityType: "TASK",
      entityId: task.id,
      metadata,
    },
  });
}
async function endSessions(
  tx: Prisma.TransactionClient,
  task: OperationalTask,
  now = new Date(),
) {
  await tx.taskPause.updateMany({
    where: { session: { taskId: task.id }, endedAt: null },
    data: { endedAt: now },
  });
  await tx.taskExecutionSession.updateMany({
    where: { taskId: task.id, endedAt: null },
    data: { endedAt: now },
  });
}
const reasonSchema = z.string().trim().min(3).max(1000);

export async function setTaskManagementBlockAction(
  taskId: string,
  blocked: boolean,
  reason?: string,
): Promise<ActionResult> {
  if (typeof blocked !== "boolean")
    return { error: "Informe uma ação de bloqueio válida." };
  return operate(taskId, true, async (tx, task, context) => {
    if (terminal(task.status) || task.status === "SUBMITTED")
      return { error: "Esta tarefa está encerrada ou aguardando revisão." };
    const note = reasonSchema.safeParse(reason);
    if (blocked && !note.success)
      return { error: "Descreva o motivo do bloqueio (3 a 1000 caracteres)." };
    const dependency = evaluateTaskDependencies(
      task.dependencies.map((item) => ({
        dependsOnTaskId: item.dependsOnId,
        dependsOnStatus: item.dependsOnTask.status,
        dependsOnApprovalStatus: item.dependsOnTask.approvalWorkflow?.status,
        type: item.type,
        logic: item.logic,
      })),
    );
    await endSessions(tx, task);
    await tx.task.update({
      where: { id: taskId },
      data: {
        managementBlocked: blocked,
        managementBlockReason: blocked ? note.data : null,
        status: blocked || dependency.isBlocked ? "BLOCKED" : "AVAILABLE",
      },
    });
    await audit(
      tx,
      task,
      context,
      blocked ? "TASK_MANAGEMENT_BLOCKED" : "TASK_MANAGEMENT_UNBLOCKED",
      { reason: blocked ? note.data! : "" },
    );
    await notifyTaskAssignees(
      tx,
      task,
      blocked ? "Tarefa bloqueada pela gestão" : "Bloqueio da gestão removido",
      blocked
        ? note.data!
        : "Confira as dependências e o prazo antes de continuar.",
      { type: "OPERATIONAL_ALERT", priority: "HIGH" },
    );
    return { success: true };
  });
}
const terminal = (status: string) =>
  ["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(status);

export async function editTaskAction(
  taskId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = taskEditSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  return operate(taskId, true, async (tx, task, c) => {
    if (!canEditTaskDefinition(task))
      return {
        error:
          "A configuração só pode ser editada antes do primeiro início da tarefa.",
      };
    const data = parsed.data;
    if (task.executionId && task.required !== data.required) {
      const execution = await tx.processExecution.findFirst({
        where: { id: task.executionId, organizationId: c.organizationId },
      });
      if (
        execution &&
        ["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(execution.status)
      )
        return {
          error:
            "Não é possível alterar a obrigatoriedade em uma execução encerrada.",
        };
    }
    const effectiveTz = resolveEffectiveTimezone({
      routineTimezone: task.execution?.routine?.timezone,
      locationTimezone: task.location?.timezone,
    });
    const parsedDeadline = data.deadlineAt
      ? parseLocalDateTimeToUtc(data.deadlineAt, effectiveTz)
      : null;
    await tx.task.update({
      where: { id: taskId, organizationId: c.organizationId },
      data: {
        ...data,
        description: data.description || null,
        instructions: data.instructions || null,
        deadlineAt: parsedDeadline,
      },
    });
    await audit(tx, task, c, "TASK_UPDATED", {
      previous: {
        title: task.title,
        description: task.description,
        instructions: task.instructions,
        priority: task.priority,
        criticality: task.criticality,
        required: task.required,
        deadlineAt: task.deadlineAt?.toISOString() ?? null,
      },
      updated: data,
    });
    return { success: true };
  });
}

const reassignTaskSchema = z.object({
  taskId: z.string().min(1, "Identificador da tarefa é obrigatório"),
  memberId: z.string().min(1, "Selecione um colaborador"),
  deadlineMinutes: z.coerce
    .number()
    .int()
    .min(1)
    .max(10080)
    .optional()
    .nullable(),
  customDeadlineAt: z.string().optional().nullable(),
  reason: z.string().trim().max(1000).optional().nullable(),
});

export type ReassignTaskInput = z.infer<typeof reassignTaskSchema>;

export async function reassignTaskAction(
  input: ReassignTaskInput,
): Promise<ActionResult> {
  const parsed = reassignTaskSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { taskId, memberId, deadlineMinutes, customDeadlineAt, reason } =
    parsed.data;

  return operate(taskId, true, async (tx, task, c) => {
    if (task.status === "CANCELLED")
      return { error: "Tarefas canceladas não podem ser reatribuídas." };
    const member = await eligibleMember(
      c.organizationId,
      memberId,
      task.locationId,
      task.teamId,
      tx,
    );
    if (!member)
      return {
        error: "Escolha uma pessoa ativa da equipe com acesso à unidade.",
      };

    const effectiveTz = resolveEffectiveTimezone({
      routineTimezone: task.execution?.routine?.timezone,
      locationTimezone: task.location?.timezone,
    });
    const now = new Date();
    let newDeadline: Date | null = null;
    if (customDeadlineAt) {
      const parsedDate = parseLocalDateTimeToUtc(customDeadlineAt, effectiveTz);
      if (!parsedDate || isNaN(parsedDate.getTime()) || parsedDate <= now) {
        return {
          error: "O novo prazo limite precisa ser uma data e hora futura.",
        };
      }
      newDeadline = parsedDate;
    } else if (deadlineMinutes && deadlineMinutes > 0) {
      newDeadline = new Date(now.getTime() + deadlineMinutes * 60000);
    } else {
      const currentDeadline = task.deadlineAt ?? task.slaDueAt;
      if (!currentDeadline || currentDeadline <= now) {
        const duration = task.slaDurationMinutes ?? 60;
        newDeadline = new Date(now.getTime() + duration * 60000);
      }
    }

    const wasTerminal =
      task.status === "COMPLETED" || task.status === "NOT_COMPLETED";
    const current = task.assignments.find(
      (a) => a.type === "PRIMARY" && a.removedAt === null,
    );
    const isSameMember = current?.memberId === memberId;

    if (!isSameMember || wasTerminal) {
      if (current && !isSameMember) {
        await tx.taskAssignment.updateMany({
          where: { taskId, memberId: current.memberId, removedAt: null },
          data: { removedAt: now },
        });
        await tx.notification.create({
          data: {
            organizationId: c.organizationId,
            userId: current.member.userId,
            type: "TASK_TRANSFERRED_OUT",
            title: "Tarefa transferida",
            message: `A tarefa “${task.title}” foi transferida para outro responsável.`,
          },
        });
      }

      await endSessions(tx, task);

      if (!isSameMember || !current) {
        await tx.taskAssignment.updateMany({
          where: { taskId, memberId, removedAt: null },
          data: { removedAt: now },
        });
        await tx.taskAssignment.create({
          data: { taskId, memberId, type: "PRIMARY", assignedBy: c.memberId },
        });
      }
    }

    const dependency = evaluateTaskDependencies(
      task.dependencies.map((item) => ({
        dependsOnTaskId: item.dependsOnId,
        dependsOnStatus: item.dependsOnTask.status,
        dependsOnApprovalStatus: item.dependsOnTask.approvalWorkflow?.status,
        type: item.type,
        logic: item.logic,
      })),
    );
    const future = !!task.scheduledDate && task.scheduledDate > now;
    const oldTiming = deadline(task, now.getTime());
    const renewed = !!newDeadline && oldTiming.phase === "EXCEEDED";
    if (renewed && isSameMember)
      await endSessions(tx, task, new Date(oldTiming.limitAt ?? now.getTime()));
    const nextStatus =
      task.managementBlocked || dependency.isBlocked
        ? "BLOCKED"
        : future
          ? "AVAILABLE"
          : task.status === "BLOCKED" ||
              task.status === "AVAILABLE" ||
              wasTerminal
            ? "IN_PROGRESS"
            : task.status;

    await tx.task.update({
      where: { id: task.id },
      data: {
        status: nextStatus,
        completedAt: null,
        startedAt:
          task.managementBlocked || dependency.isBlocked || future
            ? future || renewed
              ? null
              : task.startedAt
            : renewed || wasTerminal
              ? now
              : (task.startedAt ?? now),
        ...(newDeadline
          ? {
              deadlineAt: newDeadline,
              slaDueAt: newDeadline,
              slaExceededAt: null,
            }
          : {}),
      },
    });

    if (task.status === "COMPLETED" && task.approvalWorkflow) {
      await tx.approvalWorkflow.update({
        where: { id: task.approvalWorkflow.id },
        data: { status: "PENDING" },
      });
      await tx.approvalStep.updateMany({
        where: { workflowId: task.approvalWorkflow.id },
        data: { status: "PENDING" },
      });
    }

    if (task.executionId) {
      const parentExec = await tx.processExecution.findUnique({
        where: { id: task.executionId },
        select: { status: true },
      });
      if (
        parentExec?.status === "NOT_COMPLETED" ||
        parentExec?.status === "COMPLETED"
      ) {
        await tx.processExecution.update({
          where: { id: task.executionId },
          data: { status: "IN_PROGRESS", completedAt: null },
        });
      }
    }

    if (nextStatus === "IN_PROGRESS") {
      const activeSession = await tx.taskExecutionSession.findFirst({
        where: { taskId: task.id, memberId, endedAt: null },
      });
      if (!activeSession) {
        await tx.taskExecutionSession.create({
          data: { taskId: task.id, memberId, startedAt: now },
        });
      }
    }

    const formattedTime = newDeadline
      ? formatTimeInTimezone(newDeadline, effectiveTz)
      : null;

    const notifTitle = isSameMember
      ? wasTerminal
        ? task.status === "NOT_COMPLETED"
          ? "Impedimento resolvido / Tarefa liberada"
          : "Tarefa reatribuída"
        : "Prazo da tarefa renovado"
      : "Você recebeu uma tarefa";
    const notifMessage = isSameMember
      ? formattedTime
        ? wasTerminal
          ? task.status === "NOT_COMPLETED"
            ? `O impedimento da tarefa “${task.title}” foi resolvido e o prazo foi renovado até às ${formattedTime}.`
            : `A tarefa “${task.title}” foi reatribuída a você com novo prazo até às ${formattedTime}.`
          : `O prazo da tarefa “${task.title}” foi renovado para às ${formattedTime}.`
        : `A tarefa “${task.title}” foi reatribuída e liberada.`
      : formattedTime
        ? `A tarefa “${task.title}” foi atribuída a você com prazo até às ${formattedTime}.`
        : `A tarefa “${task.title}” foi atribuída a você.`;

    await tx.notification.create({
      data: {
        organizationId: c.organizationId,
        userId: member.userId,
        type: "TASK_ASSIGNED",
        priority: task.priority,
        title: notifTitle,
        message: notifMessage,
        data: { taskId },
      },
    });

    if (task.status === "NOT_COMPLETED") {
      await audit(tx, task, c, "TASK_IMPEDIMENT_RESOLVED", {
        resolvedBy: c.memberId,
        newMemberId: memberId,
        reason: reason?.slice(0, 1000) ?? "",
      });
    }

    await audit(tx, task, c, "TASK_REASSIGNED", {
      previousMemberId: current?.memberId ?? null,
      newMemberId: memberId,
      isSameMember,
      previousStatus: task.status,
      newDeadlineAt: newDeadline?.toISOString() ?? null,
      reason: reason?.slice(0, 1000) ?? "",
    });

    return {
      success: true,
      data: {
        newDeadlineAt: newDeadline?.toISOString() ?? null,
      },
    };
  });
}

export async function transferTaskAction(
  taskId: string,
  newMemberId: string,
  reason?: string,
): Promise<ActionResult> {
  return reassignTaskAction({ taskId, memberId: newMemberId, reason });
}

export async function claimTaskAction(taskId: string): Promise<ActionResult> {
  const employee = await getAuthenticatedContext();
  if (employee?.role === "EMPLOYEE") {
    try {
      const changeId=randomUUID();
      const result = await employeeOperate(new Request('https://tarefai.invalid',{method:'POST',headers:{'Idempotency-Key':changeId}}), taskId, "claim", {});
      await publishSyncRequired(employee.organizationId,['TASK_CHANGED','EXECUTION_CHANGED'],undefined,changeId);
      try{return {...result,changeId,task:await webTaskDetail(employee,taskId)};}
      catch{return {...result,changeId};}
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : "Não foi possível continuar.",
      };
    }
  }
  const c = await getAuthenticatedContext();
  if (!c) return { error: "Não autenticado." };
  const result = await notificationTransaction(async (tx) => {
    await lockTask(tx, c.organizationId, taskId);
    const task = await tx.task.findFirst({
      where: { id: taskId, organizationId: c.organizationId, deletedAt: null },
      include: taskInclude,
    });
    if (!task || terminal(task.status))
      return { error: "Tarefa indisponível." };
    if (task.status === "BLOCKED")
      return {
        error: "Aguardando conclusão de etapas anteriores para ser assumida.",
      };
    if (task.assignments.some((a) => a.type === "PRIMARY"))
      return { error: "Outra pessoa já assumiu esta tarefa." };
    if (
      !task.teamId ||
      !(await eligibleMember(
        c.organizationId,
        c.memberId,
        task.locationId,
        task.teamId,
        tx,
      ))
    )
      return {
        error:
          "Apenas membros da equipe selecionada com acesso à unidade podem assumir esta tarefa.",
      };
    const now = new Date();
    if (task.scheduledDate && task.scheduledDate > now) {
      const effectiveTz = resolveEffectiveTimezone({
        routineTimezone: task.execution?.routine?.timezone,
        locationTimezone: task.location?.timezone,
      });
      const formattedTime = formatTimeInTimezone(task.scheduledDate, effectiveTz);
      return {
        error: `Esta tarefa está agendada para às ${formattedTime} e só poderá ser assumida a partir do horário agendado.`,
      };
    }
    await tx.taskAssignment.create({
      data: {
        taskId,
        memberId: c.memberId,
        type: "PRIMARY",
        assignedBy: c.memberId,
      },
    });
    await tx.task.update({
      where: { id: taskId },
      data: {
        status: "IN_PROGRESS",
        startedAt: task.startedAt ?? now,
        slaDueAt:
          task.slaDueAt ??
          (task.slaDurationMinutes
            ? new Date(now.getTime() + task.slaDurationMinutes * 60000)
            : null),
      },
    });
    await tx.taskExecutionSession.create({
      data: { taskId, memberId: c.memberId, startedAt: now },
    });
    await audit(tx, task, c, "TASK_CLAIMED");
    await notifyManagers(
      tx,
      task,
      "Tarefa assumida",
      `O colaborador ${c.userName || "da equipe"} assumiu a tarefa “${task.title}”.`,
      { type: "TASK_CLAIMED", priority: "LOW", excludeUserId: c.userId },
    );
    await synchronizeExecution(
      tx,
      c.organizationId,
      task.executionId,
      undefined,
      task.id,
    );
    return { success: true };
  });
  revalidatePath("/tasks");
  revalidatePath("/management/tasks");
  return result;
}

export async function pauseTaskAction(
  taskId: string,
  category = "OUTROS",
  note?: string,
): Promise<ActionResult> {
  return {
    error:
      "O sistema não permite pausar tarefas. A tarefa permanece aberta até ser cancelada ou concluída.",
  };
}
export async function resumeTaskAction(taskId: string): Promise<ActionResult> {
  return {
    error:
      "O sistema não permite pausar nem retomar tarefas. A tarefa permanece aberta até ser cancelada ou concluída.",
  };
}
export async function reportImpedimentAction(
  taskId: string,
  category: string,
  reason: string,
): Promise<ActionResult> {
  const employee = await getAuthenticatedContext();
  if (employee?.role === "EMPLOYEE") {
    try {
      const result = await employeeOperate(null, taskId, "impediment", {
        category,
        reason,
      });
      revalidatePath("/tasks");
      revalidatePath("/history");
      return result;
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : "Não foi possível continuar.",
      };
    }
  }
  return operate(taskId, false, async (tx, task, c) => {
    const check = canReportImpediment(task.status);
    if (!check.allowed) return { error: check.reason };
    if (
      !reasonSchema.safeParse(reason).success ||
      !reasonSchema.safeParse(category).success
    )
      return { error: "Informe a categoria e descreva o impedimento." };
    await endSessions(tx, task);
    await tx.taskOccurrence.create({
      data: {
        taskId,
        type: "IMPEDIMENT",
        category,
        reason: reason.trim(),
        severity: "HIGH",
        createdBy: c.memberId,
      },
    });
    await tx.task.update({
      where: { id: taskId },
      data: { status: "NOT_COMPLETED" },
    });
    await notifyManagers(
      tx,
      task,
      "Impedimento operacional",
      task.title + ": " + reason,
      {
        type: "IMPEDIMENT_REPORTED",
        priority: "HIGH",
        data: { taskId: task.id, taskTitle: task.title, locationId: task.locationId },
      }
    );
    await audit(tx, task, c, "TASK_IMPEDIMENT_REPORTED", { category, reason });
    return { success: true };
  });
}
export async function cancelTaskAction(
  taskId: string,
  reason: string,
  category = "OPERACIONAL",
): Promise<ActionResult> {
  return operate(taskId, true, async (tx, task, c) => {
    if (terminal(task.status)) return { error: "A tarefa já está encerrada." };
    if (
      !reasonSchema.safeParse(reason).success ||
      !reasonSchema.safeParse(category).success
    )
      return {
        error: "Informe o motivo do cancelamento (3 a 1000 caracteres).",
      };
    await endSessions(tx, task);
    await tx.task.update({
      where: { id: taskId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: "[" + category + "] " + reason.trim(),
      },
    });
    await audit(tx, task, c, "TASK_CANCELLED", { category, reason });
    await notifyTaskAssignees(
      tx,
      task,
      "Tarefa cancelada",
      `A tarefa “${task.title}” foi cancelada pela gestão. Motivo: ${reason}`,
      { type: "TASK_CANCELLED", priority: "MEDIUM", excludeUserId: c.userId },
    );
    return { success: true };
  });
}
export async function trashTaskAction(
  taskId: string,
  reason?: string,
): Promise<ActionResult> {
  return operate(taskId, true, async (tx, task, c) => {
    if (
      ["IN_PROGRESS", "PAUSED", "SUBMITTED", "NEEDS_CORRECTION"].includes(
        task.status,
      )
    )
      return {
        error: "Cancele ou finalize a tarefa antes de movê-la para a lixeira.",
      };
    await tx.task.update({
      where: { id: taskId },
      data: {
        deletedAt: new Date(),
        deletedBy: c.memberId,
        deleteReason: reason?.slice(0, 1000) || "Exclusão operacional",
      },
    });
    await audit(tx, task, c, "TASK_TRASHED", { reason: reason ?? "" });
    return { success: true };
  });
}
export async function restoreTaskAction(taskId: string): Promise<ActionResult> {
  return operate(
    taskId,
    true,
    async (tx, task, c) => {
      await tx.task.update({
        where: { id: taskId },
        data: { deletedAt: null, deletedBy: null, deleteReason: null },
      });
      await audit(tx, task, c, "TASK_RESTORED");
      return { success: true };
    },
    true,
  );
}
export async function purgeTaskAction(taskId: string): Promise<ActionResult> {
  return operate(
    taskId,
    true,
    async (tx, task, c) => {
      if (!["OWNER", "ADMIN"].includes(c.role))
        return {
          error:
            "Apenas proprietários e administradores podem excluir definitivamente.",
        };
      await audit(tx, task, c, "TASK_PURGED");
      await tx.task.delete({
        where: {
          id: taskId,
          organizationId: c.organizationId,
          deletedAt: { not: null },
        },
      });
      return { success: true };
    },
    true,
  );
}

export async function submitApprovalDecisionAction(
  stepId: string,
  decision: "APPROVED" | "REJECTED",
  note?: string,
): Promise<ActionResult> {
  const c = await getAuthenticatedContext();
  if (!c || !isManagement(c)) return { error: "Acesso negado." };
  if (
    !z.enum(["APPROVED", "REJECTED"]).safeParse(decision).success ||
    (note && note.length > 1000)
  )
    return { error: "Decisão inválida." };
  if (decision === "REJECTED" && !reasonSchema.safeParse(note).success)
    return { error: "Explique o que precisa ser corrigido." };
  const found = await prisma.approvalStep.findFirst({
    where: { id: stepId, workflow: { task: taskScope(c) } },
    select: { workflow: { select: { taskId: true } } },
  });
  if (!found) return { error: "Aprovação não encontrada no seu escopo." };
  return operate(found.workflow.taskId, true, async (tx, task, context) => {
    const workflow = task.approvalWorkflow,
      step = workflow?.steps.find((s) => s.id === stepId);
    if (
      !workflow ||
      !step ||
      task.status !== "SUBMITTED" ||
      workflow.status !== "PENDING" ||
      step.status !== "PENDING"
    )
      return { error: "Esta etapa não está aguardando decisão." };
    const teamAccess = step.approverTeamId
      ? await tx.teamMember.findFirst({
          where: {
            teamId: step.approverTeamId,
            organizationMemberId: context.memberId,
            team: { organizationId: context.organizationId },
          },
        })
      : null;
    const fallback =
      step.fallbackMemberId === context.memberId &&
      step.deadlineAt &&
      step.deadlineAt <= new Date();
    if (step.approverMemberId !== context.memberId && !teamAccess && !fallback)
      return {
        error: "Somente o aprovador designado pode decidir nesta etapa.",
      };
    if (
      workflow.mode === "SEQUENTIAL" &&
      workflow.steps.some(
        (s) => s.sequence < step.sequence && s.status !== "APPROVED",
      )
    )
      return { error: "Aguarde a aprovação das etapas anteriores." };
    await tx.approvalDecision.create({
      data: {
        stepId,
        decidedBy: context.memberId,
        decision,
        note: note?.trim() || null,
      },
    });
    await tx.approvalStep.update({
      where: { id: stepId },
      data: { status: decision },
    });
    const allApproved =
      decision === "APPROVED" &&
      workflow.steps.every((s) => s.id === stepId || s.status === "APPROVED");
    await tx.approvalWorkflow.update({
      where: { id: workflow.id },
      data: {
        status:
          decision === "REJECTED"
            ? "NEEDS_CORRECTION"
            : allApproved
              ? "APPROVED"
              : "PENDING",
      },
    });
    if (decision === "REJECTED" || allApproved) {
      await tx.task.update({
        where: { id: task.id },
        data: {
          status: allApproved ? "COMPLETED" : "NEEDS_CORRECTION",
          completedAt: allApproved ? new Date() : null,
        },
      });
      const owner = task.assignments.find((a) => a.type === "PRIMARY");
      if (owner) {
        await tx.notification.create({
          data: {
            organizationId: context.organizationId,
            userId: owner.member.userId,
            type: allApproved
              ? "APPROVAL_UPDATED"
              : "TASK_CORRECTION_REQUESTED",
            priority: allApproved ? "LOW" : "HIGH",
            title: allApproved ? "Entrega aprovada" : "Correção solicitada",
            message: task.title + (note ? ": " + note : ""),
            data: { taskId: task.id },
          },
        });

      }
      if (allApproved) {
        await notifyManagers(
          tx,
          task,
          "Entrega aprovada e concluída",
          `A tarefa “${task.title}” foi aprovada e concluída.`,
          {
            type: "TASK_COMPLETED",
            priority: "LOW",
            excludeUserId: context.userId,
          },
        );
      }
    } else if (decision === "APPROVED" && workflow.mode === "SEQUENTIAL") {
      const nextStep = workflow.steps.find(
        (s) => s.sequence > step.sequence && s.status === "PENDING",
      );
      if (nextStep) {
        await notifyApprovers(
          tx,
          task,
          nextStep,
          "Aprovação pendente",
          `A tarefa “${task.title}” aguarda sua aprovação (Etapa ${nextStep.sequence}).`,
          {
            type: "APPROVAL_REQUESTED",
            priority: "HIGH",
            excludeUserId: context.userId,
          },
        );
      }
    }
    await audit(
      tx,
      task,
      context,
      decision === "APPROVED" ? "APPROVAL_APPROVED" : "APPROVAL_REJECTED",
      { decision, note: note ?? "", stepSequence: step.sequence },
    );
    return { success: true };
  });
}

/**
 * Busca membros elegíveis para uma tarefa com status de disponibilidade operacional calculado (Item 18, 35)
 */
export async function getEligibleMembersForTaskAction(
  taskId: string,
): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context) return { error: "Não autenticado." };

  const task = await prisma.task.findFirst({
    where: { ...taskScope(context), id: taskId, deletedAt: null },
    include: { location: true },
  });
  if (!task) return { error: "Tarefa não encontrada." };

  const now = new Date();
  const isLocationOpen = task.location
    ? isLocationOpenAt(task.location, now)
    : true;

  const members = await prisma.organizationMember.findMany({
    where: {
      organizationId: context.organizationId,
      status: "ACTIVE",
      user: { status: "ACTIVE" },
      ...(task.teamId
        ? { teamMemberships: { some: { teamId: task.teamId } } }
        : {}),
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
        where: {
          removedAt: null,
          task: { status: "IN_PROGRESS", deletedAt: null },
        },
      },
    },
  });

  const formatted = members.map((m) => {
    const availability = calculateMemberAvailability({
      memberStatus: m.status,
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
 * A disponibilidade operacional é 100% automatizada pelo sistema.
 * Alterações manuais pelo funcionário foram descontinuadas.
 */
export async function updateMemberAvailabilityAction(
  _manualSetting?: "AUTO" | "AVAILABLE" | "UNAVAILABLE",
): Promise<ActionResult> {
  return {
    error:
      "A disponibilidade operacional é calculada automaticamente pelo sistema com base no expediente da unidade e tarefas em andamento.",
  };
}

// ─── Drawer de Detalhe da Tarefa (Gestão) ─────────────────────────────────────
export type ManagementTaskDrawerResult = {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  taskType?: string | null;
  formFields?: any;
  formAnswers?: any;
  origin: string;
  status: string;
  priority: string;
  criticality: string;
  required: boolean;
  deadlineAt: string | null;
  slaDueAt: string | null;
  slaExceeded: boolean;
  actualDuration: number | null;
  startedAt: string | null;
  completedAt: string | null;
  timezone?: string;
  locationName: string | null;
  teamName: string | null;
  assignments: Array<{
    id: string;
    memberId: string;
    memberName: string;
    type: string;
  }>;
  evidenceRequirements: Array<{
    id: string;
    type: string;
    required: boolean;
    executionStage: string;
    minQuantity: number;
    submissions: Array<{
      id: string;
      value: string | null;
      storageKey: string | null;
      validationStatus: string;
      attemptNumber: number;
      createdAt: string;
    }>;
  }>;
  dependencies: Array<{
    id: string;
    type: string;
    logic: string;
    dependsOnTask: { id: string; title: string; status: string };
  }>;
  occurrences: Array<{
    id: string;
    type: string;
    category: string;
    reason: string;
    severity: string;
    createdAt: string;
  }>;
  activityLogs: Array<{
    id: string;
    action: string;
    actorId: string | null;
    actorName: string | null;
    createdAt: string;
    metadata: unknown;
  }>;
  approvalWorkflow: {
    id: string;
    mode: string;
    status: string;
    steps: Array<{
      id: string;
      sequence: number;
      status: string;
      canDecide: boolean;
      decisions: Array<{
        id: string;
        decision: string;
        note: string | null;
        decidedBy: string;
        createdAt: string;
      }>;
    }>;
  } | null;
  canEdit: boolean;
};

export async function getManagementTaskDrawerAction(taskId: string): Promise<{
  success?: boolean;
  error?: string;
  task?: ManagementTaskDrawerResult;
}> {
  const context = await getAuthenticatedContext();
  if (!context) return { error: "Não autenticado." };
  if (!isManagement(context)) return { error: "Acesso não autorizado." };
  if (!taskId || typeof taskId !== "string")
    return { error: "Identificador inválido." };

  try {
    const [task, rawDependencies, activityLogs] = await Promise.all([
      prisma.task.findFirst({
        where: { id: taskId, ...taskScope(context), deletedAt: null },
        include: {
          location: true,
          execution: { select: { routine: { select: { timezone: true } } } },
          team: true,
          assignments: {
            where: { removedAt: null },
            include: { member: { include: { user: true } } },
          },
          evidenceRequirements: {
            include: { submissions: { orderBy: { createdAt: "desc" } } },
          },
          occurrences: {
            where: {
              type: { not: "PAUSE_ALERT" },
              category: { notIn: ["LONG_PAUSE", "INTERVALO"] },
            },
            orderBy: { createdAt: "desc" },
          },
          approvalWorkflow: {
            include: {
              steps: {
                include: { decisions: true },
                orderBy: { sequence: "asc" },
              },
            },
          },
        },
      }),
      "taskDependency" in prisma &&
      typeof (prisma as any).taskDependency?.findMany === "function"
        ? (prisma as any).taskDependency
            .findMany({
              where: { taskId, task: taskScope(context) },
              include: {
                dependsOnTask: {
                  select: { id: true, title: true, status: true },
                },
              },
            })
            .catch(() => [])
        : Promise.resolve([]),
      prisma.activityLog.findMany({
        where: {
          organizationId: context.organizationId,
          entityType: "TASK",
          entityId: taskId,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    if (!task)
      return { error: "Tarefa não encontrada ou sem permissão de acesso." };

    // Scope check for MANAGER
    if (context.role === "MANAGER" && context.scope) {
      if (
        task.locationId &&
        !context.scope.locationIds.includes(task.locationId)
      ) {
        return { error: "Sem acesso a esta tarefa." };
      }
      if (task.teamId && !context.scope.teamIds.includes(task.teamId)) {
        return { error: "Sem acesso a esta tarefa." };
      }
    }

    // Resolve actor names for activity logs
    const actorIds = activityLogs.flatMap((l) =>
      l.actorId ? [l.actorId] : [],
    );
    const [actors, ownTeams] = await Promise.all([
      actorIds.length > 0
        ? prisma.organizationMember.findMany({
            where: { id: { in: actorIds } },
            include: { user: { select: { name: true } } },
          })
        : Promise.resolve([]),
      prisma.teamMember.findMany({
        where: { organizationMemberId: context.memberId },
        select: { teamId: true },
      }),
    ]);
    const actorMap = new Map(actors.map((a) => [a.id, a.user.name]));

    const dependenciesList: any[] = Array.isArray(rawDependencies)
      ? rawDependencies
      : [];
    const now = new Date();
    const slaExceeded = Boolean(
      task.slaExceededAt ||
      (task.slaDueAt && task.slaDueAt < now && task.status !== "COMPLETED"),
    );

    return {
      success: true,
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        instructions: task.instructions,
        taskType: task.taskType,
        formFields: task.formFields,
        formAnswers: task.formAnswers,
        origin: task.origin,
        status: task.status,
        priority: task.priority,
        criticality: task.criticality,
        required: task.required,
        deadlineAt: task.deadlineAt ? task.deadlineAt.toISOString() : null,
        slaDueAt: task.slaDueAt ? task.slaDueAt.toISOString() : null,
        slaExceeded,
        actualDuration: task.actualDuration,
        startedAt: task.startedAt ? task.startedAt.toISOString() : null,
        completedAt: task.completedAt ? task.completedAt.toISOString() : null,
        timezone: resolveEffectiveTimezone({
          routineTimezone: task.execution?.routine?.timezone,
          locationTimezone: task.location?.timezone,
        }),
        locationName: task.location?.name || null,
        teamName: task.team?.name || null,
        assignments: task.assignments.map((a) => ({
          id: a.id,
          memberId: a.memberId,
          memberName: a.member?.user?.name || "—",
          type: a.type,
        })),
        evidenceRequirements: task.evidenceRequirements.map((req) => ({
          id: req.id,
          type: req.type,
          required: req.required,
          executionStage: req.executionStage ?? "DURING",
          minQuantity: req.minQuantity,
          submissions: req.submissions.map((s) => ({
            id: s.id,
            value: s.value,
            storageKey: s.storageKey,
            validationStatus: s.validationStatus,
            attemptNumber: s.attemptNumber,
            createdAt: s.createdAt.toISOString(),
          })),
        })),
        dependencies: dependenciesList.map((d: any) => ({
          id: d.id,
          type: d.type,
          logic: d.logic,
          dependsOnTask: {
            id: d.dependsOnTask?.id || "",
            title: d.dependsOnTask?.title || "Etapa anterior",
            status: d.dependsOnTask?.status || "AVAILABLE",
          },
        })),
        occurrences: task.occurrences.map((o) => ({
          id: o.id,
          type: o.type,
          category: o.category,
          reason: o.reason,
          severity: o.severity,
          createdAt: o.createdAt.toISOString(),
        })),
        activityLogs: activityLogs.map((l) => ({
          id: l.id,
          action: l.action,
          actorId: l.actorId,
          actorName: actorMap.get(l.actorId ?? "") ?? null,
          createdAt: l.createdAt.toISOString(),
          metadata: l.metadata,
        })),
        approvalWorkflow: task.approvalWorkflow
          ? {
              id: task.approvalWorkflow.id,
              mode: task.approvalWorkflow.mode,
              status: task.approvalWorkflow.status,
              steps: task.approvalWorkflow.steps.map((step) => ({
                id: step.id,
                sequence: step.sequence,
                status: step.status,
                canDecide:
                  task.status === "SUBMITTED" &&
                  step.status === "PENDING" &&
                  (step.approverMemberId === context.memberId ||
                    ownTeams.some((t) => t.teamId === step.approverTeamId) ||
                    (step.fallbackMemberId === context.memberId &&
                      !!step.deadlineAt &&
                      step.deadlineAt <= new Date())) &&
                  (task.approvalWorkflow!.mode !== "SEQUENTIAL" ||
                    task.approvalWorkflow!.steps.every(
                      (prior) =>
                        prior.sequence >= step.sequence ||
                        prior.status === "APPROVED",
                    )),
                decisions: step.decisions.map((d) => ({
                  id: d.id,
                  decision: d.decision,
                  note: d.note,
                  decidedBy: d.decidedBy,
                  createdAt: d.createdAt.toISOString(),
                })),
              })),
            }
          : null,
        canEdit: canEditTaskDefinition(task as any),
      },
    };
  } catch (err) {
    console.error("[getManagementTaskDrawerAction]", err);
    return { error: "Erro ao consultar a tarefa." };
  }
}
