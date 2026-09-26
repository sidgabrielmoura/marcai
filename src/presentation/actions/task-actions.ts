"use server";
import { z } from "zod";
import { prisma } from "@/infrastructure/database/prisma";
import { getAuthenticatedContext } from "@/application/security/auth-context";
import { taskScope, eligibleMember } from "@/application/security/operational-scope";
import { synchronizeExecution } from "@/application/tasks/synchronize-execution";
import { notifyManagers } from "@/application/tasks/notify-managers";
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
function refresh(id: string) { for (const p of [`/tasks/${id}`, `/management/tasks/${id}`, "/tasks", "/history", "/management/tasks", "/management/executions", "/overview", "/notifications"]) revalidatePath(p); }

export async function startTaskAction(taskId: string, justification?: string): Promise<ActionResult> {
  const c = await getAuthenticatedContext(); if (!c) return { error: "Não autenticado." };
  const result = await prisma.$transaction(async tx => {
    await lockTask(tx, c.organizationId, taskId);
    const task = await tx.task.findFirst({ where: { ...taskScope(c), id: taskId, deletedAt: null }, include: { execution: true, location: true, organization: { select: { settings: true } }, dependencies: { include: { dependsOnTask: { include: { approvalWorkflow: true } } } }, evidenceRequirements: { where: { executionStage: "START", required: true }, include: { submissions: true } } } });
    if (!task) return { error: "Tarefa não encontrada no seu acesso." };
    if (!await eligibleMember(c.organizationId, c.memberId, task.locationId, task.teamId, tx)) return { error: "Seu acesso à equipe ou unidade mudou. Solicite uma nova atribuição à gestão." };
    
    // Avaliação de início antecipado (Item 33)
    const scheduledOrAvailable = task.execution?.availableAt ?? task.scheduledDate ?? new Date(0);
    const settings = (task.organization?.settings as Record<string, any>) || {};
    const earlyEval = evaluateEarlyExecution({
      policy: settings.earlyExecutionPolicy || "NOT_ALLOWED",
      scheduledOrAvailableAt: scheduledOrAvailable,
      currentTime: new Date(),
      windowMinutes: settings.earlyExecutionWindowMinutes ?? 60,
      justification: justification ?? null,
    });
    if (!earlyEval.allowed) {
      return { error: earlyEval.reason || "Esta tarefa ainda está programada. Aguarde o horário de liberação." };
    }

    const dependencies = evaluateTaskDependencies(task.dependencies.map(d => ({ dependsOnTaskId: d.dependsOnId, dependsOnStatus: d.dependsOnTask.status, dependsOnApprovalStatus: d.dependsOnTask.approvalWorkflow?.status, type: d.type, logic: d.logic })));
    const check = canStartTask(task.status, dependencies.isBlocked);
    if (!check.allowed) return { error: check.reason };
    const round = await getEvidenceRound(tx, c.organizationId, taskId);
    task.evidenceRequirements.forEach(r => { r.submissions = evidenceInRound(r.submissions, round); });
    if (task.evidenceRequirements.some(r => r.submissions.filter(s => s.validationStatus === "VALID").length < r.minQuantity && r.submissions.filter(s => s.validationStatus === "REJECTED").length < 3)) return { error: "Registre as evidências de início antes de começar." };
    const now = new Date();

    // Guarda de horário operacional da unidade (Item 34)
    if (task.location) {
      const open = isLocationOpenAt(task.location, now);
      if (!open) {
        await tx.taskOccurrence.create({
          data: {
            taskId: task.id,
            type: "IMPEDIMENT",
            category: "OUT_OF_OPERATING_HOURS",
            reason: `Tarefa iniciada fora do horário de funcionamento da unidade (${task.location.name}).`,
            severity: "MEDIUM",
            createdBy: c.memberId,
          },
        });
      }
    }

    await tx.task.update({ where: { id: task.id }, data: { status: "IN_PROGRESS", startedAt: task.startedAt ?? now, slaDueAt: task.slaDueAt ?? (task.slaDurationMinutes ? new Date(now.getTime() + task.slaDurationMinutes * 60000) : null) } });
    await tx.taskExecutionSession.create({ data: { taskId, memberId: c.memberId } });
    await tx.activityLog.create({ data: { organizationId: c.organizationId, actorId: c.memberId, action: "TASK_STARTED", entityType: "TASK", entityId: taskId, metadata: { startedBy: c.userName, isEarly: earlyEval.isEarly } } });
    await synchronizeExecution(tx, c.organizationId, task.executionId);
    return { success: true };
  });
  if (result.success) {
    eventBus.publish("TASK_STARTED", c.organizationId, { taskId, memberId: c.memberId });
  }
  refresh(taskId); return result;
}

export async function submitEvidenceAction(taskId: string, requirementId: string, value: string, _metadata?: Record<string, unknown>): Promise<ActionResult> {
  return saveEvidence(taskId, requirementId, value, null);
}
export async function uploadEvidenceAction(form: FormData): Promise<ActionResult> {
  const file = form.get("file");
  if (!(file instanceof File)) return { error: "Selecione um arquivo antes de enviar." };
  return saveEvidence(String(form.get("taskId")), String(form.get("requirementId")), file.name, file);
}

async function saveEvidence(taskId: string, requirementId: string, value: string, file: File | null): Promise<ActionResult> {
  const c = await getAuthenticatedContext(); if (!c) return { error: "Não autenticado." };
  if (typeof value !== "string") return { error: "Evidência inválida ou muito longa." };
  let storedKey: string | null = null;
  try {
    const result = await prisma.$transaction(async tx => {
      await lockTask(tx, c.organizationId, taskId);
      const task = await tx.task.findFirst({ where: { ...taskScope(c), id: taskId, deletedAt: null } });
      if (!task) return { error: "Tarefa não encontrada no seu acesso." };
      const req = await tx.taskEvidenceRequirement.findFirst({ where: { id: requirementId, taskId }, include: { submissions: true } });
      if (!req) return { error: "Evidência não encontrada." };
      if (task.status !== "IN_PROGRESS" && !(req.executionStage === "START" && ["AVAILABLE", "NEEDS_CORRECTION"].includes(task.status))) return { error: "Inicie ou retome a tarefa antes de registrar a evidência." };
      const round = await getEvidenceRound(tx, c.organizationId, taskId);
      const attemptNumber = req.submissions.length + 1;
      req.submissions = evidenceInRound(req.submissions, round);
      if (req.submissions.filter(s => s.validationStatus === "VALID").length >= req.maxQuantity) return { error: "A quantidade máxima de evidências já foi atingida." };
      const attachment = ["PHOTO", "VIDEO", "FILE", "SIGNATURE"].includes(req.type);
      let rejection: string | null = null;
      if (value.length > 10000) rejection = "O texto deve ter até 10.000 caracteres.";
      else if (attachment) {
        if (!file) rejection = "Selecione e envie um arquivo real para esta evidência.";
        else if (file.size > 10 * 1024 * 1024) rejection = "O arquivo deve ter até 10 MB.";
        else {
          const bytes = Buffer.from(await file.arrayBuffer());
          rejection = inspectEvidenceFile(bytes, req.type, file.name, file.type);
          if (!rejection) storedKey = await storeEvidence(bytes);
        }
      } else if (file) rejection = "Esta evidência deve ser preenchida no campo indicado.";
      else if (req.type === "NUMBER") { if (!value.trim() || !Number.isFinite(Number(value.replace(",", ".")))) rejection = "Informe um número válido."; }
      else if (req.type === "LOCATION") {
        try { const coords = JSON.parse(value); if (!z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), accuracy: z.number().min(0) }).safeParse(coords).success) rejection = "Localização inválida. Capture novamente pelo dispositivo."; } catch { rejection = "Capture a localização do dispositivo antes de enviar."; }
      } else if (!value.trim()) rejection = "Preencha o texto antes de enviar.";
      const failed = req.submissions.filter(s => s.validationStatus === "REJECTED").length;
      await tx.evidenceSubmission.create({ data: { requirementId, submittedBy: c.memberId, value: value.trim().slice(0, 10000), storageKey: storedKey, attemptNumber, validationStatus: rejection ? "REJECTED" : "VALID", rejectionReason: rejection, metadata: { roundId: round?.id ?? null, ...(file ? { name: file.name, mime: file.type, size: file.size } : {}), receivedAt: new Date().toISOString() } } });
      await tx.activityLog.create({ data: { organizationId: c.organizationId, actorId: c.memberId, action: rejection ? "EVIDENCE_VALIDATION_FAILED" : "EVIDENCE_SUBMITTED", entityType: "TASK", entityId: taskId, metadata: { requirementId, attempt: attemptNumber, roundId: round?.id ?? null } } });
      if (rejection && failed === 2) { await tx.taskOccurrence.create({ data: { taskId, type: "VALIDATION_EXCEPTION", category: "EVIDENCE_MAX_ATTEMPTS", reason: "Três falhas de validação. Continuidade operacional liberada com ressalva.", severity: "CRITICAL", createdBy: c.memberId } }); await notifyManagers(tx, task, "Evidência com três falhas", `Revise a evidência da tarefa “${task.title}”. O funcionário pode continuar com ressalva.`); }
      return rejection ? { error: `${rejection} Tentativa ${failed + 1}/3.${failed >= 2 ? " Você pode continuar; a ocorrência foi registrada para a gestão." : ""}` } : { success: true };
    }, { timeout: 20000 });
    refresh(taskId); return result;
  } catch { if (storedKey) await removeEvidence(storedKey); return { error: "Não foi possível salvar a evidência. Tente novamente." }; }
}

export async function completeTaskAction(taskId: string): Promise<ActionResult> {
  const c = await getAuthenticatedContext(); if (!c) return { error: "Não autenticado." };
  const result = await prisma.$transaction(async tx => {
    await lockTask(tx, c.organizationId, taskId);
    const task = await tx.task.findFirst({ where: { ...taskScope(c), id: taskId, deletedAt: null }, include: { evidenceRequirements: { include: { submissions: true } }, sessions: { include: { pauses: true } }, approvalWorkflow: { include: { steps: true } } } });
    if (!task) return { error: "Tarefa não encontrada no seu acesso." };
    const round = await getEvidenceRound(tx, c.organizationId, taskId);
    task.evidenceRequirements.forEach(r => { r.submissions = evidenceInRound(r.submissions, round); });
    const check = canCompleteTask(task.status, task.evidenceRequirements.map(r => ({ id: r.id, required: r.required, minQuantity: r.minQuantity, validSubmissionsCount: r.submissions.filter(s => s.validationStatus === "VALID").length, failedAttemptsCount: r.submissions.filter(s => s.validationStatus === "REJECTED").length })));
    if (!check.allowed) return { error: check.reason };
    const review = !!task.approvalWorkflow, now = new Date();
    if (review) { await tx.approvalWorkflow.update({ where: { id: task.approvalWorkflow!.id }, data: { status: "PENDING" } }); await tx.approvalStep.updateMany({ where: { workflowId: task.approvalWorkflow!.id }, data: { status: "PENDING" } }); }
    await tx.taskExecutionSession.updateMany({ where: { taskId, endedAt: null }, data: { endedAt: now } });
    await tx.task.update({ where: { id: taskId }, data: { status: review ? "SUBMITTED" : "COMPLETED", completedAt: review ? null : now, actualDuration: effectiveWorkSeconds(task.sessions, now) } });
    await tx.activityLog.create({ data: { organizationId: c.organizationId, actorId: c.memberId, action: review ? "TASK_SUBMITTED" : "TASK_COMPLETED", entityType: "TASK", entityId: taskId, metadata: { bypassedEvidence: !!check.generateOccurrence } } });
    if (review) await notifyManagers(tx, task, "Entrega aguardando aprovação", `A tarefa “${task.title}” está pronta para revisão.`);
    await synchronizeExecution(tx, c.organizationId, task.executionId);
    return { success: true };
  });
  if (result.success) {
    eventBus.publish("TASK_COMPLETED", c.organizationId, { taskId, memberId: c.memberId });
  }
  refresh(taskId); return result;
}
