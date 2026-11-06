"use client";
import { EmployeeTaskForm } from "./employee-task-form";
import { TaskTimeline } from "./task-timeline";
import { ImpedimentSheet } from "./impediment-sheet";
import { CircleX } from "lucide-react";
import { useEmployeeDraft } from "@/presentation/hooks/use-employee-draft";
import { useSubmissionReceipts } from "@/presentation/lib/submission-receipts";

import { useEffect, useState } from "react";
import {applyTaskResource,subscribeTaskResource} from '@/presentation/realtime/task-resource';
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, MapPin, ArrowLeft, Lock, Clock, ListTodo, FileCheck2, AlertTriangle, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import {
  completeTaskAction,
  submitEvidenceAction,
  submitCloudinaryEvidenceAction,
  registerTaskFormAttachmentAction,
  getTaskDetailAction,
} from "@/presentation/actions/task-actions";
import { uploadDirectToCloudinary } from "@/presentation/lib/cloudinary-upload";
import { deadline } from "@/domain/rules/employee-workflow";
import { useEmployeeNow } from "@/presentation/hooks/use-employee-now";
import {
  reportImpedimentAction,
  claimTaskAction,
} from "@/presentation/actions/management-task-actions";
import { StatusBadge, PriorityBadge } from "../shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

import {
  TaskEvidenceItem,
  evidenceTypeMeta,
  type EvidenceDraft,
  type TaskEvidenceRequirement,
} from "./task-evidence-item";

function isPauseOccurrence(o: {
  type?: string;
  category?: string;
  reason?: string;
}): boolean {
  const type = (o.type || "").toUpperCase();
  const category = (o.category || "").toUpperCase();
  const reason = (o.reason || "").toLowerCase();
  return (
    type === "PAUSE_ALERT" ||
    type.includes("PAUSE") ||
    category === "LONG_PAUSE" ||
    category === "INTERVALO" ||
    category.includes("PAUSE") ||
    category.includes("PAUSA") ||
    reason.includes("está pausada") ||
    reason.includes("tarefa pausada") ||
    reason.includes("pausa de descanso")
  );
}

function cleanReason(reason: string): string {
  return reason
    .replace(
      /O prazo de SLA foi excedido\.?/gi,
      "O prazo de execução foi excedido.",
    )
    .replace(/SLA excedido há/gi, "Prazo limite excedido há")
    .replace(/SLA excedido/gi, "Prazo limite excedido")
    .replace(/\bSLA\b/g, "prazo limite");
}

interface TaskDetailClientProps {
  onCompleted?: () => void;
  embedded?: boolean;
  task: {
    draftScope: string;
    roundId: string;
    correctionReason?: string | null;
    approvalHistory?: Array<{
      id: string;
      decision: string;
      note: string | null;
      createdAt: string;
    }>;
    timeline?: Array<{ id: string; action: string; createdAt: Date | string }>;
    id: string;
    title: string;
    description: string | null;
    instructions: string | null;
    status: string;
    timezone?: string;
    startedAt?: string | Date | null;
    maxDuration?: number | null;
    executionAvailableAt?: string | null;
    snapshotAt?: string;
    actions?: {
      complete: { allowed: boolean; reason: string | null };
      evidence: { allowed: boolean; reason: string | null };
    };
    priority: string;
    deadlineAt: Date | string | null;
    slaDueAt?: Date | string | null;
    toleranceMinutes?: number | null;
    locationName: string | null;
    scheduledDate?: Date | string | null;
    requiresApproval?: boolean;
    correctionRequested?: boolean;
    isUnassigned?: boolean;
    slaExceeded?: boolean;
    delayMinutes?: number;
    dependencies: {
      id: string;
      type: string;
      logic: string;
      dependsOnTask: { id: string; title: string; status: string };
    }[];
    occurrences: {
      id: string;
      type: string;
      category: string;
      reason: string;
      severity: string;
      createdAt: string;
    }[];
    evidenceRequirements: TaskEvidenceRequirement[];
    taskType?: string | null;
    formFields?: any;
    formAnswers?: any;
  };
}

export function TaskDetailClient({
  task: initialTask,
  onCompleted,
  embedded,
}: TaskDetailClientProps) {
  const [task,setTask]=useState(initialTask);
  useEffect(()=>{setTask(initialTask);},[initialTask]);
  useEffect(()=>subscribeTaskResource(initialTask.id,updated=>setTask(updated)),[initialTask.id]);
  const router = useRouter();
  const receipt = useSubmissionReceipts(task.id + ":" + task.roundId);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<"impediment" | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState("OUTROS");
  const [evidenceDrafts, setEvidenceDrafts] = useState<
    Record<string, EvidenceDraft>
  >({});
  const [formAnswers, setFormAnswers] = useState<Record<string, any>>(
    task.formAnswers ?? {},
  );
  const [occurrencesOpen, setOccurrencesOpen] = useState(false);
  const [requirements, setRequirements] = useState(task.evidenceRequirements);
  useEffect(()=>setRequirements(task.evidenceRequirements),[task.evidenceRequirements]);

  const terminal = [
    "COMPLETED",
    "CANCELLED",
    "NOT_COMPLETED",
    "SUBMITTED",
  ].includes(task.status);
  const draft = useEmployeeDraft(
    task.draftScope,
    { formAnswers, evidenceDrafts },
    (value) => {
      setFormAnswers(value.formAnswers);
      setEvidenceDrafts(value.evidenceDrafts);
    },
    terminal,
  );
  const now = useEmployeeNow(
    task.snapshotAt ? Date.parse(task.snapshotAt) : undefined,
  );
  const timing = deadline(task, now);
  const scheduled = timing.scheduled;
  const isToleranceExceeded = !terminal && timing.phase === "EXCEEDED";
  const operationDenied = task.actions?.complete.allowed === false;
  const evidenceDenied = task.actions?.evidence.allowed === false;

  const isFormTask =
    task.taskType === "FORM" ||
    (Array.isArray(task.formFields) && task.formFields.length > 0);
  const isStandardTask = !isFormTask;

  const totalRequirements = isStandardTask ? requirements.length : 0;
  const completedRequirements = isStandardTask
    ? requirements.filter(
        (req) =>
          req.submissions.filter((s) => s.validationStatus === "VALID").length >=
          req.minQuantity,
      ).length
    : 0;

  if (!draft.ready)
    return (
      <div role="status">
        <Spinner />
        Recuperando rascunho…
      </div>
    );

  async function run(
    action: () => Promise<{ success?: boolean; error?: string;task?:import('@/presentation/actions/task-actions').TaskDetailResult;changeId?:string }>,
    options?: { successNotice?: string; complete?: boolean },
  ) {
    setBusy(true);
    setOperationError(null);
    try {
      const r = await action();
      if (r.error) {
        setOperationError(r.error);
        toast.add({
          title: "Erro na operação",
          description: r.error,
          type: "error",
        });
      } else {
        toast.add({
          title: "Sucesso",
          description: options?.successNotice || "Ação concluída com sucesso.",
          type: "success",
        });
        setDialog(null);
        if (options?.complete) {
          if (onCompleted) onCompleted();
          else router.push("/tasks");
        }
        if(!applyTaskResource(r))router.refresh();
      }
    } catch {
      setOperationError("Não foi possível concluir a ação. Tente novamente.");
      toast.add({
        title: "Erro inesperado",
        description: "Não foi possível concluir a ação. Tente novamente.",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function registerRequirement(req: TaskEvidenceRequirement) {
    setBusy(true);
    try {
      const entry = evidenceDrafts[req.id];
      if (!entry)
        throw new Error("Preencha ou capture a comprovação antes de enviar.");
      let file = entry.file;
      if (req.type === "SIGNATURE") {
        const blob = await entry.getSignatureBlob?.();
        if (!blob) throw new Error("Desenhe a assinatura antes de enviar.");
        file = new File([blob], "assinatura.png", { type: "image/png" });
      }
      let result;
      if (file) {
        const form = new FormData();
        form.set("taskId", task.id);
        form.set("requirementId", req.id);
        form.set("roundId", task.roundId);
        form.set("file", file);
        form.set(
          "receipt",
          await receipt("evidence-upload", { requirementId: req.id, file }),
        );
        result = await uploadEvidenceAction(form);
      } else
        result = await submitEvidenceAction(task.id, req.id, entry.value, {
          roundId: task.roundId,
          receipt: await receipt("evidence", {
            id: req.id,
            value: entry.value.trim(),
          }),
        });
      const updated = await getTaskDetailAction(task.id);
      if (updated.task && updated.task.roundId === task.roundId)
        setRequirements(updated.task.evidenceRequirements);
      if (result.error) throw new Error(result.error);
      setEvidenceDrafts((previous) => {
        const next = { ...previous };
        delete next[req.id];
        return next;
      });
      toast.add({
        title: "Comprovação enviada",
        description: "Você pode registrar a próxima comprovação exigida.",
        type: "success",
      });
    } catch (error) {
      toast.add({
        title: "Não foi possível enviar",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function uploadEvidenceAction(form: FormData) {
    const file = form.get("file");
    if (!(file instanceof File)) return { error: "Selecione um arquivo." };
    const requirementId = String(form.get("requirementId"));
    const uploaded = await uploadDirectToCloudinary({
      file,
      scope: "evidence",
      taskId: task.id,
      requirementId,
      roundId: task.roundId,
    });
    return submitCloudinaryEvidenceAction(
      task.id,
      requirementId,
      task.roundId,
      uploaded,
      String(form.get("receipt") ?? ""),
    );
  }

  async function uploadTaskFormFileAction(
    form: FormData,
  ): Promise<Awaited<ReturnType<typeof registerTaskFormAttachmentAction>>> {
    const file = form.get("file");
    if (!(file instanceof File)) return { error: "Selecione um arquivo." };
    const fieldId = String(form.get("fieldId"));
    const uploaded = await uploadDirectToCloudinary({
      file,
      scope: "form",
      taskId: task.id,
      fieldId,
      roundId: task.roundId,
    });
    return registerTaskFormAttachmentAction(
      task.id,
      fieldId,
      task.roundId,
      uploaded,
      String(form.get("receipt") ?? ""),
    );
  }

  async function handleCompleteWithEvidence() {
    if (scheduled) {
      toast.add({
        title: "Aguardando horário",
        description: `Esta tarefa está agendada para iniciar às ${new Date(task.scheduledDate!).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: task.timezone ?? "America/Sao_Paulo" })} e só pode ser concluída a partir deste horário.`,
        type: "error",
      });
      return;
    }
    if (isToleranceExceeded) {
      toast.add({
        title: "Limite de tolerância atingido",
        description:
          "O tempo limite de tolerância desta tarefa foi atingido. Ela está bloqueada para conclusão.",
        type: "error",
      });
      return;
    }
    setBusy(true);
    try {
      const pendingRequirements = !isFormTask
        ? requirements.filter((req) => {
            const validCount = req.submissions.filter(
              (s) => s.validationStatus === "VALID",
            ).length;
            return validCount < req.minQuantity;
          })
        : [];

      // Validação de formulário se for o caso
      if (isFormTask && Array.isArray(task.formFields)) {
        for (const field of task.formFields) {
          if (field.required) {
            const answer = formAnswers[field.id];
            if (answer === undefined || answer === null || answer === "") {
              toast.add({
                title: "Perguntas pendentes",
                description: `A pergunta "${field.question}" é obrigatória.`,
                type: "error",
              });
              setBusy(false);
              return;
            }
          }
        }
      }

      // Validação prévia de exigências obrigatórias (apenas tarefas padrão)
      if (!isFormTask) {
        for (const req of pendingRequirements) {
          const draft = evidenceDrafts[req.id];
          const meta = evidenceTypeMeta[req.type] || { label: req.type };
          const failures = req.submissions.filter(
            (s) => s.validationStatus === "REJECTED",
          ).length;
          if (failures >= 3) continue; // Tolerância operacional D-05

          if (req.required) {
            if (req.type === "PHOTO") {
              if (!draft?.file) {
                toast.add({
                  title: "Evidência obrigatória",
                  description: `Tire a foto de comprovação (${meta.label}) antes de concluir.`,
                  type: "error",
                });
                setBusy(false);
                return;
              }
            } else if (["VIDEO", "FILE"].includes(req.type)) {
              if (!draft?.file) {
                toast.add({
                  title: "Evidência obrigatória",
                  description: `Anexe o arquivo (${meta.label}) antes de concluir.`,
                  type: "error",
                });
                setBusy(false);
                return;
              }
            } else if (req.type === "SIGNATURE") {
              if (!draft?.signed) {
                toast.add({
                  title: "Evidência obrigatória",
                  description: "Desenhe a sua assinatura antes de concluir.",
                  type: "error",
                });
                setBusy(false);
                return;
              }
            } else if (req.type === "LOCATION") {
              if (!draft?.value) {
                toast.add({
                  title: "Evidência obrigatória",
                  description: "Capture a localização GPS antes de concluir.",
                  type: "error",
                });
                setBusy(false);
                return;
              }
            } else if (req.type === "NUMBER") {
              if (
                !draft?.value ||
                !draft.value.trim() ||
                !Number.isFinite(Number(draft.value.replace(",", ".")))
              ) {
                toast.add({
                  title: "Evidência obrigatória",
                  description: `Informe a medição numérica para "${meta.label}".`,
                  type: "error",
                });
                setBusy(false);
                return;
              }
            } else if (req.type === "TEXT") {
              if (!draft?.value || !draft.value.trim()) {
                toast.add({
                  title: "Evidência obrigatória",
                  description: `Preencha o relato escrito para "${meta.label}".`,
                  type: "error",
                });
                setBusy(false);
                return;
              }
            }
          }
        }
      }

      // Envia automaticamente as evidências pendentes fornecidas (apenas tarefas padrão)
      if (!isFormTask) {
        for (const req of pendingRequirements) {
          const draft = evidenceDrafts[req.id];
          if (!draft) continue;

          if (
            req.type === "SIGNATURE" &&
            draft.signed &&
            draft.getSignatureBlob
          ) {
            const blob = await draft.getSignatureBlob();
            if (blob) {
              const sigFile = new File([blob], "assinatura.png", {
                type: "image/png",
              });
              const form = new FormData();
              form.set("taskId", task.id);
              form.set("roundId", task.roundId);
              form.set("requirementId", req.id);
              form.set("file", sigFile);
              form.set(
                "receipt",
                await receipt("evidence-upload", {
                  requirementId: form.get("requirementId"),
                  file: form.get("file"),
                }),
              );
              const uploadRes = await uploadEvidenceAction(form);
              if (uploadRes.error) {
                toast.add({
                  title: "Erro ao enviar assinatura",
                  description: uploadRes.error,
                  type: "error",
                });
                setBusy(false);
                return;
              }
            }
          } else if (
            ["PHOTO", "VIDEO", "FILE"].includes(req.type) &&
            draft.file
          ) {
            const form = new FormData();
            form.set("taskId", task.id);
            form.set("roundId", task.roundId);
            form.set("requirementId", req.id);
            form.set("file", draft.file);
            form.set(
              "receipt",
              await receipt("evidence-upload", {
                requirementId: form.get("requirementId"),
                file: form.get("file"),
              }),
            );
            const uploadRes = await uploadEvidenceAction(form);
            if (uploadRes.error) {
              const meta = evidenceTypeMeta[req.type] || { label: req.type };
              toast.add({
                title: `Erro ao enviar ${meta.label}`,
                description: uploadRes.error,
                type: "error",
              });
              setBusy(false);
              return;
            }
          } else if (
            ["TEXT", "NUMBER", "LOCATION"].includes(req.type) &&
            draft.value?.trim()
          ) {
            const submitRes = await submitEvidenceAction(
              task.id,
              req.id,
              draft.value.trim(),
              {
                roundId: task.roundId,
                receipt: await receipt("evidence", {
                  id: req.id,
                  value: draft.value.trim(),
                }),
              },
            );
            if (submitRes.error) {
              const meta = evidenceTypeMeta[req.type] || { label: req.type };
              toast.add({
                title: `Erro ao enviar ${meta.label}`,
                description: submitRes.error,
                type: "error",
              });
              setBusy(false);
              return;
            }
          }
        }
      }

      // Envia os arquivos de form se for o caso
      const finalFormAnswers = { ...formAnswers };
      if (isFormTask && Array.isArray(task.formFields)) {
        for (const field of task.formFields) {
          if (
            ["PHOTO", "VIDEO", "FILE"].includes(field.type) &&
            finalFormAnswers[field.id] instanceof File
          ) {
            const file = finalFormAnswers[field.id] as File;
            const form = new FormData();
            form.set("taskId", task.id);
            form.set("roundId", task.roundId);
            form.set("fieldId", field.id);
            form.set("file", file);
            form.set(
              "receipt",
              await receipt("form-upload", { fieldId: field.id, file }),
            );
            const uploadRes = await uploadTaskFormFileAction(form);
            if (uploadRes.error) {
              toast.add({
                title: `Erro ao enviar ${field.type === "PHOTO" ? "foto" : field.type === "VIDEO" ? "vídeo" : "arquivo"}`,
                description: uploadRes.error,
                type: "error",
              });
              setBusy(false);
              return;
            }
            finalFormAnswers[field.id] = {
              storageKey: uploadRes.storageKey,
              fileUrl: uploadRes.fileUrl,
              publicId: uploadRes.publicId,
              fileName: uploadRes.fileName,
              fileSize: uploadRes.fileSize,
              mimeType: uploadRes.mimeType,
            };
          }
        }
      }

      // Conclui a tarefa
      const completeRes = await completeTaskAction(
        task.id,
        isFormTask ? finalFormAnswers : undefined,
        task.roundId,
        await receipt("complete", finalFormAnswers),
      );
      if (completeRes.error) {
        toast.add({
          title: "Erro ao concluir tarefa",
          description: completeRes.error,
          type: "error",
        });
        router.refresh();
      } else {
        toast.add({
          title: "Sucesso",
          description:
            completeRes.status === "SUBMITTED"
              ? "Enviado para aprovação!"
              : "Tarefa concluída!",
          type: "success",
        });
        await draft.discard();
        applyTaskResource(completeRes);
        if (onCompleted) onCompleted();
        else router.push("/tasks");
      }
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Não foi possível concluir a ação. Tente novamente.",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-5 flex flex-col gap-4">
      {draft.error ? (
        <p role="alert">{draft.error}</p>
      ) : !terminal ? (
        <p role="status">
          {draft.saving
            ? "Salvando rascunho…"
            : "Rascunho protegido neste navegador por até 24 horas. Ao sair da conta ou fechar esta aba, o acesso local é descartado."}
        </p>
      ) : null}
      {task.correctionReason && (
        <Card>
          <CardContent>
            <h2>Correção solicitada</h2>
            <p>{task.correctionReason}</p>
          </CardContent>
        </Card>
      )}
      {!!task.approvalHistory?.length && (
        <Card>
          <CardContent>
            <h2>Histórico de revisão</h2>
            {task.approvalHistory.map((review) => (
              <p key={review.id}>
                {review.decision}
                {review.note ? " · " + review.note : ""}
              </p>
            ))}
          </CardContent>
        </Card>
      )}
      {/* Botão de retorno e cabeçalho alinhado ao padrão do Drawer */}
      <div className="flex flex-col gap-2">
        {!embedded && (
          <Link
            href="/tasks"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--brand-900)] transition-colors w-fit"
          >
            <ArrowLeft className="size-3.5" />
            Voltar às tarefas
          </Link>
        )}

        <div className="flex flex-col gap-2 bg-[var(--surface)] p-4 sm:p-5 rounded-2xl border border-[var(--border-subtle)] shadow-xs">
          <h1 className="text-lg sm:text-xl font-bold leading-snug text-[var(--text-primary)]">
            {task.title}
          </h1>

          <div className="w-full flex flex-wrap gap-2 items-center">
            <StatusBadge
              status={scheduled ? "SCHEDULED" : task.status}
              size="sm"
              className="max-w-fit px-3 font-semibold"
            />
            <PriorityBadge
              priority={task.priority}
              size="sm"
              className="max-w-fit px-3 font-semibold"
            />
            {task.slaExceeded && (
              <Badge className="text-[10px] max-w-fit px-3 font-semibold text-red-700 bg-red-50 border-red-200 py-0.5 rounded-md flex items-center gap-1">
                <AlertTriangle className="size-3 text-red-600" />
                <span>Prazo estourado</span>
              </Badge>
            )}
            {task.locationName && (
              <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] font-medium">
                <MapPin className="size-3.5 text-slate-400" />
                {task.locationName}
              </span>
            )}
            {task.deadlineAt && (
              <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] font-medium">
                <Clock className="size-3.5 text-slate-400" />
                Prazo:{" "}
                {new Date(task.deadlineAt).toLocaleString("pt-BR", {
                  timeZone: task.timezone ?? "America/Sao_Paulo",
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Banners de status e alertas */}
      {task.correctionRequested && !terminal && (
        <div className="p-3.5 rounded-xl bg-amber-50/90 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
          <AlertCircle className="size-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong className="font-semibold block mb-0.5">
              Correção solicitada pela gestão
            </strong>
            Revise as orientações abaixo e anexe as novas comprovações
            requeridas para reenviar.
          </div>
        </div>
      )}

      {task.status === "BLOCKED" && (
        <div className="p-3.5 rounded-xl bg-amber-50/90 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
          <AlertTriangle className="size-4 text-amber-600 shrink-0" />
          <span>
            {task.actions?.complete.reason ?? "Aguardando etapas anteriores para ser liberada."} O prazo não corre
            enquanto a tarefa estiver bloqueada.
          </span>
        </div>
      )}

      {/* Card 1: Instruções de execução */}
      <Card className="rounded-xl p-0 border border-[var(--border-subtle)] bg-[var(--surface)] shadow-none overflow-hidden">
        <div className="px-4 py-3 bg-slate-50/80 dark:bg-muted/30 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListTodo className="size-4 text-[var(--brand-900)] dark:text-primary" />
            <h3 className="font-bold text-xs uppercase tracking-wider text-[var(--text-primary)]">
              Instruções de execução
            </h3>
          </div>
        </div>

        <CardContent className="p-4 sm:p-5 flex flex-col gap-3.5 text-xs leading-relaxed">
          {task.description && (
            <div className="p-3 rounded-lg bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 text-blue-950 dark:text-blue-100">
              <span className="font-semibold block mb-1 text-[11px] uppercase tracking-wide text-blue-800 dark:text-blue-300">
                Resumo da atividade
              </span>
              <p className="font-medium text-xs">{task.description}</p>
            </div>
          )}

          {task.taskType === "FORM" && Array.isArray(task.formFields) ? (
            <EmployeeTaskForm taskId={task.id} scope={task.draftScope} fields={task.formFields} answers={formAnswers}
              disabled={terminal || busy} onChange={(id, value) => setFormAnswers(previous => ({ ...previous, [id]: value }))} />
          ) : (
            <div className="space-y-1.5">
              <span className="font-semibold text-xs text-[var(--text-primary)] block">
                Passo a passo:
              </span>
              <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-300 bg-slate-50/50 dark:bg-muted/10 p-3.5 rounded-lg border border-[var(--border-subtle)]">
                {task.instructions ||
                  "Execute as ações indicadas no título e confirme com as comprovações abaixo."}
              </p>
            </div>
          )}

          {task.dependencies && task.dependencies.length > 0 && (
            <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <span className="font-semibold text-[11px] text-[var(--text-secondary)] uppercase tracking-wide">
                Etapas predecessoras
              </span>
              <div className="flex flex-col gap-1.5">
                {task.dependencies.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-white dark:bg-card border border-slate-200 dark:border-border text-xs"
                  >
                    <span className="truncate font-medium">
                      {d.dependsOnTask.title}
                    </span>
                    <StatusBadge status={d.dependsOnTask.status} size="sm" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card 2: Comprovações e Evidências - Somente se for tarefa padrão */}
      {isStandardTask && (
        <Card className="rounded-xl p-0 border border-[var(--border-subtle)] bg-[var(--surface)] shadow-none overflow-hidden">
          <div className="px-4 py-3 bg-slate-50/80 dark:bg-muted/30 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCheck2 className="size-4 text-[var(--brand-900)] dark:text-primary" />
              <h3 className="font-bold text-xs uppercase tracking-wider text-[var(--text-primary)]">
                Comprovações e Evidências
              </h3>
            </div>
            {totalRequirements > 0 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-muted text-slate-800 dark:text-foreground">
                {completedRequirements}/{totalRequirements} entregues
              </span>
            )}
          </div>

          <CardContent className="p-4 sm:p-5 flex flex-col gap-3.5">
            {totalRequirements === 0 ? (
              <div className="p-4 text-center rounded-lg bg-emerald-50/60 border border-emerald-100 text-xs text-emerald-800">
                <FileCheck2 className="size-5 mx-auto mb-1 text-emerald-600" />
                Nenhuma evidência documental exigida. Basta confirmar o término do
                trabalho no botão abaixo.
              </div>
            ) : (
              requirements.map((req) => (
                <div key={req.id + ":" + req.submissions.length}>
                  <TaskEvidenceItem
                    taskId={task.id}
                    scope={task.draftScope}
                    timezone={task.timezone}
                    requirement={req}
                    disabled={
                      terminal ||
                      busy ||
                      scheduled ||
                      task.status === "BLOCKED" ||
                      !!task.isUnassigned ||
                      isToleranceExceeded ||
                      evidenceDenied
                    }
                    draft={evidenceDrafts[req.id]}
                    onDraftChange={(draft) =>
                      setEvidenceDrafts((prev) => ({ ...prev, [req.id]: draft }))
                    }
                    onSuccess={(msg) => {
                      toast.add({
                        title: "Comprovação enviada",
                        description: msg || "Comprovação enviada com sucesso!",
                        type: "success",
                      });
                      router.refresh();
                    }}
                    onError={(err) => {
                      toast.add({
                        title: "Erro no envio",
                        description: err,
                        type: "error",
                      });
                    }}
                  />
                  {!terminal &&
                  !task.isUnassigned &&
                  req.submissions.filter((s) => s.validationStatus === "VALID")
                    .length < req.minQuantity ? (
                    <Button
                      variant="outline"
                      disabled={
                        busy ||
                        scheduled ||
                        isToleranceExceeded ||
                        task.status === "BLOCKED" ||
                        evidenceDenied
                      }
                      onClick={() => {
                        void registerRequirement(req);
                      }}
                    >
                      Registrar comprovação
                    </Button>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* Card 3: Ocorrências registradas - Inicialmente colapsado, layout neutro */}
      {(() => {
        const validOccurrences = (task.occurrences || []).filter(
          (o) => !isPauseOccurrence(o),
        );
        if (validOccurrences.length === 0) return null;
        return (
          <Card className="rounded-xl p-0 border border-slate-200 dark:border-slate-800 bg-surface shadow-none overflow-hidden">
            <button
              type="button"
              onClick={() => setOccurrencesOpen((prev) => !prev)}
              className="w-full px-4 py-2.5 bg-slate-50/80 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-left cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/40 transition-colors select-none"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="size-4 text-slate-600 dark:text-slate-400" />
                <span className="font-bold text-[11px] uppercase tracking-wide text-slate-900 dark:text-slate-200">
                  Ocorrências registradas
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] font-semibold px-1.5 py-0 border-slate-300 text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-300"
                >
                  {validOccurrences.length}
                </Badge>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <span>{occurrencesOpen ? "Recolher" : "Expandir"}</span>
                {occurrencesOpen ? (
                  <ChevronUp className="size-3.5" />
                ) : (
                  <ChevronDown className="size-3.5" />
                )}
              </div>
            </button>
            {occurrencesOpen && (
              <CardContent className="p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {validOccurrences.map((occ) => (
                  <div
                    key={occ.id}
                    className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-xs flex flex-col gap-0.5"
                  >
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {cleanReason(occ.reason)}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {new Date(occ.createdAt).toLocaleString("pt-BR", {
                        timeZone: task.timezone ?? "America/Sao_Paulo",
                      })}
                    </span>
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        );
      })()}

      {/* Card 4: Painel de Ações Operacionais */}
      <Card className="rounded-xl p-4 sm:p-5 border border-[var(--border-subtle)] bg-[var(--surface)] shadow-xs flex flex-col gap-3">
        {scheduled ? (
          <div className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 text-center">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Clock className="size-4 text-slate-500" />
              <span>Aguardando horário</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Esta tarefa será liberada em{" "}
              {new Date(task.scheduledDate!).toLocaleString("pt-BR", {
                timeZone: task.timezone ?? "America/Sao_Paulo",
                dateStyle: "short",
                timeStyle: "short",
              })}
              .
            </p>
          </div>
        ) : task.isUnassigned ? (
          <Button
            className="w-full h-11 text-xs font-semibold rounded-xl bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)] cursor-pointer"
            disabled={busy || task.status === "BLOCKED" || isToleranceExceeded}
            onClick={() =>
              run(() => claimTaskAction(task.id), {
                successNotice: "Tarefa assumida com sucesso!",
              })
            }
          >
            {busy ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Check data-icon="inline-start" />
            )}
            {task.status === "BLOCKED"
              ? "Aguardando etapas anteriores"
              : "Assumir esta tarefa"}
          </Button>
        ) : task.status === "BLOCKED" ? (
          <div className="p-3 text-center rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 font-medium">
            Aguardando etapas anteriores para ser liberada.
          </div>
        ) : !terminal && task.status !== "SUBMITTED" ? (
          <div className="flex flex-col gap-2">
            {isToleranceExceeded && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                <Lock className="size-4 shrink-0 text-red-600" />
                <span>
                  Limite de tolerância atingido. Esta tarefa está bloqueada para
                  conclusão.
                </span>
              </div>
            )}

            <Button
              className={`w-full h-11 text-xs font-semibold rounded-xl ${
                isToleranceExceeded
                  ? "bg-slate-200 text-slate-500 border border-slate-300 cursor-not-allowed opacity-70 hover:bg-slate-200 hover:text-slate-500"
                  : "bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)] cursor-pointer"
              }`}
              disabled={busy || isToleranceExceeded || operationDenied}
              onClick={handleCompleteWithEvidence}
            >
              {busy ? (
                <Spinner data-icon="inline-start" />
              ) : isToleranceExceeded ? (
                <Lock data-icon="inline-start" className="size-4" />
              ) : (
                <Check data-icon="inline-start" />
              )}
              {isToleranceExceeded
                ? "Bloqueada por limite de tolerância"
                : task.requiresApproval
                  ? "Enviar para aprovação"
                  : "Concluir tarefa"}
            </Button>

            <Button
              variant="outline"
              className="employee-impediment-trigger w-full"
              disabled={busy}
              onClick={() => {
                setReason("");
                setOperationError(null);
                setDialog("impediment");
              }}
            >
              <CircleX data-icon="inline-start" />Não foi possível realizar
            </Button>
          </div>
        ) : task.status === "SUBMITTED" ? (
          <div className="p-3 text-center rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900 font-medium">
            Entrega aguardando aprovação da gestão.
          </div>
        ) : (
          <div className="p-3 text-center rounded-lg bg-slate-100 text-xs text-slate-700 font-medium">
            Tarefa finalizada. Histórico e comprovações preservados.
          </div>
        )}
      </Card>

      <TaskTimeline key={task.id} events={task.timeline ?? []} timezone={task.timezone} />
      <ImpedimentSheet open={dialog === "impediment"} category={category} reason={reason} busy={busy} error={operationError}
        onCategoryChange={setCategory} onReasonChange={setReason} onClose={() => setDialog(null)}
        onSubmit={() => { void run(() => reportImpedimentAction(task.id, category, reason.trim()), { successNotice: "Impedimento registrado. A gestão foi avisada.", complete: true }); }} />
    </div>
  );
}
