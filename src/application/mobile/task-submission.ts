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
import {
  commitEmployeeUpload,
  resolveEmployeeUpload,
} from "./cloudinary-uploads";
import { revalidatePath } from "next/cache";

import { createHash } from "node:crypto";
import { idempotent } from "./idempotency";
import { fail, MobileError } from "./http";
import { mutable, verifyFormAttachments } from "./attachments";
import { deadline } from "./policy";

export type ActionResult = {
  success?: boolean;
  error?: string;
  committed?: boolean;
  status?: "SUBMITTED" | "COMPLETED";
};
function refresh(id: string) {
  for (const p of ["/tasks", "/history", "/notifications", "/management/tasks"])
    revalidatePath(p);
}
export type CloudinaryUploadInfo = {
  fileUrl: string;
  publicId?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
};

export async function saveEvidence(
  req: Request | null,
  taskId: string,
  requirementId: string,
  value: string,
  file: File | null,
  expectedRoundId?: string,
  cloudinary?: CloudinaryUploadInfo,
): Promise<ActionResult> {
  const c = await getAuthenticatedContext();
  if (!c) return { error: "Não autenticado." };
  if (typeof value !== "string")
    return { error: "Evidência inválida ou muito longa." };
  let storedKey: string | null = null;
  try {
    const proof = cloudinary
      ? await resolveEmployeeUpload(
          c,
          taskId,
          { requirementId, roundId: expectedRoundId ?? "initial" },
          cloudinary,
        )
      : null;
    const result = await idempotent(
      req,
      c,
      {
        operation: "evidence",
        taskId,
        requirementId,
        value,
        expectedRoundId,
        fileHash: file
          ? createHash("sha256")
              .update(Buffer.from(await file.arrayBuffer()))
              .digest("hex")
          : null,
        cloudinary: proof?.attachment ?? null,
      },
      async (tx) => {
        await lockTask(tx, c.organizationId, taskId);
        const task = await mutable(tx, c, taskId);
        if (!task) return { error: "Tarefa não encontrada no seu acesso." };
        const requirement = await tx.taskEvidenceRequirement.findFirst({
          where: { id: requirementId, taskId },
          include: { submissions: true },
        });
        if (!requirement) return { error: "Evidência não encontrada." };
        if (
          !["AVAILABLE", "IN_PROGRESS", "NEEDS_CORRECTION", "PAUSED"].includes(
            task.status,
          )
        )
          return {
            error: "Esta tarefa não está disponível para registrar evidências.",
          };

        // Se a tolerância expirou, bloqueia envio de evidências
        const now = new Date();
        if (task.scheduledDate && task.scheduledDate > now) {
          const timeFormatted = task.scheduledDate.toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: task.location?.timezone ?? "America/Sao_Paulo",
          });
          return {
            error: `Esta tarefa está agendada para às ${timeFormatted} e só permite registro de evidências a partir do seu horário de início.`,
          };
        }
        const d = deadline(
          {
            ...task,
            executionAvailableAt: task.execution?.availableAt,
            deadlineAt: task.deadlineAt?.toISOString(),
            slaDueAt: task.slaDueAt?.toISOString(),
            scheduledDate: task.scheduledDate?.toISOString(),
            startedAt: task.startedAt?.toISOString(),
          },
          now.getTime(),
        );
        if (d.phase === "EXCEEDED") {
          return {
            error:
              "O tempo de tolerância desta tarefa expirou. O envio de comprovações foi bloqueado.",
          };
        }

        if (
          !(await eligibleMember(
            c.organizationId,
            c.memberId,
            task.locationId,
            task.teamId,
            tx,
          ))
        )
          return { error: "Seu acesso mudou." };
        const round = await getEvidenceRound(tx, c.organizationId, taskId);
        if (expectedRoundId && expectedRoundId !== (round?.id ?? "initial"))
          return { error: "A rodada de correção mudou. Atualize a tarefa." };
        const attemptNumber = requirement.submissions.length + 1;
        requirement.submissions = evidenceInRound(
          requirement.submissions,
          round,
        );
        if (
          requirement.submissions.filter((s) => s.validationStatus === "VALID")
            .length >= requirement.maxQuantity
        )
          return {
            error: "A quantidade máxima de evidências já foi atingida.",
          };
        const attachment = ["PHOTO", "VIDEO", "FILE", "SIGNATURE"].includes(
          requirement.type,
        );
        let rejection: string | null = null;
        if (value.length > 10000)
          rejection = "O texto deve ter até 10.000 caracteres.";
        else if (attachment) {
          if (proof) {
            const attachment = await commitEmployeeUpload(tx, c, proof);
            storedKey = attachment.storageKey;
            cloudinary = attachment;
          } else if (!file)
            rejection =
              "Selecione e envie um arquivo real para esta evidência.";
          else if (file.size > 10 * 1024 * 1024)
            rejection = "O arquivo deve ter até 10 MB.";
          else {
            const bytes = Buffer.from(await file.arrayBuffer());
            rejection = inspectEvidenceFile(
              bytes,
              requirement.type,
              file.name,
              file.type,
            );
            if (!rejection) storedKey = await storeEvidence(bytes, tx);
          }
        } else if (file || cloudinary)
          rejection = "Esta evidência deve ser preenchida no campo indicado.";
        else if (requirement.type === "NUMBER") {
          if (
            !value.trim() ||
            !Number.isFinite(Number(value.replace(",", ".")))
          )
            rejection = "Informe um número válido.";
        } else if (requirement.type === "LOCATION") {
          try {
            const coords = JSON.parse(value);
            if (
              !z
                .object({
                  latitude: z.number().min(-90).max(90),
                  longitude: z.number().min(-180).max(180),
                  accuracy: z.number().min(0),
                })
                .safeParse(coords).success
            )
              rejection =
                "Localização inválida. Capture novamente pelo dispositivo.";
          } catch {
            rejection = "Capture a localização do dispositivo antes de enviar.";
          }
        } else if (!value.trim())
          rejection = "Preencha o texto antes de enviar.";
        const failed = requirement.submissions.filter(
          (s) => s.validationStatus === "REJECTED",
        ).length;
        const received = new Date();
        if (d.limitAt !== null && received.getTime() > d.limitAt)
          fail(
            409,
            "TOLERANCE_EXCEEDED",
            "A tolerância terminou durante o envio.",
          );
        if (!rejection && !task.startedAt)
          await tx.task.update({
            where: { id: taskId },
            data: { startedAt: received },
          });
        await tx.evidenceSubmission.create({
          data: {
            requirementId,
            submittedBy: c.memberId,
            value: value.trim().slice(0, 10000),
            storageKey: storedKey,
            fileUrl:
              cloudinary?.fileUrl ||
              (storedKey?.startsWith("http") ? storedKey : null),
            publicId: cloudinary?.publicId || null,
            attemptNumber,
            validationStatus: rejection ? "REJECTED" : "VALID",
            rejectionReason: rejection,
            metadata: {
              roundId: round?.id ?? null,
              ...(cloudinary
                ? {
                    name: cloudinary.fileName || value,
                    mime: cloudinary.mimeType,
                    size: cloudinary.fileSize,
                    cloudinary,
                  }
                : file
                  ? { name: file.name, mime: file.type, size: file.size }
                  : {}),
              receivedAt: new Date().toISOString(),
            },
          },
        });
        await tx.activityLog.create({
          data: {
            organizationId: c.organizationId,
            actorId: c.memberId,
            action: rejection
              ? "EVIDENCE_VALIDATION_FAILED"
              : "EVIDENCE_SUBMITTED",
            entityType: "TASK",
            entityId: taskId,
            metadata: {
              requirementId,
              attempt: attemptNumber,
              roundId: round?.id ?? null,
            },
          },
        });
        if (rejection && failed === 2) {
          await tx.taskOccurrence.create({
            data: {
              taskId,
              type: "VALIDATION_EXCEPTION",
              category: "EVIDENCE_MAX_ATTEMPTS",
              reason:
                "Três falhas de validação. Continuidade operacional liberada com ressalva.",
              severity: "CRITICAL",
              createdBy: c.memberId,
            },
          });
          await notifyManagers(
            tx,
            task,
            "Evidência com três falhas",
            `Revise a evidência da tarefa “${task.title}”. O funcionário pode continuar com ressalva.`,
            { type: "VALIDATION_EXCEPTION", priority: "HIGH" },
          );
        }
        if (!rejection)
          await synchronizeExecution(
            tx,
            c.organizationId,
            task.executionId,
            received,
            task.id,
          );
        return rejection
          ? {
              committed: true,
              error: `${rejection} Tentativa ${failed + 1}/3.${failed >= 2 ? " Você pode continuar; a ocorrência foi registrada para a gestão." : ""}`,
            }
          : { success: true };
      },
    );
    refresh(taskId);
    return result;
  } catch (e) {
    const key = storedKey as string | null;
    if (key && !key.startsWith("http")) await removeEvidence(key);
    if (e instanceof MobileError) throw e;
    return { error: "Não foi possível salvar a evidência. Tente novamente." };
  }
}

export async function completeTask(
  req: Request | null,
  taskId: string,
  formAnswers?: Record<string, any>,
  expectedRoundId?: string,
): Promise<ActionResult> {
  const c = await getAuthenticatedContext();
  if (!c) return { error: "Não autenticado." };
  const result = await idempotent(
    req,
    c,
    { operation: "complete", taskId, formAnswers, expectedRoundId },
    async (tx) => {
      await lockTask(tx, c.organizationId, taskId);
      const task = await tx.task.findFirst({
        where: { ...taskScope(c), id: taskId, deletedAt: null },
        include: {
          assignments: { where: { removedAt: null }, select: { type: true } },
          execution: true,
          dependencies: {
            include: { dependsOnTask: { include: { approvalWorkflow: true } } },
          },
          location: true,
          organization: { select: { settings: true } },
          evidenceRequirements: { include: { submissions: true } },
          sessions: { include: { pauses: true } },
          approvalWorkflow: { include: { steps: true } },
        },
      });
      if (!task) return { error: "Tarefa não encontrada no seu acesso." };
      if (!task.assignments.some((assignment) => assignment.type === "PRIMARY"))
        return { error: "Assuma a tarefa antes de registrar a entrega." };
      if (
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
            "Seu acesso à equipe ou unidade mudou. Solicite uma nova atribuição à gestão.",
        };

      const now = new Date();
      if (
        task.managementBlocked ||
        (task.execution &&
          ["PAUSED", "CANCELLED", "NOT_COMPLETED"].includes(
            task.execution.status,
          ))
      )
        return {
          error: "Esta atividade está bloqueada ou encerrada pela gestão.",
        };
      await verifyFormAttachments(tx, c, task, formAnswers);
      const dependencyCheck = evaluateTaskDependencies(
        task.dependencies.map((d) => ({
          dependsOnTaskId: d.dependsOnId,
          dependsOnStatus: d.dependsOnTask.status,
          dependsOnApprovalStatus: d.dependsOnTask.approvalWorkflow?.status,
          type: d.type,
          logic: d.logic,
        })),
      );
      if (dependencyCheck.isBlocked)
        return { error: "Aguarde as etapas anteriores." };

      // Verificação de tarefa com agendamento futuro
      if (task.scheduledDate && task.scheduledDate > now) {
        const timeFormatted = task.scheduledDate.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: task.location?.timezone ?? "America/Sao_Paulo",
        });
        return {
          error: `Esta tarefa está agendada para às ${timeFormatted} e só pode ser concluída a partir do horário agendado.`,
        };
      }

      // Verificação de bloqueio por limite de tolerância esgotado
      const d = deadline(
        {
          ...task,
          executionAvailableAt: task.execution?.availableAt,
          deadlineAt: task.deadlineAt?.toISOString(),
          slaDueAt: task.slaDueAt?.toISOString(),
          scheduledDate: task.scheduledDate?.toISOString(),
          startedAt: task.startedAt?.toISOString(),
        },
        now.getTime(),
      );
      if (d.phase === "EXCEEDED")
        return { error: "A tolerância terminou. Aguarde atuação da gestão." };

      const round = await getEvidenceRound(tx, c.organizationId, taskId);
      if (expectedRoundId && expectedRoundId !== (round?.id ?? "initial"))
        return { error: "A rodada de correção mudou. Atualize a tarefa." };
      task.evidenceRequirements.forEach((r) => {
        r.submissions = evidenceInRound(r.submissions, round);
      });
      const check = canCompleteTask(
        task.status,
        task.evidenceRequirements.map((r) => ({
          id: r.id,
          required: r.required,
          minQuantity: r.minQuantity,
          validSubmissionsCount: r.submissions.filter(
            (s) => s.validationStatus === "VALID",
          ).length,
          failedAttemptsCount: r.submissions.filter(
            (s) => s.validationStatus === "REJECTED",
          ).length,
        })),
      );
      if (!check.allowed) return { error: check.reason };

      if (task.taskType === "FORM" && Array.isArray(task.formFields)) {
        const error = validateFormAnswers(
          task.formFields as Parameters<typeof validateFormAnswers>[0],
          formAnswers,
        );
        if (error) return { error };
      }

      // Guarda de horário operacional da unidade
      if (task.location) {
        const open = isLocationOpenAt(task.location, now);
        if (!open) {
          await tx.taskOccurrence.create({
            data: {
              taskId: task.id,
              type: "IMPEDIMENT",
              category: "OUT_OF_OPERATING_HOURS",
              reason: `Tarefa concluída fora do horário de funcionamento da unidade (${task.location.name}).`,
              severity: "MEDIUM",
              createdBy: c.memberId,
            },
          });
        }
      }

      const review = !!task.approvalWorkflow;
      if (review) {
        await tx.approvalWorkflow.update({
          where: { id: task.approvalWorkflow!.id },
          data: { status: "PENDING" },
        });
        await tx.approvalStep.updateMany({
          where: { workflowId: task.approvalWorkflow!.id },
          data: { status: "PENDING" },
        });
      }

      // Encerrar sessões abertas
      await tx.taskExecutionSession.updateMany({
        where: { taskId, endedAt: null },
        data: { endedAt: now },
      });

      // Determinar início e calcular duração real
      const startedAt = task.startedAt ?? now;
      const actualDuration =
        task.sessions.length > 0
          ? effectiveWorkSeconds(task.sessions, now)
          : Math.max(
              1,
              Math.round((now.getTime() - startedAt.getTime()) / 1000),
            );

      const receivedAt = Date.now();
      const dPost = deadline(
        {
          ...task,
          executionAvailableAt: task.execution?.availableAt,
          deadlineAt: task.deadlineAt?.toISOString(),
          slaDueAt: task.slaDueAt?.toISOString(),
          scheduledDate: task.scheduledDate?.toISOString(),
          startedAt: task.startedAt?.toISOString(),
        },
        receivedAt,
      );
      if (dPost.phase === "EXCEEDED")
        fail(
          409,
          "TOLERANCE_EXCEEDED",
          "A tolerância terminou durante o envio. Aguarde atuação da gestão.",
        );
      await tx.task.update({
        where: { id: taskId },
        data: {
          status: review ? "SUBMITTED" : "COMPLETED",
          startedAt: task.startedAt ?? startedAt,
          completedAt: review ? null : now,
          actualDuration,
          ...(formAnswers ? { formAnswers: formAnswers as any } : {}),
        },
      });

      if (
        check.generateOccurrence &&
        !(await tx.taskOccurrence.findFirst({
          where: {
            taskId,
            category: "EVIDENCE_MAX_ATTEMPTS",
            createdAt: { gte: round?.createdAt ?? new Date(0) },
          },
        }))
      ) {
        await tx.taskOccurrence.create({
          data: {
            taskId: task.id,
            type: check.generateOccurrence.type,
            category: check.generateOccurrence.category,
            reason: check.generateOccurrence.reason,
            severity: check.generateOccurrence.severity,
            createdBy: c.memberId,
          },
        });
      }

      await tx.activityLog.create({
        data: {
          organizationId: c.organizationId,
          actorId: c.memberId,
          action: review ? "TASK_SUBMITTED" : "TASK_COMPLETED",
          entityType: "TASK",
          entityId: taskId,
          metadata: {
            bypassedEvidence: !!check.generateOccurrence,
            directCompletion: !task.startedAt,
          },
        },
      });

      if (review && task.approvalWorkflow?.steps?.length) {
        const sortedSteps = [...task.approvalWorkflow.steps].sort(
          (a, b) => a.sequence - b.sequence,
        );
        const notificationSteps =
          task.approvalWorkflow.mode === "PARALLEL"
            ? sortedSteps
            : sortedSteps.slice(0, 1);
        for (const firstStep of notificationSteps) {
          await notifyApprovers(
            tx,
            task,
            firstStep,
            "Entrega aguardando aprovação",
            `A tarefa “${task.title}” está pronta para revisão.`,
            {
              type: "APPROVAL_REQUESTED",
              priority: "HIGH",
              excludeUserId: c.userId,
            },
          );
        }
      } else if (review) {
        await notifyManagers(
          tx,
          task,
          "Entrega aguardando aprovação",
          `A tarefa “${task.title}” está pronta para revisão.`,
          {
            type: "APPROVAL_REQUESTED",
            priority: "HIGH",
            excludeUserId: c.userId,
          },
        );
      } else {
        await notifyManagers(
          tx,
          task,
          "Tarefa concluída",
          `A tarefa “${task.title}” foi concluída por ${c.userName || "um colaborador"}.`,
          {
            type: "TASK_COMPLETED",
            priority: check.generateOccurrence ? "HIGH" : "LOW",
            excludeUserId: c.userId,
          },
        );
      }

      await synchronizeExecution(
        tx,
        c.organizationId,
        task.executionId,
        undefined,
        task.id,
      );
      return {
        success: true,
        status: review ? ("SUBMITTED" as const) : ("COMPLETED" as const),
      };
    },
  );

  if (result.success) {
    eventBus.publish(
      result.status === "SUBMITTED" ? "TASK_SUBMITTED" : "TASK_COMPLETED",
      c.organizationId,
      {
        taskId,
        memberId: c.memberId,
      },
    );
  }
  refresh(taskId);
  return result;
}

export async function startTask(
  req: Request | null,
  taskId: string,
  justification?: string,
): Promise<ActionResult> {
  const c = await getAuthenticatedContext();
  if (!c) return { error: "Não autenticado." };
  const result = await idempotent(
    req,
    c,
    { operation: "start", taskId, justification },
    async (tx) => {
      await lockTask(tx, c.organizationId, taskId);
      const task = await tx.task.findFirst({
        where: { ...taskScope(c), id: taskId, deletedAt: null },
        include: {
          assignments: { where: { removedAt: null }, select: { type: true } },
          execution: true,
          location: true,
          organization: { select: { settings: true } },
          dependencies: {
            include: { dependsOnTask: { include: { approvalWorkflow: true } } },
          },
          evidenceRequirements: {
            where: { executionStage: "START", required: true },
            include: { submissions: true },
          },
        },
      });
      if (!task) return { error: "Tarefa não encontrada no seu acesso." };
      if (!task.assignments.some((assignment) => assignment.type === "PRIMARY"))
        return { error: "Assuma a tarefa antes de registrar a entrega." };
      if (
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
            "Seu acesso à equipe ou unidade mudou. Solicite uma nova atribuição à gestão.",
        };

      const timing = deadline(
        { ...task, executionAvailableAt: task.execution?.availableAt },
        Date.now(),
      );
      if (timing.phase === "EXCEEDED")
        return { error: "A tolerância terminou. Aguarde atuação da gestão." };
      if (
        task.managementBlocked ||
        (task.execution &&
          ["PAUSED", "CANCELLED", "NOT_COMPLETED"].includes(
            task.execution.status,
          ))
      )
        return {
          error: "Esta atividade está bloqueada ou encerrada pela gestão.",
        };

      // Avaliação de início antecipado (Item 33)
      const scheduledOrAvailable =
        timing.releaseAt !== null ? new Date(timing.releaseAt) : new Date(0);
      const settings =
        (task.organization?.settings as Record<string, any>) || {};
      const earlyEval = evaluateEarlyExecution({
        policy: settings.earlyExecutionPolicy || "NOT_ALLOWED",
        scheduledOrAvailableAt: scheduledOrAvailable,
        currentTime: new Date(),
        windowMinutes: settings.earlyExecutionWindowMinutes ?? 60,
        justification: justification ?? null,
      });
      if (!earlyEval.allowed) {
        return {
          error:
            earlyEval.reason ||
            "Esta tarefa ainda está programada. Aguarde o horário de liberação.",
        };
      }

      const dependencies = evaluateTaskDependencies(
        task.dependencies.map((d) => ({
          dependsOnTaskId: d.dependsOnId,
          dependsOnStatus: d.dependsOnTask.status,
          dependsOnApprovalStatus: d.dependsOnTask.approvalWorkflow?.status,
          type: d.type,
          logic: d.logic,
        })),
      );
      const check = canStartTask(task.status, dependencies.isBlocked);
      if (!check.allowed) return { error: check.reason };
      const round = await getEvidenceRound(tx, c.organizationId, taskId);
      task.evidenceRequirements.forEach((r) => {
        r.submissions = evidenceInRound(r.submissions, round);
      });
      if (
        task.evidenceRequirements.some(
          (r) =>
            r.submissions.filter((s) => s.validationStatus === "VALID").length <
              r.minQuantity &&
            r.submissions.filter((s) => s.validationStatus === "REJECTED")
              .length < 3,
        )
      )
        return { error: "Registre as evidências de início antes de começar." };
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

      await tx.task.update({
        where: { id: task.id },
        data: {
          status: "IN_PROGRESS",
          startedAt: task.startedAt ?? now,
          slaDueAt: task.slaDueAt ?? task.deadlineAt,
        },
      });
      await tx.taskExecutionSession.create({
        data: { taskId, memberId: c.memberId },
      });
      await tx.activityLog.create({
        data: {
          organizationId: c.organizationId,
          actorId: c.memberId,
          action: "TASK_STARTED",
          entityType: "TASK",
          entityId: taskId,
          metadata: { startedBy: c.userName, isEarly: earlyEval.isEarly },
        },
      });
      await synchronizeExecution(
        tx,
        c.organizationId,
        task.executionId,
        undefined,
        task.id,
      );
      return { success: true };
    },
  );
  if (result.success) {
    eventBus.publish("TASK_STARTED", c.organizationId, {
      taskId,
      memberId: c.memberId,
    });
  }
  refresh(taskId);
  return result;
}
