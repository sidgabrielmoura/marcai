"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
import { LogoLoader } from "@/components/loader/logo-loader";
import {
  getEmployeeProcessExecutionAction,
  completeProcessExecutionAction,
  type EmployeeProcessExecutionDetail,
  type EmployeeProcessTaskItem,
} from "@/presentation/actions/process-actions";
import {
  completeTaskAction,
  uploadTaskFormFileAction,
  uploadEvidenceAction,
} from "@/presentation/actions/task-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Check,
  CheckCircle2,
  CheckCheck,
  Lock,
  ArrowLeft,
  ArrowRight,
  Clock,
  Sparkles,
  Camera,
  Video,
  Paperclip,
  FileText,
  AlertCircle,
  HelpCircle,
  Layers,
  ChevronRight,
  Send,
  Star,
  X,
} from "lucide-react";

interface EmployeeProcessDetailDrawerProps {
  executionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}

export function EmployeeProcessDetailDrawer({
  executionId,
  open,
  onOpenChange,
  onUpdated,
}: EmployeeProcessDetailDrawerProps) {
  const router = useRouter();
  const [execution, setExecution] = useState<EmployeeProcessExecutionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedTask, setSelectedTask] = useState<EmployeeProcessTaskItem | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [completingProcess, setCompletingProcess] = useState(false);

  // Estados de formulário/evidências para a tarefa ativa (View 2)
  const [formAnswers, setFormAnswers] = useState<Record<string, any>>({});
  const [fileUploads, setFileUploads] = useState<Record<string, File | null>>({});
  const [filePreviews, setFilePreviews] = useState<Record<string, string>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const loadExecution = useCallback(
    async (silent = false) => {
      if (!executionId) return;
      if (!silent) setLoading(true);
      try {
        const res = await getEmployeeProcessExecutionAction(executionId);
        if (res.error) {
          toast.add({
            title: "Erro ao carregar processo",
            description: res.error,
            type: "error",
          });
        } else if (res.execution) {
          setExecution(res.execution);
          // Se tiver uma tarefa selecionada, atualizar seu estado
          if (selectedTask) {
            const updated = res.execution.tasks.find((t) => t.id === selectedTask.id);
            if (updated) setSelectedTask(updated);
          }
        }
      } catch {
        toast.add({
          title: "Erro inesperado",
          description: "Não foi possível carregar os detalhes do processo.",
          type: "error",
        });
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [executionId, selectedTask]
  );

  useEffect(() => {
    if (open && executionId) {
      setLoading(true);
      setSelectedTask(null);
      void loadExecution();
    } else {
      setLoading(false);
      setExecution(null);
      setSelectedTask(null);
    }
  }, [open, executionId]);

  // Totalizadores de progresso
  const totalTasks = execution?.tasks.length ?? 0;
  const completedTasks = execution?.tasks.filter((t) => t.status === "COMPLETED").length ?? 0;
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const allCompleted = totalTasks > 0 && completedTasks === totalTasks;

  // Abrir uma tarefa para execução (View 2)
  const handleOpenTask = (task: EmployeeProcessTaskItem) => {
    if (task.isBlocked) {
      toast.add({
        title: "Etapa bloqueada",
        description:
          execution?.orderRule === "STRICT"
            ? "Conclua a etapa anterior antes de iniciar esta."
            : "Esta tarefa possui dependências que ainda não foram concluídas.",
        type: "warning",
      });
      return;
    }

    setSelectedTask(task);
    // Inicializar respostas prévias se existirem
    if (task.formAnswers && typeof task.formAnswers === "object") {
      setFormAnswers(task.formAnswers);
    } else {
      setFormAnswers({});
    }
    setFileUploads({});
    setFilePreviews({});
  };

  // Voltar para a lista de tarefas do processo (View 1)
  const handleBackToList = () => {
    setSelectedTask(null);
    setFileUploads({});
    setFilePreviews({});
  };

  // Concluir a tarefa selecionada
  const handleCompleteCurrentTask = async () => {
    if (!selectedTask) return;

    if (selectedTask.scheduledDate && new Date(selectedTask.scheduledDate) > new Date()) {
      const timeFormatted = new Date(selectedTask.scheduledDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      toast.add({
        title: "Aguardando horário",
        description: `Esta tarefa está agendada para às ${timeFormatted} e só pode ser concluída a partir do horário agendado.`,
        type: "warning",
      });
      return;
    }

    setActionBusy(true);

    try {
      // 1. Validar campos de formulário obrigatórios (se taskType === "FORM")
      if (selectedTask.taskType === "FORM" && Array.isArray(selectedTask.formFields)) {
        for (const field of selectedTask.formFields) {
          if (field.required) {
            const answer = formAnswers[field.id];
            const hasUpload = !!fileUploads[field.id];
            if (
              (answer === undefined || answer === null || answer === "") &&
              !hasUpload
            ) {
              toast.add({
                title: "Perguntas pendentes",
                description: `A pergunta "${field.question || field.label}" é obrigatória.`,
                type: "error",
              });
              setActionBusy(false);
              return;
            }
          }
        }
      }

      // 2. Fazer upload de arquivos/fotos/vídeos de perguntas
      const finalAnswers = { ...formAnswers };
      if (selectedTask.taskType === "FORM" && Array.isArray(selectedTask.formFields)) {
        for (const field of selectedTask.formFields) {
          const file = fileUploads[field.id];
          if (file) {
            const formData = new FormData();
            formData.set("file", file);
            formData.set("taskId", selectedTask.id);
            formData.set("fieldId", field.id);
            formData.set("fileType", field.type);
            const uploadRes = await uploadTaskFormFileAction(formData);
            if (uploadRes.error || !uploadRes.storageKey) {
              toast.add({
                title: `Erro ao enviar ${
                  field.type === "PHOTO"
                    ? "foto"
                    : field.type === "VIDEO"
                    ? "vídeo"
                    : "arquivo"
                }`,
                description: uploadRes.error || "Falha no upload do arquivo.",
                type: "error",
              });
              setActionBusy(false);
              return;
            }
            finalAnswers[field.id] = {
              storageKey: uploadRes.storageKey,
              fileName: uploadRes.fileName,
              fileSize: uploadRes.fileSize,
              mimeType: uploadRes.mimeType,
              type: field.type,
            };
          }
        }
      }

      // 3. Enviar conclusão da tarefa
      const res = await completeTaskAction(
        selectedTask.id,
        selectedTask.taskType === "FORM" ? finalAnswers : undefined
      );

      if (res.error) {
        toast.add({
          title: "Erro ao concluir etapa",
          description: res.error,
          type: "error",
        });
      } else {
        toast.add({
          title: "Etapa concluída!",
          description: `A tarefa "${selectedTask.title}" foi concluída com sucesso.`,
          type: "success",
        });

        // Recarregar os dados do processo
        await loadExecution(true);
        if (onUpdated) onUpdated();
        router.refresh();

        // Volta para a View 1 (Lista de tarefas)
        setSelectedTask(null);
      }
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Ocorreu um erro ao concluir a etapa.",
        type: "error",
      });
    } finally {
      setActionBusy(false);
    }
  };

  // Concluir o processo como um todo
  const handleCompleteProcess = async () => {
    if (!executionId) return;
    if (!allCompleted) {
      toast.add({
        title: "Processo incompleto",
        description: "Você precisa concluir todas as tarefas antes de finalizar o processo.",
        type: "warning",
      });
      return;
    }

    setCompletingProcess(true);
    try {
      const res = await completeProcessExecutionAction(executionId);
      if (res.error) {
        toast.add({
          title: "Erro ao concluir processo",
          description: res.error,
          type: "error",
        });
      } else {
        toast.add({
          title: "Processo concluído com sucesso! 🎉",
          description: `Todas as ${totalTasks} etapas foram cumpridas com sucesso.`,
          type: "success",
        });
        if (onUpdated) onUpdated();
        router.refresh();
        onOpenChange(false);
      }
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Não foi possível concluir o processo.",
        type: "error",
      });
    } finally {
      setCompletingProcess(false);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      showSwipeHandle={true}
      swipeDirection="down"
    >
      <DrawerContent className="w-full h-[92dvh] max-h-[92dvh] sm:max-w-2xl sm:mx-auto border-t border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--text-primary)] rounded-t-[24px] shadow-2xl flex flex-col focus:outline-none">
        {loading ? (
          <div className="flex flex-col h-full w-full">
            <DrawerHeader className="relative px-5 pt-2 pb-3.5 border-b border-[var(--border-subtle)] text-left shrink-0">
              <div className="flex items-center justify-between gap-3 pr-8">
                <DrawerClose
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-3.5 top-2.5 size-8 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-muted cursor-pointer"
                    />
                  }
                >
                  <X className="size-4" />
                  <span className="sr-only">Fechar</span>
                </DrawerClose>
              </div>
              <Skeleton className="h-6 w-3/4 mt-2" />
              <Skeleton className="h-4 w-1/2 mt-1" />
            </DrawerHeader>
            <div className="flex-1 flex flex-col items-center justify-center p-12 gap-3 min-h-[300px]">
              <LogoLoader size={64} text="Carregando tarefas do processo..." />
            </div>
          </div>
        ) : !execution ? (
          <div className="flex flex-col h-full w-full">
            <DrawerHeader className="relative px-5 pt-2 pb-3.5 border-b border-[var(--border-subtle)] text-left shrink-0">
              <div className="flex items-center justify-between gap-3 pr-8">
                <DrawerClose
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-3.5 top-2.5 size-8 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-muted cursor-pointer"
                    />
                  }
                >
                  <X className="size-4" />
                  <span className="sr-only">Fechar</span>
                </DrawerClose>
              </div>
              <DrawerTitle className="text-base font-bold text-[var(--brand-900)] mt-1.5">
                Processo
              </DrawerTitle>
            </DrawerHeader>
            <div className="p-8 text-center text-xs text-slate-500 flex-1 flex items-center justify-center">
              Processo não encontrado.
            </div>
          </div>
        ) : selectedTask ? (
          /* ==============================================================
             VIEW 2: EXECUÇÃO DA TAREFA ESPECÍFICA DO PROCESSO
             ============================================================== */
          <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
            <DrawerHeader className="relative px-5 pt-2 pb-3.5 border-b border-[var(--border-subtle)] text-left shrink-0">
              <div className="flex items-center justify-between gap-2 mb-2 pr-8">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleBackToList}
                  className="h-8 px-2 text-xs font-semibold text-[var(--brand-900)] hover:bg-slate-100 dark:hover:bg-muted/40 gap-1.5 -ml-2 cursor-pointer"
                >
                  <ArrowLeft className="size-4" />
                  <span>Voltar para o processo</span>
                </Button>

                <Badge
                  variant="outline"
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-muted dark:text-slate-300"
                >
                  Etapa {selectedTask.orderIndex} de {totalTasks}
                </Badge>
              </div>

              <DrawerClose
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-3.5 top-2.5 size-8 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-muted cursor-pointer"
                  />
                }
              >
                <X className="size-4" />
                <span className="sr-only">Fechar</span>
              </DrawerClose>

              <DrawerTitle className="text-base sm:text-lg font-bold leading-snug text-[var(--brand-900)] dark:text-foreground text-left">
                {selectedTask.title}
              </DrawerTitle>
              {selectedTask.description && (
                <DrawerDescription className="text-xs text-[var(--text-secondary)] text-left mt-0.5">
                  {selectedTask.description}
                </DrawerDescription>
              )}
            </DrawerHeader>

            <div className="p-5 flex flex-col gap-4 flex-1 overflow-y-auto">
              {/* Orientações ou Instruções se houver */}
              {selectedTask.instructions && (
                <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 text-blue-950 dark:text-blue-100">
                  <span className="font-semibold block mb-1 text-[11px] uppercase tracking-wide text-blue-800 dark:text-blue-300">
                    Orientações da etapa
                  </span>
                  <p className="font-medium text-xs whitespace-pre-line leading-relaxed">
                    {selectedTask.instructions}
                  </p>
                </div>
              )}

              {/* Se for Tarefa com Perguntas (taskType === 'FORM') */}
              {selectedTask.taskType === "FORM" &&
                Array.isArray(selectedTask.formFields) && (
                  <div className="space-y-4 pt-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--brand-900)] dark:text-foreground">
                      <FileText className="size-4 text-purple-600" />
                      <span>Responda às perguntas desta etapa:</span>
                    </div>

                    {selectedTask.formFields.map((field: any, idx: number) => (
                      <div
                        key={field.id}
                        className="p-3.5 bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl flex flex-col gap-2.5 shadow-2xs"
                      >
                        <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 leading-snug">
                          {idx + 1}. {field.question || field.label}{" "}
                          {field.required && (
                            <span className="text-red-500">*</span>
                          )}
                        </label>

                        {field.type === "SHORT_TEXT" && (
                          <Input
                            value={formAnswers[field.id] || ""}
                            onChange={(e) =>
                              setFormAnswers((prev) => ({
                                ...prev,
                                [field.id]: e.target.value,
                              }))
                            }
                            placeholder="Sua resposta..."
                            className="text-xs h-10"
                            disabled={selectedTask.status === "COMPLETED" || actionBusy}
                          />
                        )}

                        {field.type === "LONG_TEXT" && (
                          <Textarea
                            value={formAnswers[field.id] || ""}
                            onChange={(e) =>
                              setFormAnswers((prev) => ({
                                ...prev,
                                [field.id]: e.target.value,
                              }))
                            }
                            placeholder="Descreva sua resposta com detalhes..."
                            className="text-xs resize-none"
                            rows={3}
                            disabled={selectedTask.status === "COMPLETED" || actionBusy}
                          />
                        )}

                        {field.type === "RATING" && (
                          <div className="flex gap-2 items-center">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                disabled={selectedTask.status === "COMPLETED" || actionBusy}
                                onClick={() =>
                                  setFormAnswers((prev) => ({
                                    ...prev,
                                    [field.id]: star,
                                  }))
                                }
                                className={`size-10 rounded-full flex items-center justify-center border transition-all ${
                                  formAnswers[field.id] === star
                                    ? "bg-amber-100 border-amber-400 text-amber-600 shadow-2xs scale-105"
                                    : "bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100"
                                }`}
                              >
                                <Star
                                  className="size-5 fill-current"
                                  strokeWidth={1.5}
                                />
                              </button>
                            ))}
                          </div>
                        )}

                        {field.type === "BOOLEAN" && (
                          <div className="flex gap-2">
                            {["SIM", "NÃO"].map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                disabled={selectedTask.status === "COMPLETED" || actionBusy}
                                onClick={() =>
                                  setFormAnswers((prev) => ({
                                    ...prev,
                                    [field.id]: opt === "SIM",
                                  }))
                                }
                                className={`flex-1 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                                  formAnswers[field.id] === (opt === "SIM")
                                    ? "bg-[var(--brand-900)] text-white border-[var(--brand-900)]"
                                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                                }`}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        )}

                        {field.type === "MULTIPLE_CHOICE" &&
                          Array.isArray(field.options) && (
                            <div className="flex flex-col gap-1.5">
                              {field.options.map((opt: string, optIdx: number) => (
                                <button
                                  key={optIdx}
                                  type="button"
                                  disabled={selectedTask.status === "COMPLETED" || actionBusy}
                                  onClick={() =>
                                    setFormAnswers((prev) => ({
                                      ...prev,
                                      [field.id]: opt,
                                    }))
                                  }
                                  className={`px-3 py-2.5 rounded-xl border text-left text-xs font-medium transition-all ${
                                    formAnswers[field.id] === opt
                                      ? "bg-purple-50 text-purple-900 border-purple-300 font-semibold shadow-2xs"
                                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                                  }`}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          )}

                        {/* Upload de Fotos, Vídeos ou Arquivos como resposta */}
                        {(field.type === "PHOTO" ||
                          field.type === "VIDEO" ||
                          field.type === "FILE") && (
                          <div>
                            <input
                              type="file"
                              ref={(el) => {
                                fileInputRefs.current[field.id] = el;
                              }}
                              accept={
                                field.type === "PHOTO"
                                  ? "image/*"
                                  : field.type === "VIDEO"
                                  ? "video/*"
                                  : "*/*"
                              }
                              capture={
                                field.type === "PHOTO"
                                  ? "environment"
                                  : field.type === "VIDEO"
                                  ? "environment"
                                  : undefined
                              }
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  setFileUploads((prev) => ({
                                    ...prev,
                                    [field.id]: file,
                                  }));
                                  if (file.type.startsWith("image/")) {
                                    setFilePreviews((prev) => ({
                                      ...prev,
                                      [field.id]: URL.createObjectURL(file),
                                    }));
                                  }
                                }
                              }}
                            />

                            {filePreviews[field.id] ? (
                              <div className="relative rounded-xl overflow-hidden border border-slate-200 mt-1 max-h-48 w-full bg-black/5 flex items-center justify-center">
                                <img
                                  src={filePreviews[field.id]}
                                  alt="Preview"
                                  className="w-full h-auto max-h-48 object-contain"
                                />
                                {selectedTask.status !== "COMPLETED" && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFileUploads((prev) => ({
                                        ...prev,
                                        [field.id]: null,
                                      }));
                                      setFilePreviews((prev) => ({
                                        ...prev,
                                        [field.id]: "",
                                      }));
                                    }}
                                    className="absolute top-2 right-2 size-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ) : fileUploads[field.id] ? (
                              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                                <span className="truncate max-w-[200px]">
                                  {fileUploads[field.id]?.name}
                                </span>
                                {selectedTask.status !== "COMPLETED" && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setFileUploads((prev) => ({
                                        ...prev,
                                        [field.id]: null,
                                      }))
                                    }
                                    className="text-red-500 font-bold hover:underline"
                                  >
                                    Remover
                                  </button>
                                )}
                              </div>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                disabled={selectedTask.status === "COMPLETED" || actionBusy}
                                onClick={() => fileInputRefs.current[field.id]?.click()}
                                className="w-full h-11 border-dashed border-slate-300 text-xs font-semibold flex items-center justify-center gap-2"
                              >
                                {field.type === "PHOTO" ? (
                                  <Camera className="size-4 text-purple-600" />
                                ) : field.type === "VIDEO" ? (
                                  <Video className="size-4 text-purple-600" />
                                ) : (
                                  <Paperclip className="size-4 text-purple-600" />
                                )}
                                <span>
                                  {field.type === "PHOTO"
                                    ? "Tirar foto / Anexar imagem"
                                    : field.type === "VIDEO"
                                    ? "Gravar vídeo / Anexar vídeo"
                                    : "Anexar arquivo"}
                                </span>
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
            </div>

            <DrawerFooter className="px-5 py-4 border-t border-[var(--border-subtle)] bg-[var(--surface)] shrink-0 flex flex-row items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleBackToList}
                disabled={actionBusy}
                className="flex-1 h-11 text-xs font-semibold rounded-xl"
              >
                Voltar
              </Button>

              {selectedTask.status === "COMPLETED" ? (
                <div className="flex-2 flex items-center justify-center h-11 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl">
                  Etapa já concluída
                </div>
              ) : selectedTask.scheduledDate && new Date(selectedTask.scheduledDate) > new Date() ? (
                <div className="flex-2 flex items-center justify-center h-11 text-xs font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded-xl cursor-not-allowed select-none gap-1.5">
                  <Clock className="size-4 text-slate-400" />
                  <span>Aguardando horário</span>
                </div>
              ) : (
                <Button
                  type="button"
                  onClick={handleCompleteCurrentTask}
                  disabled={actionBusy}
                  className="flex-2 h-11 bg-[var(--brand-900)] text-white hover:bg-[var(--brand-900)]/90 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                >
                  {actionBusy ? (
                    <Spinner className="size-4 text-white" />
                  ) : (
                    <Check className="size-4 text-white" />
                  )}
                  <span>Concluir etapa</span>
                </Button>
              )}
            </DrawerFooter>
          </div>
        ) : (
          /* ==============================================================
             VIEW 1: LISTA DAS TAREFAS DO PROCESSO EMPILHADAS
             ============================================================== */
          <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
            <DrawerHeader className="relative px-5 pt-2 pb-3.5 border-b border-[var(--border-subtle)] text-left shrink-0">
              <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap pr-8">
                <Badge
                  variant="outline"
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-soft text-[var(--brand-900)] border-brand-200 flex items-center gap-1"
                >
                  <Layers className="size-3" />
                  Processo
                </Badge>

                {allCompleted ? (
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="size-3 text-emerald-600" />
                    100% Concluído
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full text-slate-700 bg-slate-50 border-slate-200"
                  >
                    {completedTasks} de {totalTasks} concluídas
                  </Badge>
                )}
              </div>

              <DrawerClose
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-3.5 top-2.5 size-8 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-muted cursor-pointer"
                  />
                }
              >
                <X className="size-4" />
                <span className="sr-only">Fechar</span>
              </DrawerClose>

              <DrawerTitle className="text-base sm:text-lg font-bold leading-snug text-[var(--brand-900)] dark:text-foreground text-left mt-0.5">
                {execution.processName}
              </DrawerTitle>

              {execution.locationName && (
                <DrawerDescription className="text-xs text-[var(--text-secondary)] text-left mt-0.5">
                  {execution.locationName}
                </DrawerDescription>
              )}

              {/* Barra de Progresso Visual Minimalista */}
              <div className="mt-3 space-y-1.5">
                <div className="flex justify-between items-center text-[11px] font-medium text-[var(--text-secondary)]">
                  <span>Progresso do checklist</span>
                  <span className="font-bold text-[var(--text-primary)]">
                    {progressPercent}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-muted overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 rounded-full ${
                      allCompleted
                        ? "bg-emerald-500"
                        : "bg-[var(--brand-900)]"
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Dica da Regra de Ordem */}
              <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] font-medium">
                <HelpCircle className="size-3 text-slate-400 shrink-0" />
                <span>
                  {execution.orderRule === "STRICT"
                    ? "Sequência restrita: conclua as etapas na ordem."
                    : execution.orderRule === "CUSTOM"
                    ? "Sequência com dependências: cumpra as etapas liberadas."
                    : "Ordem livre: você pode realizar qualquer tarefa disponível."}
                </span>
              </div>
            </DrawerHeader>

            {/* Lista Vertical de Cards de Tarefas Empilhados */}
            <div className="p-5 flex flex-col gap-2.5 flex-1 overflow-y-auto">
              {execution.tasks.map((task) => {
                const isCompleted = task.status === "COMPLETED";
                const isBlocked = task.isBlocked;

                if (isCompleted) {
                  /* Layout Minimalista Verdinho com Check */
                  return (
                    <div
                      key={task.id}
                      onClick={() => handleOpenTask(task)}
                      className="p-3.5 rounded-xl border border-emerald-200/90 bg-emerald-50/70 dark:bg-emerald-950/20 dark:border-emerald-800/60 flex items-center justify-between gap-3 transition-all cursor-pointer hover:bg-emerald-100/60 shadow-2xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="size-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-2xs">
                          <Check className="size-3.5 stroke-[2.5]" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-semibold text-xs text-emerald-950 dark:text-emerald-100 truncate">
                            {task.title}
                          </h4>
                          <p className="text-[10px] text-emerald-700/80 dark:text-emerald-300/80 font-medium mt-0.5">
                            Concluída com sucesso
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {task.taskType === "FORM" && (
                          <span className="text-[10px] font-bold text-purple-700 bg-purple-100 dark:bg-purple-950/40 dark:text-purple-300 px-1.5 py-0.5 rounded">
                            Com Perguntas
                          </span>
                        )}
                        <ChevronRight className="size-4 text-emerald-600/70" />
                      </div>
                    </div>
                  );
                }

                if (isBlocked) {
                  /* Layout Apagado com Efeito Desabilitado e Cadeado */
                  return (
                    <div
                      key={task.id}
                      onClick={() => handleOpenTask(task)}
                      className="p-3.5 rounded-xl border border-dashed border-slate-200 dark:border-border bg-slate-50/70 dark:bg-slate-900/30 opacity-55 flex items-center justify-between gap-3 select-none cursor-not-allowed"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="size-6 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0">
                          <Lock className="size-3" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-medium text-xs text-slate-600 dark:text-slate-400 truncate">
                            {task.title}
                          </h4>
                          <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                            Aguardando etapa anterior
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Lock className="size-3 text-slate-400" />
                      </div>
                    </div>
                  );
                }

                /* Layout Agendado para Horário Futuro */
                const isTaskScheduled = !!task.scheduledDate && new Date(task.scheduledDate) > new Date();
                if (isTaskScheduled) {
                  return (
                    <div
                      key={task.id}
                      onClick={() => handleOpenTask(task)}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-border bg-slate-50/70 dark:bg-slate-900/30 opacity-75 grayscale contrast-90 flex items-center justify-between gap-3 cursor-pointer select-none transition-all hover:bg-slate-100/60"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="size-6 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500 font-bold text-xs flex items-center justify-center shrink-0">
                          {task.orderIndex}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-semibold text-xs text-slate-700 dark:text-slate-300 truncate">
                            {task.title}
                          </h4>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
                            <Clock className="size-3 text-slate-400" />
                            <span>
                              Aguardando horário (inicia às{" "}
                              {new Date(task.scheduledDate!).toLocaleTimeString("pt-BR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              )
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 text-slate-400">
                        <ChevronRight className="size-4" />
                      </div>
                    </div>
                  );
                }

                /* Layout Ativo e Disponível */
                return (
                  <div
                    key={task.id}
                    onClick={() => handleOpenTask(task)}
                    className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] hover:bg-slate-50/80 dark:hover:bg-muted/40 cursor-pointer flex items-center justify-between gap-3 shadow-2xs hover:border-[var(--brand-700)] transition-all group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-6 rounded-full bg-brand-soft border border-brand-200 text-[var(--brand-900)] font-bold text-xs flex items-center justify-center shrink-0">
                        {task.orderIndex}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-xs text-[var(--brand-900)] dark:text-foreground truncate group-hover:text-[var(--brand-700)]">
                          {task.title}
                        </h4>
                        <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)] mt-0.5">
                          <span className="font-semibold text-blue-600">
                            Disponível para execução
                          </span>
                          {task.taskType === "FORM" && (
                            <>
                              <span>·</span>
                              <span className="text-purple-600 font-medium">
                                Tarefa com Perguntas
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 text-[var(--brand-900)] group-hover:translate-x-0.5 transition-transform">
                      <span className="text-xs font-semibold hidden sm:inline">
                        Iniciar
                      </span>
                      <ArrowRight className="size-4" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Rodapé: Botão de Concluir Processo */}
            <DrawerFooter className="px-5 py-4 border-t border-[var(--border-subtle)] bg-[var(--surface)] shrink-0">
              {execution.scheduledAt && new Date(execution.scheduledAt) > new Date() ? (
                <div className="w-full h-12 rounded-xl text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200 dark:bg-muted dark:text-slate-400 flex items-center justify-center gap-2 cursor-not-allowed select-none">
                  <Clock className="size-4 text-slate-400" />
                  <span>
                    Aguardando horário do processo (inicia às{" "}
                    {new Date(execution.scheduledAt).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    )
                  </span>
                </div>
              ) : (
                <Button
                  type="button"
                  onClick={handleCompleteProcess}
                  disabled={!allCompleted || completingProcess}
                  className={`w-full h-12 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    allCompleted
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm cursor-pointer scale-[1.01]"
                      : "bg-slate-100 text-slate-400 border border-slate-200 dark:bg-muted dark:text-slate-500 cursor-not-allowed"
                  }`}
                >
                  {completingProcess ? (
                    <Spinner className="size-4 text-white" />
                  ) : allCompleted ? (
                    <CheckCheck className="size-4 text-white" />
                  ) : (
                    <Lock className="size-3.5 text-slate-400" />
                  )}
                  <span>
                    {allCompleted
                      ? "Concluir processo"
                      : `Concluir processo (${completedTasks} de ${totalTasks} concluídas)`}
                  </span>
                </Button>
              )}
            </DrawerFooter>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
