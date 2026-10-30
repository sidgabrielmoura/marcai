"use client";

import { useEffect, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  getManagementTaskDrawerAction,
  type ManagementTaskDrawerResult,
  cancelTaskAction,
  trashTaskAction,
  submitApprovalDecisionAction,
  reassignTaskAction,
  getEligibleMembersForTaskAction,
} from "@/presentation/actions/management-task-actions";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { StatusBadge, PriorityBadge } from "../shared";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { LogoLoader } from "@/components/loader/logo-loader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  X,
  RefreshCw,
  MapPin,
  Users,
  Clock,
  FileCheck2,
  Activity,
  Check,
  ExternalLink,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ListTodo,
  ChevronRight,
  UserCheck,
  ClipboardList,
  Camera,
  Video,
  Paperclip,
  Download,
  Star,
  Copy,
} from "lucide-react";
import { copyTaskToClipboard } from "@/presentation/utils/task-clipboard";

interface ManagementTaskDrawerProps {
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskUpdated?: () => void;
  userRole: string;
  initialReassign?: boolean;
}

import { TaskActivityHistory } from "./task-activity-history";
import {
  formatDateInTimezone,
  formatDateTimeInTimezone,
  formatTimeInTimezone,
} from "@/domain/rules/date-time";

function fmtDate(iso: string, timezone?: string) {
  return formatDateTimeInTimezone(iso, timezone);
}

function fmtDuration(secs: number | null): string {
  if (!secs) return "—";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

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

function formatOccurrenceCategory(category: string, type: string): string {
  if (type === "SLA_BREACH" || category.startsWith("SLA_")) {
    const mins = parseInt(category.replace(/^SLA_/, ""), 10);
    if (isNaN(mins) || mins === 0) return "Término do prazo limite";
    if (mins >= 60 && mins % 60 === 0) {
      const h = mins / 60;
      return `Atraso de ${h} ${h === 1 ? "hora" : "horas"}`;
    }
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `Atraso de ${h}h ${m}min`;
    }
    return `Atraso de ${mins} minutos`;
  }
  const labels: Record<string, string> = {
    MATERIAL_FALTANTE: "Falta de materiais / insumos",
    EQUIPAMENTO_QUEBRADO: "Equipamento com defeito",
    ACESSO_BLOQUEADO: "Local inacessível / trancado",
    OUTROS: "Impedimento operacional",
  };
  return labels[category] || category;
}

function formatSeverity(severity: string): { label: string; badgeClass: string } {
  switch (severity) {
    case "CRITICAL":
      return { label: "Crítica", badgeClass: "bg-red-100 text-red-800 border-red-200" };
    case "HIGH":
      return { label: "Alta", badgeClass: "bg-rose-100 text-rose-800 border-rose-200" };
    case "MEDIUM":
      return { label: "Média", badgeClass: "bg-slate-100 text-slate-800 border-slate-300" };
    case "LOW":
      return { label: "Baixa", badgeClass: "bg-slate-100 text-slate-700 border-slate-200" };
    default:
      return { label: severity, badgeClass: "bg-slate-100 text-slate-700 border-slate-200" };
  }
}

function cleanReason(reason: string): string {
  return reason
    .replace(/O prazo de SLA foi excedido\.?/gi, "O prazo de execução foi excedido.")
    .replace(/SLA excedido há/gi, "Prazo limite excedido há")
    .replace(/SLA excedido/gi, "Prazo limite excedido")
    .replace(/\bSLA\b/g, "prazo limite");
}

export function ManagementTaskDrawer({
  taskId,
  open,
  onOpenChange,
  onTaskUpdated,
  userRole,
  initialReassign = false,
}: ManagementTaskDrawerProps) {
  const router = useRouter();
  const [task, setTask] = useState<ManagementTaskDrawerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showTrashAlert, setShowTrashAlert] = useState(false);
  const [approvalStep, setApprovalStep] = useState<{
    stepId: string;
    decision: "APPROVED" | "REJECTED";
  } | null>(null);
  const [approvalNote, setApprovalNote] = useState("");

  // Reatribuição e Renovação de Prazo
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignMemberId, setReassignMemberId] = useState("");
  const [reassignDeadlineType, setReassignDeadlineType] = useState<"15" | "30" | "60" | "120" | "eod" | "custom">("60");
  const [reassignCustomDate, setReassignCustomDate] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [eligibleMembers, setEligibleMembers] = useState<
    Array<{ id: string; name: string; role: string; availability: string }>
  >([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [drawerOccurrencesOpen, setDrawerOccurrencesOpen] = useState(false);

  function getDeadlinePreview(type: string, customDate: string) {
    const now = new Date();
    let target: Date;
    if (type === "custom") {
      if (!customDate) return "Selecione uma data e horário";
      target = new Date(customDate);
      if (isNaN(target.getTime())) return "Data inválida";
    } else if (type === "eod") {
      target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0, 0);
      if (target <= now) {
        target.setHours(23, 59, 0, 0);
      }
    } else {
      target = new Date(now.getTime() + Number(type) * 60000);
    }
    const diffMinutes = Math.round((target.getTime() - now.getTime()) / 60000);
    const isToday = target.toDateString() === now.toDateString();
    const timeStr = formatTimeInTimezone(target, task?.timezone);
    const dateStr = formatDateInTimezone(target, task?.timezone);
    if (diffMinutes <= 0) {
      return "Prazo no passado (escolha um horário futuro)";
    }
    return `${isToday ? "Hoje" : dateStr} às ${timeStr} (daqui a ${diffMinutes} min)`;
  }

  async function openReassignForTask(t: ManagementTaskDrawerResult) {
    const current = t.assignments.find((a) => a.type === "PRIMARY")?.memberId || "";
    setReassignMemberId(current);
    setReassignDeadlineType("60");
    setReassignReason("");
    setReassignCustomDate("");
    setShowReassignModal(true);

    setLoadingMembers(true);
    try {
      const res = await getEligibleMembersForTaskAction(t.id);
      if (res.success && Array.isArray(res.data)) {
        setEligibleMembers(res.data);
        if (!current && res.data.length > 0) {
          setReassignMemberId(res.data[0].id);
        }
      }
    } catch {
      // fallback
    } finally {
      setLoadingMembers(false);
    }
  }

  async function handleOpenReassignModal() {
    if (!task) return;
    await openReassignForTask(task);
  }

  async function handleConfirmReassign() {
    if (!task || !reassignMemberId) return;

    let deadlineMinutes: number | undefined;
    let customDeadlineAt: string | undefined;

    if (reassignDeadlineType === "custom") {
      if (!reassignCustomDate) {
        toast.add({
          title: "Data inválida",
          description: "Selecione a data e hora do novo prazo.",
          type: "error",
        });
        return;
      }
      customDeadlineAt = reassignCustomDate;
    } else if (reassignDeadlineType === "eod") {
      const now = new Date();
      const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0, 0);
      if (target <= now) {
        target.setHours(23, 59, 0, 0);
      }
      deadlineMinutes = Math.max(15, Math.round((target.getTime() - now.getTime()) / 60000));
    } else {
      deadlineMinutes = Number(reassignDeadlineType);
    }

    const successMsg =
      task.status === "NOT_COMPLETED"
        ? "Impedimento resolvido e tarefa reatribuída com sucesso!"
        : task.status === "COMPLETED"
          ? "Tarefa reatribuída com sucesso!"
          : "Tarefa reatribuída e prazo renovado com sucesso!";

    await runAction(
      () =>
        reassignTaskAction({
          taskId: task.id,
          memberId: reassignMemberId,
          deadlineMinutes,
          customDeadlineAt,
          reason: reassignReason.trim() || undefined,
        }),
      successMsg
    );
    setShowReassignModal(false);
  }

  const loadTask = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await getManagementTaskDrawerAction(id);
      if (res.error) {
        toast.add({
          title: "Erro ao carregar detalhes",
          description: res.error,
          type: "error",
        });
        setTask(null);
      } else if (res.task) {
        setTask(res.task);
        if (initialReassign) {
          void openReassignForTask(res.task);
        }
      }
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Não foi possível carregar os detalhes da tarefa.",
        type: "error",
      });
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && taskId) {
      loadTask(taskId);
    } else if (!open) {
      const timer = setTimeout(() => {
        setTask(null);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [open, taskId, loadTask]);

  async function runAction(
    action: () => Promise<{ success?: boolean; error?: string }>,
    successMessage: string = "Operação realizada com sucesso."
  ) {
    setActionBusy(true);
    try {
      const res = await action();
      if (res.error) {
        toast.add({
          title: "Erro na operação",
          description: res.error,
          type: "error",
        });
      } else {
        toast.add({
          title: "Sucesso",
          description: successMessage,
          type: "success",
        });
        if (taskId) await loadTask(taskId);
        onTaskUpdated?.();
        router.refresh();
      }
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Erro ao executar ação.",
        type: "error",
      });
    } finally {
      setActionBusy(false);
    }
  }

  async function handleConfirmCancel() {
    if (!task || !cancelReason.trim()) return;
    await runAction(
      () => cancelTaskAction(task.id, cancelReason.trim()),
      "Tarefa cancelada com sucesso."
    );
    setShowCancelDialog(false);
    setCancelReason("");
  }

  async function handleConfirmTrash() {
    if (!task) return;
    await runAction(
      () => trashTaskAction(task.id),
      "Tarefa movida para a lixeira."
    );
    setShowTrashAlert(false);
    onOpenChange(false);
  }

  async function handleConfirmApproval() {
    if (!approvalStep) return;
    await runAction(
      () =>
        submitApprovalDecisionAction(
          approvalStep.stepId,
          approvalStep.decision,
          approvalNote.trim() || undefined,
        ),
      approvalStep.decision === "APPROVED"
        ? "Etapa de aprovação aprovada."
        : "Etapa de aprovação rejeitada."
    );
    setApprovalStep(null);
    setApprovalNote("");
  }

  const primaryAssignee = task?.assignments.find((a) => a.type === "PRIMARY");
  const pendingApprovalStep = task?.approvalWorkflow?.steps?.find(
    (s) => s.status === "PENDING" && s.canDecide,
  );

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle={true} swipeDirection="down">
        <DrawerContent className="w-full h-[92dvh] max-h-[92dvh] sm:max-w-2xl sm:mx-auto border-t border-(--border-subtle) bg-surface text-(--text-primary) rounded-t-[24px] shadow-2xl flex flex-col focus:outline-none">

          {/* ── Header ── */}
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
              {loading ? <Skeleton className="h-6 w-3/4" /> : task?.title || "Detalhes da tarefa"}
            </DrawerTitle>

            <DrawerDescription
              render={<div />}
              className="flex flex-col items-start gap-x-3 gap-y-1 text-xs text-(--text-secondary) mt-1"
            >
              {loading ? (
                <Skeleton className="h-4 w-1/2" />
              ) : task ? (
                <>
                  <div className="w-full flex gap-1 items-center flex-wrap">
                    <StatusBadge status={task.status} size="sm" className="flex-1! max-w-fit! px-5" />
                    <PriorityBadge priority={task.priority} size="sm" className="max-w-fit! flex-1! px-5!" />
                    {task.taskType === "FORM" && (
                      <Badge className="text-[10px] max-w-fit px-3! flex-none truncate font-semibold bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800 py-0.5 rounded-md flex items-center! gap-1">
                        <ClipboardList className="size-3" />
                        <p className="text-xs">Tarefa com Perguntas</p>
                      </Badge>
                    )}
                    {task.slaExceeded && (
                      <Badge className="text-[10px] max-w-fit px-5! flex-1! truncate font-semibold text-red-700 bg-red-50 border-red-200 py-0.5 rounded-md flex items-center! gap-1">
                        <AlertTriangle className="size-1.5" />
                        <p className="text-xs">Atrasada</p>
                      </Badge>
                    )}
                  </div>
                  {task.deadlineAt && (
                    <span className="inline-flex items-center gap-1 font-medium">
                      <Clock className="size-3 text-slate-400" />
                      Prazo: {formatDateTimeInTimezone(task.deadlineAt, task.timezone)}
                    </span>
                  )}
                </>
              ) : null}
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 flex flex-col gap-4">

            {!task && !loading && taskId && (
              <div className="py-8 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
                <p>Não foi possível exibir a tarefa.</p>
                <Button size="sm" variant="outline" className="h-7 text-xs px-2.5" onClick={() => loadTask(taskId)}>
                  <RefreshCw data-icon="inline-start" className="size-3" />
                  Tentar de novo
                </Button>
              </div>
            )}

            {loading ? (
              <div className="flex flex-col items-center justify-center p-12 gap-3 min-h-75">
                <LogoLoader size={64} text="Carregando detalhes da tarefa..." />
              </div>
            ) : task ? (
              <>
                {!["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(task.status) && (task.status === "BLOCKED" || task.slaExceeded) && (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="size-4 text-slate-600 dark:text-slate-400 shrink-0" />
                      <span>
                        {task.status === "BLOCKED"
                          ? "Tarefa bloqueada para conclusão. Reatribua ou renove o prazo para liberá-la."
                          : "Prazo ou tolerância esgotados. Renove o prazo para que o colaborador possa concluir."}
                      </span>
                    </div>
                    {userRole !== "EMPLOYEE" && (
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-slate-900 hover:bg-slate-800 text-white shrink-0 font-medium"
                        onClick={handleOpenReassignModal}
                      >
                        Destravar
                      </Button>
                    )}
                  </div>
                )}

                {task.status === "NOT_COMPLETED" && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-200 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="size-4 text-rose-600 dark:text-rose-400 shrink-0" />
                      <span>
                        Tarefa com impedimento relatado pelo colaborador. Reatribua para outro responsável ou renove o prazo para reiniciar a execução.
                      </span>
                    </div>
                    {userRole !== "EMPLOYEE" && (
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-rose-900 hover:bg-rose-800 text-white shrink-0 font-medium"
                        onClick={handleOpenReassignModal}
                      >
                        Destravar / Reatribuir
                      </Button>
                    )}
                  </div>
                )}

                <Card className="shrink-0 rounded-xl p-0 border border-(--border-subtle) bg-surface shadow-none overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50/80 dark:bg-muted/30 border-b border-(--border-subtle) flex items-center gap-2">
                    <ListTodo className="size-4 text-brand-900 dark:text-primary" />
                    <h3 className="font-bold text-xs uppercase tracking-wider text-(--text-primary)">Informações gerais</h3>
                  </div>
                  <CardContent className="p-4 flex flex-col gap-3 text-xs">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <div>
                        <span className="text-[10px] uppercase tracking-wide font-semibold text-(--text-secondary) block mb-0.5">Unidade</span>
                        <span className="font-medium flex items-center gap-1">
                          <MapPin className="size-3 text-brand-700 shrink-0" />
                          {task.locationName || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase tracking-wide font-semibold text-(--text-secondary) block mb-0.5">Equipe</span>
                        <span className="font-medium flex items-center gap-1">
                          <Users className="size-3 text-brand-700 shrink-0" />
                          {task.teamName || "—"}
                        </span>
                      </div>
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-[10px] uppercase tracking-wide font-semibold text-(--text-secondary) block mb-0.5">Responsável</span>
                          <span className="font-medium">
                            {primaryAssignee?.memberName || <span className="text-amber-700">Sem responsável</span>}
                          </span>
                        </div>
                        {userRole !== "EMPLOYEE" && task.status !== "CANCELLED" && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 text-[11px] px-2 font-medium border-brand-200 text-brand-900 hover:bg-brand-50"
                            onClick={handleOpenReassignModal}
                          >
                            Alterar
                          </Button>
                        )}
                      </div>
                      <div>
                        <span className="text-[10px] uppercase tracking-wide font-semibold text-(--text-secondary) block mb-0.5">Origem</span>
                        <span className="font-medium">{task.taskType === "FORM" ? "Tarefa com Perguntas" : task.origin === "PROCESS" ? "Processo" : "Avulsa"}</span>
                      </div>
                      {task.startedAt && (
                        <div>
                          <span className="text-[10px] uppercase tracking-wide font-semibold text-(--text-secondary) block mb-0.5">Iniciada</span>
                          <span className="font-medium">{fmtDate(task.startedAt)}</span>
                        </div>
                      )}
                      {task.completedAt && (
                        <div>
                          <span className="text-[10px] uppercase tracking-wide font-semibold text-(--text-secondary) block mb-0.5">Concluída</span>
                          <span className="font-medium">{fmtDate(task.completedAt)}</span>
                        </div>
                      )}
                      {task.actualDuration !== null && (
                        <div>
                          <span className="text-[10px] uppercase tracking-wide font-semibold text-(--text-secondary) block mb-0.5">Duração real</span>
                          <span className="font-medium">{fmtDuration(task.actualDuration)}</span>
                        </div>
                      )}

                    </div>

                    {task.description && (
                      <div className="p-3 rounded-lg bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 text-blue-950 dark:text-blue-100 mt-1">
                        <span className="font-semibold block mb-1 text-[11px] uppercase tracking-wide text-blue-800">Descrição</span>
                        <p className="text-xs">{task.description}</p>
                      </div>
                    )}

                    {task.taskType === "FORM" && Array.isArray(task.formFields) ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs block text-(--text-primary)">
                            Perguntas e Respostas:
                          </span>
                          <span className="text-[11px] text-muted-foreground font-medium">
                            {task.formFields.length} {task.formFields.length === 1 ? "pergunta" : "perguntas"}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {task.formFields.map((field: any, idx: number) => {
                            const answer = task.formAnswers?.[field.id];
                            const isAnswered = answer !== undefined && answer !== null && answer !== "";
                            return (
                              <div key={field.id} className="p-3 bg-slate-50/70 dark:bg-muted/15 border border-(--border-subtle) rounded-lg flex flex-col gap-2">
                                <div className="flex items-start justify-between gap-2">
                                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-snug">
                                    {idx + 1}. {field.question || field.label || "Pergunta sem título"}{" "}
                                    {field.required && <span className="text-red-500 font-bold">*</span>}
                                  </span>
                                  <Badge variant="outline" className="text-[10px] font-medium shrink-0 px-1.5 py-0">
                                    {field.type === "SHORT_TEXT" && "Texto Curto"}
                                    {field.type === "LONG_TEXT" && "Texto Longo"}
                                    {field.type === "RATING" && "Avaliação"}
                                    {field.type === "BOOLEAN" && "Sim / Não"}
                                    {field.type === "PHOTO" && "Foto"}
                                    {field.type === "VIDEO" && "Vídeo"}
                                    {field.type === "FILE" && "Arquivos"}
                                    {field.type === "NUMBER" && "Número"}
                                    {(!field.type || !["SHORT_TEXT", "LONG_TEXT", "RATING", "BOOLEAN", "PHOTO", "VIDEO", "FILE", "NUMBER"].includes(field.type)) && (field.type || "Texto")}
                                  </Badge>
                                </div>
                                <div className="text-xs text-slate-900 dark:text-slate-100 font-medium bg-white dark:bg-slate-900 p-2.5 rounded-md border border-slate-200 dark:border-slate-800">
                                  {!isAnswered ? (
                                    <span className="text-slate-400 dark:text-slate-500 italic text-[11px] flex items-center gap-1.5">
                                      <Clock className="size-3" />
                                      Aguardando resposta do colaborador
                                    </span>
                                  ) : field.type === "BOOLEAN" ? (
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${answer === true || answer === "true"
                                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                        : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300"
                                      }`}>
                                      {answer === true || answer === "true" ? "✓ Sim" : "✕ Não"}
                                    </span>
                                  ) : field.type === "RATING" ? (
                                    <div className="flex items-center gap-2">
                                      <div className="flex gap-1 text-amber-500 text-sm">
                                        {Array.from({ length: 5 }).map((_, i) => (
                                          <span key={i}>{i < Number(answer) ? "★" : "☆"}</span>
                                        ))}
                                      </div>
                                      <span className="text-[11px] text-muted-foreground font-medium">({answer} de 5)</span>
                                    </div>
                                  ) : field.type === "PHOTO" ? (
                                    <div className="flex flex-col gap-1.5">
                                      <div className="flex items-center gap-2 text-brand-900 dark:text-primary">
                                        <Camera className="size-3.5 shrink-0" />
                                        <span className="truncate">{typeof answer === "object" ? answer.fileName : String(answer)}</span>
                                      </div>
                                      {typeof answer === "object" && (answer.fileUrl || answer.storageKey) && (
                                        <a
                                          href={answer.fileUrl || `/api/tasks/${task.id}/form-file/${answer.storageKey}`}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-brand-900 dark:text-brand-300 hover:underline w-fit"
                                        >
                                          <ExternalLink className="size-3" />
                                          <span>Visualizar foto</span>
                                        </a>
                                      )}
                                    </div>
                                  ) : field.type === "VIDEO" ? (
                                    <div className="flex flex-col gap-1.5">
                                      <div className="flex items-center gap-2 text-brand-900 dark:text-primary">
                                        <Video className="size-3.5 shrink-0" />
                                        <span className="truncate">{typeof answer === "object" ? answer.fileName : String(answer)}</span>
                                      </div>
                                      {typeof answer === "object" && (answer.fileUrl || answer.storageKey) && (
                                        <a
                                          href={answer.fileUrl || `/api/tasks/${task.id}/form-file/${answer.storageKey}`}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-brand-900 dark:text-brand-300 hover:underline w-fit"
                                        >
                                          <ExternalLink className="size-3" />
                                          <span>Assistir / Baixar vídeo</span>
                                        </a>
                                      )}
                                    </div>
                                  ) : field.type === "FILE" ? (
                                    <div className="flex flex-col gap-1.5">
                                      <div className="flex items-center gap-2 text-brand-900 dark:text-primary">
                                        <Paperclip className="size-3.5 shrink-0" />
                                        <span className="truncate">{typeof answer === "object" ? answer.fileName : String(answer)}</span>
                                        {typeof answer === "object" && answer.fileSize && (
                                          <span className="text-[10px] text-muted-foreground">({Math.round(answer.fileSize / 1024)} KB)</span>
                                        )}
                                      </div>
                                      {typeof answer === "object" && (answer.fileUrl || answer.storageKey) && (
                                        <a
                                          href={answer.fileUrl || `/api/tasks/${task.id}/form-file/${answer.storageKey}`}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-brand-900 dark:text-brand-300 hover:underline w-fit"
                                        >
                                          <Download className="size-3" />
                                          <span>Baixar anexo</span>
                                        </a>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="whitespace-pre-wrap">{String(answer)}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : task.instructions ? (
                      <div className="space-y-1">
                        <span className="font-semibold text-xs block">Instruções:</span>
                        <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-300 bg-slate-50/50 dark:bg-muted/10 p-3 rounded-lg border border-(--border-subtle) text-xs">
                          {task.instructions}
                        </p>
                      </div>
                    ) : null}

                    <Link
                      href={`/management/tasks/${task.id}`}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-900 hover:text-brand-700 mt-1"
                    >
                      <ExternalLink className="size-3.5" />
                      Ver página completa
                    </Link>
                  </CardContent>
                </Card>

                {/* ── Dependências ── */}
                {task.dependencies.length > 0 && (
                  <Card className="shrink-0 rounded-xl p-0 border border-(--border-subtle) bg-surface shadow-none overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50/80 dark:bg-muted/30 border-b border-(--border-subtle) flex items-center gap-2">
                      <ChevronRight className="size-4 text-brand-900" />
                      <h3 className="font-bold text-xs uppercase tracking-wider text-(--text-primary)">Dependências</h3>
                    </div>
                    <CardContent className="p-4 flex flex-col gap-2">
                      {task.dependencies.map((d) => (
                        <div key={d.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white dark:bg-card border border-slate-200 text-xs">
                          <span className="truncate font-medium">{d.dependsOnTask.title}</span>
                          <StatusBadge status={d.dependsOnTask.status} />
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* ── Comprovações ── */}
                {task.evidenceRequirements.length > 0 && (
                  <Card className="shrink-0 rounded-xl p-0 border border-(--border-subtle) bg-surface shadow-none overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50/80 dark:bg-muted/30 border-b border-(--border-subtle) flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileCheck2 className="size-4 text-brand-900 dark:text-primary" />
                        <h3 className="font-bold text-xs uppercase tracking-wider text-(--text-primary)">Comprovações</h3>
                      </div>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-muted text-slate-800 dark:text-foreground">
                        {task.evidenceRequirements.filter((r) => r.submissions.filter((s) => s.validationStatus === "VALID").length >= r.minQuantity).length}
                        /{task.evidenceRequirements.length}
                      </span>
                    </div>
                    <CardContent className="p-4 flex flex-col gap-3">
                      {task.evidenceRequirements.map((req) => {
                        const valid = req.submissions.filter((s) => s.validationStatus === "VALID");
                        const isDone = valid.length >= req.minQuantity;
                        return (
                          <div
                            key={req.id}
                            className={`p-3 rounded-xl border text-xs transition-colors ${isDone
                              ? "bg-emerald-50/40 border-emerald-200"
                              : "bg-slate-50/60 border-(--border-subtle)"
                              }`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span className="font-semibold text-(--text-primary)">{req.type} · {req.executionStage}</span>
                              <Badge
                                className={`text-[10px] font-semibold ${isDone
                                  ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                  : req.required
                                    ? "border-amber-300 text-amber-800 bg-amber-50"
                                    : "text-slate-500"
                                  }`}
                                variant="outline"
                              >
                                {isDone ? "Entregue" : req.required ? "Obrigatória" : "Opcional"}
                              </Badge>
                            </div>
                            {req.submissions.length === 0 ? (
                              <p className="text-muted-foreground">Nenhum envio ainda.</p>
                            ) : (
                              <div className="flex flex-col gap-1.5">
                                {req.submissions.map((s) => (
                                  <div key={s.id} className="flex items-center gap-1.5">
                                    {s.validationStatus === "VALID"
                                      ? <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
                                      : s.validationStatus === "REJECTED"
                                        ? <XCircle className="size-3.5 text-red-600 shrink-0" />
                                        : <Clock className="size-3.5 text-slate-400 shrink-0" />}
                                    {(s as any).fileUrl || s.storageKey ? (
                                      <a href={(s as any).fileUrl || `/api/evidence/${s.id}`} className="underline text-blue-600 hover:text-blue-800 font-medium truncate" target="_blank" rel="noopener noreferrer">
                                        Ver comprovação #{s.attemptNumber}
                                      </a>
                                    ) : (
                                      <span className="truncate text-slate-700">{s.value || `Envio #${s.attemptNumber}`}</span>
                                    )}
                                    <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{fmtDate(s.createdAt)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}

                {/* ── Aprovação ── */}
                {task.approvalWorkflow && (
                  <Card className="shrink-0 rounded-xl p-0 border border-(--border-subtle) bg-surface shadow-none overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50/80 dark:bg-muted/30 border-b border-(--border-subtle) flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-brand-900" />
                        <h3 className="font-bold text-xs uppercase tracking-wider text-(--text-primary)">Aprovação</h3>
                      </div>
                      <Badge
                        className={`text-[10px] font-semibold ${task.approvalWorkflow.status === "APPROVED"
                          ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                          : task.approvalWorkflow.status === "REJECTED"
                            ? "bg-red-100 text-red-800 border-red-200"
                            : "bg-amber-50 text-amber-800 border-amber-200"
                          }`}
                        variant="outline"
                      >
                        {task.approvalWorkflow.status === "APPROVED" ? "Aprovado"
                          : task.approvalWorkflow.status === "REJECTED" ? "Rejeitado"
                            : "Aguardando"}
                      </Badge>
                    </div>
                    <CardContent className="p-4 flex flex-col gap-2 text-xs">
                      {task.approvalWorkflow.steps.map((step) => (
                        <div key={step.id} className="p-2.5 rounded-lg border border-(--border-subtle) bg-white dark:bg-card">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold">Etapa {step.sequence}</span>
                            <StatusBadge status={step.status} />
                          </div>
                          {step.decisions.map((d) => (
                            <div key={d.id} className="text-[11px] text-muted-foreground flex items-start gap-1.5 mt-1">
                              {d.decision === "APPROVED"
                                ? <Check className="size-3 text-emerald-600 shrink-0 mt-0.5" />
                                : <XCircle className="size-3 text-red-600 shrink-0 mt-0.5" />}
                              <span>{d.decidedBy} — {d.note || d.decision}</span>
                            </div>
                          ))}
                        </div>
                      ))}

                      {pendingApprovalStep && userRole !== "EMPLOYEE" && (
                        <div className="flex gap-2 pt-1">
                          <Button
                            type="button"
                            size="sm"
                            className="flex-1 h-9 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                            disabled={actionBusy}
                            onClick={() => setApprovalStep({ stepId: pendingApprovalStep.id, decision: "APPROVED" })}
                          >
                            <Check data-icon="inline-start" className="size-3.5" />
                            Aprovar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            className="flex-1 h-9 text-xs font-semibold cursor-pointer"
                            disabled={actionBusy}
                            onClick={() => setApprovalStep({ stepId: pendingApprovalStep.id, decision: "REJECTED" })}
                          >
                            <XCircle data-icon="inline-start" className="size-3.5" />
                            Rejeitar
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {(() => {
                  const validOccurrences = (task.occurrences || []).filter((o) => !isPauseOccurrence(o));
                  if (validOccurrences.length === 0) return null;

                  const impediments = validOccurrences.filter((o) => o.type !== "SLA_BREACH");
                  const slaBreaches = validOccurrences
                    .filter((o) => o.type === "SLA_BREACH")
                    .sort((a, b) => {
                      const minsA = parseInt(a.category.replace(/^SLA_/, ""), 10) || 0;
                      const minsB = parseInt(b.category.replace(/^SLA_/, ""), 10) || 0;
                      return minsB - minsA;
                    });
                  const latestBreach = slaBreaches[0];
                  const latestDelayText = latestBreach
                    ? formatOccurrenceCategory(latestBreach.category, latestBreach.type)
                    : null;
                  const latestSev = latestBreach ? formatSeverity(latestBreach.severity) : null;

                  return (
                    <Card className="shrink-0 p-0 rounded-xl border border-slate-200 dark:border-slate-800 bg-surface shadow-none overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setDrawerOccurrencesOpen((prev) => !prev)}
                        className="w-full px-4 py-2.5 bg-slate-50/80 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-left hover:bg-slate-100/60 dark:hover:bg-slate-800/40 transition-colors cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-2">
                          <AlertCircle className="size-4 text-slate-600 dark:text-slate-400" />
                          <span className="font-bold text-[11px] uppercase tracking-wide text-slate-900 dark:text-slate-200">
                            Ocorrências e Alertas
                          </span>
                          <Badge variant="outline" className="text-[10px] font-semibold px-1.5 py-0 border-slate-300 text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-300">
                            {validOccurrences.length} {validOccurrences.length === 1 ? "registro" : "registros"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-slate-500">
                          <span>{drawerOccurrencesOpen ? "Recolher" : "Expandir"}</span>
                          {drawerOccurrencesOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                        </div>
                      </button>

                      {drawerOccurrencesOpen && (
                        <CardContent className="p-3.5 flex flex-col gap-3">
                          {/* Impedimentos operacionais */}
                          {impediments.length > 0 && (
                            <div className="flex flex-col gap-2">
                              <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                                Impedimentos operacionais ({impediments.length})
                              </span>
                              {impediments.map((imp) => {
                                const sev = formatSeverity(imp.severity);
                                return (
                                  <div
                                    key={imp.id}
                                    className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-xs flex flex-col gap-1.5"
                                  >
                                    <div className="flex items-center justify-between gap-1 flex-wrap">
                                      <div className="flex items-center gap-1.5">
                                        <Badge variant="destructive" className="text-[9px] uppercase px-1 py-0">
                                          Impedimento
                                        </Badge>
                                        <span className="font-semibold text-slate-900 dark:text-slate-100 text-xs">
                                          {formatOccurrenceCategory(imp.category, imp.type)}
                                        </span>
                                      </div>
                                      <Badge className={`text-[10px] font-semibold ${sev.badgeClass}`}>
                                        {sev.label}
                                      </Badge>
                                    </div>
                                    <p className="text-slate-700 dark:text-slate-300 text-xs leading-relaxed bg-white dark:bg-slate-950 p-2 rounded border border-slate-100 dark:border-slate-800">
                                      {imp.reason}
                                    </p>
                                    <span className="text-[10px] text-muted-foreground font-mono">
                                      {fmtDate(imp.createdAt)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Alerta consolidado de SLA */}
                          {latestBreach && (
                            <div className="flex flex-col gap-1.5">
                              <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                                Alertas de Prazo & Atraso
                              </span>
                              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 flex flex-col gap-1.5 text-xs">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div className="flex items-center gap-1.5">
                                    <Clock className="size-3.5 text-slate-600 dark:text-slate-400 shrink-0" />
                                    <span className="font-bold text-slate-900 dark:text-slate-100">
                                      {latestDelayText}
                                    </span>
                                  </div>
                                  {latestSev && (
                                    <Badge className={`text-[10px] font-semibold ${latestSev.badgeClass}`}>
                                      {latestSev.label}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-slate-600 dark:text-slate-400 text-[11px]">
                                  {cleanReason(latestBreach.reason)}
                                </p>
                                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-200/60 dark:border-slate-800">
                                  <span>Último disparo: {fmtDate(latestBreach.createdAt)}</span>
                                  {slaBreaches.length > 1 && (
                                    <span className="font-medium text-slate-700 dark:text-slate-300">
                                      {slaBreaches.length} avisos acumulados
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      )}
                    </Card>
                  );
                })()}

                {/* ── Histórico ── */}
                {task.activityLogs.length > 0 && (
                  <Card className="shrink-0 rounded-xl p-0 border border-(--border-subtle) bg-surface shadow-none overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50/80 dark:bg-muted/30 border-b border-(--border-subtle) flex items-center gap-2">
                      <Activity className="size-4 text-brand-900" />
                      <h3 className="font-bold text-xs uppercase tracking-wider text-(--text-primary)">Histórico</h3>
                    </div>
                    <CardContent className="p-4 flex flex-col gap-2 text-xs">
                      <TaskActivityHistory
                        logs={task.activityLogs}
                        assignedMemberIds={task.assignments
                          .filter((assignment) => assignment.type === "PRIMARY")
                          .map((assignment) => assignment.memberId)}
                        timezone={task.timezone}
                      />
                    </CardContent>
                  </Card>
                )}
              </>
            ) : null}
          </div>

          {/* ── Footer com ações ── */}
          {task && userRole !== "EMPLOYEE" && (
            <DrawerFooter className="px-4 sm:px-6 py-3.5 border-t border-(--border-subtle) bg-surface shrink-0 flex flex-col gap-2">
              <div className="flex gap-2">
                {task.status !== "CANCELLED" && (
                  <Button
                    type="button"
                    variant="default"
                    className="flex-1 h-10 text-xs font-semibold rounded-xl bg-brand-900 text-white hover:bg-brand-800 cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                    disabled={actionBusy}
                    onClick={handleOpenReassignModal}
                  >
                    <UserCheck className="size-4" />
                    {task.status === "COMPLETED"
                      ? "Reatribuir tarefa"
                      : task.status === "NOT_COMPLETED"
                        ? "Reatribuir / Resolver"
                        : "Reatribuir / Renovar prazo"}
                  </Button>
                )}

                {!["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(task.status) && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 px-3 text-xs font-semibold rounded-xl text-amber-800 hover:bg-amber-50 cursor-pointer"
                    disabled={actionBusy}
                    onClick={() => { setCancelReason(""); setShowCancelDialog(true); }}
                  >
                    <XCircle data-icon="inline-start" className="size-3.5" />
                    Cancelar
                  </Button>
                )}

                <Button
                  type="button"
                  variant="outline"
                  className="h-10 px-3 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 text-[var(--brand-900)] hover:bg-[var(--canvas)] cursor-pointer flex items-center gap-1.5 shrink-0 shadow-2xs"
                  onClick={() => {
                    const evidenceReq = task.evidenceRequirements?.[0];
                    copyTaskToClipboard({
                      title: task.title,
                      description: task.description || "",
                      instructions: task.instructions || task.description || "",
                      taskType: (task.taskType as any) || "STANDARD",
                      priority: (task.priority as any) || "MEDIUM",
                      criticality: (task.criticality as any) || "MEDIUM",
                      toleranceMinutes: 20,
                      evidenceType: evidenceReq?.type || "NONE",
                      evidenceRequired: evidenceReq?.required ?? false,
                      formFields: task.formFields || [],
                      sourceType: task.origin === "AD_HOC" ? "ADHOC" : "PROCESS_TASK",
                      sourceTitle: task.title,
                    });
                  }}
                  title="Copiar tarefa para colar em nova tarefa ou processo"
                >
                  <Copy className="size-3.5 text-slate-500" />
                  <span>Copiar tarefa</span>
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 w-10 text-xs font-semibold rounded-xl text-red-700 hover:bg-red-50 cursor-pointer shrink-0"
                  disabled={actionBusy}
                  onClick={() => setShowTrashAlert(true)}
                  title="Mover para lixeira"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </DrawerFooter>
          )}
        </DrawerContent>
      </Drawer>

      <Dialog open={showReassignModal} onOpenChange={setShowReassignModal}>
        <DialogContent className="sm:max-w-lg p-7!">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="">
                {task?.status === "COMPLETED"
                  ? "Reatribuir tarefa concluída"
                  : task?.status === "NOT_COMPLETED"
                    ? "Reatribuir / Resolver impedimento"
                    : "Reatribuir tarefa & renovar prazo"}
              </span>
            </DialogTitle>
            <DialogDescription>
              {task?.status === "COMPLETED"
                ? "Selecione o colaborador e defina o novo prazo para reexecução da tarefa."
                : task?.status === "NOT_COMPLETED"
                  ? "Selecione o colaborador e defina o novo prazo para reiniciar a tarefa e resolver o impedimento."
                  : "Selecione o colaborador responsável e defina o novo prazo para conclusão."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Responsável */}
            <Field>
              <FieldLabel className="text-xs font-semibold text-(--text-primary)">
                Colaborador responsável *
              </FieldLabel>
              {loadingMembers ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Spinner className="size-3.5" />
                  <span>Carregando membros da equipe...</span>
                </div>
              ) : (
                <NativeSelect
                  value={reassignMemberId}
                  onChange={(e) => setReassignMemberId(e.target.value)}
                  className="text-xs"
                >
                  <NativeSelectOption value="">Selecione um colaborador...</NativeSelectOption>
                  {eligibleMembers.map((m) => {
                    const isCurrent = m.id === primaryAssignee?.memberId;
                    const availLabel =
                      m.availability === "AVAILABLE"
                        ? "Disponível"
                        : m.availability === "BUSY"
                          ? "Ocupado"
                          : "Indisponível";
                    return (
                      <NativeSelectOption key={m.id} value={m.id}>
                        {m.name} {isCurrent ? "- Responsável atual" : ""} - {availLabel}
                      </NativeSelectOption>
                    );
                  })}
                </NativeSelect>
              )}
            </Field>

            {/* Novo Prazo */}
            <div className="space-y-2">
              <FieldLabel className="text-xs font-semibold text-(--text-primary) block">
                Novo prazo para conclusão *
              </FieldLabel>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                {[
                  { id: "15", label: "+15 min" },
                  { id: "30", label: "+30 min" },
                  { id: "60", label: "+1 hora" },
                  { id: "120", label: "+2 horas" },
                  { id: "eod", label: "Fim do dia" },
                  { id: "custom", label: "Outro" },
                ].map((opt) => (
                  <Button
                    key={opt.id}
                    type="button"
                    variant={reassignDeadlineType === opt.id ? "default" : "outline"}
                    className={`h-8 text-xs font-medium px-2 rounded-lg transition-all ${reassignDeadlineType === opt.id
                      ? "bg-brand-900 text-white font-semibold shadow-xs hover:bg-brand-800"
                      : "bg-surface hover:bg-slate-100 dark:hover:bg-muted text-(--text-secondary)"
                      }`}
                    onClick={() => setReassignDeadlineType(opt.id as any)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>

              {reassignDeadlineType === "custom" && (
                <div className="pt-2">
                  <Input
                    type="datetime-local"
                    value={reassignCustomDate}
                    onChange={(e) => setReassignCustomDate(e.target.value)}
                    className="text-xs h-9"
                  />
                </div>
              )}

              {/* Preview do novo prazo */}
              <div className="p-2.5 rounded-lg bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 flex items-center gap-2 text-xs text-emerald-900 dark:text-emerald-300">
                <Clock className="size-4 shrink-0 text-emerald-700" />
                <span>
                  <strong>Novo prazo:</strong> {getDeadlinePreview(reassignDeadlineType, reassignCustomDate)}
                </span>
              </div>
            </div>

            {/* Justificativa / Observação */}
            <Field>
              <FieldLabel className="text-xs font-semibold text-(--text-primary)">
                Observação / Motivo (opcional)
              </FieldLabel>
              <Textarea
                rows={2}
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                placeholder="Ex: Tarefa atrasada por falta de material; novo prazo acordado com o operador..."
                className="text-sm! resize-none"
              />
            </Field>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowReassignModal(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmReassign}
              disabled={actionBusy || !reassignMemberId}
              className="bg-brand-900 hover:bg-brand-800 text-white font-semibold"
            >
              {actionBusy && <Spinner data-icon="inline-start" />}
              <span>
                {task?.status === "NOT_COMPLETED"
                  ? "Resolver impedimento e reatribuir"
                  : "Confirmar e renovar prazo"}
              </span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancelar */}
      <Dialog open={showCancelDialog} onOpenChange={(o) => { if (!o) setShowCancelDialog(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar tarefa</DialogTitle>
            <DialogDescription>Informe o motivo do cancelamento.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Field>
              <FieldLabel className="text-xs font-semibold">Motivo *</FieldLabel>
              <Textarea rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Descreva o motivo..." className="text-xs resize-none" />
            </Field>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>Voltar</Button>
            <Button variant="destructive" onClick={handleConfirmCancel} disabled={actionBusy || !cancelReason.trim()}>
              {actionBusy && <Spinner data-icon="inline-start" />}
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lixeira */}
      <AlertDialog open={showTrashAlert} onOpenChange={(o) => { if (!o) setShowTrashAlert(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover para a lixeira?</AlertDialogTitle>
            <AlertDialogDescription>
              A tarefa sairá da lista de atividades. Você poderá restaurá-la na lixeira.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowTrashAlert(false)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmTrash} disabled={actionBusy}>
              {actionBusy && <Spinner data-icon="inline-start" />}
              Mover para lixeira
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Aprovar / Rejeitar */}
      <Dialog open={approvalStep !== null} onOpenChange={(o) => { if (!o) { setApprovalStep(null); setApprovalNote(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {approvalStep?.decision === "APPROVED" ? "Aprovar entrega" : "Rejeitar entrega"}
            </DialogTitle>
            <DialogDescription>
              {approvalStep?.decision === "APPROVED"
                ? "Confirme a aprovação desta etapa."
                : "Informe o motivo da rejeição para o operador."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Field>
              <FieldLabel className="text-xs font-semibold">
                Observação {approvalStep?.decision === "REJECTED" ? "*" : "(opcional)"}
              </FieldLabel>
              <Textarea rows={3} value={approvalNote} onChange={(e) => setApprovalNote(e.target.value)} placeholder="Escreva uma observação..." className="text-xs resize-none" />
            </Field>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setApprovalStep(null); setApprovalNote(""); }}>Voltar</Button>
            <Button
              variant={approvalStep?.decision === "APPROVED" ? "default" : "destructive"}
              onClick={handleConfirmApproval}
              disabled={actionBusy || (approvalStep?.decision === "REJECTED" && !approvalNote.trim())}
              className={approvalStep?.decision === "APPROVED" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
            >
              {actionBusy && <Spinner data-icon="inline-start" />}
              {approvalStep?.decision === "APPROVED" ? "Confirmar aprovação" : "Confirmar rejeição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
