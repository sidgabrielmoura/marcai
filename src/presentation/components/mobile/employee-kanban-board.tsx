"use client";
import { boardState, columnFor } from "@/application/mobile/policy";
import {
  operationPermission,
  processProgress,
  processBadge,
  type BoardSummary,
} from "@/domain/rules/employee-workflow";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckSquare,
  AlertTriangle,
  Users,
  CheckCircle2,
  Calendar,
  ArrowRight,
  Search,
  X,
  Layers,
  Check,
  Clock,
} from "lucide-react";
import { taskClock, formatClock } from "@/domain/rules/employee-task-clock";
import { ClaimTaskButton } from "./claim-task-button";
import { QuickCompleteButton } from "./quick-complete-button";
import { EmployeeTaskDetailDrawer } from "./task-detail-drawer";
import { EmployeeProcessDetailDrawer } from "./process-detail-drawer";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TaskStatus, Priority, Criticality } from "@/domain/types";

export interface EmployeeTask {
  roundId: string;
  timezone: string;
  column?: ColumnId;
  dependencyBlocked?: boolean;
  maxDuration?: number | null;
  requiresApproval?: boolean;
  definitionOrder?: number | null;
  processSummary?: BoardSummary;
  managementBlocked?: boolean;
  executionStatus?: string | null;
  executionAvailableAt?: string | null;
  id: string;
  executionId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  criticality: Criticality;
  origin: string;
  taskType: string;
  scheduledDate: string | null;
  deadlineAt: string | null;
  completedAt: string | null;
  startedAt: string | null;
  slaDueAt: string | null;
  toleranceMinutes?: number | null;
  elapsedSeconds: number | null;
  timerRunning: boolean;
  slaExceeded: boolean;
  delayMinutes: number;
  locationName: string | null;
  teamName: string | null;
  processName: string | null;
  evidenceCount: number;
  hasRequiredEvidence: boolean;
  hasImpediment: boolean;
  impedimentReason?: string;
  isUnassigned: boolean;
}

export type KanbanBoardItem =
  | {
      type: "TASK";
      id: string;
      task: EmployeeTask;
    }
  | {
      type: "PROCESS";
      id: string;
      executionId: string;
      processName: string;
      tasks: EmployeeTask[];
      totalTasks: number;
      completedTasks: number;
      progressPercent: number;
      progressLabel: string;
      locationName: string | null;
      teamName: string | null;
      timezone: string;
      scheduledDate: string | null;
      deadlineAt: string | null;
      priority: Priority;
      hasImpediment: boolean;
      allUnassigned: boolean;
      anyOverdue: boolean;
      attention: boolean;
      allCompleted: boolean;
      isScheduled: boolean;
    };

export function buildKanbanItems(
  tasks: EmployeeTask[],
  now: number = Date.now(),
): KanbanBoardItem[] {
  const items: KanbanBoardItem[] = [];
  const processMap = new Map<string, EmployeeTask[]>();

  for (const task of tasks) {
    if (task.executionId && task.origin === "PROCESS") {
      const list = processMap.get(task.executionId) || [];
      list.push(task);
      processMap.set(task.executionId, list);
    } else {
      items.push({
        type: "TASK",
        id: task.id,
        task,
      });
    }
  }

  for (const [executionId, pTasks] of processMap.entries()) {
    pTasks.sort(
      (a, b) =>
        (a.definitionOrder ?? Infinity) - (b.definitionOrder ?? Infinity),
    );
    const summary = pTasks.find((task) => task.processSummary)?.processSummary;
    const totalTasks = summary?.totalTasks ?? pTasks.length;
    const completedTasks =
      summary?.completedTasks ??
      pTasks.filter((t) => t.status === "COMPLETED").length;
    const allCompleted = summary?.executionStatus
      ? summary.executionStatus === "COMPLETED"
      : totalTasks > 0 && completedTasks === totalTasks;
    const progress = processProgress(pTasks, summary);
    const progressPercent = progress.percent;
    const allUnassigned = pTasks.every((t) => t.isUnassigned);
    const { anyOverdue, attention } = boardState(pTasks, now);
    const first = pTasks[0];
    const earliestScheduled =
      pTasks
        .filter((t) => t.status !== "COMPLETED")
        .find((t) => !!t.scheduledDate)?.scheduledDate || first.scheduledDate;
    const pendingTasks = pTasks.filter(
      (t) => !["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(t.status),
    );
    const isScheduled =
      summary?.column === "upcoming" ||
      (!attention &&
        totalTasks === pTasks.length &&
        pendingTasks.length > 0 &&
        pendingTasks.every(
          (t) => !!t.scheduledDate && Date.parse(t.scheduledDate) > now,
        ));

    const priorities: Priority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
    const maxPriority = pTasks.reduce((max, t) => {
      const idxT = priorities.indexOf(t.priority);
      const idxM = priorities.indexOf(max);
      return idxT > idxM ? t.priority : max;
    }, "LOW" as Priority);

    items.push({
      type: "PROCESS",
      id: executionId,
      executionId,
      processName: first.processName || "Processo",
      tasks: pTasks,
      totalTasks,
      completedTasks,
      progressPercent,
      progressLabel: progress.label,
      locationName: first.locationName,
      teamName: first.teamName,
      timezone: first.timezone,
      scheduledDate: earliestScheduled,
      deadlineAt: first.deadlineAt,
      priority: maxPriority,
      hasImpediment: pTasks.some((t) => t.hasImpediment),
      allUnassigned,
      anyOverdue,
      attention,
      allCompleted,
      isScheduled,
    });
  }

  return items;
}

import {
  type DeadlineStatus,
  getTaskDeadlineStatus,
} from "@/domain/rules/task-metrics";

export { type DeadlineStatus, getTaskDeadlineStatus };

export type ColumnId =
  "today" | "overdue" | "unassigned" | "completed" | "upcoming";

interface ColumnDef {
  id: ColumnId;
  title: string;
  shortTitle: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  pillBadgeClass: string;
  borderTopClass: string;
  description: string;
  emptyText: string;
}

const COLUMNS: ColumnDef[] = [
  {
    id: "today",
    title: "A Fazer (Hoje)",
    shortTitle: "A Fazer",
    icon: CheckSquare,
    accentColor: "bg-blue-600",
    pillBadgeClass: "bg-blue-100 text-blue-800",
    borderTopClass: "border-t-blue-500",
    description: "Tarefas para realizar hoje",
    emptyText: "Nenhuma tarefa pendente para hoje.",
  },
  {
    id: "overdue",
    title: "Atrasadas",
    shortTitle: "Atrasadas",
    icon: AlertTriangle,
    accentColor: "bg-red-500",
    pillBadgeClass: "bg-red-100 text-red-800",
    borderTopClass: "border-t-red-500",
    description: "Prazo expirado — Ação prioritária",
    emptyText: "Nenhuma tarefa em atraso. Tudo em dia!",
  },
  {
    id: "unassigned",
    title: "Para Assumir",
    shortTitle: "Para Assumir",
    icon: Users,
    accentColor: "bg-purple-600",
    pillBadgeClass: "bg-purple-100 text-purple-800",
    borderTopClass: "border-t-purple-500",
    description: "Disponíveis na sua equipe e unidade",
    emptyText: "Nenhuma tarefa disponível para assumir.",
  },
  {
    id: "completed",
    title: "Concluídas Hoje",
    shortTitle: "Concluídas",
    icon: CheckCircle2,
    accentColor: "bg-emerald-600",
    pillBadgeClass: "bg-emerald-100 text-emerald-800",
    borderTopClass: "border-t-emerald-500",
    description: "Entregas finalizadas no seu turno",
    emptyText: "Nenhuma tarefa concluída hoje ainda.",
  },
  {
    id: "upcoming",
    title: "Próximos Dias",
    shortTitle: "Próximas",
    icon: Calendar,
    accentColor: "bg-slate-500",
    pillBadgeClass: "bg-slate-100 text-slate-800",
    borderTopClass: "border-t-slate-400",
    description: "Programadas para amanhã em diante",
    emptyText: "Sem tarefas programadas para os próximos dias.",
  },
];

interface EmployeeKanbanBoardProps {
  tasks: EmployeeTask[];
  snapshotAt: number;
  initialColumn?: ColumnId;
}

const typeFilterItems: Array<{
  label: string;
  value: "ALL" | "STANDARD" | "FORM";
}> = [
  { label: "Todos", value: "ALL" },
  { label: "Tarefas", value: "STANDARD" },
  { label: "Com Perguntas", value: "FORM" },
];

export function EmployeeKanbanBoard({
  tasks,
  snapshotAt,
  initialColumn = "today",
}: EmployeeKanbanBoardProps) {
  const [activeColumn, setActiveColumn] = useState<ColumnId>(initialColumn);
  const [filterType, setFilterType] = useState<"ALL" | "STANDARD" | "FORM">(
    "ALL",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [now, setNow] = useState(snapshotAt);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(
    null,
  );
  const [processDrawerOpen, setProcessDrawerOpen] = useState(false);
  const showLocation =
    new Set(tasks.map((task) => task.locationName).filter(Boolean)).size > 1;

  function handleOpenTask(taskId: string) {
    setSelectedTaskId(taskId);
    setSheetOpen(true);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("taskId", taskId);
      window.history.replaceState(null, "", url.toString());
    }
  }

  function handleSheetChange(open: boolean) {
    setSheetOpen(open);
    if (!open && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("taskId")) {
        url.searchParams.delete("taskId");
        window.history.replaceState(
          null,
          "",
          url.pathname + (url.search ? url.search : ""),
        );
      }
    }
  }

  function handleOpenProcess(executionId: string) {
    setSelectedExecutionId(executionId);
    setProcessDrawerOpen(true);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("executionId", executionId);
      window.history.replaceState(null, "", url.toString());
    }
  }

  function handleProcessDrawerChange(open: boolean) {
    setProcessDrawerOpen(open);
    if (!open && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("executionId")) {
        url.searchParams.delete("executionId");
        window.history.replaceState(
          null,
          "",
          url.pathname + (url.search ? url.search : ""),
        );
      }
    }
  }

  // Verificar se há taskId ou executionId na URL ao carregar a página
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const taskIdParam = params.get("taskId");
      const executionIdParam = params.get("executionId");
      if (executionIdParam) {
        setSelectedExecutionId(executionIdParam);
        setProcessDrawerOpen(true);
      } else if (taskIdParam) {
        setSelectedTaskId(taskIdParam);
        setSheetOpen(true);
      }
    }
  }, []);

  // A single clock for all cards, calculated from timestamps to avoid drift.
  useEffect(() => {
    const clientAnchor = Date.now();
    const tick = () =>
      setNow(snapshotAt + Math.max(0, Date.now() - clientAnchor));
    tick();
    const interval = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [snapshotAt]);

  const boardRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Construir itens unificados de Kanban (tarefas avulsas e processos agrupados)
  const allKanbanItems = useMemo(
    () => buildKanbanItems(tasks, now),
    [tasks, now],
  );

  // Filtragem de busca e tipo
  const filteredItems = useMemo(() => {
    let result = allKanbanItems;

    if (filterType !== "ALL") {
      if (filterType === "FORM") {
        result = result.filter((it) =>
          it.type === "TASK"
            ? it.task.taskType === "FORM"
            : it.tasks.some((t) => t.taskType === "FORM"),
        );
      } else {
        result = result.filter((it) =>
          it.type === "TASK"
            ? it.task.taskType !== "FORM"
            : it.tasks.some((t) => t.taskType !== "FORM"),
        );
      }
    }

    if (!searchQuery.trim()) return result;
    const q = searchQuery.toLowerCase().trim();
    return result.filter((it) => {
      if (it.type === "TASK") {
        return (
          it.task.title.toLowerCase().includes(q) ||
          (it.task.locationName &&
            it.task.locationName.toLowerCase().includes(q)) ||
          (it.task.processName && it.task.processName.toLowerCase().includes(q))
        );
      } else {
        return (
          it.processName.toLowerCase().includes(q) ||
          (it.locationName && it.locationName.toLowerCase().includes(q)) ||
          it.tasks.some((t) => t.title.toLowerCase().includes(q))
        );
      }
    });
  }, [allKanbanItems, filterType, searchQuery]);

  // Agrupamento por coluna
  const groupedTasks = useMemo(() => {
    const groups: Record<ColumnId, KanbanBoardItem[]> = {
      today: [],
      overdue: [],
      unassigned: [],
      completed: [],
      upcoming: [],
    };
    for (const item of filteredItems) {
      const column: ColumnId =
        item.type === "TASK"
          ? columnFor(item.task, now)
          : boardState(item.tasks, now).column;
      groups[column].push(item);
    }
    return groups;
  }, [filteredItems, now]);

  // Navegar suavemente até uma coluna específica
  function scrollToColumn(colId: ColumnId) {
    setActiveColumn(colId);
    const target = columnRefs.current[colId];
    if (target && boardRef.current) {
      target.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  }

  // Detectar a coluna ativa enquanto o usuário desliza horizontalmente
  useEffect(() => {
    const container = boardRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            const colId = entry.target.getAttribute(
              "data-column-id",
            ) as ColumnId;
            if (colId) {
              setActiveColumn(colId);
            }
          }
        }
      },
      {
        root: container,
        threshold: 0.55,
      },
    );

    Object.values(columnRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  // Se houver coluna inicial informada (ex.: por query param), rolar até ela no carregamento
  useEffect(() => {
    if (initialColumn && columnRefs.current[initialColumn]) {
      const timer = setTimeout(() => {
        columnRefs.current[initialColumn]?.scrollIntoView({
          behavior: "smooth",
          inline: "center",
          block: "nearest",
        });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [initialColumn]);

  return (
    <div className="flex flex-col gap-3.5 w-full">
      {/* Barra de Busca Rápida */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[var(--brand-700)]/60" />
        <Input
          type="text"
          aria-label="Buscar tarefas"
          placeholder="Buscar tarefas por título, unidade ou processo..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-11 pl-10 pr-9 bg-[var(--surface)] border-[var(--border-subtle)] rounded-xl text-sm"
        />
        {searchQuery && (
          <button
            type="button"
            aria-label="Limpar busca"
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Alternador Rápido: Todos / Tarefas / Tarefas com Perguntas */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none -mx-1 px-1">
        {typeFilterItems.map((item) => {
          const active = filterType === item.value;
          const count =
            item.value === "ALL"
              ? allKanbanItems.length
              : item.value === "FORM"
                ? allKanbanItems.filter((it) =>
                    it.type === "TASK"
                      ? it.task.taskType === "FORM"
                      : it.tasks.some((t) => t.taskType === "FORM"),
                  ).length
                : allKanbanItems.filter((it) =>
                    it.type === "TASK"
                      ? it.task.taskType !== "FORM"
                      : it.tasks.some((t) => t.taskType !== "FORM"),
                  ).length;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilterType(item.value)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border cursor-pointer ${
                active
                  ? "bg-[var(--brand-900)] text-white border-[var(--brand-900)] shadow-xs"
                  : "bg-[var(--surface)] text-[var(--brand-900)] border-[var(--border-subtle)] hover:bg-[var(--canvas)]"
              }`}
            >
              <span>{item.label}</span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                  active
                    ? "bg-white/20 text-white"
                    : "bg-slate-100 text-slate-600 dark:bg-muted/40 dark:text-slate-400"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-none -mx-1 px-1">
        {COLUMNS.map((col) => {
          const count = groupedTasks[col.id].length;
          const isActive = activeColumn === col.id;
          const isOverdueCol = col.id === "overdue" && count > 0;
          const Icon = col.icon;

          return (
            <button
              key={col.id}
              type="button"
              onClick={() => scrollToColumn(col.id)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                isActive
                  ? "bg-[var(--brand-900)] text-white border-[var(--brand-900)] shadow-xs scale-102"
                  : isOverdueCol
                    ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                    : "bg-[var(--surface)] text-[var(--brand-900)] border-[var(--border-subtle)] hover:bg-[var(--canvas)]"
              }`}
            >
              <Icon className="size-3.5 shrink-0" />
              <span>{col.shortTitle}</span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                  isActive
                    ? "bg-white/20 text-white"
                    : isOverdueCol
                      ? "bg-red-200 text-red-900"
                      : "bg-slate-100 text-slate-700"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-1.5 py-1">
        {COLUMNS.map((col) => {
          const isActive = activeColumn === col.id;
          return (
            <button
              key={col.id}
              type="button"
              onClick={() => scrollToColumn(col.id)}
              aria-label={`Ir para ${col.title}`}
              className={`transition-all duration-300 rounded-full ${
                isActive
                  ? "w-6 h-1.5 bg-[var(--brand-900)]"
                  : "w-1.5 h-1.5 bg-slate-300 hover:bg-slate-400"
              }`}
            />
          );
        })}
      </div>

      {/* Quadro Kanban Trello com Scroll Snap Mandatório */}
      <div
        ref={boardRef}
        className="trello-kanban-container"
        tabIndex={0}
        aria-label="Quadro de tarefas"
      >
        {COLUMNS.map((col) => {
          const tasksInCol = groupedTasks[col.id];
          const Icon = col.icon;

          return (
            <div
              key={col.id}
              ref={(el) => {
                columnRefs.current[col.id] = el;
              }}
              data-column-id={col.id}
              className="trello-kanban-column flex flex-col rounded-2xl bg-slate-100/80 dark:bg-muted/40 border border-[var(--border-subtle)] p-3 shadow-xs"
            >
              <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-200/80 dark:border-border">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`size-7 rounded-lg ${col.accentColor} text-white flex items-center justify-center shrink-0 shadow-xs`}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm text-[var(--brand-900)] dark:text-foreground truncate">
                      {col.title}
                    </h3>
                    <p className="text-[11px] text-[var(--text-secondary)] truncate">
                      {col.description}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${col.pillBadgeClass}`}
                >
                  {tasksInCol.length}
                </Badge>
              </div>

              <div className="flex flex-col gap-2.5 overflow-y-auto! max-h-[calc(100vh-270px)] pr-0.5">
                {tasksInCol.length === 0 ? (
                  <div className="p-6 text-center rounded-xl bg-white/60 dark:bg-card/60 border border-dashed border-slate-200 dark:border-border my-auto">
                    <p className="text-xs text-slate-500 font-medium leading-relaxed">
                      {col.emptyText}
                    </p>
                  </div>
                ) : (
                  tasksInCol.map((item) =>
                    item.type === "PROCESS" ? (
                      <ProcessCard
                        key={`proc-${item.id}`}
                        item={item}
                        now={now}
                        showLocation={showLocation}
                        onOpenProcess={handleOpenProcess}
                      />
                    ) : (
                      <TaskCard
                        key={`task-${item.id}`}
                        task={item.task}
                        now={now}
                        snapshotAt={snapshotAt}
                        showLocation={showLocation}
                        onOpenTask={handleOpenTask}
                      />
                    ),
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Drawer para visualização e execução de processo completo */}
      <EmployeeProcessDetailDrawer
        executionId={selectedExecutionId}
        open={processDrawerOpen}
        onOpenChange={handleProcessDrawerChange}
      />

      {/* Drawer para visualização e execução da tarefa avulsa selecionada (baixo para cima) */}
      <EmployeeTaskDetailDrawer
        taskId={selectedTaskId}
        open={sheetOpen}
        onOpenChange={handleSheetChange}
      />
    </div>
  );
}

function TaskCard({
  task,
  now,
  snapshotAt,
  showLocation,
  onOpenTask,
}: {
  task: EmployeeTask;
  now: number;
  snapshotAt: number;
  showLocation: boolean;
  onOpenTask: (taskId: string) => void;
}) {
  const clock = taskClock(task, now, snapshotAt);
  const completed = task.status === "COMPLETED";
  const isScheduled = clock.isScheduled;
  const permission = operationPermission(task, now, !task.isUnassigned);
  const deadlineInfo = getTaskDeadlineStatus(task, now);
  const state = isScheduled
    ? `Programada para às ${new Date(task.scheduledDate!).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: task.timezone })}`
    : (
        {
          PAUSED: "Pausada",
          NEEDS_CORRECTION: "Correção solicitada",
          BLOCKED: "Aguardando etapa anterior",
          SUBMITTED: "Aguardando aprovação",
        } as Record<string, string>
      )[task.status];
  const action = completed
    ? "Ver entrega"
    : isScheduled
      ? "Ver agendamento"
      : task.status === "PAUSED"
        ? "Retomar tarefa"
        : task.status === "NEEDS_CORRECTION"
          ? "Corrigir entrega"
          : task.status === "IN_PROGRESS"
            ? task.hasRequiredEvidence
              ? "Registrar entrega"
              : "Continuar tarefa"
            : "Abrir tarefa";

  return (
    <Card
      className={`employee-task-card shrink-0 h-fit gap-2.5 ring-0 rounded-xl border p-3.5 shadow-none flex flex-col transition-all ${isScheduled ? "grayscale contrast-90 opacity-85 border-slate-300 dark:border-slate-700 bg-slate-50/90 dark:bg-muted/20 select-none" : "border-[var(--border-subtle)] bg-[var(--surface)]"}`}
    >
      {/* Badge de prazo/tolerância acima do título */}
      <div className="flex items-center justify-between gap-1.5 flex-wrap">
        <Badge
          variant="outline"
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${isScheduled ? "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" : deadlineInfo.badgeClass}`}
        >
          {isScheduled ? "Aguardando horário" : deadlineInfo.label}
        </Badge>
        {task.priority === "CRITICAL" && (
          <Badge
            variant="outline"
            className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md ${isScheduled ? "bg-slate-200 text-slate-700 border-slate-300" : "bg-red-100 text-red-800 border-red-200"}`}
          >
            Urgente
          </Badge>
        )}
      </div>

      <button
        type="button"
        onClick={() => onOpenTask(task.id)}
        className="text-left rounded-sm text-sm font-semibold leading-snug text-[var(--text-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-700)] cursor-pointer"
      >
        <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wide bg-[var(--canvas)] border border-[var(--border-subtle)] px-2 py-0.5 rounded-full mr-2 align-middle inline-block mb-1">
          {task.origin === "PROCESS"
            ? "Processo"
            : task.taskType === "FORM"
              ? "Tarefa com Perguntas"
              : "Tarefa Avulsa"}
        </span>
        <br />
        {task.title}
      </button>

      {showLocation && task.locationName && (
        <p className="text-xs text-[var(--text-secondary)]">
          {task.locationName}
        </p>
      )}

      {state && (
        <p className="text-xs font-medium text-[var(--text-secondary)]">
          {state}
        </p>
      )}

      {/* Somente tempo decorrido da tarefa ou status de agendamento */}
      {isScheduled ? (
        <div className="min-w-0 pt-0.5">
          <p className="text-[11px] text-[var(--text-secondary)]">
            Liberação automática
          </p>
          <span className="text-xs font-semibold text-[var(--text-primary)]">
            Disponível às{" "}
            {new Date(task.scheduledDate!).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: task.timezone,
            })}
          </span>
        </div>
      ) : (
        <div
          className="min-w-0 pt-0.5"
          role="timer"
          aria-live="off"
          aria-label="Tempo decorrido"
        >
          <p className="text-[11px] text-[var(--text-secondary)]">
            {completed
              ? "Tempo total"
              : clock.toleranceExceeded
                ? "Tempo decorrido (encerrado na tolerância)"
                : "Tempo decorrido"}
          </p>
          <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
            {formatClock(clock.elapsed ?? 0)}
          </span>
        </div>
      )}

      <div className="mt-1">
        {isScheduled ? (
          <div className="h-10 w-full flex items-center justify-between px-3 text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-muted/40 rounded-xl border border-slate-200 dark:border-border cursor-not-allowed select-none">
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5 text-slate-400" />
              <span>Aguardando horário</span>
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              {new Date(task.scheduledDate!).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: task.timezone,
              })}
            </span>
          </div>
        ) : task.isUnassigned &&
          operationPermission(task, now, true, "claim").allowed ? (
          <ClaimTaskButton
            taskId={task.id}
            onClaimed={(id) => onOpenTask(id)}
          />
        ) : clock.toleranceExceeded ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenTask(task.id)}
            className="h-10 w-full justify-between px-3 text-xs font-semibold text-red-700 bg-red-50/50 border-red-200 hover:bg-red-100/60 cursor-pointer"
          >
            <span>Bloqueada (Tolerância esgotada)</span>
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Button>
        ) : permission.allowed &&
          ["AVAILABLE", "IN_PROGRESS", "NEEDS_CORRECTION"].includes(
            task.status,
          ) &&
          !task.hasRequiredEvidence &&
          task.taskType !== "FORM" ? (
          <div className="flex items-center gap-2">
            <QuickCompleteButton
              taskId={task.id}
              roundId={task.roundId}
              taskTitle={task.title}
              requiresApproval={task.requiresApproval}
              className="flex-1 h-10! bg-[var(--brand-900)]! shadow-none!"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => onOpenTask(task.id)}
              aria-label="Ver detalhes da tarefa"
              className="h-10 w-10 shrink-0 cursor-pointer"
            >
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenTask(task.id)}
            className="h-10 w-full justify-between px-0 text-xs font-semibold text-[var(--brand-900)] hover:bg-transparent hover:underline cursor-pointer"
          >
            {action}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Button>
        )}
      </div>
    </Card>
  );
}

function ProcessCard({
  item,
  now,
  showLocation,
  onOpenProcess,
}: {
  item: Extract<KanbanBoardItem, { type: "PROCESS" }>;
  now: number;
  showLocation: boolean;
  onOpenProcess: (executionId: string) => void;
}) {
  const isCompleted = item.allCompleted;
  const isOverdue = item.anyOverdue;
  const attention = item.attention;
  const isScheduled = item.isScheduled;
  const badge = processBadge(boardState(item.tasks, now));

  return (
    <Card
      className={`employee-process-card shrink-0 h-fit gap-3 ring-0 rounded-xl border p-3.5 shadow-none flex flex-col transition-all ${isScheduled ? "grayscale contrast-90 opacity-85 border-slate-300 dark:border-slate-700 bg-slate-50/90 dark:bg-muted/20 select-none" : "border-[var(--border-subtle)] bg-[var(--surface)] hover:border-[var(--brand-700)]/40"}`}
    >
      {/* Top Badges */}
      <div className="flex items-center justify-between gap-1.5 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800 flex items-center gap-1"
          >
            <Layers className="size-3" aria-hidden="true" />
            <span>Processo</span>
          </Badge>

          {isCompleted ? (
            <Badge
              variant="outline"
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 flex items-center gap-1"
            >
              <Check className="size-3" aria-hidden="true" />
              <span>Concluído</span>
            </Badge>
          ) : attention ? (
            <Badge
              variant="outline"
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
            >
              Atenção
            </Badge>
          ) : isOverdue ? (
            <Badge
              variant="outline"
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800"
            >
              Atrasado
            </Badge>
          ) : isScheduled ? (
            <Badge
              variant="outline"
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 flex items-center gap-1"
            >
              <Clock className="size-3 text-slate-500" />
              <span>Aguardando horário</span>
            </Badge>
          ) : item.hasImpediment ? (
            <Badge
              variant="outline"
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 flex items-center gap-1"
            >
              <AlertTriangle className="size-3" />
              <span>Com impedimento</span>
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-slate-50 text-slate-700 border-slate-200 dark:bg-muted/40 dark:text-slate-300 dark:border-border"
            >
              {badge.label}
            </Badge>
          )}
        </div>

        {item.priority === "CRITICAL" && (
          <Badge
            variant="outline"
            className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md ${isScheduled ? "bg-slate-200 text-slate-700 border-slate-300" : "bg-red-100 text-red-800 border-red-200"}`}
          >
            Urgente
          </Badge>
        )}
      </div>

      {/* Process Title */}
      <button
        type="button"
        onClick={() => onOpenProcess(item.executionId)}
        className="text-left rounded-sm text-sm font-semibold leading-snug text-[var(--text-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-700)] cursor-pointer"
      >
        {item.processName}
      </button>

      {showLocation && item.locationName && (
        <p className="text-xs text-[var(--text-secondary)] -mt-1">
          {item.locationName}
        </p>
      )}

      {/* Progress Section */}
      <div className="flex flex-col gap-1.5 pt-1">
        <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
          <span className="font-medium">{item.progressLabel}</span>
          <span className="font-semibold tabular-nums text-[var(--text-primary)]">
            {item.progressPercent}%
          </span>
        </div>
        <div className="h-2 w-full bg-slate-100 dark:bg-muted/50 rounded-full overflow-hidden border border-slate-200/50 dark:border-border/50">
          <div
            className={`h-full transition-all duration-300 rounded-full ${
              isCompleted
                ? "bg-emerald-600 dark:bg-emerald-500"
                : isScheduled
                  ? "bg-slate-400 dark:bg-slate-500"
                  : "bg-[var(--brand-900)] dark:bg-[var(--brand-700)]"
            }`}
            style={{ width: `${item.progressPercent}%` }}
          />
        </div>

        {/* Mini Step indicators preview */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 scrollbar-none">
          {item.tasks.map((task, idx) => {
            const isDone = task.status === "COMPLETED";
            return (
              <div
                key={task.id}
                title={`${idx + 1}. ${task.title} (${isDone ? "Concluída" : "Pendente"})`}
                className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md border shrink-0 ${
                  isDone
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300"
                    : isScheduled
                      ? "bg-slate-100 border-slate-200 text-slate-500 dark:bg-muted/30 dark:border-border dark:text-slate-400"
                      : "bg-slate-50 border-slate-200 text-slate-600 dark:bg-muted/30 dark:border-border dark:text-slate-400"
                }`}
              >
                {isDone ? (
                  <Check className="size-2.5 text-emerald-600 dark:text-emerald-400 stroke-[3]" />
                ) : (
                  <span className="font-mono">{idx + 1}</span>
                )}
                <span className="max-w-[80px] truncate">{task.title}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Action */}
      <div className="mt-1 border-t border-[var(--border-subtle)]/70 pt-2">
        {isScheduled ? (
          <div className="h-9 w-full flex items-center justify-between px-3 text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-muted/40 rounded-xl border border-slate-200 dark:border-border cursor-not-allowed select-none">
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5 text-slate-400" />
              <span>Aguardando horário</span>
            </span>
            {item.scheduledDate && (
              <span className="text-[11px] font-mono text-slate-500">
                Inicia às{" "}
                {new Date(item.scheduledDate).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: item.timezone,
                })}
              </span>
            )}
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenProcess(item.executionId)}
            className={
              attention
                ? "h-9 w-full justify-between px-3 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-300 hover:bg-amber-100 cursor-pointer"
                : "h-9 w-full justify-between px-0 text-xs font-semibold text-[var(--brand-900)] hover:bg-transparent hover:underline cursor-pointer"
            }
          >
            <span>
              {attention
                ? "Atenção"
                : isCompleted
                  ? "Ver processo concluído"
                  : item.completedTasks > 0
                    ? "Continuar processo"
                    : "Abrir processo"}
            </span>
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Button>
        )}
      </div>
    </Card>
  );
}
