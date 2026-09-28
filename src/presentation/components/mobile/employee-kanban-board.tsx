"use client";

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
} from "lucide-react";
import { taskClock, formatClock } from "@/domain/rules/employee-task-clock";
import { ClaimTaskButton } from "./claim-task-button";
import { QuickCompleteButton } from "./quick-complete-button";
import { EmployeeTaskDetailDrawer } from "./task-detail-drawer";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TaskStatus, Priority, Criticality } from "@/domain/types";

export interface EmployeeTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  criticality: Criticality;
  origin: string;
  scheduledDate: string | null;
  deadlineAt: string | null;
  completedAt: string | null;
  startedAt: string | null;
  slaDueAt: string | null;
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

export type ColumnId =
  | "today"
  | "overdue"
  | "unassigned"
  | "completed"
  | "upcoming";

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

export function EmployeeKanbanBoard({
  tasks,
  snapshotAt,
  initialColumn = "today",
}: EmployeeKanbanBoardProps) {
  const [activeColumn, setActiveColumn] = useState<ColumnId>(initialColumn);
  const [searchQuery, setSearchQuery] = useState("");
  const [now, setNow] = useState(snapshotAt);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const showLocation = new Set(tasks.map(task => task.locationName).filter(Boolean)).size > 1;

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
        window.history.replaceState(null, "", url.pathname + (url.search ? url.search : ""));
      }
    }
  }

  // Verificar se há taskId na URL ao carregar a página
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const taskIdParam = params.get("taskId");
      if (taskIdParam) {
        setSelectedTaskId(taskIdParam);
        setSheetOpen(true);
      }
    }
  }, []);

  // A single clock for all cards, calculated from timestamps to avoid drift.
  useEffect(() => {
    const clientAnchor = Date.now();
    const tick = () => setNow(snapshotAt + Math.max(0, Date.now() - clientAnchor));
    tick();
    const interval = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", tick); };
  }, [snapshotAt]);

  const boardRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Filtragem de busca
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return tasks;
    const q = searchQuery.toLowerCase().trim();
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.locationName && t.locationName.toLowerCase().includes(q)) ||
        (t.processName && t.processName.toLowerCase().includes(q)),
    );
  }, [tasks, searchQuery]);

  // Agrupamento por coluna
  const groupedTasks = useMemo(() => {
    const groups: Record<ColumnId, EmployeeTask[]> = {
      today: [],
      overdue: [],
      unassigned: [],
      completed: [],
      upcoming: [],
    };

    const currentDate = new Date(now);

    for (const task of filteredTasks) {
      if (task.isUnassigned) {
        groups.unassigned.push(task);
        continue;
      }

      if (task.status === "COMPLETED") {
        groups.completed.push(task);
        continue;
      }

      // Tarefas não concluídas com SLA ou prazo estourado
      if ((taskClock(task, now, snapshotAt).remaining ?? Infinity) <= 0) {
        groups.overdue.push(task);
        continue;
      }

      // Verificação de data para Hoje vs Próximos Dias
      const targetDate = task.scheduledDate || task.deadlineAt;
      if (targetDate) {
        const d = new Date(targetDate);
        const todayEnd = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 23, 59, 59, 999);
        if (d > todayEnd) {
          groups.upcoming.push(task);
          continue;
        }
      }

      // Padrão para tarefas do dia ou sem data futura (AVAILABLE, IN_PROGRESS, PAUSED, NEEDS_CORRECTION)
      groups.today.push(task);
    }

    return groups;
  }, [filteredTasks, now, snapshotAt]);

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
            const colId = entry.target.getAttribute("data-column-id") as ColumnId;
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
                  ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                  : "bg-[var(--surface)] text-[var(--brand-900)] border-[var(--border-subtle)] hover:bg-[var(--canvas)]"
                }`}
            >
              <Icon className="size-3.5 shrink-0" />
              <span>{col.shortTitle}</span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${isActive
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
                  tasksInCol.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      now={now}
                      snapshotAt={snapshotAt}
                      showLocation={showLocation}
                      onOpenTask={handleOpenTask}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Drawer para visualização e execução da tarefa selecionada (baixo para cima) */}
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
  const overdue = clock.remaining !== null && clock.remaining <= 0;
  const state = ({ PAUSED: "Pausada", NEEDS_CORRECTION: "Correção solicitada", BLOCKED: "Aguardando etapa anterior", SUBMITTED: "Aguardando aprovação" } as Record<string, string>)[task.status];
  const action = completed ? "Ver entrega" : task.status === "PAUSED" ? "Retomar tarefa" : task.status === "NEEDS_CORRECTION" ? "Corrigir entrega" : task.status === "IN_PROGRESS" ? (task.hasRequiredEvidence ? "Registrar entrega" : "Continuar tarefa") : "Abrir tarefa";

  return (
    <Card className="employee-task-card shrink-0 h-fit gap-3 ring-0 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4 shadow-none">
      <button
        type="button"
        onClick={() => onOpenTask(task.id)}
        className="text-left rounded-sm text-sm font-semibold leading-snug text-[var(--text-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-700)] cursor-pointer"
      >
        {task.title}
      </button>
      {showLocation && task.locationName && <p className="text-xs text-[var(--text-secondary)]">{task.locationName}</p>}
      {state && <p className="text-xs font-medium text-[var(--text-secondary)]">{state}</p>}
      {(clock.elapsed !== null || clock.remaining !== null) && (
        <div className="flex flex-wrap gap-x-5 gap-y-2" role="timer" aria-live="off" aria-label="Tempos da tarefa">
          {clock.elapsed !== null && (
            <div className="min-w-0">
              <p className="text-[11px] text-[var(--text-secondary)]">{completed ? "Tempo total" : "Decorrido"}</p>
              <span className="font-mono text-sm font-medium tabular-nums text-[var(--text-primary)]">{formatClock(clock.elapsed)}</span>
            </div>
          )}
          {clock.remaining !== null && (
            <div className={overdue ? "text-red-700 dark:text-red-400" : "text-[var(--text-primary)]"} title={clock.deadlineLabel}>
              <p className="text-[11px]">{overdue ? "Em atraso" : "Restante"}</p>
              <span className="font-mono text-sm font-medium tabular-nums">{formatClock(clock.remaining)}</span>
            </div>
          )}
        </div>
      )}
      <div className="mt-1">
        {task.isUnassigned && task.status === "AVAILABLE" ? (
          <ClaimTaskButton taskId={task.id} onClaimed={(id) => onOpenTask(id)} />
        ) : task.status === "IN_PROGRESS" && !task.hasRequiredEvidence ? (
          <div className="flex items-center gap-2">
            <QuickCompleteButton taskId={task.id} taskTitle={task.title} className="flex-1 h-10! bg-[var(--brand-900)]! shadow-none!" />
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
            {action}<ArrowRight className="size-3.5" aria-hidden="true" />
          </Button>
        )}
      </div>
    </Card>
  );
}

