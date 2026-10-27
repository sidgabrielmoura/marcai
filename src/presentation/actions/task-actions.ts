"use server";
import { recordTaskView } from "@/application/mobile/task-views";
import { webTaskDetail } from "@/application/mobile/web-task-contract";
import {
  saveEvidence as saveTaskEvidence,
  completeTask as submitTask,
  startTask as beginTask,
} from "@/application/mobile/task-submission";
import {
  createUpload,
  chunk,
  finalizeForm,
} from "@/application/mobile/attachments";
import { registerCloudinaryFormAttachment } from "@/application/mobile/attachments";
import type { CloudinaryUploadInfo } from "@/application/mobile/task-submission";
import { randomUUID, createHash } from "node:crypto";

import { validateFormAnswers } from "@/domain/rules/form-answers";
import { z } from "zod";
import { prisma } from "@/infrastructure/database/prisma";
import { getAuthenticatedContext } from "@/application/security/auth-context";
import {
  taskScope,
  eligibleMember,
} from "@/application/security/operational-scope";
import { synchronizeExecution } from "@/application/tasks/synchronize-execution";
import {
  notifyManagers,
  notifyApprovers,
} from "@/application/tasks/notify-managers";
import { lockTask } from "@/application/tasks/task-lock";
import {
  getEvidenceRound,
  evidenceInRound,
} from "@/application/tasks/evidence-round";
import { effectiveWorkSeconds } from "@/domain/rules/execution-state";
import { canStartTask, canCompleteTask } from "@/domain/rules/task-rules";
import { evaluateTaskDependencies } from "@/domain/rules/dependency-rules";
import { evaluateEarlyExecution } from "@/domain/rules/early-execution";
import { isLocationOpenAt } from "@/domain/rules/operating-hours";
import { eventBus } from "@/infrastructure/events/event-bus";
import {
  inspectEvidenceFile,
  storeEvidence,
  removeEvidence,
} from "@/infrastructure/storage/evidence-storage";
import { revalidatePath } from "@/infrastructure/realtime/revalidate";
import {publishSyncRequired} from '@/infrastructure/realtime/sync';
export type ActionResult = {
  success?: boolean;
  error?: string;
  status?: "SUBMITTED" | "COMPLETED";
  task?: TaskDetailResult;
  changeId?: string;
};
async function taskResponse(taskId:string,result:ActionResult,changeId:string,includeTask=true):Promise<ActionResult>{
 if(result.error)return result;
 const context=await getAuthenticatedContext(false);
 if(!context)return {...result,changeId};
 await publishSyncRequired(context.organizationId,['TASK_CHANGED','EXECUTION_CHANGED'],undefined,changeId);
 if(!includeTask)return {...result,changeId};
 try{return {...result,changeId,task:await webTaskDetail(context,taskId)};}
 catch{return {...result,changeId};} // Access may have changed after the committed write.
}
function refresh(id: string) {
  for (const p of [
    `/tasks/${id}`,
    `/management/tasks/${id}`,
    "/tasks",
    "/history",
    "/management/tasks",
    "/overview",
    "/notifications",
  ])
    revalidatePath(p);
}

export async function startTaskAction(
  taskId: string,
  justification?: string,
): Promise<ActionResult> {
  const receipt=randomUUID();
  return taskResponse(taskId,await beginTask(webRequest(receipt,true), taskId, justification),receipt);
}

export async function submitCloudinaryEvidenceAction(
  taskId: string,
  requirementId: string,
  roundId: string,
  file: CloudinaryUploadInfo,
  receipt?: string,
): Promise<ActionResult> {
  if (!roundId) return { error: "Atualize a tarefa antes de enviar." };
  try {
    return await saveTaskEvidence(
      webRequest(receipt),
      taskId,
      requirementId,
      file.fileName ?? "Comprovação",
      null,
      roundId,
      file,
    );
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível registrar a comprovação.",
    };
  }
}

export async function registerTaskFormAttachmentAction(
  taskId: string,
  fieldId: string,
  roundId: string,
  file: {
    fileUrl: string;
    publicId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
  },
  receipt?: string,
): Promise<{
  success?: boolean;
  storageKey?: string;
  fileUrl?: string;
  publicId?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  error?: string;
}> {
  const context = await getAuthenticatedContext(false);
  if (!context) return { error: "Não autenticado." };
  try {
    return {
      success: true,
      ...(await registerCloudinaryFormAttachment(
        webRequest(receipt),
        context,
        taskId,
        { ...file, fieldId, roundId },
      )),
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível registrar o anexo.",
    };
  }
}

export async function submitEvidenceAction(
  taskId: string,
  requirementId: string,
  value: string,
  metadata?: { roundId?: string; receipt?: string },
): Promise<ActionResult> {
  return saveEvidence(
    taskId,
    requirementId,
    value,
    null,
    metadata?.roundId,
    metadata?.receipt,
  );
}
export async function uploadEvidenceAction(
  form: FormData,
): Promise<ActionResult> {
  const file = form.get("file");
  if (!(file instanceof File))
    return { error: "Selecione um arquivo antes de enviar." };
  return saveEvidence(
    String(form.get("taskId")),
    String(form.get("requirementId")),
    file.name,
    file,
    String(form.get("roundId") ?? ""),
    String(form.get("receipt") ?? ""),
  );
}

async function saveEvidence(
  taskId: string,
  requirementId: string,
  value: string,
  file: File | null,
  roundId?: string,
  receipt?: string,
): Promise<ActionResult> {
  if (!roundId) return { error: "Atualize a tarefa antes de enviar." };
  return saveTaskEvidence(
    webRequest(receipt),
    taskId,
    requirementId,
    value,
    file,
    roundId,
  );
}

export async function uploadTaskFormFileAction(
  formData: FormData,
): Promise<{
  success?: boolean;
  storageKey?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  error?: string;
}> {
  const c = await getAuthenticatedContext(false);
  if (!c) return { error: "Não autenticado." };
  const taskId = String(formData.get("taskId") ?? ""),
    fieldId = String(formData.get("fieldId") ?? ""),
    file = formData.get("file");
  if (!(file instanceof File) || !taskId || !fieldId)
    return { error: "Informe tarefa, pergunta e arquivo." };
  const roundId = String(formData.get("roundId") ?? "");
  if (!roundId) return { error: "Atualize a tarefa antes de enviar." };
  const inputReceipt = String(formData.get("receipt") ?? "");
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://tarefai.com.br";
  const req = (stage: string) => {
    const hex = createHash("sha256")
      .update(inputReceipt + ":" + stage)
      .digest("hex");
    const derived =
      hex.slice(0, 8) +
      "-" +
      hex.slice(8, 12) +
      "-4" +
      hex.slice(13, 16) +
      "-a" +
      hex.slice(17, 20) +
      "-" +
      hex.slice(20, 32);
    return new Request(origin, {
      method: "POST",
      headers: { "Idempotency-Key": inputReceipt ? derived : randomUUID() },
    });
  };
  try {
    const created = await createUpload(req("create"), c, taskId, {
      fieldId,
      roundId,
      name: file.name,
      mime: file.type,
      size: file.size,
    });
    const bytes = Buffer.from(await file.arrayBuffer());
    for (let part = 0; part < Math.ceil(bytes.length / 1048576); part++)
      await chunk(
        c,
        created.uploadId,
        part,
        bytes.subarray(part * 1048576, (part + 1) * 1048576),
      );
    const result = await finalizeForm(req("finalize"), c, created.uploadId);
    return {
      success: true,
      storageKey: String(result.storageKey),
      fileName: String(result.fileName),
      fileSize: Number(result.fileSize),
      mimeType: String(result.mimeType),
    };
  } catch {
    return {
      error:
        "Não foi possível enviar o anexo. Verifique formato, prazo e acesso.",
    };
  }
}

function webRequest(receipt?: string, reconcile=false) {
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://tarefai.com.br";
  return receipt
    ? new Request(origin, {
        method: "POST",
        headers: { "Idempotency-Key": receipt, ...(reconcile?{"X-Client-Reconciliation":"2"}:{}) },
      })
    : null;
}
export async function completeTaskAction(
  taskId: string,
  formAnswers?: Record<string, any>,
  roundId?: string,
  receipt?: string,
  includeDetail = true,
): Promise<ActionResult> {
  if (!roundId) return { error: "Atualize a tarefa antes de enviar." };
  const changeId=receipt??randomUUID();
  return taskResponse(taskId,await submitTask(webRequest(changeId,true), taskId, formAnswers, roundId),changeId,includeDetail);
}

export type TaskDetailResult = Awaited<ReturnType<typeof webTaskDetail>>;
export async function recordTaskViewAction(taskId: string, receipt: string): Promise<ActionResult> {
  const context = await getAuthenticatedContext(false);
  if (!context) return { error: "Não autenticado." };
  try {
    z.string().uuid().parse(receipt);
    return await recordTaskView(webRequest(receipt)!, context, taskId);
  } catch {
    return { error: "Não foi possível registrar a visualização." };
  }
}

export async function getTaskDetailAction(
  taskId: string,
): Promise<{ success?: boolean; error?: string; task?: TaskDetailResult }> {
  const c = await getAuthenticatedContext();
  if (!c) return { error: "Não autenticado." };
  try {
    return { success: true, task: await webTaskDetail(c, taskId) };
  } catch {
    return { error: "Tarefa removida, transferida ou fora do seu acesso." };
  }
}
