"use client";

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
  startTaskAction,
  completeTaskAction,
  submitEvidenceAction,
  uploadEvidenceAction,
  type TaskDetailResult,
} from "@/presentation/actions/task-actions";
import {
  pauseTaskAction,
  resumeTaskAction,
  reportImpedimentAction,
  claimTaskAction,
} from "@/presentation/actions/management-task-actions";
import { StatusBadge, PriorityBadge, Modal } from "../shared";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Pause,
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
  FileUp,
  FileText,
  Hash,
  PenTool,
  Navigation,
  Clock,
  ChevronRight,
  ListTodo,
} from "lucide-react";

interface TaskDetailDrawerProps {
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskUpdated?: () => void;
}

const evidenceTypeMeta: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  PHOTO: { label: "Foto de comprovação", icon: Camera },
  VIDEO: { label: "Gravação de vídeo", icon: Video },
  FILE: { label: "Anexo de arquivo", icon: FileUp },
  TEXT: { label: "Relato escrito", icon: FileText },
  NUMBER: { label: "Medição / Valor", icon: Hash },
  SIGNATURE: { label: "Assinatura digital", icon: PenTool },
  LOCATION: { label: "Localização GPS", icon: Navigation },
};

export function EmployeeTaskDetailDrawer({
  taskId,
  open,
  onOpenChange,
  onTaskUpdated,
}: TaskDetailDrawerProps) {
  const router = useRouter();
  const [task, setTask] = useState<TaskDetailResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [dialog, setDialog] = useState<"pause" | "impediment" | null>(null);
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState("OUTROS");

  const loadTask = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getTaskDetailAction(id);
      if (res.error) {
        setError(res.error);
        setTask(null);
      } else if (res.task) {
        setTask(res.task);
      }
    } catch {
      setError("Não foi possível carregar os detalhes da tarefa.");
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && taskId) {
      loadTask(taskId);
      setNotice(null);
    } else if (!open) {
      const timer = setTimeout(() => {
        setTask(null);
        setError(null);
        setNotice(null);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [open, taskId, loadTask]);

  async function handleAction(
    action: () => Promise<{ success?: boolean; error?: string }>,
    options?: { closeOnSuccess?: boolean; successNotice?: string }
  ) {
    setActionBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await action();
      if (res.error) {
        setError(res.error);
      } else {
        setDialog(null);
        if (options?.successNotice) {
          setNotice(options.successNotice);
        }
        if (taskId) {
          await loadTask(taskId);
        }
        onTaskUpdated?.();
        router.refresh();
        if (options?.closeOnSuccess) {
          setTimeout(() => {
            onOpenChange(false);
          }, 600);
        }
      }
    } catch {
      setError("Erro ao executar ação. Verifique sua conexão e tente novamente.");
    } finally {
      setActionBusy(false);
    }
  }

  const isTerminal = task
    ? ["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(task.status)
    : false;
  const isScheduled = !!task?.scheduledDate && new Date(task.scheduledDate) > new Date();

  const evidencePendingCount = task
    ? task.evidenceRequirements.filter(
      (r) =>
        r.required &&
        r.submissions.filter((s) => s.validationStatus === "VALID").length < r.minQuantity &&
        r.submissions.filter((s) => s.validationStatus === "REJECTED").length < 3
    ).length
    : 0;

  const totalRequirements = task?.evidenceRequirements.length ?? 0;
  const completedRequirements =
    task?.evidenceRequirements.filter(
      (r) => r.submissions.filter((s) => s.validationStatus === "VALID").length >= r.minQuantity
    ).length ?? 0;

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        showSwipeHandle={true}
        swipeDirection="down"
      >
        <DrawerContent className="w-full h-[92dvh] max-h-[92dvh] sm:max-w-2xl sm:mx-auto border-t border-(--border-subtle) bg-surface text-(--text-primary) rounded-t-[24px] shadow-2xl flex flex-col focus:outline-none">
          <DrawerHeader className="relative px-5 pt-2 pb-3.5 border-b border-(--border-subtle) text-left shrink-0">
            <div className="flex items-center justify-between gap-3 pr-8">
              <DrawerClose
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-3.5 top-2.5 size-8 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-muted"
                  />
                }
              >
                <X className="size-4" />
                <span className="sr-only">Fechar</span>
              </DrawerClose>
            </div>

            <DrawerTitle className="text-base sm:text-lg font-bold leading-snug text-(--text-primary) mt-1.5 text-start!">
              {loading ? (
                <Skeleton className="h-6 w-3/4" />
              ) : (
                task?.title || "Detalhes da tarefa"
              )}
            </DrawerTitle>

            <DrawerDescription
              render={<div />}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-(--text-secondary) mt-1"
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
                        timeZone: "America/Sao_Paulo",
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  )}
                </>
              )}
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 flex flex-col gap-4">
            {error && (
              <Alert variant="destructive" className="py-2.5 shrink-0">
                <AlertCircle data-icon="inline-start" className="size-4" />
                <AlertDescription className="flex items-center justify-between gap-2 text-xs">
                  <span>{error}</span>
                  {taskId && !task && (
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
                  )}
                </AlertDescription>
              </Alert>
            )}

            {notice && (
              <Alert className="py-2.5 border-emerald-200 bg-emerald-50/80 text-emerald-900 text-xs shrink-0">
                <AlertDescription>{notice}</AlertDescription>
              </Alert>
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
              <div className="flex flex-col gap-3.5">
                <Skeleton className="h-32 w-full rounded-xl shrink-0" />
                <Skeleton className="h-44 w-full rounded-xl shrink-0" />
              </div>
            ) : task ? (
              <>
                <Card className="shrink-0 rounded-xl p-0 border border-(--border-subtle) bg-surface shadow-none overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50/80 dark:bg-muted/30 border-b border-(--border-subtle) flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ListTodo className="size-4 text-brand-900 dark:text-primary" />
                      <h3 className="font-bold text-xs uppercase tracking-wider text-(--text-primary)">
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

                    <div className="space-y-1.5">
                      <span className="font-semibold text-xs text-[var(--text-primary)] block">
                        Passo a passo:
                      </span>
                      <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-300 bg-slate-50/50 dark:bg-muted/10 p-3 rounded-lg border border-[var(--border-subtle)]">
                        {task.instructions ||
                          "Execute as ações indicadas no título e confirme com as comprovações abaixo."}
                      </p>
                    </div>

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

                <Card className="shrink-0 rounded-xl p-0 border border-(--border-subtle) bg-surface shadow-none overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50/80 dark:bg-muted/30 border-b border-(--border-subtle) flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileCheck2 className="size-4 text-brand-900 dark:text-primary" />
                      <h3 className="font-bold text-xs uppercase tracking-wider text-(--text-primary) line-clamp-1">
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
                        <DrawerEvidenceItem
                          key={req.id}
                          taskId={task.id}
                          requirement={req}
                          disabled={isTerminal || task.status === "BLOCKED" || !!task.isUnassigned}
                          onSuccess={async (msg) => {
                            setNotice(msg || "Comprovação enviada com sucesso!");
                            setError(null);
                            if (taskId) await loadTask(taskId);
                            onTaskUpdated?.();
                            router.refresh();
                          }}
                          onError={(err) => {
                            setError(err);
                          }}
                        />
                      ))
                    )}
                  </CardContent>
                </Card>

                {task.occurrences && task.occurrences.length > 0 && (
                  <Card className="shrink-0 rounded-xl border border-red-200 bg-red-50/20 shadow-none overflow-hidden">
                    <div className="px-4 py-2.5 bg-red-50/60 border-b border-red-200 flex items-center justify-between">
                      <span className="font-bold text-[11px] uppercase tracking-wide text-red-900">
                        Ocorrências registradas
                      </span>
                    </div>
                    <CardContent className="p-3.5 flex flex-col gap-2">
                      {task.occurrences.map((occ) => (
                        <div
                          key={occ.id}
                          className="p-2.5 rounded-lg bg-white dark:bg-card border border-red-200 text-xs flex flex-col gap-0.5"
                        >
                          <span className="font-semibold text-red-800">{occ.reason}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(occ.createdAt).toLocaleString("pt-BR", {
                              timeZone: "America/Sao_Paulo",
                            })}
                          </span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </>
            ) : null}
          </div>

          {/* Rodapé Fixo / Ações Operacionais */}
          {task && (
            <DrawerFooter className="px-4 sm:px-6 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--surface)] shrink-0 flex flex-col gap-2">
              {task.isUnassigned ? (
                <div className="flex flex-col gap-2">
                  <Button
                    className="w-full h-11 text-xs font-semibold rounded-xl bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)] cursor-pointer"
                    disabled={actionBusy}
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
                    Assumir esta tarefa
                  </Button>
                </div>
              ) : isScheduled ? (
                <p className="text-xs text-muted-foreground text-center py-1">
                  Esta tarefa será liberada em{" "}
                  {new Date(task.scheduledDate!).toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                  .
                </p>
              ) : task.status === "BLOCKED" ? (
                <p className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200 text-center font-medium">
                  Aguardando etapas anteriores para ser liberada.
                </p>
              ) : task.status === "PAUSED" ? (
                <div className="flex flex-col gap-2">
                  <Button
                    className="w-full h-11 text-xs font-semibold rounded-xl cursor-pointer"
                    disabled={actionBusy}
                    onClick={() =>
                      handleAction(() => resumeTaskAction(task.id), {
                        successNotice: "Tarefa retomada!",
                      })
                    }
                  >
                    {actionBusy ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <RotateCcw data-icon="inline-start" />
                    )}
                    Retomar tarefa
                  </Button>
                </div>
              ) : !isTerminal && task.status !== "SUBMITTED" ? (
                <div className="flex flex-col gap-2">
                  {task.status === "AVAILABLE" && (
                    <Button
                      variant="outline"
                      className="w-full h-10 text-xs font-semibold rounded-xl cursor-pointer"
                      disabled={actionBusy}
                      onClick={() =>
                        handleAction(() => startTaskAction(task.id), {
                          successNotice: "Cronômetro iniciado!",
                        })
                      }
                    >
                      {actionBusy && <Spinner data-icon="inline-start" />}
                      Iniciar execução
                    </Button>
                  )}

                  <Button
                    className="w-full h-11 text-xs font-semibold rounded-xl bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)] cursor-pointer"
                    disabled={actionBusy || evidencePendingCount > 0}
                    onClick={() =>
                      handleAction(() => completeTaskAction(task.id), {
                        closeOnSuccess: true,
                        successNotice: task.requiresApproval
                          ? "Enviado para aprovação!"
                          : "Tarefa concluída!",
                      })
                    }
                  >
                    {actionBusy ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <Check data-icon="inline-start" />
                    )}
                    {task.requiresApproval
                      ? "Enviar para aprovação"
                      : "Concluir tarefa"}
                  </Button>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 h-9 rounded-lg text-xs cursor-pointer"
                      disabled={actionBusy}
                      onClick={() => {
                        setReason("");
                        setDialog("pause");
                      }}
                    >
                      <Pause data-icon="inline-start" className="size-3.5" />
                      Pausar
                    </Button>
                    <Button
                      variant="ghost"
                      className="flex-1 h-9 rounded-lg text-xs text-red-600 hover:text-red-700 hover:bg-red-50 cursor-pointer"
                      disabled={actionBusy}
                      onClick={() => {
                        setReason("");
                        setDialog("impediment");
                      }}
                    >
                      Não foi possível realizar
                    </Button>
                  </div>
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
            </DrawerFooter>
          )}
        </DrawerContent>
      </Drawer>

      {/* Modal de Pausa ou Impedimento */}
      {dialog && task && (
        <Modal
          open={true}
          title={dialog === "pause" ? "Pausar tarefa" : "Registrar impedimento"}
          onClose={() => {
            if (!actionBusy) setDialog(null);
          }}
        >
          <form
            className="flex flex-col gap-4 text-xs"
            onSubmit={(e) => {
              e.preventDefault();
              handleAction(
                () =>
                  dialog === "pause"
                    ? pauseTaskAction(task.id, category, reason)
                    : reportImpedimentAction(task.id, category, reason),
                {
                  closeOnSuccess: dialog === "impediment",
                  successNotice:
                    dialog === "pause"
                      ? "Tarefa pausada."
                      : "Impedimento registrado. A gestão foi avisada.",
                }
              );
            }}
          >
            <p className="text-slate-600 leading-relaxed">
              {dialog === "pause"
                ? "O prazo continua correndo normalmente. Registre a justificativa da pausa."
                : "Utilize caso uma condição física ou operacional impeça a realização da tarefa. A atividade será cancelada como não realizada e a liderança avisada."}
            </p>

            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="reason-cat" className="text-xs">
                  Motivo
                </FieldLabel>
                <NativeSelect
                  id="reason-cat"
                  className="w-full text-xs"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {Object.entries({
                    OUTROS: "Outro motivo",
                    MATERIAL_FALTANTE: "Falta de materiais / insumos",
                    EQUIPAMENTO_QUEBRADO: "Equipamento com defeito",
                    ACESSO_BLOQUEADO: "Local inacessível / trancado",
                    INTERVALO: "Intervalo / Pausa de descanso",
                  }).map(([val, label]) => (
                    <NativeSelectOption key={val} value={val}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>

              <Field>
                <FieldLabel htmlFor="reason-desc" className="text-xs">
                  Detalhes do ocorrido
                </FieldLabel>
                <Textarea
                  id="reason-desc"
                  required
                  minLength={3}
                  maxLength={1000}
                  rows={3}
                  className="text-xs"
                  placeholder="Descreva o motivo com clareza..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
            </FieldGroup>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <Button
                type="button"
                variant="outline"
                disabled={actionBusy}
                onClick={() => setDialog(null)}
                className="text-xs h-9 cursor-pointer"
              >
                Voltar
              </Button>
              <Button
                disabled={actionBusy}
                type="submit"
                variant={dialog === "impediment" ? "destructive" : "default"}
                className="text-xs h-9 cursor-pointer"
              >
                {actionBusy && <Spinner data-icon="inline-start" />}
                {dialog === "pause" ? "Confirmar pausa" : "Confirmar impedimento"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

/**
 * Item individual de comprovação / evidência no Drawer
 */
function DrawerEvidenceItem({
  taskId,
  requirement: req,
  disabled,
  onSuccess,
  onError,
}: {
  taskId: string;
  requirement: TaskDetailResult["evidenceRequirements"][0];
  disabled: boolean;
  onSuccess: (msg?: string) => void;
  onError: (err: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [signed, setSigned] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);

  const meta = evidenceTypeMeta[req.type] || {
    label: req.type,
    icon: FileText,
  };
  const Icon = meta.icon;

  const valid = req.submissions.filter((s) => s.validationStatus === "VALID");
  const failures = req.submissions.filter((s) => s.validationStatus === "REJECTED").length;
  const isDone = valid.length >= req.minQuantity;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      let selectedFile = file;

      if (req.type === "SIGNATURE") {
        if (!signed || !canvasRef.current) {
          onError("Desenhe a assinatura no campo antes de enviar.");
          setBusy(false);
          return;
        }
        const blob = await new Promise<Blob | null>((resolve) =>
          canvasRef.current!.toBlob(resolve, "image/png")
        );
        if (blob) {
          selectedFile = new File([blob], "assinatura.png", { type: "image/png" });
        }
      }

      if (["PHOTO", "VIDEO", "FILE", "SIGNATURE"].includes(req.type)) {
        if (!selectedFile) {
          onError("Selecione um arquivo para enviar.");
          setBusy(false);
          return;
        }
        const formData = new FormData();
        formData.set("taskId", taskId);
        formData.set("requirementId", req.id);
        formData.set("file", selectedFile);
        const result = await uploadEvidenceAction(formData);
        if (result.error) {
          onError(result.error);
        } else {
          setFile(null);
          setValue("");
          onSuccess("Arquivo enviado!");
        }
      } else {
        const result = await submitEvidenceAction(taskId, req.id, value);
        if (result.error) {
          onError(result.error);
        } else {
          setValue("");
          onSuccess("Comprovação registrada!");
        }
      }
    } catch {
      onError("Não foi possível enviar a comprovação.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCaptureGps() {
    if (!navigator.geolocation) {
      onError("Este navegador não suporta geolocalização.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setValue(
          JSON.stringify({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          })
        );
        setBusy(false);
      },
      () => {
        onError("Não foi possível obter localização. Verifique as permissões de GPS.");
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  return (
    <div
      className={`p-3.5 rounded-xl border transition-colors ${isDone
        ? "bg-emerald-50/40 border-emerald-200 dark:bg-emerald-950/10 dark:border-emerald-900/40"
        : "bg-slate-50/60 dark:bg-muted/15 border-[var(--border-subtle)]"
        }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div
            className={`size-7 rounded-lg flex items-center justify-center shrink-0 ${isDone
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-100 text-slate-700 dark:bg-muted dark:text-foreground"
              }`}
          >
            <Icon className="size-3.5" />
          </div>
          <div>
            <h4 className="font-semibold text-xs text-[var(--text-primary)]">
              {meta.label}
            </h4>
            <span className="text-[10px] text-muted-foreground">
              {req.minQuantity > 1 ? `Exige ${req.minQuantity} envios` : "Envio único"}
            </span>
          </div>
        </div>

        <Badge
          variant={isDone ? "secondary" : "outline"}
          className={`text-[10px] font-semibold ${isDone
            ? "bg-emerald-100 text-emerald-800 border-emerald-200"
            : req.required
              ? "border-amber-300 text-amber-800 bg-amber-50"
              : "text-slate-500"
            }`}
        >
          {isDone ? "Concluída" : req.required ? "Obrigatória" : "Opcional"}
        </Badge>
      </div>

      {valid.map((s) => (
        <p key={s.id} className="text-xs text-muted-foreground break-all my-1.5 flex items-center gap-1.5">
          <Check className="size-3 text-emerald-600 shrink-0" />
          {s.storageKey ? (
            <a
              className="underline text-blue-600 hover:text-blue-800 font-medium"
              href={`/api/evidence/${s.id}`}
            >
              Visualizar {s.value || "comprovação"}
            </a>
          ) : (
            <span>{s.value}</span>
          )}
        </p>
      ))}

      {failures > 0 && !isDone && (
        <p className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200 my-1.5">
          {failures} envio(s) não atendido(s). Anexe uma nova comprovação.
        </p>
      )}

      {!isDone && !disabled && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5 mt-2">
          {["PHOTO", "VIDEO", "FILE"].includes(req.type) && (
            <div className="flex flex-col gap-1">
              <Input
                type="file"
                accept={
                  req.type === "PHOTO"
                    ? "image/jpeg,image/png,image/webp"
                    : req.type === "VIDEO"
                      ? "video/mp4"
                      : "image/jpeg,image/png,image/webp,application/pdf,video/mp4"
                }
                capture={req.type === "PHOTO" ? "environment" : undefined}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
                className="h-9 text-xs bg-white dark:bg-card file:text-xs file:font-semibold cursor-pointer"
              />
              <span className="text-[10px] text-muted-foreground">
                Formatos permitidos: {req.type === "VIDEO" ? "MP4" : "JPG, PNG, WebP ou PDF"} (máx. 10 MB)
              </span>
            </div>
          )}

          {["TEXT", "NUMBER"].includes(req.type) && (
            <div className="flex flex-col gap-1">
              {req.type === "TEXT" ? (
                <Textarea
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  required
                  rows={2}
                  className="text-xs bg-white dark:bg-card"
                  placeholder="Escreva a resposta ou observação aqui..."
                />
              ) : (
                <Input
                  type="number"
                  step="any"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  required
                  placeholder="Digite a medição numérica..."
                  className="h-9 text-xs! bg-white dark:bg-card"
                />
              )}
            </div>
          )}

          {req.type === "LOCATION" && (
            <div className="flex flex-col gap-1.5">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={handleCaptureGps}
                className="w-full text-xs h-9 cursor-pointer"
              >
                <Navigation data-icon="inline-start" className="size-3.5" />
                {value ? "Atualizar coordenadas GPS" : "Obter localização atual"}
              </Button>
              {value && (
                <span className="text-[11px] text-emerald-700 bg-emerald-50 p-1.5 rounded border border-emerald-200">
                  Localização capturada. Envie para confirmar.
                </span>
              )}
            </div>
          )}

          {req.type === "SIGNATURE" && (
            <div className="flex flex-col gap-1.5">
              <div className="border border-slate-300 dark:border-border rounded-lg overflow-hidden bg-white">
                <canvas
                  ref={canvasRef}
                  width={500}
                  height={130}
                  aria-label="Área de assinatura"
                  className="touch-none w-full h-[110px] bg-white cursor-crosshair block"
                  onPointerDown={(e) => {
                    isDrawing.current = true;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ctx = e.currentTarget.getContext("2d");
                    if (ctx) {
                      ctx.beginPath();
                      ctx.moveTo(
                        ((e.clientX - rect.left) * 500) / rect.width,
                        ((e.clientY - rect.top) * 130) / rect.height
                      );
                    }
                  }}
                  onPointerMove={(e) => {
                    if (!isDrawing.current) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ctx = e.currentTarget.getContext("2d");
                    if (ctx) {
                      ctx.lineWidth = 2.5;
                      ctx.strokeStyle = "#0f172a";
                      ctx.lineCap = "round";
                      ctx.lineJoin = "round";
                      ctx.lineTo(
                        ((e.clientX - rect.left) * 500) / rect.width,
                        ((e.clientY - rect.top) * 130) / rect.height
                      );
                      ctx.stroke();
                      setSigned(true);
                    }
                  }}
                  onPointerUp={() => {
                    isDrawing.current = false;
                  }}
                  onPointerCancel={() => {
                    isDrawing.current = false;
                  }}
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground">
                  Desenhe com o dedo ou ponteiro
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 px-2 text-slate-500 cursor-pointer"
                  onClick={() => {
                    const ctx = canvasRef.current?.getContext("2d");
                    ctx?.clearRect(0, 0, 500, 130);
                    setSigned(false);
                  }}
                >
                  Limpar
                </Button>
              </div>
            </div>
          )}

          <Button
            type="submit"
            variant="outline"
            disabled={busy || (req.type === "LOCATION" && !value)}
            className="w-full text-xs h-9 font-semibold cursor-pointer"
          >
            {busy ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Send data-icon="inline-start" className="size-3.5" />
            )}
            Registrar envio
          </Button>
        </form>
      )}
    </div>
  );
}
