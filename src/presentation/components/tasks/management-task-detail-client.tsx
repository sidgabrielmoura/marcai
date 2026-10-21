"use client";
import { ManagementTaskBlockButton } from "./management-task-block-button";

import { useState } from "react";
import { canEditTaskDefinition } from "@/domain/rules/task-edit";
import { EditTaskDialog } from "./edit-task-dialog";
import { useRouter } from "next/navigation";
import {
  Clock,
  User,
  Trash2,
  Camera,
  History,
  UserCheck,
  AlertTriangle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  CheckCircle2,
  XCircle,
  Star,
  Video,
  Paperclip,
  ExternalLink,
  Download,
} from "lucide-react";
import {
  reassignTaskAction,
  transferTaskAction,
  cancelTaskAction,
  trashTaskAction,
  submitApprovalDecisionAction,
} from "@/presentation/actions/management-task-actions";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { uiLabel } from "../shared/ui-labels";

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

function formatSeverity(severity: string): {
  label: string;
  badgeClass: string;
} {
  switch (severity) {
    case "CRITICAL":
      return {
        label: "Crítica",
        badgeClass: "bg-red-100 text-red-800 border-red-200",
      };
    case "HIGH":
      return {
        label: "Alta",
        badgeClass: "bg-rose-100 text-rose-800 border-rose-200",
      };
    case "MEDIUM":
      return {
        label: "Média",
        badgeClass: "bg-slate-100 text-slate-800 border-slate-300",
      };
    case "LOW":
      return {
        label: "Baixa",
        badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
      };
    default:
      return {
        label: severity,
        badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
      };
  }
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

import {
  PageHeader,
  StatusBadge,
  PriorityBadge,
} from "@/presentation/components/shared";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Spinner } from "@/components/ui/spinner";

interface ManagementTaskDetailProps {
  task: {
    id: string;
    title: string;
    description: string | null;
    instructions: string | null;
    taskType?: string | null;
    formFields?: any;
    formAnswers?: any;
    origin: string;
    status: string;
    managementBlocked?: boolean;
    startedAt: Date | string | null;
    priority: string;
    criticality: string;
    required: boolean;
    deadlineAt: Date | string | null;
    slaDurationMinutes: number | null;
    slaDueAt: Date | string | null;
    slaExceededAt: Date | string | null;
    actualDuration: number | null;
    locationName: string | null;
    teamName: string | null;
    assignments: Array<{
      id: string;
      memberId: string;
      memberName: string;
      memberEmail: string | null;
      type: string;
      assignedAt: Date | string;
    }>;
    evidenceRequirements: Array<{
      id: string;
      type: string;
      required: boolean;
      executionStage: string;
      submissions: Array<{
        id: string;
        value: string | null;
        storageKey: string | null;
        fileUrl?: string | null;
        publicId?: string | null;
        validationStatus: string;
        attemptNumber: number;
        createdAt: Date | string;
      }>;
    }>;
    dependencies: Array<{
      id: string;
      type: string;
      logic: string;
      dependsOnTask: {
        id: string;
        title: string;
        status: string;
      };
    }>;
    occurrences: Array<{
      id: string;
      type: string;
      category: string;
      reason: string;
      severity: string;
      createdAt: Date | string;
    }>;
    activityLogs: Array<{
      id: string;
      action: string;
      actorName: string | null;
      createdAt: Date | string;
      metadata: any;
    }>;
    approvalWorkflow?: {
      id: string;
      mode: string;
      status: string;
      steps: Array<{
        id: string;
        sequence: number;
        status: string;
        canDecide: boolean;
        decisions: Array<{
          id: string;
          decision: string;
          note: string | null;
          decidedBy: string;
          createdAt: Date | string;
        }>;
      }>;
    } | null;
  };
  availableMembers: Array<{ id: string; name: string; email: string | null }>;
  userRole: string;
}

export function ManagementTaskDetailClient({
  task,
  availableMembers,
  userRole,
}: ManagementTaskDetailProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);

  // Modais de Controle
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState(
    task.assignments.find((a) => a.type === "PRIMARY")?.memberId || "",
  );
  const [reassignDeadlineType, setReassignDeadlineType] = useState<
    "15" | "30" | "60" | "120" | "eod" | "custom"
  >("60");
  const [reassignCustomDate, setReassignCustomDate] = useState("");
  const [reassignReason, setReassignReason] = useState("");

  const [showTrashAlert, setShowTrashAlert] = useState(false);

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const [occurrencesOpen, setOccurrencesOpen] = useState(false);

  const [approvalStep, setApprovalStep] = useState<{
    stepId: string;
    decision: "APPROVED" | "REJECTED";
  } | null>(null);
  const [approvalNote, setApprovalNote] = useState("");

  const primaryAssignment = task.assignments.find((a) => a.type === "PRIMARY");

  const isForm = task.taskType === "FORM";
  const formFieldsList: any[] = Array.isArray(task.formFields)
    ? task.formFields
    : [];
  const totalQuestions = formFieldsList.length;
  const answeredQuestions = formFieldsList.filter((f) => {
    const val = task.formAnswers?.[f.id];
    return val !== undefined && val !== null && val !== "";
  }).length;
  const completionPercentage =
    totalQuestions > 0
      ? Math.round((answeredQuestions / totalQuestions) * 100)
      : 0;
  const isFullyAnswered =
    totalQuestions > 0 && answeredQuestions === totalQuestions;

  function getDeadlinePreview(type: string, customDate: string) {
    const now = new Date();
    let target: Date;
    if (type === "custom") {
      if (!customDate) return "Selecione uma data e horário";
      target = new Date(customDate);
      if (isNaN(target.getTime())) return "Data inválida";
    } else if (type === "eod") {
      target = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        18,
        0,
        0,
        0,
      );
      if (target <= now) {
        target.setHours(23, 59, 0, 0);
      }
    } else {
      target = new Date(now.getTime() + Number(type) * 60000);
    }
    const diffMinutes = Math.round((target.getTime() - now.getTime()) / 60000);
    const isToday = target.toDateString() === now.toDateString();
    const timeStr = target.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const dateStr = target.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    });
    if (diffMinutes <= 0) {
      return "Prazo no passado (escolha um horário futuro)";
    }
    return `${isToday ? "Hoje" : dateStr} às ${timeStr} (daqui a ${diffMinutes} min)`;
  }

  async function handleTransfer() {
    if (!selectedMemberId) return;
    setLoading(true);
    try {
      let deadlineMinutes: number | undefined;
      let customDeadlineAt: string | undefined;

      if (reassignDeadlineType === "custom") {
        if (!reassignCustomDate) {
          toast.add({
            title: "Data inválida",
            description: "Selecione a data e hora do novo prazo.",
            type: "error",
          });
          setLoading(false);
          return;
        }
        customDeadlineAt = new Date(reassignCustomDate).toISOString();
      } else if (reassignDeadlineType === "eod") {
        const now = new Date();
        const target = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          18,
          0,
          0,
          0,
        );
        if (target <= now) {
          target.setHours(23, 59, 0, 0);
        }
        deadlineMinutes = Math.max(
          15,
          Math.round((target.getTime() - now.getTime()) / 60000),
        );
      } else {
        deadlineMinutes = Number(reassignDeadlineType);
      }

      const res = await reassignTaskAction({
        taskId: task.id,
        memberId: selectedMemberId,
        deadlineMinutes,
        customDeadlineAt,
        reason: reassignReason.trim() || undefined,
      });

      if (res.error) {
        toast.add({
          title: "Erro ao reatribuir tarefa",
          description: res.error,
          type: "error",
        });
      } else {
        toast.add({
          title: "Tarefa reatribuída",
          description: "Responsável atualizado e prazo renovado com sucesso.",
          type: "success",
        });
        setShowTransferModal(false);
        router.refresh();
      }
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Não foi possível transferir a tarefa.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmCancel() {
    if (!cancelReason.trim()) return;
    setLoading(true);
    try {
      const res = await cancelTaskAction(task.id, cancelReason.trim());
      if (res.error) {
        toast.add({
          title: "Erro ao cancelar tarefa",
          description: res.error,
          type: "error",
        });
      } else {
        toast.add({
          title: "Tarefa cancelada",
          description: "Tarefa cancelada com sucesso.",
          type: "info",
        });
        setShowCancelDialog(false);
        router.refresh();
      }
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Não foi possível cancelar a tarefa.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmTrash() {
    setLoading(true);
    try {
      const res = await trashTaskAction(task.id);
      if (res.error) {
        toast.add({
          title: "Erro ao mover para a lixeira",
          description: res.error,
          type: "error",
        });
      } else {
        toast.add({
          title: "Tarefa na lixeira",
          description: "Tarefa movida para a lixeira.",
          type: "info",
        });
        router.push("/management/tasks");
      }
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Não foi possível mover a tarefa para a lixeira.",
        type: "error",
      });
    } finally {
      setLoading(false);
      setShowTrashAlert(false);
    }
  }

  async function handleConfirmApproval() {
    if (!approvalStep) return;
    setLoading(true);
    try {
      const res = await submitApprovalDecisionAction(
        approvalStep.stepId,
        approvalStep.decision,
        approvalNote.trim() || undefined,
      );
      if (res.error) {
        toast.add({
          title: "Erro na aprovação",
          description: res.error,
          type: "error",
        });
      } else {
        toast.add({
          title:
            approvalStep.decision === "APPROVED"
              ? "Aprovação registrada"
              : "Rejeição registrada",
          description:
            approvalStep.decision === "APPROVED"
              ? "Etapa de aprovação deferida com sucesso."
              : "Etapa de aprovação indeferida.",
          type: approvalStep.decision === "APPROVED" ? "success" : "warning",
        });
        setApprovalStep(null);
        setApprovalNote("");
        router.refresh();
      }
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Não foi possível registrar a decisão de aprovação.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title={task.title}
        backHref="/management/tasks"
        backLabel="Voltar para tarefas"
        action={
          userRole !== "EMPLOYEE" ? (
            <div className="flex flex-wrap items-center gap-2">
              {![
                "COMPLETED",
                "CANCELLED",
                "NOT_COMPLETED",
                "SUBMITTED",
              ].includes(task.status) ? (
                <ManagementTaskBlockButton
                  taskId={task.id}
                  blocked={!!task.managementBlocked}
                />
              ) : null}
              {!["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(
                task.status,
              ) && (
                <Button
                  type="button"
                  variant="default"
                  onClick={() => {
                    setSelectedMemberId(primaryAssignment?.memberId || "");
                    setReassignDeadlineType("60");
                    setReassignCustomDate("");
                    setReassignReason("");
                    setShowTransferModal(true);
                  }}
                  disabled={loading}
                  className="h-10 px-3.5 rounded-[12px] bg-brand-900 text-white text-(length:--type-label) font-semibold hover:bg-brand-900/80 flex items-center gap-1.5 shadow-xs"
                >
                  <UserCheck className="size-4" />
                  Reatribuir / Destravar
                </Button>
              )}
              {canEditTaskDefinition(task) && (
                <Button
                  variant="outline"
                  disabled={loading}
                  onClick={() => setShowEditDialog(true)}
                >
                  {isForm ? "Editar tarefa com perguntas" : "Editar tarefa"}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCancelDialog(true)}
                disabled={
                  loading ||
                  ["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(
                    task.status,
                  )
                }
                className="h-10 px-3.5 rounded-[12px] bg-[var(--surface)] border-[var(--border-subtle)] text-[var(--brand-900)] text-[length:var(--type-label)] font-semibold hover:bg-[var(--canvas)]"
              >
                Cancelar
              </Button>

              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowTrashAlert(true)}
                disabled={loading}
                className="size-10 rounded-[12px] bg-red-50 text-red-700 border-red-200 hover:bg-red-100 flex items-center justify-center"
                title="Mover para a lixeira"
                aria-label="Mover para a lixeira"
              >
                <Trash2 data-icon="inline-start" className="size-4" />
              </Button>
            </div>
          ) : undefined
        }
      />

      {showEditDialog && (
        <EditTaskDialog task={task} onClose={() => setShowEditDialog(false)} />
      )}

      {/* Banner se a tarefa estiver bloqueada ou com SLA violado */}
      {!["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(task.status) &&
        (task.status === "BLOCKED" ||
          (task.deadlineAt && new Date(task.deadlineAt) < new Date())) && (
          <div className="p-4 rounded-[16px] bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="size-4 text-slate-600 dark:text-slate-400 shrink-0" />
              <span>
                {task.status === "BLOCKED"
                  ? isForm
                    ? "Esta tarefa com perguntas está bloqueada. O gestor pode reatribuí-la ou renovar o prazo para liberá-la para preenchimento."
                    : "Esta tarefa está bloqueada. O gestor pode reatribuí-la ou renovar o prazo para liberá-la para execução."
                  : isForm
                    ? "Prazo ou tolerância expirados. Renove o prazo para que o colaborador possa responder às perguntas."
                    : "Prazo ou tolerância expirados. Renove o prazo para que o colaborador possa concluir a entrega."}
              </span>
            </div>
            {userRole !== "EMPLOYEE" && (
              <Button
                size="sm"
                className="h-8 text-xs bg-slate-900 hover:bg-slate-800 text-white shrink-0 font-medium px-3 rounded-lg"
                onClick={() => {
                  setSelectedMemberId(primaryAssignment?.memberId || "");
                  setReassignDeadlineType("60");
                  setReassignCustomDate("");
                  setReassignReason("");
                  setShowTransferModal(true);
                }}
              >
                Destravar {isForm ? "tarefa com perguntas" : "tarefa"}
              </Button>
            )}
          </div>
        )}

      <Card className="bg-[var(--surface)] rounded-[18px] p-5 shadow-none border-[var(--border-subtle)]">
        <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={task.status} size="sm" showIcon />
            <PriorityBadge
              priority={task.priority}
              size="sm"
              className="w-fit! flex-none!"
            />
            {isForm && (
              <Badge className="bg-purple-100 text-purple-900 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 text-xs">
                <ClipboardList className="size-3.5" />
                Tarefa com Perguntas
              </Badge>
            )}
          </div>
          <Badge
            variant="secondary"
            className="text-(length:--type-caption) font-semibold"
          >
            {task.origin === "PROCESS"
              ? "Processo"
              : isForm
                ? "Tarefa com perguntas"
                : "Tarefa avulsa"}
          </Badge>
        </div>

        <h2 className="text-[var(--text-primary)] mb-2 text-[length:var(--type-section-title)] font-bold">
          {isForm ? "Sobre esta tarefa com perguntas" : "Sobre esta tarefa"}
        </h2>
        {task.description ? (
          <p className="text-[length:var(--type-label)] text-[var(--text-secondary)] leading-relaxed mb-4">
            {task.description}
          </p>
        ) : isForm ? (
          <p className="text-[length:var(--type-label)] text-[var(--text-secondary)] italic leading-relaxed mb-4">
            Tarefa com perguntas estruturadas para preenchimento pela equipe.
          </p>
        ) : null}

        {/* Metadados de Localização, Prazo e SLA */}
        <div
          className={`grid grid-cols-2 ${isForm ? "sm:grid-cols-4" : "sm:grid-cols-3"} gap-3 pt-4 border-t border-[var(--border-subtle)] text-[length:var(--type-label)]`}
        >
          <div>
            <span className="text-[length:var(--type-caption)] uppercase font-semibold text-[var(--text-secondary)] block">
              Unidade
            </span>
            <span className="font-semibold text-[var(--brand-900)]">
              {task.locationName || "Sem unidade"}
            </span>
          </div>

          <div>
            <span className="text-[length:var(--type-caption)] uppercase font-semibold text-[var(--text-secondary)] block">
              Equipe
            </span>
            <span className="font-semibold text-[var(--brand-900)]">
              {task.teamName || "Sem equipe"}
            </span>
          </div>

          <div>
            <span className="text-[length:var(--type-caption)] uppercase font-semibold text-[var(--text-secondary)] block">
              Prazo final
            </span>
            <span className="font-semibold text-[var(--brand-900)]">
              {task.deadlineAt
                ? new Date(task.deadlineAt).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Sem prazo fixo"}
            </span>
          </div>

          {isForm && (
            <div>
              <span className="text-[length:var(--type-caption)] uppercase font-semibold text-[var(--text-secondary)] block">
                Preenchimento
              </span>
              <span className="font-semibold text-[var(--brand-900)] flex items-center gap-1.5">
                {answeredQuestions} de {totalQuestions} respondidas
                {totalQuestions > 0 && (
                  <span
                    className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                      isFullyAnswered
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {completionPercentage}%
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      </Card>

      <Card className="bg-[var(--surface)] rounded-[18px] p-5 shadow-none border-[var(--border-subtle)]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[var(--text-secondary)] text-[length:var(--type-card-title)] font-bold">
            {isForm ? "Responsável pelo preenchimento" : "Responsáveis"}
          </h3>
          {userRole !== "EMPLOYEE" &&
            !["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(
              task.status,
            ) && (
              <Button
                type="button"
                variant="link"
                onClick={() => setShowTransferModal(true)}
                className="text-[length:var(--type-label)] font-semibold text-[var(--brand-700)] p-0 h-auto"
              >
                Alterar responsável
              </Button>
            )}
        </div>

        <div className="flex items-center justify-between p-3 rounded-[14px] bg-[var(--canvas)] border border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[var(--brand-900)] text-white">
              <User className="size-4" />
            </div>
            <div>
              <div className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                {primaryAssignment?.memberName ||
                  "Nenhum responsável atribuído"}
              </div>
              <div className="text-[length:var(--type-caption)] text-[var(--text-secondary)]">
                {primaryAssignment?.memberEmail ||
                  "Aguardando definição do responsável"}
              </div>
            </div>
          </div>
          <Badge className="text-(length:--type-caption) font-semibold px-2 py-0.5 capitalize text-xs p-3 rounded-full text-white border-transparent">
            {isForm ? "Atribuído" : "Responsável principal"}
          </Badge>
        </div>
      </Card>

      {/* Tarefa com Perguntas: Perguntas e Respostas */}
      {isForm && formFieldsList.length > 0 ? (
        <Card className="bg-[var(--surface)] rounded-[18px] p-5 shadow-none border-[var(--border-subtle)] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-4">
            <div>
              <div className="flex items-center gap-2">
                <ClipboardList className="size-5 text-brand-900" />
                <h3 className="text-[var(--brand-900)] text-[length:var(--type-card-title)] font-bold">
                  Perguntas e Respostas da Tarefa
                </h3>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Respostas registradas pelo colaborador para cada pergunta desta
                tarefa.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isFullyAnswered ? (
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 font-semibold px-3 py-1 rounded-full flex items-center gap-1.5 text-xs">
                  <CheckCircle2 className="size-3.5 text-emerald-600" />
                  100% Respondido ({answeredQuestions}/{totalQuestions})
                </Badge>
              ) : answeredQuestions > 0 ? (
                <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 font-semibold px-3 py-1 rounded-full flex items-center gap-1.5 text-xs">
                  <Clock className="size-3.5 text-amber-600" />
                  {answeredQuestions} de {totalQuestions} respondidas (
                  {completionPercentage}%)
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-slate-600 border-slate-300 font-medium px-3 py-1 rounded-full flex items-center gap-1.5 text-xs"
                >
                  <Clock className="size-3.5 text-slate-400" />
                  Aguardando respostas ({totalQuestions} perguntas)
                </Badge>
              )}
            </div>
          </div>

          {/* Barra de progresso visual */}
          {totalQuestions > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-medium text-[var(--text-secondary)]">
                <span>Progresso do preenchimento</span>
                <span>{completionPercentage}%</span>
              </div>
              <div className="w-full bg-[var(--canvas)] rounded-full h-2 overflow-hidden border border-[var(--border-subtle)]">
                <div
                  className={`h-full transition-all duration-300 rounded-full ${
                    isFullyAnswered ? "bg-emerald-500" : "bg-brand-900"
                  }`}
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>
            </div>
          )}

          {/* Lista de perguntas */}
          <div className="space-y-3 pt-1">
            {formFieldsList.map((field: any, idx: number) => {
              const answer = task.formAnswers?.[field.id];
              const isAnswered =
                answer !== undefined && answer !== null && answer !== "";
              return (
                <div
                  key={field.id}
                  className="p-4 bg-[var(--canvas)] border border-[var(--border-subtle)] rounded-[16px] flex flex-col gap-2.5 transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <span className="size-7 rounded-lg bg-brand-soft border border-brand-200 flex items-center justify-center text-xs font-bold text-brand-900 shrink-0 select-none mt-0.5">
                        {idx + 1}
                      </span>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold text-[var(--brand-900)] leading-snug">
                          {field.question ||
                            field.label ||
                            "Pergunta sem título"}
                        </span>
                        {field.required && (
                          <span className="text-[11px] font-semibold text-red-600 flex items-center gap-0.5">
                            * Obrigatória
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[10px] font-medium shrink-0 px-2 py-0.5 rounded-md bg-[var(--surface)] text-[var(--text-secondary)] border-[var(--border-subtle)]"
                    >
                      {field.type === "SHORT_TEXT" && "Texto Curto"}
                      {field.type === "LONG_TEXT" && "Texto Longo"}
                      {field.type === "RATING" && "Avaliação (1-5)"}
                      {field.type === "BOOLEAN" && "Sim / Não"}
                      {field.type === "PHOTO" && "Foto"}
                      {field.type === "VIDEO" && "Vídeo"}
                      {field.type === "FILE" && "Arquivos"}
                      {field.type === "NUMBER" && "Número"}
                      {field.type === "MULTIPLE_CHOICE" && "Múltipla escolha"}
                      {(!field.type ||
                        ![
                          "SHORT_TEXT",
                          "LONG_TEXT",
                          "RATING",
                          "BOOLEAN",
                          "PHOTO",
                          "VIDEO",
                          "FILE",
                          "NUMBER",
                          "MULTIPLE_CHOICE",
                        ].includes(field.type)) &&
                        (field.type || "Texto")}
                    </Badge>
                  </div>

                  {/* Resposta do Colaborador */}
                  <div className="mt-1">
                    <span className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-secondary)] block mb-1">
                      Resposta:
                    </span>
                    <div className="text-sm text-[var(--text-primary)] font-medium bg-[var(--surface)] p-3 rounded-[12px] border border-[var(--border-subtle)]">
                      {!isAnswered ? (
                        <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 italic text-xs py-0.5">
                          <Clock className="size-3.5 text-slate-400 shrink-0" />
                          <span>Aguardando resposta do colaborador</span>
                        </div>
                      ) : field.type === "BOOLEAN" ? (
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                              answer === true || answer === "true"
                                ? "bg-emerald-100 text-emerald-900 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300"
                                : "bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-800 dark:text-slate-300"
                            }`}
                          >
                            {answer === true || answer === "true" ? (
                              <>
                                <CheckCircle2 className="size-3.5 text-emerald-600" />{" "}
                                Sim
                              </>
                            ) : (
                              <>
                                <XCircle className="size-3.5 text-slate-500" />{" "}
                                Não
                              </>
                            )}
                          </span>
                        </div>
                      ) : field.type === "RATING" ? (
                        <div className="flex items-center gap-3">
                          <div className="flex gap-1 text-amber-500 text-base">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <span key={i}>
                                {i < Number(answer) ? "★" : "☆"}
                              </span>
                            ))}
                          </div>
                          <span className="text-xs font-semibold text-[var(--brand-900)]">
                            {answer} de 5 estrelas
                          </span>
                        </div>
                      ) : field.type === "PHOTO" ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2.5 text-brand-900 dark:text-primary">
                            <Camera className="size-4 text-brand-700 shrink-0" />
                            <span className="font-semibold text-xs">
                              {typeof answer === "object"
                                ? answer.fileName
                                : String(answer)}
                            </span>
                          </div>
                          {typeof answer === "object" &&
                            (answer.fileUrl || answer.storageKey) && (
                              <div className="flex items-center gap-2 mt-0.5">
                                <a
                                  href={
                                    answer.fileUrl ||
                                    `/api/tasks/${task.id}/form-file/${answer.storageKey}`
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--canvas)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--brand-900)] hover:bg-[var(--surface)] transition-colors"
                                >
                                  <ExternalLink className="size-3.5" />
                                  <span>Visualizar foto</span>
                                </a>
                              </div>
                            )}
                        </div>
                      ) : field.type === "VIDEO" ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2.5 text-brand-900 dark:text-primary">
                            <Video className="size-4 text-brand-700 shrink-0" />
                            <span className="font-semibold text-xs">
                              {typeof answer === "object"
                                ? answer.fileName
                                : String(answer)}
                            </span>
                          </div>
                          {typeof answer === "object" &&
                            (answer.fileUrl || answer.storageKey) && (
                              <div className="flex items-center gap-2 mt-0.5">
                                <a
                                  href={
                                    answer.fileUrl ||
                                    `/api/tasks/${task.id}/form-file/${answer.storageKey}`
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--canvas)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--brand-900)] hover:bg-[var(--surface)] transition-colors"
                                >
                                  <ExternalLink className="size-3.5" />
                                  <span>Assistir / Baixar vídeo</span>
                                </a>
                              </div>
                            )}
                        </div>
                      ) : field.type === "FILE" ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2.5 text-brand-900 dark:text-primary">
                            <Paperclip className="size-4 text-brand-700 shrink-0" />
                            <span className="font-semibold text-xs">
                              {typeof answer === "object"
                                ? answer.fileName
                                : String(answer)}
                            </span>
                            {typeof answer === "object" && answer.fileSize && (
                              <span className="text-[11px] text-muted-foreground">
                                ({Math.round(answer.fileSize / 1024)} KB)
                              </span>
                            )}
                          </div>
                          {typeof answer === "object" &&
                            (answer.fileUrl || answer.storageKey) && (
                              <div className="flex items-center gap-2 mt-0.5">
                                <a
                                  href={
                                    answer.fileUrl ||
                                    `/api/tasks/${task.id}/form-file/${answer.storageKey}`
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--canvas)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--brand-900)] hover:bg-[var(--surface)] transition-colors"
                                >
                                  <Download className="size-3.5" />
                                  <span>Baixar anexo</span>
                                </a>
                              </div>
                            )}
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap leading-relaxed text-xs sm:text-sm">
                          {String(answer)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : isForm ? (
        <Card className="bg-[var(--surface)] rounded-[18px] p-5 shadow-none border-[var(--border-subtle)]">
          <h3 className="text-[var(--text-secondary)] mb-2 text-[length:var(--type-card-title)] font-bold">
            Perguntas da Tarefa
          </h3>
          <p className="text-xs text-[var(--text-secondary)] italic">
            Nenhuma pergunta foi cadastrada para esta tarefa.
          </p>
        </Card>
      ) : null}

      {/* Instruções de Execução */}
      {task.instructions && (
        <Card className="bg-[var(--surface)] rounded-[18px] p-5 shadow-none border-[var(--border-subtle)]">
          <h3 className="text-[var(--text-secondary)] mb-2 text-[length:var(--type-card-title)] font-bold">
            {isForm ? "Orientações gerais para o preenchimento" : "Instruções"}
          </h3>
          <div className="text-[length:var(--type-label)] text-[var(--brand-900)] bg-[var(--canvas)] p-3 rounded-[14px] border border-[var(--border-subtle)] whitespace-pre-line leading-relaxed">
            {task.instructions}
          </div>
        </Card>
      )}

      {/* Evidências Coletadas (oculta se for form sem evidências exigidas) */}
      {(!isForm || task.evidenceRequirements.length > 0) && (
        <Card className="bg-[var(--surface)] rounded-[18px] p-5 shadow-none border-[var(--border-subtle)]">
          <h3 className="text-[var(--text-secondary)] mb-3 text-[length:var(--type-card-title)] font-bold">
            {isForm ? "Evidências Fotográficas Adicionais" : "Evidências"}
          </h3>

          {task.evidenceRequirements.length === 0 ? (
            <p className="text-[length:var(--type-label)] text-[var(--text-secondary)]">
              Esta tarefa não exige evidências.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {task.evidenceRequirements.map((req) => (
                <Card
                  key={req.id}
                  className="p-3.5 rounded-[16px] bg-[var(--canvas)] border-[var(--border-subtle)] shadow-none"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Camera className="size-4 text-[var(--brand-700)]" />
                      <span className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                        {uiLabel(req.type)}
                      </span>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[length:var(--type-caption)] font-semibold px-2 py-0.5 rounded-full bg-[var(--surface)] border-[var(--border-subtle)] text-[var(--brand-900)]"
                    >
                      {(
                        {
                          START: "Antes de iniciar",
                          DURING: "Durante a execução",
                          COMPLETION: "Para concluir",
                        } as Record<string, string>
                      )[req.executionStage] || req.executionStage}
                    </Badge>
                  </div>

                  <div className="flex flex-col gap-1.5 mt-2">
                    {req.submissions.length === 0 ? (
                      <span className="text-[length:var(--type-label)] text-amber-800 font-medium">
                        Aguardando envio do colaborador.
                      </span>
                    ) : (
                      req.submissions.map((sub) => (
                        <Card
                          key={sub.id}
                          className="flex items-center justify-between p-2 rounded-[10px] bg-[var(--surface)] border-[var(--border-subtle)] text-[length:var(--type-label)] shadow-none"
                        >
                          <div>
                            <span className="font-semibold text-[var(--brand-900)]">
                              {sub.fileUrl || sub.storageKey ? (
                                <a
                                  className="underline hover:text-brand-700"
                                  href={
                                    sub.fileUrl || `/api/evidence/${sub.id}`
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Visualizar / Baixar {sub.value || "arquivo"}
                                </a>
                              ) : (
                                sub.value || "Evidência enviada"
                              )}
                            </span>
                            <span className="text-[length:var(--type-caption)] text-[var(--text-secondary)] block">
                              Tentativa #{sub.attemptNumber} •{" "}
                              {new Date(sub.createdAt).toLocaleTimeString(
                                "pt-BR",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                            </span>
                          </div>
                          <Badge
                            variant={
                              sub.validationStatus === "VALID"
                                ? "default"
                                : "destructive"
                            }
                            className={`text-[length:var(--type-caption)] font-semibold px-2 py-0.5 rounded-full ${
                              sub.validationStatus === "VALID"
                                ? "bg-emerald-100 text-emerald-900 border-transparent"
                                : "bg-red-100 text-red-900 border-transparent"
                            }`}
                          >
                            {sub.validationStatus === "VALID"
                              ? "Validada"
                              : "Rejeitada"}
                          </Badge>
                        </Card>
                      ))
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Dependências Operacionais */}
      <Card className="bg-[var(--surface)] rounded-[18px] p-5 shadow-none border-[var(--border-subtle)]">
        <h3 className="text-[var(--text-secondary)] mb-3 text-[length:var(--type-card-title)] font-bold">
          Etapas anteriores
        </h3>

        {task.dependencies.length === 0 ? (
          <p className="text-[length:var(--type-label)] text-[var(--text-secondary)]">
            Esta tarefa pode começar sem aguardar outras etapas.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {task.dependencies.map((dep) => (
              <Card
                key={dep.id}
                className="flex items-center justify-between p-3 rounded-[12px] bg-[var(--canvas)] border-[var(--border-subtle)] text-[length:var(--type-label)] shadow-none"
              >
                <div>
                  <div className="font-semibold text-[var(--brand-900)]">
                    Depende de: {dep.dependsOnTask.title}
                  </div>
                  <div className="text-[length:var(--type-caption)] text-[var(--text-secondary)]">
                    {uiLabel(dep.type)} ·{" "}
                    {dep.logic === "AND"
                      ? "Todas as dependências"
                      : "Uma das dependências"}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className="text-[length:var(--type-caption)] font-semibold px-2 py-0.5 rounded-full bg-[var(--surface)] text-[var(--brand-900)] border-[var(--border-subtle)]"
                >
                  {uiLabel(dep.dependsOnTask.status)}
                </Badge>
              </Card>
            ))}
          </div>
        )}
      </Card>

      {/* Fluxo de Aprovação */}
      {task.approvalWorkflow && (
        <Card className="bg-[var(--surface)] rounded-[18px] p-5 shadow-none border-[var(--border-subtle)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[var(--text-secondary)] text-[length:var(--type-card-title)] font-bold">
              Aprovações
            </h3>
            <Badge
              variant="secondary"
              className="text-[length:var(--type-label)] font-semibold px-2 py-0.5 rounded-full bg-[var(--brand-soft)] text-[var(--brand-900)] border-transparent"
            >
              {uiLabel(task.approvalWorkflow.status)}
            </Badge>
          </div>

          <div className="flex flex-col gap-2.5">
            {task.approvalWorkflow.steps.map((step) => (
              <Card
                key={step.id}
                className="p-3 rounded-[14px] bg-[var(--canvas)] border-[var(--border-subtle)] flex items-center justify-between text-[length:var(--type-label)] shadow-none"
              >
                <div>
                  <span className="font-semibold text-[var(--brand-900)]">
                    Etapa {step.sequence} · {uiLabel(step.status)}
                  </span>
                </div>

                {step.canDecide && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        setApprovalStep({
                          stepId: step.id,
                          decision: "APPROVED",
                        })
                      }
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      Aprovar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        setApprovalStep({
                          stepId: step.id,
                          decision: "REJECTED",
                        })
                      }
                      className="bg-rose-600 text-white hover:bg-rose-700"
                    >
                      Solicitar correção
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </Card>
      )}

      {/* Ocorrências e Alertas Operacionais - Inicialmente colapsado, layout limpo e neutro */}
      {(() => {
        const validOccurrences = (task.occurrences || []).filter(
          (o) => !isPauseOccurrence(o),
        );
        const impediments = validOccurrences.filter(
          (o) => o.type !== "SLA_BREACH",
        );
        const slaBreaches = validOccurrences
          .filter((o) => o.type === "SLA_BREACH")
          .sort((a, b) => {
            const minsA = parseInt(a.category.replace(/^SLA_/, ""), 10) || 0;
            const minsB = parseInt(b.category.replace(/^SLA_/, ""), 10) || 0;
            return minsB - minsA;
          });

        return (
          <Card className="bg-[var(--surface)] rounded-[18px] shadow-none border-[var(--border-subtle)] overflow-hidden">
            <button
              type="button"
              onClick={() => setOccurrencesOpen((prev) => !prev)}
              className="w-full flex items-center justify-between gap-3 p-4 sm:p-5 text-left hover:bg-slate-50/60 dark:hover:bg-slate-900/40 transition-colors cursor-pointer select-none"
            >
              <div className="flex items-center gap-2.5 flex-wrap">
                <AlertCircle className="size-4 text-slate-600 dark:text-slate-400 shrink-0" />
                <h3 className="text-[var(--text-primary)] text-[length:var(--type-card-title)] font-bold">
                  Ocorrências e Alertas Operacionais
                </h3>
                <Badge
                  variant="outline"
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    validOccurrences.length > 0
                      ? "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200"
                      : "bg-transparent text-slate-500 border-slate-200"
                  }`}
                >
                  {validOccurrences.length}{" "}
                  {validOccurrences.length === 1 ? "registro" : "registros"}
                </Badge>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium shrink-0">
                <span>
                  {occurrencesOpen ? "Ocultar detalhes" : "Ver detalhes"}
                </span>
                {occurrencesOpen ? (
                  <ChevronUp className="size-4 text-slate-500" />
                ) : (
                  <ChevronDown className="size-4 text-slate-500" />
                )}
              </div>
            </button>

            {occurrencesOpen && (
              <div className="px-5 pb-5 pt-1 border-t border-[var(--border-subtle)] flex flex-col gap-4">
                {validOccurrences.length === 0 ? (
                  <p className="text-[length:var(--type-label)] text-[var(--text-secondary)] py-3">
                    Nenhuma ocorrência ou violação de prazo registrada nesta
                    tarefa.
                  </p>
                ) : (
                  <>
                    {/* 1. Impedimentos Operacionais (se houver) */}
                    {impediments.length > 0 && (
                      <div className="flex flex-col gap-2 pt-2">
                        <span className="text-[11px] font-semibold text-rose-800 dark:text-rose-300 uppercase tracking-wide">
                          Impedimentos reportados ({impediments.length})
                        </span>
                        <div className="flex flex-col gap-2">
                          {impediments.map((imp) => {
                            const sev = formatSeverity(imp.severity);
                            const catLabel = formatOccurrenceCategory(
                              imp.category,
                              imp.type,
                            );
                            return (
                              <div
                                key={imp.id}
                                className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-xs flex flex-col gap-2"
                              >
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant="destructive"
                                      className="text-[10px] uppercase font-bold px-1.5 py-0.2"
                                    >
                                      Impedimento
                                    </Badge>
                                    <span className="font-semibold text-slate-900 dark:text-slate-100 text-xs">
                                      {catLabel}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      className={`text-[10px] font-semibold ${sev.badgeClass}`}
                                    >
                                      Severidade: {sev.label}
                                    </Badge>
                                    <span className="text-[11px] text-muted-foreground font-mono">
                                      {new Date(imp.createdAt).toLocaleString(
                                        "pt-BR",
                                        {
                                          dateStyle: "short",
                                          timeStyle: "short",
                                        },
                                      )}
                                    </span>
                                  </div>
                                </div>
                                <p className="text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-950/60 p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800 text-xs leading-relaxed">
                                  {imp.reason}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 2. Violação de Prazo Limite / Marcos de Atraso */}
                    {slaBreaches.length > 0 &&
                      (() => {
                        const latestBreach = slaBreaches[0];
                        const latestMins =
                          parseInt(
                            latestBreach.category.replace(/^SLA_/, ""),
                            10,
                          ) || 0;
                        const sev = formatSeverity(latestBreach.severity);

                        return (
                          <div className="flex flex-col gap-2.5 pt-2">
                            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                              Alertas de Prazo & Atraso
                            </span>

                            {/* Resumo executivo do atraso atual - Neutro, limpo, moderno */}
                            <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="flex items-start gap-2.5">
                                <Clock className="size-5 text-slate-600 dark:text-slate-400 shrink-0 mt-0.5" />
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">
                                      Prazo Excedido
                                    </span>
                                    <Badge
                                      variant="outline"
                                      className="bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-200 text-[10px] font-semibold"
                                    >
                                      {latestMins > 0
                                        ? formatOccurrenceCategory(
                                            latestBreach.category,
                                            latestBreach.type,
                                          )
                                        : "Prazo original esgotado"}
                                    </Badge>
                                    <Badge
                                      className={`text-[10px] font-semibold ${sev.badgeClass}`}
                                    >
                                      Severidade: {sev.label}
                                    </Badge>
                                  </div>
                                  <p className="text-slate-600 dark:text-slate-400 text-xs mt-1">
                                    {cleanReason(latestBreach.reason)}
                                  </p>
                                </div>
                              </div>
                              <div className="text-left sm:text-right shrink-0">
                                <span className="text-[10px] text-slate-500 block font-medium">
                                  Último alerta do sistema:
                                </span>
                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 font-mono">
                                  {new Date(
                                    latestBreach.createdAt,
                                  ).toLocaleString("pt-BR", {
                                    dateStyle: "short",
                                    timeStyle: "short",
                                  })}
                                </span>
                              </div>
                            </div>

                            {/* Histórico limpo dos marcos disparados */}
                            {slaBreaches.length > 1 && (
                              <div className="flex flex-col gap-1.5 pt-1">
                                <span className="text-[11px] text-[var(--text-secondary)] font-medium">
                                  Histórico dos marcos de alerta (
                                  {slaBreaches.length} notificações disparadas):
                                </span>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                  {slaBreaches.map((b) => {
                                    const mins =
                                      parseInt(
                                        b.category.replace(/^SLA_/, ""),
                                        10,
                                      ) || 0;
                                    const label =
                                      mins === 0
                                        ? "Prazo esgotado (0 min)"
                                        : `Alerta aos +${mins} min`;
                                    return (
                                      <div
                                        key={b.id}
                                        className="p-2.5 rounded-lg bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs flex flex-col gap-0.5"
                                      >
                                        <div className="flex items-center justify-between gap-1">
                                          <span className="font-semibold text-slate-800 dark:text-slate-200 text-[11px]">
                                            {label}
                                          </span>
                                          <span className="text-[10px] text-muted-foreground font-mono">
                                            {new Date(
                                              b.createdAt,
                                            ).toLocaleTimeString("pt-BR", {
                                              hour: "2-digit",
                                              minute: "2-digit",
                                            })}
                                          </span>
                                        </div>
                                        <span className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-1">
                                          {cleanReason(b.reason)}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                  </>
                )}
              </div>
            )}
          </Card>
        );
      })()}

      {/* Auditoria Append-Only */}
      <Card className="bg-[var(--surface)] rounded-[18px] p-5 shadow-none border-[var(--border-subtle)]">
        <h3 className="text-[var(--text-secondary)] mb-3 flex items-center gap-1.5 text-[length:var(--type-card-title)] font-bold">
          <History className="size-4" />
          <span>Histórico de atividades</span>
        </h3>

        <div className="flex flex-col divide-y divide-[var(--border-subtle)] text-[length:var(--type-label)]">
          {task.activityLogs.map((log) => (
            <div
              key={log.id}
              className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between"
            >
              <div>
                <span className="font-semibold text-[var(--brand-900)]">
                  {uiLabel(log.action)}
                </span>
                <span className="text-[length:var(--type-caption)] text-[var(--text-secondary)] block">
                  Por: {log.actorName || "Sistema"}
                </span>
              </div>
              <span className="text-[length:var(--type-caption)] text-[var(--text-secondary)] font-mono">
                {new Date(log.createdAt).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Dialog open={showTransferModal} onOpenChange={setShowTransferModal}>
        <DialogContent className="sm:max-w-lg p-7!">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="size-5 text-[var(--brand-900)]" />
              <span>Reatribuir tarefa & renovar prazo</span>
            </DialogTitle>
            <DialogDescription>
              Selecione o colaborador responsável e defina o novo prazo para
              conclusão.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Field>
              <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                Colaborador responsável *
              </FieldLabel>
              <NativeSelect
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className="text-[length:var(--type-label)]"
              >
                <NativeSelectOption value="">
                  Selecione um colaborador...
                </NativeSelectOption>
                {availableMembers.map((m) => {
                  const isCurrent = m.id === primaryAssignment?.memberId;
                  return (
                    <NativeSelectOption key={m.id} value={m.id}>
                      {m.name} {isCurrent ? "- Responsável atual" : ""}
                    </NativeSelectOption>
                  );
                })}
              </NativeSelect>
            </Field>

            {/* Novo Prazo */}
            <div className="space-y-2">
              <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)] block">
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
                    variant={
                      reassignDeadlineType === opt.id ? "default" : "outline"
                    }
                    className={`h-8 text-xs font-medium px-2 rounded-lg transition-all ${
                      reassignDeadlineType === opt.id
                        ? "bg-[var(--brand-900)] text-white font-semibold shadow-xs hover:bg-[var(--brand-800)]"
                        : "bg-[var(--surface)] hover:bg-slate-100 text-[var(--text-secondary)]"
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
                  <strong>Novo prazo:</strong>{" "}
                  {getDeadlinePreview(reassignDeadlineType, reassignCustomDate)}
                </span>
              </div>
            </div>

            <Field>
              <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                Observação / Motivo (opcional)
              </FieldLabel>
              <Textarea
                rows={2}
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                placeholder="Ex: Tarefa atrasada por falta de insumos; prazo renegociado com a equipe..."
                className="text-sm! resize-none"
              />
            </Field>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowTransferModal(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleTransfer}
              disabled={!selectedMemberId || loading}
              className="bg-[var(--brand-900)] hover:bg-[var(--brand-800)] text-white font-semibold"
            >
              {loading ? <Spinner data-icon="inline-start" /> : null}
              <span>Confirmar e renovar prazo</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: CANCELAR TAREFA */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar tarefa</DialogTitle>
            <DialogDescription>
              Explique por que a tarefa será cancelada. O motivo ficará no
              histórico.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Field>
              <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                Justificativa *
              </FieldLabel>
              <Textarea
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Descreva o motivo do cancelamento..."
                className="text-[length:var(--type-label)] resize-none"
              />
            </Field>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCancelDialog(false)}
            >
              Voltar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmCancel}
              disabled={loading || !cancelReason.trim()}
            >
              {loading ? <Spinner data-icon="inline-start" /> : null}
              <span>Cancelar tarefa</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: DECISÃO DE APROVAÇÃO */}
      <Dialog
        open={approvalStep !== null}
        onOpenChange={(open) => {
          if (!open) setApprovalStep(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {approvalStep?.decision === "APPROVED"
                ? "Aprovar etapa"
                : "Solicitar correção"}
            </DialogTitle>
            <DialogDescription>
              {approvalStep?.decision === "APPROVED"
                ? "Confirme a aprovação da etapa. Você pode incluir uma nota opcional."
                : "Descreva o que precisa ser corrigido antes da aprovação."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Field>
              <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                Observações
              </FieldLabel>
              <Textarea
                rows={3}
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder="Adicione uma observação, se necessário"
                className="text-[length:var(--type-label)] resize-none"
              />
            </Field>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setApprovalStep(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className={
                approvalStep?.decision === "APPROVED"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : ""
              }
              variant={
                approvalStep?.decision === "APPROVED"
                  ? "default"
                  : "destructive"
              }
              onClick={handleConfirmApproval}
              disabled={loading}
            >
              {loading ? <Spinner data-icon="inline-start" /> : null}
              <span>
                {approvalStep?.decision === "APPROVED"
                  ? "Aprovar etapa"
                  : "Solicitar correção"}
              </span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ALERT DIALOG: MOVER PARA LIXEIRA */}
      <AlertDialog open={showTrashAlert} onOpenChange={setShowTrashAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover tarefa para a lixeira?</AlertDialogTitle>
            <AlertDialogDescription>
              A tarefa sairá da lista de atividades. Você poderá restaurá-la na
              lixeira.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmTrash}
              disabled={loading}
            >
              {loading ? <Spinner data-icon="inline-start" /> : null}
              <span>Mover para a lixeira</span>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
