"use client";
import { boardState, columnFor } from "@/application/mobile/policy";
import {
  operationPermission,
  processProgress,
  processBadge,
  deadline,
  dependencyBlocked,
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
  MapPin,
  FileText,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
    accentColor: "bg-[var(--brand-900)] text-white",
    pillBadgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
    borderTopClass: "border-t-[var(--brand-900)]",
    description: "Tarefas para realizar hoje",
    emptyText: "Nenhuma tarefa pendente para hoje.",
  },
  {
    id: "overdue",
    title: "Atrasadas",
    shortTitle: "Atrasadas",
    icon: AlertTriangle,
    accentColor: "bg-rose-600 text-white",
    pillBadgeClass: "bg-rose-50 text-rose-800 border-rose-200/70 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
    borderTopClass: "border-t-rose-500",
    description: "Prazo expirado — Ação prioritária",
    emptyText: "Nenhuma tarefa em atraso. Tudo em dia!",
  },
  {
    id: "unassigned",
    title: "Para Assumir",
    shortTitle: "Para Assumir",
    icon: Users,
    accentColor: "bg-slate-700 text-white dark:bg-slate-800",
    pillBadgeClass: "bg-slate-100 text-slate-700 border-slate-200/70 dark:bg-muted dark:text-slate-300 dark:border-border",
    borderTopClass: "border-t-slate-600",
    description: "Disponíveis na sua equipe e unidade",
    emptyText: "Nenhuma tarefa disponível para assumir.",
  },
  {
    id: "completed",
    title: "Concluídas Hoje",
    shortTitle: "Concluídas",
    icon: CheckCircle2,
    accentColor: "bg-emerald-700 text-white",
    pillBadgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
    borderTopClass: "border-t-emerald-600",
    description: "Entregas finalizadas no seu turno",
    emptyText: "Nenhuma tarefa concluída hoje ainda.",
  },
  {
    id: "upcoming",
    title: "Próximos Dias",
    shortTitle: "Próximas",
    icon: Calendar,
    accentColor: "bg-slate-500 text-white",
    pillBadgeClass: "bg-slate-100 text-slate-700 border-slate-200/70 dark:bg-muted dark:text-slate-300 dark:border-border",
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

  const typeFilterLabels = {
    ALL: "Todos",
    STANDARD: "Tarefas",
    FORM: "Com perguntas",
  } as const;

  return (
    <div className="flex flex-col gap-3.5 w-full">
      <section className="flex items-center gap-1 sm:gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[var(--brand-700)]/60" />
          <Input
            type="text"
            aria-label="Buscar tarefas"
            placeholder="Buscar tarefas por título, unidade ou processo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-9 bg-surface border-(--border-subtle) rounded-xl text-xs!"
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

        <Select
          value={filterType}
          onValueChange={(value) => {
            if (value !== null) {
              setFilterType(value);
            }
          }}
        >
          <SelectTrigger
            className="h-10 w-full max-sm:text-xs! flex-1 sm:w-55 rounded-xl border-border bg-background
      text-sm shadow-none transition-colors
      hover:bg-muted/40 focus:ring-2 focus:ring-ring/20"
          >
            <SelectValue placeholder="Filtrar por tipo">
              {typeFilterLabels[filterType]}
            </SelectValue>
          </SelectTrigger>

          <SelectContent
            align="start"
            className="min-w-55 rounded-xl p-1 shadow-lg"
          >
            {typeFilterItems.map((item) => {
              const count =
                item.value === "ALL"
                  ? allKanbanItems.length
                  : allKanbanItems.filter((it) =>
                    item.value === "FORM"
                      ? it.type === "TASK"
                        ? it.task.taskType === "FORM"
                        : it.tasks.some((t) => t.taskType === "FORM")
                      : it.type === "TASK"
                        ? it.task.taskType !== "FORM"
                        : it.tasks.some((t) => t.taskType !== "FORM"),
                  ).length;

              return (
                <SelectItem
                  key={item.value}
                  value={item.value}
                  className="min-h-10 cursor-pointer rounded-lg py-2 pl-3 pr-3
            focus:bg-accent focus:text-accent-foreground"
                >
                  <span className="flex w-full min-w-0 items-center gap-6">
                    <span className="flex-1 text-sm font-medium">
                      {typeFilterLabels[item.value]}
                    </span>

                    <span className="min-w-7 rounded-md bg-muted px-2 mr-4 py-0.5 text-center
              text-xs font-semibold tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </section>

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
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${isActive
                ? "bg-[var(--brand-900)] text-white border-[var(--brand-900)] shadow-xs scale-102"
                : isOverdueCol
                  ? "bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100"
                  : "bg-[var(--surface)] text-[var(--brand-900)] border-[var(--border-subtle)] hover:bg-[var(--canvas)]"
                }`}
            >
              <Icon className="size-3.5 shrink-0" />
              <span>{col.shortTitle}</span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${isActive
                  ? "bg-white/20 text-white"
                  : isOverdueCol
                    ? "bg-rose-200 text-rose-900"
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
              className={`transition-all duration-300 rounded-full ${isActive
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
              className="trello-kanban-column flex flex-col rounded-2xl bg-slate-50/80 dark:bg-muted/20 border border-slate-200/70 dark:border-border/60 p-3 sm:p-3.5 shadow-none"
            >
              <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-200/70 dark:border-border/50">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`size-7 rounded-lg ${col.accentColor} flex items-center justify-center shrink-0 shadow-none`}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm text-[var(--brand-900)] dark:text-foreground truncate">
                      {col.title}
                    </h3>
                    <p className="text-[11px] text-[var(--text-secondary)] truncate">
                      {col.description}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${col.pillBadgeClass}`}
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
    ? null
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

  const deadlineClass = isScheduled
    ? "bg-slate-100 text-slate-600 border-slate-200/80 dark:bg-muted dark:text-slate-300 dark:border-border"
    : deadlineInfo.status === "OVERDUE"
      ? "bg-rose-50 text-rose-800 border-rose-200/70 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800/40"
      : deadlineInfo.status === "TOLERANCE"
        ? "bg-amber-50 text-amber-800 border-amber-200/60 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/40"
        : "bg-emerald-50/70 text-emerald-800 border-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/40";

  const scheduledTimeStr = task.scheduledDate
    ? new Date(task.scheduledDate).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: task.timezone,
    })
    : null;

  return (
    <Card
      className={`employee-task-card shrink-0 h-fit ring-0 rounded-2xl border p-3.5 sm:p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col gap-2.5 transition-all ${isScheduled
        ? "opacity-80 bg-slate-50/70 dark:bg-muted/15 border-slate-200 dark:border-border select-none"
        : "bg-[var(--surface)] border-slate-200/80 dark:border-border/80 hover:border-slate-300 dark:hover:border-slate-700"
        }`}
    >
      {/* Top Meta Row (Status & Characteristics) */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {task.taskType === "FORM" && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-muted px-2 py-0.5 rounded-md">
              <FileText className="size-3 text-slate-400" />
              <span>Perguntas</span>
            </span>
          )}
          {task.priority === "CRITICAL" && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200/70 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 px-1.5 py-0.5 rounded-md">
              <span className="size-1.5 rounded-full bg-rose-500 animate-pulse" />
              Urgente
            </span>
          )}
        </div>

        <Badge
          variant="outline"
          className={`text-[11px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${deadlineClass}`}
        >
          {isScheduled ? "Agendada" : deadlineInfo.label}
        </Badge>
      </div>

      {/* Task Title */}
      <button
        type="button"
        onClick={() => onOpenTask(task.id)}
        className="text-left font-semibold text-[14px] leading-snug text-slate-900 dark:text-slate-100 hover:text-[var(--brand-900)] dark:hover:text-emerald-400 transition-colors line-clamp-2 cursor-pointer"
      >
        {task.title}
      </button>

      {/* Location and/or Operational State */}
      {((showLocation && task.locationName) || state) && (
        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          {showLocation && task.locationName && (
            <span className="inline-flex items-center gap-1 truncate">
              <MapPin className="size-3 text-slate-400 shrink-0" />
              <span className="truncate">{task.locationName}</span>
            </span>
          )}
          {state && (
            <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
              <span className="size-1.5 rounded-full bg-amber-500 shrink-0" />
              {state}
            </span>
          )}
        </div>
      )}

      {/* Clock / Elapsed Time or Scheduled Info */}
      {isScheduled ? (
        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <Clock className="size-3.5 text-slate-400 shrink-0" />
          <span>Inicia às {scheduledTimeStr}</span>
        </div>
      ) : (
        <div
          className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400"
          role="timer"
          aria-live="off"
          aria-label="Tempo decorrido"
        >
          <span className="inline-flex items-center gap-1.5">
            <Clock
              className={`size-3.5 shrink-0 ${clock.running
                ? "text-emerald-600 dark:text-emerald-400 animate-pulse"
                : "text-slate-400"
                }`}
            />
            <span className="font-mono text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-300">
              {formatClock(clock.elapsed ?? 0)}
            </span>
          </span>
          <span className="text-[11px] text-slate-400">
            {completed
              ? "total"
              : clock.toleranceExceeded
                ? "tolerância esgotada"
                : "decorrido"}
          </span>
        </div>
      )}

      {/* Bottom Action Footer */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 mt-0.5">
        {isScheduled ? (
          <div className="flex items-center justify-between text-xs text-slate-400 select-none py-0.5">
            <span>Aguardando liberação</span>
            <span className="font-mono text-[11px] font-medium text-slate-500">
              {scheduledTimeStr}
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
            className="h-9 w-full justify-between px-3 text-xs font-semibold text-rose-700 bg-rose-50/70 border-rose-200 hover:bg-rose-100/80 rounded-xl cursor-pointer"
          >
            <span>Bloqueada (Tolerância)</span>
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
              className="flex-1 h-9! text-xs! font-medium! bg-[var(--brand-900)]! hover:bg-[var(--brand-700)]! rounded-xl! shadow-none!"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => onOpenTask(task.id)}
              aria-label="Ver detalhes da tarefa"
              className="h-9 w-9 rounded-xl shrink-0 cursor-pointer text-slate-600 hover:text-slate-900"
            >
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onOpenTask(task.id)}
            className="w-full flex items-center justify-between text-xs font-medium text-[var(--brand-900)] dark:text-emerald-400 hover:text-[var(--brand-700)] transition-colors py-0.5 cursor-pointer group"
          >
            <span>{action}</span>
            <ArrowRight className="size-3.5 text-slate-400 group-hover:translate-x-0.5 group-hover:text-[var(--brand-900)] dark:group-hover:text-emerald-400 transition-all" />
          </button>
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

  // Determine active/next pending step
  const activeTask = item.tasks.find(
    (t) => !["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(t.status),
  );

  const statusBadge = isCompleted ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-800 bg-emerald-50/80 border border-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/40 px-2 py-0.5 rounded-full">
      <Check className="size-3 text-emerald-600" />
      <span>Concluído</span>
    </span>
  ) : isOverdue ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-800 bg-rose-50 border border-rose-200/70 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800/40 px-2 py-0.5 rounded-full">
      <AlertTriangle className="size-3 text-rose-600" />
      <span>Atrasado</span>
    </span>
  ) : attention || item.hasImpediment ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200/60 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/40 px-2 py-0.5 rounded-full">
      <AlertTriangle className="size-3 text-amber-600" />
      <span>Atenção</span>
    </span>
  ) : isScheduled ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 border border-slate-200/70 dark:bg-muted dark:text-slate-300 dark:border-border px-2 py-0.5 rounded-full">
      <Clock className="size-3 text-slate-400" />
      <span>Agendado</span>
    </span>
  ) : (
    <span className="inline-flex items-center text-[11px] font-medium text-slate-600 bg-slate-50 border border-slate-200/60 dark:bg-muted/40 dark:text-slate-300 dark:border-border px-2 py-0.5 rounded-full">
      {badge.label}
    </span>
  );

  const scheduledTimeStr = item.scheduledDate
    ? new Date(item.scheduledDate).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: item.timezone,
    })
    : null;

  return (
    <Card
      className={`employee-process-card shrink-0 h-fit ring-0 rounded-2xl border p-3.5 sm:p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col gap-2.5 transition-all ${isScheduled
        ? "opacity-80 bg-slate-50/70 dark:bg-muted/15 border-slate-200 dark:border-border select-none"
        : isOverdue
          ? "border-rose-200 dark:border-rose-900/40 bg-[var(--surface)] hover:border-rose-300"
          : attention
            ? "border-amber-200 dark:border-amber-900/40 bg-[var(--surface)] hover:border-amber-300"
            : "border-slate-200/80 dark:border-border/80 bg-[var(--surface)] hover:border-slate-300 dark:hover:border-slate-700"
        }`}
    >
      {/* Top Meta Row (Process Badge + Status) */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-900 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/40 px-2 py-0.5 rounded-md">
            <Layers className="size-3 text-emerald-700 dark:text-emerald-400" />
            <span>Processo</span>
          </span>

          {item.priority === "CRITICAL" && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200/70 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 px-1.5 py-0.5 rounded-md">
              <span className="size-1.5 rounded-full bg-rose-500 animate-pulse" />
              Urgente
            </span>
          )}
        </div>

        {statusBadge}
      </div>

      {/* Process Title */}
      <button
        type="button"
        onClick={() => onOpenProcess(item.executionId)}
        className="text-left font-semibold text-[14px] leading-snug text-slate-900 dark:text-slate-100 hover:text-[var(--brand-900)] dark:hover:text-emerald-400 transition-colors line-clamp-2 cursor-pointer"
      >
        {item.processName}
      </button>

      {/* Location */}
      {showLocation && item.locationName && (
        <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          <MapPin className="size-3 text-slate-400 shrink-0" />
          <span className="truncate">{item.locationName}</span>
        </div>
      )}

      {/* Clean Progress Section */}
      <div className="flex flex-col gap-1.5 pt-0.5">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {item.completedTasks} de {item.totalTasks} etapas
          </span>
          <span className="font-mono text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-400">
            {item.progressPercent}%
          </span>
        </div>

        <div className="h-1.5 w-full bg-slate-100 dark:bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${isCompleted
              ? "bg-emerald-600"
              : isOverdue
                ? "bg-rose-500"
                : isScheduled
                  ? "bg-slate-400"
                  : "bg-[var(--brand-900)] dark:bg-[var(--brand-700)]"
              }`}
            style={{ width: `${item.progressPercent}%` }}
          />
        </div>

        {activeTask && !isCompleted && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 truncate pt-0.5">
            <span className="text-[11px] text-slate-400 shrink-0">Etapa atual:</span>
            <span className="font-medium text-slate-700 dark:text-slate-300 truncate text-[11px]">
              {activeTask.title}
            </span>
          </div>
        )}
      </div>

      {/* Bottom Action Footer */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 mt-0.5">
        {isScheduled ? (
          <div className="flex items-center justify-between text-xs text-slate-400 select-none py-0.5">
            <span>Aguardando liberação</span>
            <span className="font-mono text-[11px] font-medium text-slate-500">
              {scheduledTimeStr ? `Inicia às ${scheduledTimeStr}` : ""}
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onOpenProcess(item.executionId)}
            className="w-full flex items-center justify-between text-xs font-medium text-[var(--brand-900)] dark:text-emerald-400 hover:text-[var(--brand-700)] transition-colors py-0.5 cursor-pointer group"
          >
            <span>
              {isCompleted
                ? "Ver processo concluído"
                : item.completedTasks > 0
                  ? "Continuar processo"
                  : "Abrir processo"}
            </span>
            <ArrowRight className="size-3.5 text-slate-400 group-hover:translate-x-0.5 group-hover:text-[var(--brand-900)] dark:group-hover:text-emerald-400 transition-all" />
          </button>
        )}
      </div>
    </Card>
  );
}
