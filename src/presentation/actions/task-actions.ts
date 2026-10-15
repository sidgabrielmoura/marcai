"use server";
import { saveEvidence as saveTaskEvidence, completeTask as submitTask, startTask as beginTask } from "@/application/mobile/task-submission";
import { createUpload, chunk, finalizeForm } from "@/application/mobile/attachments";
import { randomUUID } from "node:crypto";

import { validateFormAnswers } from "@/domain/rules/form-answers";
import { z } from "zod";
import { prisma } from "@/infrastructure/database/prisma";
import { getAuthenticatedContext } from "@/application/security/auth-context";
import { taskScope, eligibleMember } from "@/application/security/operational-scope";
import { synchronizeExecution } from "@/application/tasks/synchronize-execution";
import { notifyManagers, notifyApprovers } from "@/application/tasks/notify-managers";
import { lockTask } from "@/application/tasks/task-lock";
import { getEvidenceRound, evidenceInRound } from "@/application/tasks/evidence-round";
import { effectiveWorkSeconds } from "@/domain/rules/execution-state";
import { canStartTask, canCompleteTask } from "@/domain/rules/task-rules";
import { evaluateTaskDependencies } from "@/domain/rules/dependency-rules";
import { evaluateEarlyExecution } from "@/domain/rules/early-execution";
import { isLocationOpenAt } from "@/domain/rules/operating-hours";
import { eventBus } from "@/infrastructure/events/event-bus";
import { inspectEvidenceFile, storeEvidence, removeEvidence } from "@/infrastructure/storage/evidence-storage";
import { revalidatePath } from "next/cache";
export type ActionResult = { success?: boolean; error?: string };
function refresh(id: string) { for (const p of [`/tasks/${id}`, `/management/tasks/${id}`, "/tasks", "/history", "/management/tasks", "/overview", "/notifications"]) revalidatePath(p); }

export async function startTaskAction(taskId: string, justification?: string): Promise<ActionResult> { return beginTask(null,taskId,justification); }

export async function submitEvidenceAction(taskId: string, requirementId: string, value: string, _metadata?: Record<string, unknown>): Promise<ActionResult> {
  return saveEvidence(taskId, requirementId, value, null);
}
export async function uploadEvidenceAction(form: FormData): Promise<ActionResult> {
  const file = form.get("file");
  if (!(file instanceof File)) return { error: "Selecione um arquivo antes de enviar." };
  return saveEvidence(String(form.get("taskId")), String(form.get("requirementId")), file.name, file);
}

async function saveEvidence(taskId: string, requirementId: string, value: string, file: File | null): Promise<ActionResult> { return saveTaskEvidence(null, taskId, requirementId, value, file); }

export async function uploadTaskFormFileAction(formData: FormData): Promise<{success?:boolean;storageKey?:string;fileName?:string;fileSize?:number;mimeType?:string;error?:string}> {
 const c=await getAuthenticatedContext(false);if(!c)return {error:"Não autenticado."};
 const taskId=String(formData.get("taskId")??""),fieldId=String(formData.get("fieldId")??""),file=formData.get("file");
 if(!(file instanceof File)||!taskId||!fieldId)return {error:"Informe tarefa, pergunta e arquivo."};
 const req=()=>new Request("https://marcai-coral.vercel.app",{method:"POST",headers:{"Idempotency-Key":randomUUID()}});
 try { const created=await createUpload(req(),c,taskId,{fieldId,name:file.name,mime:file.type,size:file.size});const bytes=Buffer.from(await file.arrayBuffer());for(let part=0;part<Math.ceil(bytes.length/1048576);part++)await chunk(c,created.uploadId,part,bytes.subarray(part*1048576,(part+1)*1048576));const result=await finalizeForm(req(),c,created.uploadId);return {success:true,storageKey:String(result.storageKey),fileName:String(result.fileName),fileSize:Number(result.fileSize),mimeType:String(result.mimeType)}; }catch {return {error:"Não foi possível enviar o anexo. Verifique formato, prazo e acesso."};}
}

export async function completeTaskAction(taskId: string, formAnswers?: Record<string, any>): Promise<ActionResult> { return submitTask(null, taskId, formAnswers); }

export type TaskDetailResult = {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  taskType: string;
  formFields: any;
  formAnswers: any;
  status: string;
  priority: string;
  deadlineAt: string | null;
  slaDueAt: string | null;
  toleranceMinutes: number;
  scheduledDate: string | null;
  requiresApproval: boolean;
  correctionRequested: boolean;
  locationName: string | null;
  isUnassigned?: boolean;
  dependencies: {
    id: string;
    type: string;
    logic: string;
    dependsOnTask: {
      id: string;
      title: string;
      status: string;
    };
  }[];
  occurrences: {
    id: string;
    type: string;
    category: string;
    reason: string;
    severity: string;
    createdAt: string;
  }[];
  evidenceRequirements: {
    id: string;
    type: string;
    required: boolean;
    minQuantity: number;
    executionStage?: string;
    submissions: {
      id: string;
      validationStatus: string;
      attemptNumber: number;
      value: string | null;
      storageKey?: string | null;
      createdAt: string;
    }[];
  }[];
};

export async function getTaskDetailAction(taskId: string): Promise<{ success?: boolean; error?: string; task?: TaskDetailResult }> {
  const c = await getAuthenticatedContext();
  if (!c) return { error: "Não autenticado." };
  if (!taskId || typeof taskId !== "string") return { error: "Identificador inválido." };

  try {
    const [task, rawDependencies] = await Promise.all([
      prisma.task.findFirst({
        where: {
          id: taskId,
          organizationId: c.organizationId,
          deletedAt: null,
          OR: [
            taskScope(c),
            {
              status: { notIn: ["COMPLETED", "CANCELLED", "NOT_COMPLETED"] },
              ...(c.role === "EMPLOYEE"
                ? {
                    teamId: { in: c.scope?.teamIds ?? [] },
                    ...(c.scope?.locationIds && c.scope.locationIds.length > 0
                      ? { OR: [{ locationId: null }, { locationId: { in: c.scope.locationIds } }] }
                      : { locationId: null }),
                  }
                : {
                    ...(c.scope?.teamIds ? { teamId: { in: c.scope.teamIds } } : {}),
                    ...(c.scope?.locationIds ? { locationId: { in: c.scope.locationIds } } : {}),
                  }),
              assignments: { none: { type: "PRIMARY", removedAt: null } },
            },
          ],
        },
        include: {
          location: true,
          approvalWorkflow: true,
          assignments: {
            where: { removedAt: null },
            select: { id: true, memberId: true, type: true },
          },
          evidenceRequirements: {
            include: {
              submissions: {
                orderBy: { attemptNumber: "asc" },
              },
            },
          },
          occurrences: {
            where: {
              type: { not: "PAUSE_ALERT" },
              category: { notIn: ["LONG_PAUSE", "INTERVALO"] },
            },
            orderBy: { createdAt: "desc" },
          },
        },
      }),
      "taskDependency" in prisma &&
        typeof (prisma as any).taskDependency?.findMany === "function"
        ? (prisma as any).taskDependency
          .findMany({
            where: {
              taskId,
              task: {
                organizationId: c.organizationId,
                deletedAt: null,
              },
            },
            include: {
              dependsOnTask: {
                select: { id: true, title: true, status: true },
              },
            },
          })
          .catch(() => [])
        : Promise.resolve([]),
    ]);

    if (!task) {
      return { error: "Tarefa não encontrada ou sem permissão de acesso." };
    }

    const evidenceRound = await getEvidenceRound(prisma, c.organizationId, taskId);
    const dependenciesList: any[] = Array.isArray(rawDependencies) ? rawDependencies : [];
    const isUnassigned = !task.assignments.some((a) => a.type === "PRIMARY");

    return {
      success: true,
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        instructions: task.instructions,
        taskType: task.taskType || "STANDARD",
        formFields: task.formFields,
        formAnswers: task.formAnswers,
        status: task.status,
        priority: task.priority,
        deadlineAt: task.deadlineAt ? task.deadlineAt.toISOString() : null,
        slaDueAt: task.slaDueAt ? task.slaDueAt.toISOString() : null,
        toleranceMinutes: task.toleranceMinutes ?? 20,
        scheduledDate: task.scheduledDate ? task.scheduledDate.toISOString() : null,
        requiresApproval: !!task.approvalWorkflow,
        correctionRequested: !!evidenceRound,
        locationName: task.location?.name || null,
        isUnassigned,
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
        evidenceRequirements: task.evidenceRequirements.map((req) => ({
          id: req.id,
          type: req.type,
          required: req.required,
          minQuantity: req.minQuantity,
          executionStage: req.executionStage ?? undefined,
          submissions: evidenceInRound(req.submissions, evidenceRound).map((s) => ({
            id: s.id,
            validationStatus: s.validationStatus,
            attemptNumber: s.attemptNumber,
            value: s.value,
            storageKey: s.storageKey,
            createdAt: s.createdAt.toISOString(),
          })),
        })),
      },
    };
  } catch (error) {
    console.error("[getTaskDetailAction] Error:", error);
    return { error: "Erro ao consultar a tarefa." };
  }
}
