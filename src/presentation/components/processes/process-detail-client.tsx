"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Pencil,
  Play,
  Pause,
  Archive,
  PlayCircle,
  Plus,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ListChecks,
  AlertTriangle,
  XCircle,
  Users,
  Timer,
  ChevronDown,
  Info,
} from "lucide-react";
import { PageHeader, StatusBadge, Modal, EmptyState } from "../shared";
import {
  toggleProcessStatusAction,
  createRoutineAction,
  toggleRoutineAction,
  triggerExecutionGenerationAction,
  cancelExecutionAction,
  reopenExecutionAction,
} from "@/presentation/actions/process-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";
import { ScheduleFields } from "./schedule-fields";
import {
  defaultSchedule,
  describeSchedule,
  weekdayLabels,
  type ScheduleDefinition,
} from "@/domain/rules/process-definition";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

export interface ProcessDetailProps {
  process: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    criticality: string;
    locationName: string | null;
    validFrom: string | null;
    validUntil: string | null;
  };
  routines: Array<{
    id: string;
    recurrenceRule: string;
    timezone: string;
    generationLeadTime: number;
    pendingPreviousPolicy: string;
    status: string;
    nextOccurrenceAt: string | null;
    parsedSchedule: ScheduleDefinition | null;
    exceptions: Array<{
      id: string;
      date: string;
      action: string;
      reason: string | null;
    }>;
  }>;
  executions: Array<{
    id: string;
    status: string;
    scheduledAt: string;
    startedAt: string | null;
    completedAt: string | null;
    reopenedAt: string | null;
    reopenReason: string | null;
    cancelledAt: string | null;
    cancellationReason: string | null;
    totalTasks: number;
    completedTasks: number;
    tasks: Array<{
      id: string;
      title: string;
      status: string;
      required: boolean;
    }>;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    teamName: string | null;
    estimatedMinutes: number | null;
    required: boolean;
    primaryMemberName: string | null;
    approverNames: string[];
  }>;
  userRole: string;
  canEdit: boolean;
}

const CRITICALITY_LABELS: Record<string, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

const EXECUTION_STATUS_CONFIG: Record<
  string,
  { label: string; color: string; dotClass: string; borderClass: string }
> = {
  COMPLETED: {
    label: "Concluído",
    color: "bg-emerald-500",
    dotClass: "bg-emerald-500 ring-emerald-100",
    borderClass: "border-emerald-200 bg-emerald-50/30",
  },
  RUNNING: {
    label: "Em andamento",
    color: "bg-blue-500",
    dotClass: "bg-blue-500 ring-blue-100",
    borderClass: "border-blue-200 bg-blue-50/30",
  },
  SCHEDULED: {
    label: "Agendado",
    color: "bg-amber-500",
    dotClass: "bg-amber-500 ring-amber-100",
    borderClass: "border-amber-200 bg-amber-50/30",
  },
  FAILED: {
    label: "Falhou",
    color: "bg-red-500",
    dotClass: "bg-red-500 ring-red-100",
    borderClass: "border-red-200 bg-red-50/30",
  },
  CANCELLED: {
    label: "Cancelado",
    color: "bg-zinc-400",
    dotClass: "bg-zinc-400 ring-zinc-100",
    borderClass: "border-zinc-200 bg-zinc-50/40",
  },
};

const ALL_WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

export function ProcessDetailClient({
  process: proc,
  routines,
  executions,
  tasks,
  userRole,
  canEdit,
}: ProcessDetailProps) {
  const router = useRouter();

  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Process status modal state
  const [processStatusTarget, setProcessStatusTarget] = useState<
    "ACTIVE" | "PAUSED" | "ARCHIVED" | null
  >(null);

  // Routine (Calendar) Modal State
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [scheduleState, setScheduleState] = useState<ScheduleDefinition>(() =>
    routines[0]?.parsedSchedule ? routines[0].parsedSchedule : defaultSchedule(),
  );

  // Execution modal state (cancel or reopen)
  const [selectedExecution, setSelectedExecution] = useState<(typeof executions)[0] | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelCategory, setCancelCategory] = useState("OPERACIONAL");
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");

  const activeRoutine = routines.find((r) => r.status === "ACTIVE") ?? routines[0] ?? null;

  // Formatting helpers
  function formatDateTime(iso: string) {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
      time: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      full: d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  }

  // Action handlers
  async function handleToggleProcessStatus(targetStatus: "ACTIVE" | "PAUSED" | "ARCHIVED") {
    setBusyAction("process-status");
    try {
      const res = await toggleProcessStatusAction(proc.id, targetStatus);
      if (res.error) {
        toast.add({
          title: "Erro ao alterar status",
          description: res.error,
          type: "error",
        });
      } else {
        setProcessStatusTarget(null);
        toast.add({
          title:
            targetStatus === "ARCHIVED"
              ? "Processo arquivado"
              : targetStatus === "PAUSED"
                ? "Processo pausado"
                : "Processo reativado",
          description:
            targetStatus === "ARCHIVED"
              ? "Processo arquivado com sucesso."
              : targetStatus === "PAUSED"
                ? "Processo pausado. O cronograma não gerará novas execuções."
                : "Processo reativado com sucesso.",
          type: targetStatus === "ARCHIVED" ? "info" : targetStatus === "PAUSED" ? "warning" : "success",
        });
        router.refresh();
      }
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Não foi possível alterar o status do processo.",
        type: "error",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSaveCalendar(e: React.FormEvent) {
    e.preventDefault();
    setBusyAction("save-calendar");
    try {
      const form = new FormData();
      form.set("processId", proc.id);
      if (editingRoutineId) form.set("routineId", editingRoutineId);
      form.set("schedule", JSON.stringify(scheduleState));

      const res = await createRoutineAction(form);
      if (res.error) {
        toast.add({
          title: "Erro ao salvar calendário",
          description: res.error,
          type: "error",
        });
      } else {
        setCalendarModalOpen(false);
        toast.add({
          title: "Calendário salvo",
          description: "Calendário do processo salvo com sucesso!",
          type: "success",
        });
        router.refresh();
      }
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Não foi possível salvar a programação do calendário.",
        type: "error",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleToggleRoutine(routineId: string) {
    setBusyAction(`routine-${routineId}`);
    try {
      const res = await toggleRoutineAction(routineId);
      if (res.error) {
        toast.add({
          title: "Erro no calendário",
          description: res.error,
          type: "error",
        });
      } else {
        toast.add({
          title: "Calendário atualizado",
          description: "Status do calendário atualizado com sucesso.",
          type: "success",
        });
        router.refresh();
      }
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Erro ao alternar status do calendário.",
        type: "error",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleTriggerExecution(routineId: string) {
    setBusyAction("trigger-execution");
    try {
      const res = await triggerExecutionGenerationAction(routineId);
      if (res.error) {
        toast.add({
          title: "Erro ao disparar execução",
          description: res.error,
          type: "error",
        });
      } else {
        toast.add({
          title: "Execução adicionada",
          description: "Nova execução adicionada ao cronograma com sucesso!",
          type: "success",
        });
        router.refresh();
      }
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Não foi possível disparar a execução.",
        type: "error",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleConfirmCancel() {
    if (!selectedExecution) return;
    setBusyAction("cancel-execution");
    try {
      const res = await cancelExecutionAction(
        selectedExecution.id,
        cancelReason,
        cancelCategory,
      );
      if (res.error) {
        toast.add({
          title: "Erro ao cancelar execução",
          description: res.error,
          type: "error",
        });
      } else {
        setCancelModalOpen(false);
        setCancelReason("");
        toast.add({
          title: "Execução cancelada",
          description: "Execução cancelada com sucesso.",
          type: "info",
        });
        router.refresh();
      }
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Erro ao cancelar a execução.",
        type: "error",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleConfirmReopen() {
    if (!selectedExecution) return;
    setBusyAction("reopen-execution");
    try {
      const res = await reopenExecutionAction(selectedExecution.id, reopenReason);
      if (res.error) {
        toast.add({
          title: "Erro ao reabrir execução",
          description: res.error,
          type: "error",
        });
      } else {
        setReopenModalOpen(false);
        setReopenReason("");
        toast.add({
          title: "Execução reaberta",
          description: "Execução reaberta no cronograma com sucesso.",
          type: "success",
        });
        router.refresh();
      }
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Erro ao reabrir a execução.",
        type: "error",
      });
    } finally {
      setBusyAction(null);
    }
  }

  function openEditCalendar(routine?: (typeof routines)[0]) {
    if (routine) {
      setEditingRoutineId(routine.id);
      setScheduleState(routine.parsedSchedule ?? defaultSchedule());
    } else {
      setEditingRoutineId(null);
      setScheduleState(defaultSchedule());
    }
    setCalendarModalOpen(true);
  }

  // Active days logic for the weekly calendar pills
  const activeDaysSet = new Set<string>();
  if (activeRoutine?.parsedSchedule) {
    if (activeRoutine.parsedSchedule.frequency === "DAILY") {
      ALL_WEEKDAYS.forEach((d) => activeDaysSet.add(d));
    } else if (activeRoutine.parsedSchedule.frequency === "WEEKLY") {
      activeRoutine.parsedSchedule.weekdays.forEach((d) => activeDaysSet.add(d));
    }
  }

  return (
    <div className="page-stack mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/management/processes"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--brand-900)] transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          <span>Voltar para Processos</span>
        </Link>

        <div className="flex items-center gap-2">
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href={`/management/processes/${proc.id}/edit`} />}
              className="text-xs h-8 gap-1.5 border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--canvas)]"
            >
              <Pencil className="size-3.5" />
              Editar processo
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-8 px-2 border-[var(--border-subtle)]"
                  aria-label="Mais opções do processo"
                />
              }
            >
              <ChevronDown className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {proc.status === "ACTIVE" ? (
                <DropdownMenuItem onClick={() => setProcessStatusTarget("PAUSED")}>
                  <Pause className="size-4 mr-2" />
                  <span>Pausar processo</span>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => setProcessStatusTarget("ACTIVE")}>
                  <Play className="size-4 mr-2" />
                  <span>Reativar processo</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setProcessStatusTarget("ARCHIVED")}
              >
                <Archive className="size-4 mr-2" />
                <span>Arquivar processo</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>



      {/* Hero Header Card - Minimalist & Explicit */}
      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl p-5 sm:p-6 space-y-4 shadow-none">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={proc.status} showIcon />
            <Badge
              variant="outline"
              className="text-xs font-normal text-[var(--text-secondary)] bg-[var(--canvas)] border-[var(--border-subtle)]"
            >
              Criticidade {CRITICALITY_LABELS[proc.criticality] ?? proc.criticality}
            </Badge>
            {proc.locationName && (
              <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                <MapPin className="size-3.5 text-muted-foreground" />
                <strong>{proc.locationName}</strong>
              </span>
            )}
          </div>

          {(proc.validFrom || proc.validUntil) && (
            <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1">
              <Calendar className="size-3 text-muted-foreground" />
              Validade:{" "}
              {proc.validFrom ? formatDateTime(proc.validFrom).date : "Início imediato"} até{" "}
              {proc.validUntil ? formatDateTime(proc.validUntil).date : "Indeterminada"}
            </span>
          )}
        </div>

        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight">
            {proc.name}
          </h1>
          {proc.description ? (
            <p className="text-sm text-[var(--text-secondary)] mt-1.5 leading-relaxed max-w-3xl">
              {proc.description}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground italic mt-1">Sem descrição cadastrada.</p>
          )}
        </div>

        {/* Quick Highlights Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3 bg-[var(--canvas)] rounded-xl">
            <span className="text-[11px] text-[var(--text-secondary)] block">Etapas do processo</span>
            <span className="text-base font-semibold text-[var(--text-primary)]">
              {tasks.length} {tasks.length === 1 ? "tarefa" : "tarefas"}
            </span>
          </div>

          <div className="p-3 bg-[var(--canvas)] rounded-xl">
            <span className="text-[11px] text-[var(--text-secondary)] block">Status do calendário</span>
            <span className="text-base font-semibold text-[var(--text-primary)]">
              {activeRoutine ? (activeRoutine.status === "ACTIVE" ? "Ativo" : "Pausado") : "Não configurado"}
            </span>
          </div>

          <div className="p-3 bg-[var(--canvas)] rounded-xl">
            <span className="text-[11px] text-[var(--text-secondary)] block">Próxima execução</span>
            <span className="text-base font-semibold text-[var(--text-primary)] truncate block">
              {activeRoutine?.nextOccurrenceAt
                ? formatDateTime(activeRoutine.nextOccurrenceAt).full
                : "Sem previsão"}
            </span>
          </div>

          <div className="p-3 bg-[var(--canvas)] rounded-xl">
            <span className="text-[11px] text-[var(--text-secondary)] block">Execuções no cronograma</span>
            <span className="text-base font-semibold text-[var(--text-primary)]">
              {executions.length} {executions.length === 1 ? "registro" : "registros"}
            </span>
          </div>
        </div>
      </div>

      {/* SECTION 1: CALENDÁRIO DO PROCESSO (Substitui "Rotinas") */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Calendar className="size-4 text-[var(--brand-700)]" />
              <span>Calendário</span>
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Agenda e frequência em que este processo é executado automaticamente.
            </p>
          </div>

          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => openEditCalendar(activeRoutine ?? undefined)}
              className="text-xs h-8 gap-1.5 border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--surface)]"
            >
              {activeRoutine ? <Pencil className="size-3.5" /> : <Plus className="size-3.5" />}
              {activeRoutine ? "Configurar calendário" : "Adicionar calendário"}
            </Button>
          )}
        </div>

        {!activeRoutine ? (
          <div className="bg-[var(--surface)] border border-dashed border-[var(--border-subtle)] rounded-2xl p-6 text-center space-y-3">
            <div className="size-10 rounded-full bg-[var(--canvas)] text-[var(--brand-700)] mx-auto flex items-center justify-center">
              <Calendar className="size-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Nenhum calendário programado
              </h3>
              <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
                Programe dias e horários para que as tarefas deste processo sejam geradas
                automaticamente para a equipe.
              </p>
            </div>
            {canEdit && (
              <Button
                size="sm"
                onClick={() => openEditCalendar()}
                className="bg-[var(--brand-900)] hover:bg-[var(--brand-700)] text-white text-xs gap-1.5"
              >
                <Plus className="size-3.5" />
                Criar calendário agora
              </Button>
            )}
          </div>
        ) : (
          <div className="bg-surface border border-(--border-subtle) rounded-2xl p-5 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-(--border-subtle)">
              <div className="space-y-1">
                <span className="text-[11px] font-medium text-(--text-secondary) uppercase tracking-wider block">
                  Dias ativos de execução
                </span>
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  {ALL_WEEKDAYS.map((dayKey) => {
                    const isActive = activeDaysSet.has(dayKey);
                    return (
                      <div
                        key={dayKey}
                        className={`h-7 min-w-8! w-12 rounded-sm text-xs font-semibold flex items-center justify-center transition-all ${isActive
                          ? "bg-brand-900 text-white shadow-xs"
                          : "bg-canvas text-muted-foreground/60 border border-(--border-subtle)"
                          }`}
                        title={isActive ? `${weekdayLabels[dayKey]}: Ativo` : `${weekdayLabels[dayKey]}: Inativo`}
                      >
                        {weekdayLabels[dayKey]}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1 sm:text-right">
                <span className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wider block">
                  Horário programado
                </span>
                <div className="flex items-center sm:justify-end gap-1.5 flex-wrap pt-1">
                  {activeRoutine.parsedSchedule?.times.map((time) => (
                    <span
                      key={time}
                      className="px-2.5 py-1 rounded-md bg-[var(--brand-soft)] text-[var(--brand-900)] font-mono text-xs font-bold border border-[var(--sage-400)]/30"
                    >
                      {time}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Calendar Rules Grid Details */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="space-y-1">
                <span className="text-[var(--text-secondary)] block">Frequência e regra</span>
                <strong className="text-[var(--text-primary)] block text-sm">
                  {activeRoutine.parsedSchedule
                    ? describeSchedule(activeRoutine.parsedSchedule)
                    : activeRoutine.recurrenceRule}
                </strong>
                <span className="text-muted-foreground text-[11px]">
                  Fuso: {activeRoutine.timezone}
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-[var(--text-secondary)] block">Próxima ocorrência prevista</span>
                <strong className="text-[var(--text-primary)] block text-sm">
                  {activeRoutine.nextOccurrenceAt
                    ? formatDateTime(activeRoutine.nextOccurrenceAt).full
                    : "Sem novas ocorrências programadas"}
                </strong>
                <span className="text-muted-foreground text-[11px]">
                  Antecedência de geração: {Math.round(activeRoutine.generationLeadTime / 60)}h antes
                </span>
              </div>

              <div className="space-y-1 sm:text-right flex flex-col sm:items-end justify-center">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block size-2 rounded-full ${activeRoutine.status === "ACTIVE" ? "bg-emerald-500" : "bg-amber-500"
                      }`}
                  />
                  <span className="font-medium text-[var(--text-primary)]">
                    Calendário {activeRoutine.status === "ACTIVE" ? "Ativo" : "Pausado"}
                  </span>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyAction === `routine-${activeRoutine.id}`}
                      onClick={() => handleToggleRoutine(activeRoutine.id)}
                      className="text-xs h-7 px-2"
                    >
                      {activeRoutine.status === "ACTIVE" ? "Pausar calendário" : "Reativar calendário"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEditCalendar(activeRoutine)}
                      className="text-xs h-7 px-2"
                    >
                      Editar
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Skip Dates / Exceptions if any */}
            {activeRoutine.parsedSchedule?.skipDates &&
              activeRoutine.parsedSchedule.skipDates.length > 0 && (
                <div className="pt-3 border-t border-[var(--border-subtle)]">
                  <span className="text-[11px] text-[var(--text-secondary)] font-medium block mb-1.5">
                    Datas ignoradas (feriados/exceções):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {activeRoutine.parsedSchedule.skipDates.map((dateStr) => (
                      <Badge
                        key={dateStr}
                        variant="secondary"
                        className="text-[11px] font-mono bg-[var(--canvas)] border-[var(--border-subtle)] text-[var(--text-secondary)]"
                      >
                        {dateStr}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
          </div>
        )}
      </section>

      {/* SECTION 2: CRONOGRAMA DE EXECUÇÕES (Substitui "Execuções") */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Clock className="size-4 text-[var(--brand-700)]" />
              <span>Cronograma</span>
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Linha do tempo com as execuções geradas, horários e progresso das tarefas.
            </p>
          </div>

          <span className="text-xs text-[var(--text-secondary)]">
            {executions.length} {executions.length === 1 ? "execução" : "execuções"}
          </span>
        </div>

        {!executions.length ? (
          <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl p-6 text-center space-y-2">
            <div className="size-10 rounded-full bg-[var(--canvas)] text-muted-foreground mx-auto flex items-center justify-center">
              <Clock className="size-5" />
            </div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Nenhuma execução registrada
            </h3>
            <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
              As execuções aparecerão aqui conforme os horários agendados no calendário.
            </p>
          </div>
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl p-4 sm:p-5 space-y-4">
            {/* DESKTOP TIMELINE: Horizontal Layout */}
            <div className="hidden md:block">
              <div className="overflow-x-auto pb-4 pt-2">
                <div className="min-w-max flex items-start gap-4 relative px-2">
                  {/* Continuous horizontal connecting line behind the nodes */}
                  <div className="absolute top-5 left-6 right-6 h-0.5 bg-[var(--border-subtle)] z-0" />

                  {executions.map((exec, idx) => {
                    const statusConfig =
                      EXECUTION_STATUS_CONFIG[exec.status] ?? EXECUTION_STATUS_CONFIG.SCHEDULED;
                    const dt = formatDateTime(exec.scheduledAt);
                    const progressPercent =
                      exec.totalTasks > 0
                        ? Math.round((exec.completedTasks / exec.totalTasks) * 100)
                        : 0;

                    return (
                      <div
                        key={exec.id}
                        className="relative z-10 flex flex-col items-center w-64 shrink-0 group"
                      >
                        {/* Timeline Node Point */}
                        <div
                          className={`size-10 rounded-full border-2 border-white shadow-xs flex items-center justify-center ${statusConfig.dotClass} text-white transition-transform group-hover:scale-110`}
                        >
                          {exec.status === "COMPLETED" ? (
                            <CheckCircle2 className="size-5 text-white" />
                          ) : exec.status === "FAILED" ? (
                            <AlertTriangle className="size-5 text-white" />
                          ) : exec.status === "CANCELLED" ? (
                            <XCircle className="size-5 text-white" />
                          ) : (
                            <Clock className="size-5 text-white" />
                          )}
                        </div>

                        {/* Node Date & Time Chip */}
                        <div className="text-center mt-2.5">
                          <span className="text-xs font-bold text-[var(--text-primary)] block">
                            {dt.time}
                          </span>
                          <span className="text-[11px] text-[var(--text-secondary)] block">
                            {dt.date}
                          </span>
                        </div>

                        {/* Execution Card Box */}
                        <div
                          className={`w-full mt-3 p-3.5 rounded-xl border transition-all text-left space-y-2.5 ${statusConfig.borderClass} hover:border-[var(--brand-700)]/40`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${exec.status === "COMPLETED"
                                ? "bg-emerald-100 text-emerald-800"
                                : exec.status === "RUNNING"
                                  ? "bg-blue-100 text-blue-800"
                                  : exec.status === "FAILED"
                                    ? "bg-red-100 text-red-800"
                                    : exec.status === "CANCELLED"
                                      ? "bg-zinc-200 text-zinc-800"
                                      : "bg-amber-100 text-amber-800"
                                }`}
                            >
                              {statusConfig.label}
                            </span>

                            <span className="text-[11px] font-semibold text-[var(--text-primary)]">
                              {exec.completedTasks}/{exec.totalTasks} tarefas
                            </span>
                          </div>

                          <Progress value={progressPercent} className="h-1.5" />

                          {/* Quick Actions per Execution */}
                          <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--border-subtle)]/40">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedExecution(exec)}
                              className="text-[11px] h-6 px-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            >
                              Ver tarefas
                            </Button>

                            {canEdit && (
                              <>
                                {["SCHEDULED", "RUNNING"].includes(exec.status) && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setSelectedExecution(exec);
                                      setCancelModalOpen(true);
                                    }}
                                    className="text-[11px] h-6 px-1.5 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  >
                                    Cancelar
                                  </Button>
                                )}
                                {["FAILED", "CANCELLED"].includes(exec.status) && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setSelectedExecution(exec);
                                      setReopenModalOpen(true);
                                    }}
                                    className="text-[11px] h-6 px-1.5 text-[var(--brand-900)] hover:bg-[var(--canvas)]"
                                  >
                                    Reabrir
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* MOBILE TIMELINE: Vertical Layout */}
            <div className="block md:hidden">
              <div className="relative pl-6 border-l-2 border-[var(--border-subtle)] space-y-4 my-2 ml-3">
                {executions.map((exec) => {
                  const statusConfig =
                    EXECUTION_STATUS_CONFIG[exec.status] ?? EXECUTION_STATUS_CONFIG.SCHEDULED;
                  const dt = formatDateTime(exec.scheduledAt);
                  const progressPercent =
                    exec.totalTasks > 0
                      ? Math.round((exec.completedTasks / exec.totalTasks) * 100)
                      : 0;

                  return (
                    <div key={exec.id} className="relative group">
                      {/* Vertical Node Point on the line */}
                      <div
                        className={`absolute -left-[31px] top-1.5 size-4 rounded-full border-2 border-white shadow-xs ${statusConfig.dotClass}`}
                      />

                      {/* Header with Date/Time */}
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-xs font-bold text-[var(--text-primary)]">
                          {dt.date} às {dt.time}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${exec.status === "COMPLETED"
                            ? "bg-emerald-100 text-emerald-800"
                            : exec.status === "RUNNING"
                              ? "bg-blue-100 text-blue-800"
                              : exec.status === "FAILED"
                                ? "bg-red-100 text-red-800"
                                : exec.status === "CANCELLED"
                                  ? "bg-zinc-200 text-zinc-800"
                                  : "bg-amber-100 text-amber-800"
                            }`}
                        >
                          {statusConfig.label}
                        </span>
                      </div>

                      {/* Card Content */}
                      <div
                        className={`p-3.5 rounded-xl border text-left space-y-2.5 ${statusConfig.borderClass}`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[var(--text-secondary)]">Progresso</span>
                          <span className="font-semibold text-[var(--text-primary)]">
                            {exec.completedTasks}/{exec.totalTasks} tarefas ({progressPercent}%)
                          </span>
                        </div>

                        <Progress value={progressPercent} className="h-1.5" />

                        <div className="flex items-center justify-between pt-1 border-t border-[var(--border-subtle)]/40">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedExecution(exec)}
                            className="text-xs h-7 px-2"
                          >
                            Ver detalhes das tarefas
                          </Button>

                          {canEdit && (
                            <>
                              {["SCHEDULED", "RUNNING"].includes(exec.status) && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setSelectedExecution(exec);
                                    setCancelModalOpen(true);
                                  }}
                                  className="text-xs h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  Cancelar
                                </Button>
                              )}
                              {["FAILED", "CANCELLED"].includes(exec.status) && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setSelectedExecution(exec);
                                    setReopenModalOpen(true);
                                  }}
                                  className="text-xs h-7 px-2 text-[var(--brand-900)]"
                                >
                                  Reabrir
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* SECTION 3: TAREFAS / ETAPAS DEFINIDAS NO PROCESSO */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <ListChecks className="size-4 text-[var(--brand-700)]" />
              <span>Etapas do processo</span>
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Atividades e procedimentos que serão executados em cada ciclo deste processo.
            </p>
          </div>

          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href={`/management/processes/${proc.id}/edit`} />}
              className="text-xs h-8 gap-1.5 border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--surface)]"
            >
              <Pencil className="size-3.5" />
              Editar etapas
            </Button>
          )}
        </div>

        {!tasks.length ? (
          <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl p-6 text-center space-y-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Nenhuma etapa cadastrada
            </h3>
            <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
              Adicione as tarefas que a equipe deverá cumprir neste fluxo de trabalho.
            </p>
          </div>
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl divide-y divide-[var(--border-subtle)] overflow-hidden">
            {tasks.map((task, index) => (
              <div
                key={task.id}
                className="p-4 sm:p-5 flex items-start justify-between gap-4 hover:bg-[var(--canvas)]/40 transition-colors"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="size-7 rounded-full bg-[var(--brand-soft)] text-[var(--brand-900)] text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {index + 1}
                  </div>

                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                        {task.title}
                      </h4>
                      {task.required && (
                        <span className="text-[10px] uppercase font-bold text-red-700 bg-red-50 border border-red-200/50 px-1.5 py-0.2 rounded">
                          Obrigatória
                        </span>
                      )}
                    </div>

                    {task.description && (
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                        {task.description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap pt-1">
                      {task.teamName && (
                        <span className="flex items-center gap-1">
                          <Users className="size-3 text-muted-foreground" />
                          Equipe: <strong>{task.teamName}</strong>
                        </span>
                      )}
                      {task.primaryMemberName && (
                        <span>
                          Responsável: <strong>{task.primaryMemberName}</strong>
                        </span>
                      )}
                      {task.estimatedMinutes && (
                        <span className="flex items-center gap-1">
                          <Timer className="size-3 text-muted-foreground" />
                          Estimativa: {task.estimatedMinutes} min
                        </span>
                      )}
                      {task.approverNames.length > 0 && (
                        <span>
                          Aprovação: {task.approverNames.join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* MODAL: Configurar / Editar Calendário */}
      <Modal
        open={calendarModalOpen}
        title={editingRoutineId ? "Configurar calendário" : "Adicionar calendário ao processo"}
        className="sm:max-w-xl max-h-[92vh] overflow-y-auto"
        onClose={() => {
          if (!busyAction) setCalendarModalOpen(false);
        }}
      >
        <form onSubmit={handleSaveCalendar} className="space-y-5 pt-1">
          <p className="text-xs text-[var(--text-secondary)] -mt-2">
            Defina dias da semana, horários e regras para disparar as execuções deste processo no cronograma da equipe.
          </p>

          <ScheduleFields value={scheduleState} onChange={setScheduleState} />



          <div className="flex justify-end gap-2 pt-4 border-t border-[var(--border-subtle)]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busyAction === "save-calendar"}
              onClick={() => setCalendarModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={busyAction === "save-calendar"}
              className="bg-[var(--brand-900)] hover:bg-[var(--brand-700)] text-white gap-1.5"
            >
              {busyAction === "save-calendar" && <Spinner className="size-3.5" />}
              Salvar calendário
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Status do Processo (Pausar / Reativar / Arquivar) */}
      {processStatusTarget && (
        <Modal
          open
          title={`${processStatusTarget === "ARCHIVED"
            ? "Arquivar"
            : processStatusTarget === "PAUSED"
              ? "Pausar"
              : "Reativar"
            } processo`}
          onClose={() => {
            if (!busyAction) setProcessStatusTarget(null);
          }}
        >
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-primary)]">
              Deseja confirmar a alteração do processo <strong>{proc.name}</strong> para{" "}
              {processStatusTarget === "ARCHIVED"
                ? "Arquivado"
                : processStatusTarget === "PAUSED"
                  ? "Pausado"
                  : "Ativo"}
              ?
            </p>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {processStatusTarget === "ARCHIVED"
                ? "O processo será movido para a aba de Arquivados. Novas execuções no cronograma serão suspensas, mas todo o histórico será mantido."
                : processStatusTarget === "PAUSED"
                  ? "Novas execuções no cronograma deixarão de ser disparadas até que o processo seja reativado."
                  : "O processo voltará a gerar execuções de acordo com os horários do calendário configurado."}
            </p>

            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
              <Button
                variant="outline"
                size="sm"
                disabled={busyAction === "process-status"}
                onClick={() => setProcessStatusTarget(null)}
              >
                Voltar
              </Button>
              <Button
                size="sm"
                disabled={busyAction === "process-status"}
                onClick={() => handleToggleProcessStatus(processStatusTarget)}
                className={
                  processStatusTarget === "ARCHIVED"
                    ? "bg-destructive text-white hover:bg-destructive/90"
                    : "bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)]"
                }
              >
                {busyAction === "process-status" && <Spinner className="size-3.5" />}
                Confirmar
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: Detalhes das Tarefas da Execução Selecionada */}
      {selectedExecution && !cancelModalOpen && !reopenModalOpen && (
        <Modal
          open
          title={`Execução: ${formatDateTime(selectedExecution.scheduledAt).full}`}
          onClose={() => setSelectedExecution(null)}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 p-3 bg-[var(--canvas)] rounded-xl text-xs">
              <span className="text-[var(--text-secondary)]">Status atual:</span>
              <span className="font-semibold text-[var(--text-primary)]">
                {EXECUTION_STATUS_CONFIG[selectedExecution.status]?.label ??
                  selectedExecution.status}
              </span>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              <span className="text-xs font-semibold text-[var(--text-primary)] block">
                Tarefas geradas ({selectedExecution.completedTasks}/{selectedExecution.totalTasks}{" "}
                concluídas):
              </span>

              {selectedExecution.tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-[var(--border-subtle)] text-xs"
                >
                  <span className="text-[var(--text-primary)] font-medium">
                    {task.title}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[10px] font-normal text-[var(--text-secondary)]"
                  >
                    {task.status === "COMPLETED"
                      ? "Concluída"
                      : task.status === "IN_PROGRESS"
                        ? "Em andamento"
                        : "Pendente"}
                  </Badge>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-[var(--border-subtle)]">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedExecution(null)}
              >
                Fechar
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: Cancelar Execução */}
      {selectedExecution && cancelModalOpen && (
        <Modal
          open
          title="Cancelar execução no cronograma"
          onClose={() => {
            if (!busyAction) setCancelModalOpen(false);
          }}
        >
          <div className="space-y-4">
            <p className="text-xs text-[var(--text-secondary)]">
              Tem certeza que deseja cancelar a execução agendada para{" "}
              <strong>{formatDateTime(selectedExecution.scheduledAt).full}</strong>?
            </p>

            <Field>
              <FieldLabel htmlFor="cancel-category">Categoria do cancelamento</FieldLabel>
              <NativeSelect
                id="cancel-category"
                value={cancelCategory}
                onChange={(e) => setCancelCategory(e.target.value)}
              >
                <NativeSelectOption value="OPERACIONAL">Operacional</NativeSelectOption>
                <NativeSelectOption value="PROGRAMACAO">Ajuste de Programação</NativeSelectOption>
                <NativeSelectOption value="DUPLICIDADE">Duplicidade</NativeSelectOption>
                <NativeSelectOption value="OUTROS">Outros</NativeSelectOption>
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel htmlFor="cancel-reason">Motivo (mínimo 5 caracteres)</FieldLabel>
              <Textarea
                id="cancel-reason"
                placeholder="Explique o motivo do cancelamento para o registro de auditoria..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
              />
            </Field>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <Button
                variant="outline"
                size="sm"
                disabled={busyAction === "cancel-execution"}
                onClick={() => setCancelModalOpen(false)}
              >
                Voltar
              </Button>
              <Button
                size="sm"
                disabled={busyAction === "cancel-execution" || cancelReason.trim().length < 5}
                onClick={handleConfirmCancel}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {busyAction === "cancel-execution" && <Spinner className="size-3.5" />}
                Confirmar cancelamento
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: Reabrir Execução */}
      {selectedExecution && reopenModalOpen && (
        <Modal
          open
          title="Reabrir execução no cronograma"
          onClose={() => {
            if (!busyAction) setReopenModalOpen(false);
          }}
        >
          <div className="space-y-4">
            <p className="text-xs text-[var(--text-secondary)]">
              Deseja reabrir a execução do dia{" "}
              <strong>{formatDateTime(selectedExecution.scheduledAt).full}</strong>?
            </p>

            <Field>
              <FieldLabel htmlFor="reopen-reason">Justificativa da reabertura</FieldLabel>
              <Textarea
                id="reopen-reason"
                placeholder="Informe o motivo para auditoria..."
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                rows={3}
              />
            </Field>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <Button
                variant="outline"
                size="sm"
                disabled={busyAction === "reopen-execution"}
                onClick={() => setReopenModalOpen(false)}
              >
                Voltar
              </Button>
              <Button
                size="sm"
                disabled={busyAction === "reopen-execution" || reopenReason.trim().length < 5}
                onClick={handleConfirmReopen}
                className="bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)]"
              >
                {busyAction === "reopen-execution" && <Spinner className="size-3.5" />}
                Reabrir execução
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
