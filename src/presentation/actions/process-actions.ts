"use server";
import { completeExecution } from "@/application/mobile/execution-operations";
import { execution as employeeExecution } from "@/application/mobile/data";
import { webTaskDetail } from "@/application/mobile/web-task-contract";
import { z } from "zod";
import { saveProcessInTransaction } from "@/application/processes/save-process";
import { TemplateInputError } from "@/application/templates/template-library";
import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import { getAuthenticatedContext } from "@/application/security/auth-context";
import {
  eligibleMember,
  isManagement,
  processScope,
} from "@/application/security/operational-scope";
import {
  processDefinitionSchema,
  readProcessDefinition,
  scheduleSchema,
  type ProcessDefinition,
} from "@/domain/rules/process-definition";
import { generateRoutineExecution } from "@/application/processes/generate-execution";
import { changeExecutionState } from "@/application/processes/execution-lifecycle";
import { dispatchNotificationAsync } from "@/infrastructure/notifications/notification-service";
import { readable } from "@/application/mobile/data";
import { taskScope } from "@/application/security/operational-scope";
import { evaluateTaskDependencies } from "@/domain/rules/dependency-rules";
import { resolveExecutionStatus } from "@/domain/rules/execution-state";
import { revalidatePath } from "@/infrastructure/realtime/revalidate";
export type ActionResult = {
  success?: boolean;
  error?: string;
  data?: { id: string };
  skipped?: boolean;
  blocked?: boolean;
  reason?: string;
  generated?: boolean;
};
function refresh() {
  for (const path of [
    "/management/processes",
    "/management/processes/archived",
    "/management/tasks",
    "/tasks",
    "/history",
    "/overview",
    "/notifications",
  ])
    revalidatePath(path);
}

export async function createProcessAction(
  formData: FormData,
): Promise<ActionResult> {
  const context = await getAuthenticatedContext(false);
  if (!context || !isManagement(context))
    return { error: "Apenas gestores podem salvar processos." };
  try {
    const input = JSON.parse(String(formData.get("definition")));
    const result = await prisma.$transaction(
      (tx) =>
        saveProcessInTransaction(tx, context, input, {
          processId: String(formData.get("processId") || "") || undefined,
          requestId: String(formData.get("requestId") || "") || undefined,
          templateReference:
            String(formData.get("templateReference") || "") || undefined,
          routineId: String(formData.get("routineId") || "") || undefined,
        }),
      { timeout: 30000 },
    );
    for (const notification of result.notifications)
      void dispatchNotificationAsync(notification);
    if (result.routineId)
      await generateRoutineExecution(
        result.routineId,
        context,
        new Date(),
        true,
      ).catch(() => undefined);
    refresh();
    return { success: true, data: { id: result.id } };
  } catch (error) {
    return {
      error:
        error instanceof TemplateInputError
          ? error.message
          : "Não foi possível salvar. Seus dados continuam nesta tela; tente novamente.",
    };
  }
}

export async function toggleProcessStatusAction(
  processId: string,
  newStatus: "ACTIVE" | "PAUSED" | "ARCHIVED",
): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context || !isManagement(context))
    return { error: "Apenas gestores podem alterar processos." };
  if (!z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]).safeParse(newStatus).success)
    return { error: "Status inválido." };
  const process = await prisma.process.findFirst({
    where: { ...processScope(context), id: processId },
    include: { sourceTemplateVersion: true },
  });
  if (!process) return { error: "Processo não encontrado no seu escopo." };
  if (
    context.role === "MANAGER" &&
    readProcessDefinition(
      process.sourceTemplateVersion?.definition,
    )?.tasks.some((t) => !context.scope?.teamIds.includes(t.teamId))
  )
    return { error: "Este processo contém equipes fora do seu escopo." };
  if (
    process.status === "ARCHIVED" &&
    !["OWNER", "ADMIN"].includes(context.role)
  )
    return {
      error:
        "Somente proprietários e administradores podem restaurar processos.",
    };
  const target = process.status === "ARCHIVED" ? "PAUSED" : newStatus;
  await prisma.$transaction(async (tx) => {
    await tx.process.update({
      where: { id: process.id, organizationId: context.organizationId },
      data: { status: target },
    });
    await tx.activityLog.create({
      data: {
        organizationId: context.organizationId,
        actorId: context.memberId,
        action: `PROCESS_STATUS_${target}`,
        entityType: "PROCESS",
        entityId: process.id,
        metadata: { previousStatus: process.status },
      },
    });
  });
  refresh();
  return { success: true };
}

export async function createRoutineAction(
  formData: FormData,
): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context || !isManagement(context))
    return { error: "Apenas gestores podem programar rotinas." };
  let input: unknown;
  try {
    input = JSON.parse(String(formData.get("schedule")));
  } catch {
    return { error: "Revise a programação." };
  }
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const process = await prisma.process.findFirst({
    where: {
      ...processScope(context),
      id: String(formData.get("processId")),
      status: "ACTIVE",
    },
    include: { sourceTemplateVersion: true },
  });
  if (!process) return { error: "Escolha um processo ativo no seu escopo." };
  if (
    context.role === "MANAGER" &&
    readProcessDefinition(
      process.sourceTemplateVersion?.definition,
    )?.tasks.some((t) => !context.scope?.teamIds.includes(t.teamId))
  )
    return { error: "Este processo contém equipes fora do seu escopo." };
  const id = String(formData.get("routineId") || "");
  if (
    id &&
    !(await prisma.routine.findFirst({ where: { id, processId: process.id } }))
  )
    return { error: "Rotina não encontrada." };
  const s = parsed.data;
  const data = {
    recurrenceRule: JSON.stringify(s),
    timezone: s.timezone,
    startsAt: new Date(s.startsAt),
    endsAt: s.endsAt ? new Date(`${s.endsAt}T23:59:59Z`) : null,
    generationLeadTime: s.generationLeadTime,
    pendingPreviousPolicy: s.pendingPreviousPolicy,
  };
  const routine = await prisma.$transaction(async (tx) => {
    const r = id
      ? await tx.routine.update({ where: { id }, data })
      : await tx.routine.create({ data: { ...data, processId: process.id } });
    await tx.activityLog.create({
      data: {
        organizationId: context.organizationId,
        actorId: context.memberId,
        action: id ? "ROUTINE_UPDATED" : "ROUTINE_CREATED",
        entityType: "ROUTINE",
        entityId: r.id,
      },
    });
    return r;
  });
  refresh();
  return { success: true, data: { id: routine.id } };
}

export async function toggleRoutineAction(id: string): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context || !isManagement(context)) return { error: "Acesso negado." };
  const routine = await prisma.routine.findFirst({
    where: { id, process: processScope(context) },
    include: { process: { include: { sourceTemplateVersion: true } } },
  });
  if (!routine) return { error: "Rotina não encontrada." };
  if (
    context.role === "MANAGER" &&
    readProcessDefinition(
      routine.process.sourceTemplateVersion?.definition,
    )?.tasks.some((t) => !context.scope?.teamIds.includes(t.teamId))
  )
    return { error: "Equipe fora do seu escopo." };
  await prisma.$transaction(async (tx) => {
    await tx.routine.update({
      where: { id },
      data: { status: routine.status === "ACTIVE" ? "PAUSED" : "ACTIVE" },
    });
    await tx.activityLog.create({
      data: {
        organizationId: context.organizationId,
        actorId: context.memberId,
        action:
          routine.status === "ACTIVE" ? "ROUTINE_PAUSED" : "ROUTINE_ACTIVATED",
        entityType: "ROUTINE",
        entityId: id,
      },
    });
  });
  refresh();
  return { success: true };
}

export async function triggerExecutionGenerationAction(
  routineId: string,
): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context || !isManagement(context))
    return { error: "Apenas gestores podem gerar execuções." };
  try {
    const result = await generateRoutineExecution(routineId, context);
    refresh();
    return result;
  } catch {
    return {
      error:
        "Não foi possível gerar a execução. Atualize a página e tente novamente.",
    };
  }
}

async function updateExecution(
  executionId: string,
  operation: "CANCEL" | "REOPEN",
  reason: string,
  category = "OPERACIONAL",
): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context || !isManagement(context))
    return { error: "Apenas gestores podem alterar execuções." };
  const parsed = z
    .object({
      executionId: z.string().min(1).max(128),
      reason: z.string().trim().min(5).max(1000),
      category: z.enum(["OPERACIONAL", "PROGRAMACAO", "DUPLICIDADE", "OUTROS"]),
    })
    .safeParse({ executionId, reason, category });
  if (!parsed.success)
    return {
      error:
        "Selecione a categoria e descreva o motivo com 5 a 1000 caracteres.",
    };
  const result = await prisma.$transaction(
    (tx) =>
      changeExecutionState(
        tx,
        context,
        executionId,
        operation,
        parsed.data.reason,
        category,
      ),
    { timeout: 20000 },
  );
  refresh();
  revalidatePath("/tasks", "layout");
  revalidatePath("/management/tasks", "layout");
  return result;
}

export async function reopenExecutionAction(
  executionId: string,
  reason: string,
): Promise<ActionResult> {
  return updateExecution(executionId, "REOPEN", reason);
}

export async function cancelExecutionAction(
  executionId: string,
  reason: string,
  category: string,
): Promise<ActionResult> {
  return updateExecution(executionId, "CANCEL", reason, category);
}

export async function instantiateProcessFromTemplateAction(
  templateVersionId: string,
  targetLocationIds: string[],
  overrideName?: string,
): Promise<ActionResult> {
  const context = await getAuthenticatedContext(false);
  if (!context || !isManagement(context)) return { error: "Acesso negado." };
  if (
    !Array.isArray(targetLocationIds) ||
    !targetLocationIds.length ||
    targetLocationIds.length > 50 ||
    new Set(targetLocationIds).size !== targetLocationIds.length
  )
    return { error: "Escolha unidades diferentes." };
  try {
    const results = await prisma.$transaction(
      async (tx) => {
        const version = await tx.processTemplateVersion.findFirst({
          where: {
            id: templateVersionId,
            template: { organizationId: context.organizationId },
          },
        });
        const d = readProcessDefinition(version?.definition);
        if (!d) throw new TemplateInputError("Definição indisponível.");
        const list = [];
        for (const id of targetLocationIds)
          list.push(
            await saveProcessInTransaction(
              tx,
              context,
              { ...d, locationId: id, name: overrideName || d.name },
              { requestId: crypto.randomUUID() },
            ),
          );
        return list;
      },
      { timeout: 60000 },
    );
    for (const r of results) {
      for (const n of r.notifications) void dispatchNotificationAsync(n);
      if (r.routineId)
        await generateRoutineExecution(
          r.routineId,
          context,
          new Date(),
          true,
        ).catch(() => undefined);
    }
    refresh();
    return { success: true, data: { id: results[0].id } };
  } catch (error) {
    return {
      error:
        error instanceof TemplateInputError
          ? error.message
          : "Não foi possível criar os processos.",
    };
  }
}

export async function updateProcessToTemplateVersionAction(
  processId: string,
  newTemplateVersionId: string,
): Promise<ActionResult> {
  const context = await getAuthenticatedContext(false);
  if (!context || !isManagement(context)) return { error: "Acesso negado." };
  try {
    await prisma.$transaction(
      async (tx) => {
        const p = await tx.process.findFirst({
          where: { ...processScope(context), id: processId },
          include: { sourceTemplateVersion: true },
        });
        const v = p?.sourceTemplateVersion
          ? await tx.processTemplateVersion.findFirst({
              where: {
                id: newTemplateVersionId,
                templateId: p.sourceTemplateVersion.templateId,
                template: { organizationId: context.organizationId },
              },
            })
          : null;
        const d = readProcessDefinition(v?.definition);
        if (!d || !p)
          throw new TemplateInputError(
            "Versão indisponível para este processo.",
          );
        await saveProcessInTransaction(
          tx,
          context,
          { ...d, locationId: p.locationId },
          { processId: p.id },
        );
      },
      { timeout: 30000 },
    );
    refresh();
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof TemplateInputError
          ? error.message
          : "Não foi possível atualizar o processo.",
    };
  }
}

export type EmployeeProcessTaskItem = {
  roundId?: string;
  requiresApproval?: boolean;
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  taskType: string;
  status: string;
  priority: string;
  criticality: string;
  required: boolean;
  orderIndex: number;
  completedAt: string | null;
  startedAt: string | null;
  deadlineAt: string | null;
  scheduledDate?: string | null;
  formFields: any[] | null;
  formAnswers: any | null;
  evidenceRequirements: Array<{
    id: string;
    type: string;
    required: boolean;
    minQuantity: number;
    maxQuantity: number;
    submissions: Array<{
      id: string;
      storageKey: string | null;
      value: string | null;
      validationStatus: string;
      createdAt: string;
    }>;
  }>;
  isAssignedToCurrent: boolean;
  assignedMemberName: string | null;
  isUnassigned: boolean;
  dependsOnIds: string[];
  isBlocked: boolean;
};

export type EmployeeProcessExecutionDetail = {
  canComplete?: boolean;
  requiredTotal?: number;
  requiredCompleted?: number;
  personalTotal?: number;
  personalCompleted?: number;
  hasHiddenSteps?: boolean;
  id: string;
  processId: string;
  processName: string;
  processDescription: string | null;
  locationName: string | null;
  status: string;
  scheduledAt: string;
  completedAt: string | null;
  orderRule: "FREE" | "STRICT" | "CUSTOM";
  tasks: EmployeeProcessTaskItem[];
};

export async function getEmployeeProcessExecutionAction(
  executionId: string,
): Promise<{ execution?: EmployeeProcessExecutionDetail; error?: string }> {
  const context = await getAuthenticatedContext();
  if (!context) return { error: "Não autenticado." };

  if (context.role === "EMPLOYEE") {
    try {
      const dto = await employeeExecution(context, executionId);
      const record = await prisma.processExecution.findFirstOrThrow({
        where: { id: executionId, organizationId: context.organizationId },
        include: {
          process: { select: { description: true } },
          location: { select: { name: true } },
        },
      });
      const tasks = await Promise.all(
        dto.visibleTasks.map(async (t, index) => ({
          ...t,
          evidenceRequirements: t.requirements.map((requirement) => ({
            ...requirement,
            executionStage: requirement.stage,
            submissions: [],
          })),
          orderIndex: index + 1,
          completedAt: t.status === "COMPLETED" ? t.endedAt : null,
          formFields: Array.isArray(t.formFields) ? t.formFields : [],
          isAssignedToCurrent: !!t.assignmentType,
          assignedMemberName: t.assignedNames.join(", ") || null,
          isBlocked:
            !t.actions.complete.allowed &&
            t.actions.complete.code === "DEPENDENCY",
          dependsOnIds: [],
        })),
      );
      return {
        execution: {
          ...dto,
          processId: record.processId,
          processName: dto.name,
          processDescription: record.process.description,
          locationName: record.location?.name ?? null,
          scheduledAt: record.scheduledAt.toISOString(),
          completedAt: record.completedAt?.toISOString() ?? null,
          orderRule: "CUSTOM",
          tasks,
        },
      };
    } catch {
      return { error: "Execução removida, transferida ou fora do seu acesso." };
    }
  }

  const execution = await prisma.processExecution.findFirst({
    where: {
      id: executionId,
      organizationId: context.organizationId,
      tasks: { some: taskScope(context) },
    },
    include: {
      process: { select: { id: true, name: true, description: true } },
      location: { select: { id: true, name: true } },
      tasks: {
        where: { AND: [{ deletedAt: null }, taskScope(context)] },
        include: {
          assignments: {
            where: { removedAt: null },
            include: {
              member: { include: { user: { select: { name: true } } } },
            },
          },
          evidenceRequirements: {
            include: {
              submissions: {
                orderBy: { createdAt: "desc" },
                select: {
                  id: true,
                  storageKey: true,
                  value: true,
                  validationStatus: true,
                  createdAt: true,
                },
              },
            },
          },
          dependencies: {
            include: {
              dependsOnTask: {
                select: {
                  id: true,
                  status: true,
                  approvalWorkflow: { select: { status: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!execution) {
    return { error: "Execução de processo não encontrada." };
  }

  const snapshotTasks = (execution.definitionSnapshot as any)?.tasks;
  let orderRule: "FREE" | "STRICT" | "CUSTOM" = "FREE";

  if (Array.isArray(snapshotTasks) && snapshotTasks.length > 1) {
    const hasAnyDepends = snapshotTasks.some(
      (t: any) => Array.isArray(t.dependsOn) && t.dependsOn.length > 0,
    );
    if (!hasAnyDepends) {
      orderRule = "FREE";
    } else {
      const isStrict = snapshotTasks.every((t: any, idx: number) => {
        if (idx === 0) return !t.dependsOn || t.dependsOn.length === 0;
        return (
          Array.isArray(t.dependsOn) &&
          t.dependsOn.length === 1 &&
          t.dependsOn[0] === snapshotTasks[idx - 1].id
        );
      });
      orderRule = isStrict ? "STRICT" : "CUSTOM";
    }
  }

  // Ordenar tarefas conforme a definição original no snapshot ou ID/createdAt
  const titleOrderMap = new Map<string, number>();
  if (Array.isArray(snapshotTasks)) {
    snapshotTasks.forEach((st: any, idx: number) => {
      if (st.id) titleOrderMap.set(st.id, idx);
    });
  }

  const sortedTasks = [...execution.tasks].sort((a, b) => {
    const orderA =
      a.definitionOrder ?? titleOrderMap.get(a.definitionTaskId ?? "") ?? 999;
    const orderB =
      b.definitionOrder ?? titleOrderMap.get(b.definitionTaskId ?? "") ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    return a.id.localeCompare(b.id);
  });

  const formattedTasks: EmployeeProcessTaskItem[] = sortedTasks.map(
    (task, idx) => {
      const isCompleted = task.status === "COMPLETED";
      let isBlocked = task.status === "BLOCKED";

      isBlocked =
        !isCompleted &&
        (task.status === "BLOCKED" ||
          evaluateTaskDependencies(
            task.dependencies.map((dep) => ({
              dependsOnTaskId: dep.dependsOnId,
              dependsOnStatus: dep.dependsOnTask.status,
              dependsOnApprovalStatus:
                dep.dependsOnTask.approvalWorkflow?.status,
              type: dep.type,
              logic: dep.logic,
            })),
          ).isBlocked);

      const primaryAssignee = task.assignments.find(
        (a) => a.type === "PRIMARY",
      );
      const isAssignedToCurrent = task.assignments.some(
        (a) => a.memberId === context.memberId,
      );
      const isUnassigned = !primaryAssignee;

      return {
        id: task.id,
        title: task.title,
        description: task.description,
        instructions: task.instructions,
        taskType: task.taskType,
        status: task.status,
        priority: task.priority,
        criticality: task.criticality,
        required: task.required,
        orderIndex: idx + 1,
        completedAt: task.completedAt ? task.completedAt.toISOString() : null,
        startedAt: task.startedAt ? task.startedAt.toISOString() : null,
        deadlineAt: task.deadlineAt ? task.deadlineAt.toISOString() : null,
        scheduledDate: task.scheduledDate
          ? task.scheduledDate.toISOString()
          : null,
        formFields: Array.isArray(task.formFields)
          ? (task.formFields as any[])
          : null,
        formAnswers: task.formAnswers || null,
        evidenceRequirements: task.evidenceRequirements.map((er) => ({
          id: er.id,
          type: er.type,
          required: er.required,
          minQuantity: er.minQuantity,
          maxQuantity: er.maxQuantity,
          submissions: er.submissions.map((s) => ({
            id: s.id,
            storageKey: s.storageKey,
            value: s.value,
            validationStatus: s.validationStatus,
            createdAt: s.createdAt.toISOString(),
          })),
        })),
        isAssignedToCurrent,
        assignedMemberName: primaryAssignee?.member.user?.name || null,
        isUnassigned,
        dependsOnIds: task.dependencies.map((d) => d.dependsOnId),
        isBlocked,
      };
    },
  );

  return {
    execution: {
      id: execution.id,
      processId: execution.processId,
      processName: execution.process.name,
      processDescription: execution.process.description,
      locationName: execution.location?.name || null,
      status: execution.status,
      scheduledAt: execution.scheduledAt.toISOString(),
      completedAt: execution.completedAt
        ? execution.completedAt.toISOString()
        : null,
      orderRule,
      tasks: formattedTasks,
    },
  };
}

export async function completeProcessExecutionAction(
  executionId: string,
): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context) return { error: "Não autenticado." };
  const result = await completeExecution(null, context, executionId);
  if (result.success) refresh();
  return result;
}
