"use client";
import {applyTaskResource,loadTaskResource,subscribeTaskResource} from '@/presentation/realtime/task-resource';
import { useTaskView } from "@/presentation/hooks/use-task-view";
import { FormChoiceInput } from "@/presentation/components/shared/form-choice-input";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import {
  getTaskDetailAction,
  completeTaskAction,
  submitEvidenceAction,
  uploadEvidenceAction,
  uploadTaskFormFileAction,
  type TaskDetailResult,
} from "@/presentation/actions/task-actions";
import {
  resumeTaskAction,
  reportImpedimentAction,
  claimTaskAction,
} from "@/presentation/actions/management-task-actions";
import { StatusBadge, PriorityBadge, Modal } from "../shared";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { LogoLoader } from "@/components/loader/logo-loader";
import {
  Check,
  MapPin,
  Send,
  RotateCcw,
  Calendar,
  AlertCircle,
  FileCheck2,
  RefreshCw,
  X,
  Camera,
  Video,
  Paperclip,
  FileUp,
  FileText,
  Hash,
  PenTool,
  Navigation,
  Clock,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ListTodo,
  Lock,
  ArrowLeft,
} from "lucide-react";

interface TaskDetailDrawerProps {
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskUpdated?: () => void;
  embedded?: boolean;
  onBack?: () => void;
}

import {
  TaskEvidenceItem,
  evidenceTypeMeta,
  type EvidenceDraft,
} from "./task-evidence-item";

export type { EvidenceDraft };

function isPauseOccurrence(o: { type?: string; category?: string; reason?: string }): boolean {
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

export function EmployeeTaskDetailDrawer({
  taskId,
  open,
  onOpenChange,
  onTaskUpdated,
  embedded = false,
  onBack,
}: TaskDetailDrawerProps) {
  const router = useRouter();
  const [task, setTask] = useState<TaskDetailResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [dialog, setDialog] = useState<"impediment" | null>(null);
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState("OUTROS");
  const [evidenceDrafts, setEvidenceDrafts] = useState<Record<string, EvidenceDraft>>({});
  const [formAnswers, setFormAnswers] = useState<Record<string, any>>({});
  const [drawerOccurrencesOpen, setDrawerOccurrencesOpen] = useState(false);
  const loadingVersion=useRef(0);
  useTaskView(open && task?.id === taskId ? taskId : null);

  const loadTask = useCallback(async (id: string) => {
    const version=++loadingVersion.current;
    setLoading(true);
    try {
      const res = await loadTaskResource(id);
      if(version!==loadingVersion.current)return;
      if (res.error) {
        toast.add({
          title: "Erro ao carregar tarefa",
          description: res.error,
          type: "error",
        });
        setTask(null);
      } else if (res.task) {
        setTask(res.task);
        setFormAnswers((res.task.formAnswers as Record<string, any>) ?? {});
      }
    } catch {
      if(version!==loadingVersion.current)return;
      toast.add({
        title: "Erro inesperado",
        description: "Não foi possível carregar os detalhes da tarefa.",
        type: "error",
      });
      setTask(null);
    } finally {
      if(version===loadingVersion.current)setLoading(false);
    }
  }, []);

  useEffect(()=>{
    if(!open||!taskId)return;
    return subscribeTaskResource(taskId,setTask);
  },[open,taskId]);

  useEffect(() => {
    loadingVersion.current++;
    if (open && taskId) {
      setLoading(true);
      setEvidenceDrafts({});
      setFormAnswers({});
      loadTask(taskId);
    } else if (!open) {
      setLoading(false);
      const timer = setTimeout(() => {
        setTask(null);
        setEvidenceDrafts({});
        setFormAnswers({});
        setDialog(null);
      }, 300);
      return () => clearTimeout(timer);
    }
    return()=>{loadingVersion.current++;};
  }, [open, taskId, loadTask]);

  async function handleAction(
    actionFn: () => Promise<{ error?: string; success?: boolean; task?:TaskDetailResult;changeId?:string }>,
    opts?: {
      closeOnSuccess?: boolean;
      successNotice?: string;
    }
  ) {
    if (!task) return;
    setActionBusy(true);
    try {
      const res = await actionFn();
      if (res.error) {
        toast.add({
          title: "Não foi possível concluir",
          description: res.error,
          type: "error",
        });
      } else {
        if (opts?.successNotice) {
          toast.add({
            title: "Ação realizada",
            description: opts.successNotice,
            type: "success",
          });
        }
        if(res.task)setTask(res.task);
        else if (taskId) await loadTask(taskId);
        onTaskUpdated?.();
        if(!applyTaskResource(res))router.refresh();
        if (opts?.closeOnSuccess) {
          if (embedded && onBack) {
            onBack();
          } else {
            onOpenChange(false);
          }
        }
      }
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Ocorreu uma falha na operação. Tente novamente.",
        type: "error",
      });
    } finally {
      setActionBusy(false);
    }
  }

  const isTerminal = task
    ? ["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(task.status)
    : false;
  const isScheduled = !!task?.scheduledDate && new Date(task.scheduledDate) > new Date();

  const deadlines = [task?.deadlineAt, task?.slaDueAt]
    .filter((v): v is string => !!v)
    .map((v) => Date.parse(v))
    .filter(Number.isFinite);
  const dueAt = deadlines.length > 0 ? Math.min(...deadlines) : null;
  const toleranceMinutes = task?.toleranceMinutes ?? 20;
  const toleranceLimitAt = dueAt !== null ? dueAt + toleranceMinutes * 60 * 1000 : null;
  const isToleranceExceeded = toleranceLimitAt !== null && !isTerminal && Date.now() > toleranceLimitAt;

  /**
   * Conclui a tarefa enviando automaticamente todas as evidências anexadas sem necessidade de botão avulso
   */
  async function handleCompleteWithEvidence() {
    if (!task) return;
    if (isScheduled) {
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
        description: `O tempo limite de tolerância desta tarefa foi atingido. Ela está bloqueada para conclusão.`,
        type: "error",
      });
      return;
    }
    setActionBusy(true);
    try {
      const isForm =
        task.taskType === "FORM" ||
        (Array.isArray(task.formFields) && task.formFields.length > 0);

      const pendingRequirements = !isForm
        ? task.evidenceRequirements.filter((req) => {
          const validCount = req.submissions.filter((s) => s.validationStatus === "VALID").length;
          return validCount < req.minQuantity;
        })
        : [];

      if (isForm && Array.isArray(task.formFields)) {
        for (const field of task.formFields as any[]) {
          if (field?.required) {
            const answer = formAnswers[field.id];
            if (answer === undefined || answer === null || answer === "") {
              toast.add({
                title: "Perguntas pendentes",
                description: `A pergunta "${field.question}" é obrigatória.`,
                type: "error",
              });
              setActionBusy(false);
              return;
            }
          }
        }
      }

      // 2. Conferir se todas as exigências obrigatórias foram anexadas/preenchidas (apenas tarefas padrão)
      if (!isForm) {
        for (const req of pendingRequirements) {
          const draft = evidenceDrafts[req.id];
          const meta = evidenceTypeMeta[req.type] || { label: req.type };
          const failures = req.submissions.filter((s) => s.validationStatus === "REJECTED").length;

          // Regra D-05: após 3 falhas de validação, a continuidade operacional com ressalva é permitida
          if (failures >= 3) continue;

          if (req.required) {
            if (req.type === "PHOTO") {
              if (!draft?.file) {
                toast.add({
                  title: "Evidência obrigatória",
                  description: `Tire a foto de comprovação (${meta.label}) antes de concluir.`,
                  type: "error",
                });
                setActionBusy(false);
                return;
              }
            } else if (["VIDEO", "FILE"].includes(req.type)) {
              if (!draft?.file) {
                toast.add({
                  title: "Evidência obrigatória",
                  description: `Anexe o arquivo (${meta.label}) antes de concluir.`,
                  type: "error",
                });
                setActionBusy(false);
                return;
              }
            } else if (req.type === "SIGNATURE") {
              if (!draft?.signed) {
                toast.add({
                  title: "Evidência obrigatória",
                  description: "Desenhe a sua assinatura antes de concluir.",
                  type: "error",
                });
                setActionBusy(false);
                return;
              }
            } else if (req.type === "LOCATION") {
              if (!draft?.value) {
                toast.add({
                  title: "Evidência obrigatória",
                  description: "Capture a localização GPS antes de concluir.",
                  type: "error",
                });
                setActionBusy(false);
                return;
              }
            } else if (req.type === "NUMBER") {
              if (!draft?.value || !draft.value.trim() || !Number.isFinite(Number(draft.value.replace(",", ".")))) {
                toast.add({
                  title: "Evidência obrigatória",
                  description: `Informe a medição numérica para "${meta.label}".`,
                  type: "error",
                });
                setActionBusy(false);
                return;
              }
            } else if (req.type === "TEXT") {
              if (!draft?.value || !draft.value.trim()) {
                toast.add({
                  title: "Evidência obrigatória",
                  description: `Preencha o relato escrito para "${meta.label}".`,
                  type: "error",
                });
                setActionBusy(false);
                return;
              }
            }
          }
        }
      }

      // 3. Se tudo está conferido e válido, enviar as evidências pendentes fornecidas (apenas tarefas padrão)
      if (!isForm) {
        for (const req of pendingRequirements) {
          const draft = evidenceDrafts[req.id];
          if (!draft) continue;

          if (req.type === "SIGNATURE" && draft.signed && draft.getSignatureBlob) {
            const blob = await draft.getSignatureBlob();
            if (blob) {
              const sigFile = new File([blob], "assinatura.png", { type: "image/png" });
              const form = new FormData();
              form.set("taskId", task.id);
              form.set("requirementId", req.id);
              form.set("file", sigFile);
              form.set("roundId", task.roundId);
              const uploadRes = await uploadEvidenceAction(form);
              if (uploadRes.error) {
                toast.add({
                  title: "Erro ao enviar assinatura",
                  description: uploadRes.error,
                  type: "error",
                });
                setActionBusy(false);
                return;
              }
            }
          } else if (["PHOTO", "VIDEO", "FILE"].includes(req.type) && draft.file) {
            const form = new FormData();
            form.set("taskId", task.id);
            form.set("requirementId", req.id);
            form.set("file", draft.file);
            form.set("roundId", task.roundId);
            const uploadRes = await uploadEvidenceAction(form);
            if (uploadRes.error) {
              const meta = evidenceTypeMeta[req.type] || { label: req.type };
              toast.add({
                title: `Erro ao enviar ${meta.label}`,
                description: uploadRes.error,
                type: "error",
              });
              setActionBusy(false);
              return;
            }
          } else if (["TEXT", "NUMBER", "LOCATION"].includes(req.type) && draft.value?.trim()) {
            const submitRes = await submitEvidenceAction(task.id, req.id, draft.value.trim(), { roundId: task.roundId });
            if (submitRes.error) {
              const meta = evidenceTypeMeta[req.type] || { label: req.type };
              toast.add({
                title: `Erro ao enviar ${meta.label}`,
                description: submitRes.error,
                type: "error",
              });
              setActionBusy(false);
              return;
            }
          }
        }
      }

      // 4. Se o form tiver arquivos (fotos, vídeos ou anexos), fazemos o upload seguro antes de concluir.
      const finalFormAnswers = { ...formAnswers };
      if (isForm && Array.isArray(task.formFields)) {
        for (const field of task.formFields as any[]) {
          if (["PHOTO", "VIDEO", "FILE"].includes(field?.type) && finalFormAnswers[field.id] instanceof File) {
            const file = finalFormAnswers[field.id] as File;
            const form = new FormData();
            form.set("taskId", task.id);
            form.set("fieldId", field.id);
            form.set("file", file);
            form.set("roundId", task.roundId);
            const uploadRes = await uploadTaskFormFileAction(form);
            if (uploadRes.error) {
              toast.add({
                title: `Erro ao enviar ${field.type === "PHOTO" ? "foto" : field.type === "VIDEO" ? "vídeo" : "arquivo"}`,
                description: uploadRes.error,
                type: "error",
              });
              setActionBusy(false);
              return;
            }
            finalFormAnswers[field.id] = {
              storageKey: uploadRes.storageKey,
              fileName: uploadRes.fileName,
              fileSize: uploadRes.fileSize,
              mimeType: uploadRes.mimeType,
              type: field.type,
            };
          }
        }
      }

      // 5. Concluir tarefa direto
      const completeRes = await completeTaskAction(task.id, isForm ? finalFormAnswers : undefined, task.roundId);
      if (completeRes.error) {
        toast.add({
          title: "Erro ao concluir tarefa",
          description: completeRes.error,
          type: "error",
        });
        await loadTask(task.id);
      } else {
        toast.add({
          title: "Sucesso",
          description: task.requiresApproval ? "Enviado para aprovação!" : "Tarefa concluída!",
          type: "success",
        });
        onTaskUpdated?.();
        if(completeRes.task)setTask(completeRes.task);
        if(!applyTaskResource(completeRes))router.refresh();
        setTimeout(() => {
          if (embedded && onBack) {
            onBack();
          } else {
            onOpenChange(false);
          }
        }, 400);
      }
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Não foi possível concluir a tarefa. Verifique sua conexão e tente novamente.",
        type: "error",
      });
    } finally {
      setActionBusy(false);
    }
  }

  const isFormTask =
    task?.taskType === "FORM" ||
    (Array.isArray(task?.formFields) && task.formFields.length > 0);
  const isStandardTask = !isFormTask;

  const completedRequirements = task && isStandardTask
    ? task.evidenceRequirements.filter((req) => {
      const validCount = req.submissions.filter((s) => s.validationStatus === "VALID").length;
      return validCount >= req.minQuantity;
    }).length
    : 0;

  const totalRequirements = task && isStandardTask ? (task.evidenceRequirements.length ?? 0) : 0;

  const bodyContent = (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 flex flex-col gap-4">
      {!task && !loading && taskId && (
        <div className="py-8 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
          <p>Não foi possível exibir a tarefa.</p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2.5"
            onClick={() => loadTask(taskId)}
            disabled={loading}
          >
            <RefreshCw data-icon="inline-start" className="size-3" />
            Tentar de novo
          </Button>
        </div>
      )}

      {task?.correctionRequested && !isTerminal && (
        <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5 shrink-0">
          <AlertCircle className="size-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong className="font-semibold block mb-0.5">Correção solicitada pela gestão</strong>
            Revise as orientações abaixo e anexe as novas comprovações requeridas para reenviar.
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 gap-3 min-h-[300px]">
          <LogoLoader size={64} text="Carregando detalhes..." />
        </div>
      ) : task ? (
        <>
          <Card className="shrink-0 rounded-xl p-0 border border-[var(--border-subtle)] bg-[var(--surface)] shadow-none overflow-hidden">
            <div className="px-4 py-3 bg-slate-50/80 dark:bg-muted/30 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListTodo className="size-4 text-[var(--brand-900)] dark:text-primary" />
                <h3 className="font-bold text-xs uppercase tracking-wider text-[var(--text-primary)]">
                  Instruções de execução
                </h3>
              </div>
            </div>

            <CardContent className="p-4 flex flex-col gap-3 text-xs leading-relaxed">
              {task.description && (
                <div className="p-3 rounded-lg bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 text-blue-950 dark:text-blue-100">
                  <span className="font-semibold block mb-1 text-[11px] uppercase tracking-wide text-blue-800 dark:text-blue-300">
                    Resumo da atividade
                  </span>
                  <p className="font-medium text-xs">{task.description}</p>
                </div>
              )}

              {task.taskType === "FORM" && Array.isArray(task.formFields) ? (
                <div className="space-y-4 pt-2">
                  {task.formFields.map((field: any, idx: number) => (
                    <div key={field.id} className="p-3 bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl">
                      <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
                        {idx + 1}. {field.question} {field.required && <span className="text-red-500">*</span>}
                      </label>
                      {field.type === "MULTIPLE_CHOICE" && <FormChoiceInput options={field.options ?? []} value={formAnswers[field.id]} onChange={value => setFormAnswers(prev => ({ ...prev, [field.id]: value }))} />}
                      {field.type === "SHORT_TEXT" && (
                        <Input
                          value={formAnswers[field.id] || ""}
                          onChange={(e) => setFormAnswers((prev) => ({ ...prev, [field.id]: e.target.value }))}
                          placeholder="Sua resposta..."
                          className="text-xs"
                          disabled={isTerminal || actionBusy}
                        />
                      )}
                      {field.type === "LONG_TEXT" && (
                        <Textarea
                          value={formAnswers[field.id] || ""}
                          onChange={(e) => setFormAnswers((prev) => ({ ...prev, [field.id]: e.target.value }))}
                          placeholder="Descreva sua resposta..."
                          className="text-xs resize-none"
                          rows={3}
                          disabled={isTerminal || actionBusy}
                        />
                      )}
                      {field.type === "RATING" && (
                        <div className="flex gap-2">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              disabled={isTerminal || actionBusy}
                              onClick={() => setFormAnswers((prev) => ({ ...prev, [field.id]: star }))}
                              className={`size-8 rounded-full flex items-center justify-center border transition-colors ${formAnswers[field.id] === star
                                ? "bg-amber-100 border-amber-400 text-amber-600"
                                : "bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100"
                                }`}
                            >
                              ★
                            </button>
                          ))}
                        </div>
                      )}
                      {field.type === "BOOLEAN" && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={isTerminal || actionBusy}
                            onClick={() => setFormAnswers((prev) => ({ ...prev, [field.id]: true }))}
                            className={`flex-1 py-2 text-xs rounded-lg border font-medium transition-colors ${formAnswers[field.id] === true
                              ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                              : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                              }`}
                          >
                            Sim
                          </button>
                          <button
                            type="button"
                            disabled={isTerminal || actionBusy}
                            onClick={() => setFormAnswers((prev) => ({ ...prev, [field.id]: false }))}
                            className={`flex-1 py-2 text-xs rounded-lg border font-medium transition-colors ${formAnswers[field.id] === false
                              ? "bg-red-50 border-red-300 text-red-700"
                              : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                              }`}
                          >
                            Não
                          </button>
                        </div>
                      )}
                      {field.type === "PHOTO" && (
                        <div className="flex flex-col gap-2">
                          {formAnswers[field.id] instanceof File ? (
                            <div className="p-2.5 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-300 dark:border-emerald-800 rounded-xl flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="size-8 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 flex items-center justify-center shrink-0">
                                  <Camera className="size-4" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-200 truncate">
                                    {(formAnswers[field.id] as File).name}
                                  </span>
                                  <span className="text-[10px] text-emerald-700/80 dark:text-emerald-400">
                                    {Math.round(((formAnswers[field.id] as File).size || 0) / 1024)} KB · Foto registrada
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={isTerminal || actionBusy}
                                onClick={() => setFormAnswers((prev) => { const next = { ...prev }; delete next[field.id]; return next; })}
                                className="text-xs text-red-600 hover:text-red-800 font-semibold px-2 py-1 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                              >
                                Trocar
                              </button>
                            </div>
                          ) : (
                            <label className={`flex flex-col items-center justify-center p-3.5 border-2 border-dashed border-[var(--border-subtle)] hover:border-[var(--brand-700)] bg-[var(--surface)] hover:bg-[var(--canvas)] rounded-xl cursor-pointer transition-all ${(isTerminal || actionBusy) ? "opacity-50 pointer-events-none" : ""
                              }`}>
                              <Camera className="size-5 mb-1 text-[var(--brand-700)] opacity-80" />
                              <span className="text-xs font-semibold text-[var(--brand-900)]">Tirar foto na hora</span>
                              <span className="text-[10px] text-muted-foreground mt-0.5">Abre a câmera do dispositivo</span>
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) setFormAnswers((prev) => ({ ...prev, [field.id]: file }));
                                }}
                              />
                            </label>
                          )}
                        </div>
                      )}

                      {field.type === "VIDEO" && (
                        <div className="flex flex-col gap-2">
                          {formAnswers[field.id] instanceof File ? (
                            <div className="p-2.5 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-300 dark:border-emerald-800 rounded-xl flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="size-8 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 flex items-center justify-center shrink-0">
                                  <Video className="size-4" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-200 truncate">
                                    {(formAnswers[field.id] as File).name}
                                  </span>
                                  <span className="text-[10px] text-emerald-700/80 dark:text-emerald-400">
                                    {Math.round(((formAnswers[field.id] as File).size || 0) / 1024)} KB · Vídeo gravado
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={isTerminal || actionBusy}
                                onClick={() => setFormAnswers((prev) => { const next = { ...prev }; delete next[field.id]; return next; })}
                                className="text-xs text-red-600 hover:text-red-800 font-semibold px-2 py-1 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                              >
                                Trocar
                              </button>
                            </div>
                          ) : (
                            <label className={`flex flex-col items-center justify-center p-3.5 border-2 border-dashed border-[var(--border-subtle)] hover:border-[var(--brand-700)] bg-[var(--surface)] hover:bg-[var(--canvas)] rounded-xl cursor-pointer transition-all ${(isTerminal || actionBusy) ? "opacity-50 pointer-events-none" : ""
                              }`}>
                              <Video className="size-5 mb-1 text-[var(--brand-700)] opacity-80" />
                              <span className="text-xs font-semibold text-[var(--brand-900)]">Gravar vídeo na hora</span>
                              <span className="text-[10px] text-muted-foreground mt-0.5">Abre a câmera para gravação direta</span>
                              <input
                                type="file"
                                accept="video/*"
                                capture="environment"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) setFormAnswers((prev) => ({ ...prev, [field.id]: file }));
                                }}
                              />
                            </label>
                          )}
                        </div>
                      )}

                      {field.type === "FILE" && (
                        <div className="flex flex-col gap-2">
                          {formAnswers[field.id] instanceof File ? (
                            <div className="p-2.5 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-300 dark:border-emerald-800 rounded-xl flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="size-8 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 flex items-center justify-center shrink-0">
                                  <Paperclip className="size-4" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-200 truncate">
                                    {(formAnswers[field.id] as File).name}
                                  </span>
                                  <span className="text-[10px] text-emerald-700/80 dark:text-emerald-400">
                                    {Math.round(((formAnswers[field.id] as File).size || 0) / 1024)} KB · Arquivo anexado
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={isTerminal || actionBusy}
                                onClick={() => setFormAnswers((prev) => { const next = { ...prev }; delete next[field.id]; return next; })}
                                className="text-xs text-red-600 hover:text-red-800 font-semibold px-2 py-1 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                              >
                                Trocar
                              </button>
                            </div>
                          ) : (
                            <label className={`flex flex-col items-center justify-center p-3.5 border-2 border-dashed border-[var(--border-subtle)] hover:border-[var(--brand-700)] bg-[var(--surface)] hover:bg-[var(--canvas)] rounded-xl cursor-pointer transition-all ${(isTerminal || actionBusy) ? "opacity-50 pointer-events-none" : ""
                              }`}>
                              <Paperclip className="size-5 mb-1 text-[var(--brand-700)] opacity-80" />
                              <span className="text-xs font-semibold text-[var(--brand-900)]">Anexar arquivo</span>
                              <span className="text-[10px] text-muted-foreground mt-0.5">Imagens, vídeos ou documentos (máx. 12 MB)</span>
                              <input
                                type="file"
                                accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) setFormAnswers((prev) => ({ ...prev, [field.id]: file }));
                                }}
                              />
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <span className="font-semibold text-xs text-[var(--text-primary)] block">
                    Passo a passo:
                  </span>
                  <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-300 bg-slate-50/50 dark:bg-muted/10 p-3 rounded-lg border border-[var(--border-subtle)]">
                    {task.instructions ||
                      "Execute as ações indicadas no título e confirme com as comprovações abaixo."}
                  </p>
                </div>
              )}

              {task.dependencies && task.dependencies.length > 0 && (
                <div className="flex flex-col gap-1.5 pt-2 border-t border-[var(--border-subtle)]">
                  <span className="font-semibold text-[11px] text-[var(--text-secondary)] uppercase tracking-wide">
                    Etapas predecessoras
                  </span>
                  <div className="flex flex-col gap-1.5">
                    {task.dependencies.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white dark:bg-card border border-slate-200 dark:border-border text-xs"
                      >
                        <span className="truncate font-medium">{d.dependsOnTask.title}</span>
                        <StatusBadge status={d.dependsOnTask.status} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card: Comprovações e Evidências - Apenas se for tarefa padrão */}
          {isStandardTask && (
            <Card className="shrink-0 rounded-xl p-0 border border-[var(--border-subtle)] bg-[var(--surface)] shadow-none overflow-hidden">
              <div className="px-4 py-3 bg-slate-50/80 dark:bg-muted/30 border-b border-[var(--border-subtle)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCheck2 className="size-4 text-[var(--brand-900)] dark:text-primary" />
                  <h3 className="font-bold text-xs uppercase tracking-wider text-[var(--text-primary)] line-clamp-1">
                    Comprovações e Evidências
                  </h3>
                </div>
                {totalRequirements > 0 && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-muted text-slate-800 dark:text-foreground">
                    {completedRequirements}/{totalRequirements} entregues
                  </span>
                )}
              </div>

              <CardContent className="p-4 flex flex-col gap-3.5">
                {totalRequirements === 0 ? (
                  <div className="p-3.5 text-center rounded-lg bg-emerald-50/60 border border-emerald-100 text-xs text-emerald-800">
                    <FileCheck2 className="size-5 mx-auto mb-1 text-emerald-600" />
                    Nenhuma evidência documental exigida. Basta confirmar o término do trabalho no botão abaixo.
                  </div>
                ) : (
                  task.evidenceRequirements.map((req) => (
                    <TaskEvidenceItem
                      key={req.id}
                      taskId={task.id}
                      requirement={req}
                      disabled={isTerminal || task.status === "BLOCKED" || !!task.isUnassigned || isToleranceExceeded}
                      draft={evidenceDrafts[req.id]}
                      onDraftChange={(draft) =>
                        setEvidenceDrafts((prev) => ({ ...prev, [req.id]: draft }))
                      }
                      onSuccess={async (msg) => {
                        toast.add({
                          title: "Comprovação enviada",
                          description: msg || "Comprovação enviada com sucesso!",
                          type: "success",
                        });
                        if (taskId) await loadTask(taskId);
                        onTaskUpdated?.();
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
                  ))
                )}
              </CardContent>
            </Card>
          )}

          {(() => {
            const validOccurrences = (task.occurrences || []).filter((occ) => !isPauseOccurrence(occ));
            if (validOccurrences.length === 0) return null;
            return (
              <Card className="shrink-0 rounded-xl p-0 border border-slate-200 dark:border-slate-800 bg-[var(--surface)] shadow-none overflow-hidden">
                <button
                  type="button"
                  onClick={() => setDrawerOccurrencesOpen((prev) => !prev)}
                  className="w-full px-4 py-2.5 bg-slate-50/80 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-left cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800/40 transition-colors select-none"
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle className="size-4 text-slate-600 dark:text-slate-400" />
                    <span className="font-bold text-[11px] uppercase tracking-wide text-slate-900 dark:text-slate-200">
                      Ocorrências registradas
                    </span>
                    <Badge variant="outline" className="text-[10px] font-semibold px-1.5 py-0 border-slate-300 text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-300">
                      {validOccurrences.length}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-slate-500">
                    <span>{drawerOccurrencesOpen ? "Recolher" : "Expandir"}</span>
                    {drawerOccurrencesOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                  </div>
                </button>
                {drawerOccurrencesOpen && (
                  <CardContent className="p-3.5 flex flex-col gap-2">
                    {validOccurrences.map((occ) => (
                      <div
                        key={occ.id}
                        className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-xs flex flex-col gap-0.5"
                      >
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{occ.reason}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {new Date(occ.createdAt).toLocaleString("pt-BR", {
                            timeZone: task?.timezone ?? "America/Sao_Paulo",
                          })}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>
            );
          })()}
        </>
      ) : null}
    </div>
  );

  const footerContent = task ? (
    <>
      {isScheduled ? (
        <div className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 text-center">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <Clock className="size-4 text-slate-500" />
            <span>Aguardando horário</span>
          </div>
          <p className="text-[11px] text-slate-500">
            Liberada em{" "}
            {new Date(task.scheduledDate!).toLocaleString("pt-BR", {
              timeZone: task.timezone ?? "America/Sao_Paulo",
              dateStyle: "short",
              timeStyle: "short",
            })}
          </p>
        </div>
      ) : task.isUnassigned ? (
        <div className="flex flex-col gap-2">
          <Button
            className="w-full h-11 text-xs font-semibold rounded-xl bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)] cursor-pointer"
            disabled={actionBusy || task.status === "BLOCKED"}
            onClick={() =>
              handleAction(() => claimTaskAction(task.id), {
                successNotice: "Tarefa assumida com sucesso!",
              })
            }
          >
            {actionBusy ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Check data-icon="inline-start" />
            )}
            {task.status === "BLOCKED" ? "Aguardando etapas anteriores" : "Assumir esta tarefa"}
          </Button>
        </div>
      ) : task.status === "BLOCKED" ? (
        <p className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200 text-center font-medium">
          Aguardando etapas anteriores para ser liberada.
        </p>
      ) : !isTerminal && task.status !== "SUBMITTED" ? (
        <div className="flex flex-col gap-2">
          {isToleranceExceeded && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
              <Lock className="size-4 shrink-0 text-red-600" />
              <span>Limite de tolerância atingido. Esta tarefa está bloqueada para conclusão.</span>
            </div>
          )}

          <Button
            className={`w-full h-11 text-xs font-semibold rounded-xl ${isToleranceExceeded
              ? "bg-slate-200 text-slate-500 border border-slate-300 cursor-not-allowed opacity-70 hover:bg-slate-200 hover:text-slate-500"
              : "bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)] cursor-pointer"
              }`}
            disabled={actionBusy || isToleranceExceeded}
            onClick={handleCompleteWithEvidence}
          >
            {actionBusy ? (
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
            variant="ghost"
            className="w-full h-9 rounded-lg text-xs text-red-600 hover:text-red-700 hover:bg-red-50 cursor-pointer"
            disabled={actionBusy}
            onClick={() => {
              setReason("");
              setDialog("impediment");
            }}
          >
            Não foi possível realizar
          </Button>
        </div>
      ) : task.status === "SUBMITTED" ? (
        <div className="p-2.5 text-center rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900 font-medium">
          Entrega aguardando aprovação da gestão.
        </div>
      ) : (
        <div className="p-2.5 text-center rounded-lg bg-slate-100 text-xs text-slate-700 font-medium">
          Tarefa finalizada. Histórico e comprovações preservados.
        </div>
      )}
    </>
  ) : null;

  const impedimentModal = dialog === "impediment" && task && (
    <Modal
      open={true}
      title="Registrar impedimento"
      onClose={() => {
        if (!actionBusy) setDialog(null);
      }}
    >
      <form
        className="flex flex-col gap-4 text-xs"
        onSubmit={(e) => {
          e.preventDefault();
          handleAction(
            () => reportImpedimentAction(task.id, category, reason),
            {
              closeOnSuccess: true,
              successNotice: "Impedimento registrado. A gestão foi avisada.",
            }
          );
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel className="text-xs">Tipo de impedimento</FieldLabel>
            <NativeSelect
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="text-xs h-9"
              disabled={actionBusy}
            >
              <NativeSelectOption value="MATERIAL_FALTANDO">Falta de material / insumo</NativeSelectOption>
              <NativeSelectOption value="ACESSO_BLOQUEADO">Local sem acesso / trancado</NativeSelectOption>
              <NativeSelectOption value="EQUIPAMENTO_DEFEITO">Equipamento com defeito</NativeSelectOption>
              <NativeSelectOption value="ERRO_PROCESSO">Dúvida ou divergência no procedimento</NativeSelectOption>
              <NativeSelectOption value="OUTROS">Outros motivos operacionais</NativeSelectOption>
            </NativeSelect>
          </Field>

          <Field>
            <FieldLabel className="text-xs">Descreva detalhadamente o ocorrido *</FieldLabel>
            <Textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explique o que impediu a conclusão..."
              className="text-xs resize-none"
              disabled={actionBusy}
            />
          </Field>
        </FieldGroup>

        <div className="flex gap-2 justify-end pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs h-8"
            disabled={actionBusy}
            onClick={() => setDialog(null)}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            size="sm"
            className="text-xs h-8 bg-red-600 hover:bg-red-700 text-white cursor-pointer"
            disabled={actionBusy || !reason.trim()}
          >
            {actionBusy ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <AlertCircle data-icon="inline-start" />
            )}
            Registrar e pausar
          </Button>
        </div>
      </form>
    </Modal>
  );

  if (embedded) {
    return (
      <div
        className={`absolute inset-0 z-30 bg-[var(--surface)] rounded-t-[24px] overflow-hidden flex flex-col transition-transform duration-300 ease-in-out ${open ? "translate-x-0 pointer-events-auto" : "translate-x-full pointer-events-none"
          }`}
      >
        <div className="p-4 sm:p-5 border-b border-[var(--border-subtle)] bg-[var(--surface)] shrink-0">
          <div className="flex items-center justify-between gap-3 mb-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="h-8 -ml-2 px-2.5 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="size-4" />
              <span>Voltar ao processo</span>
            </Button>

            <div className="flex items-center gap-2 flex-wrap">
              {task && (
                <>
                  <StatusBadge status={isScheduled ? "SCHEDULED" : task.status} />
                  <PriorityBadge priority={task.priority} />
                </>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="size-8 rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              >
                <X className="size-4" />
                <span className="sr-only">Fechar</span>
              </Button>
            </div>
          </div>

          <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)] leading-snug">
            {loading ? (
              <Skeleton className="h-6 w-3/4" />
            ) : (
              task?.title || "Detalhes da etapa"
            )}
          </h2>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)] mt-1">
            {loading ? (
              <Skeleton className="h-4 w-1/2" />
            ) : (
              <>
                {task?.deadlineAt && (
                  <span className="inline-flex items-center gap-1 font-medium">
                    <Clock className="size-3 text-slate-400" />
                    Prazo:{" "}
                    {new Date(task.deadlineAt).toLocaleString("pt-BR", {
                      timeZone: task?.timezone ?? "America/Sao_Paulo",
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {bodyContent}

        {footerContent && (
          <div className="px-4 sm:px-6 py-3.5 border-t border-(--border-subtle) bg-[var(--surface)] shrink-0 flex flex-col gap-2">
            {footerContent}
          </div>
        )}

        {impedimentModal}
      </div>
    );
  }

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        showSwipeHandle={true}
        swipeDirection="down"
      >
        <DrawerContent className="fixed inset-x-0 bottom-0 top-auto w-full h-[92dvh] max-h-[92dvh] sm:max-w-2xl! sm:mx-auto border-t border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--text-primary)] rounded-t-[24px] shadow-2xl flex flex-col focus:outline-none overflow-hidden p-0">
          <DrawerHeader className="p-4 sm:p-5 border-b border-(--border-subtle) bg-[var(--surface)] shrink-0">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                {task && (
                  <>
                    <StatusBadge status={isScheduled ? "SCHEDULED" : task.status} />
                    <PriorityBadge priority={task.priority} />
                  </>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="size-8 rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              >
                <X className="size-4" />
                <span className="sr-only">Fechar</span>
              </Button>
            </div>

            <DrawerTitle className="text-base sm:text-lg font-bold text-[var(--text-primary)] leading-snug">
              {loading ? (
                <Skeleton className="h-6 w-3/4" />
              ) : (
                task?.title || "Detalhes da tarefa"
              )}
            </DrawerTitle>

            <DrawerDescription
              render={<div />}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)] mt-1"
            >
              {loading ? (
                <Skeleton className="h-4 w-1/2" />
              ) : (
                <>
                  {task?.deadlineAt && (
                    <span className="inline-flex items-center gap-1 font-medium">
                      <Clock className="size-3 text-slate-400" />
                      Prazo:{" "}
                      {new Date(task.deadlineAt).toLocaleString("pt-BR", {
                        timeZone: task?.timezone ?? "America/Sao_Paulo",
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  )}
                </>
              )}
            </DrawerDescription>
          </DrawerHeader>

          {bodyContent}

          {footerContent && (
            <DrawerFooter className="px-4 sm:px-6 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--surface)] shrink-0 flex flex-col gap-2">
              {footerContent}
            </DrawerFooter>
          )}
        </DrawerContent>
      </Drawer>

      {impedimentModal}
    </>
  );
}
