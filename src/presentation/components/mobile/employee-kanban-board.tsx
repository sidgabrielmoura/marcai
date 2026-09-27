"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckSquare,
  Play,
  AlertTriangle,
  Users,
  CheckCircle2,
  Calendar,
  MapPin,
  Clock,
  ArrowRight,
  Search,
  X,
  Camera,
  GitMerge,
  AlertCircle,
  Eye,
} from "lucide-react";
import { StatusBadge, PriorityBadge } from "../shared";
import { ClaimTaskButton } from "./claim-task-button";
import { QuickCompleteButton } from "./quick-complete-button";
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
  initialColumn?: ColumnId;
}

export function EmployeeKanbanBoard({
  tasks,
  initialColumn = "today",
}: EmployeeKanbanBoardProps) {
  const [activeColumn, setActiveColumn] = useState<ColumnId>(initialColumn);
  const [searchQuery, setSearchQuery] = useState("");

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

    const now = new Date();

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
      if (task.slaExceeded || (task.deadlineAt && new Date(task.deadlineAt) < now)) {
        groups.overdue.push(task);
        continue;
      }

      // Verificação de data para Hoje vs Próximos Dias
      const targetDate = task.scheduledDate || task.deadlineAt;
      if (targetDate) {
        const d = new Date(targetDate);
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        if (d > todayEnd) {
          groups.upcoming.push(task);
          continue;
        }
      }

      // Padrão para tarefas do dia ou sem data futura (AVAILABLE, IN_PROGRESS, PAUSED, NEEDS_CORRECTION)
      groups.today.push(task);
    }

    return groups;
  }, [filteredTasks]);

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
          placeholder="Buscar tarefas por título, unidade ou processo..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-11 pl-10 pr-9 bg-[var(--surface)] border-[var(--border-subtle)] rounded-xl text-sm"
        />
        {searchQuery && (
          <button
            type="button"
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
          const isOverdue = col.id === "overdue";

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
                    <TrelloCard key={task.id} task={task} isOverdueCol={isOverdue} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrelloCard({
  task,
  isOverdueCol,
}: {
  task: EmployeeTask;
  isOverdueCol: boolean;
}) {
  const isCompleted = task.status === "COMPLETED";

  return (
    <Card className="group relative min-h-fit! h-fit! bg-white dark:bg-card border border-slate-200/80 dark:border-border rounded-xl p-3! shadow-xs hover:shadow-md transition-all flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500 truncate">
          {task.origin === "PROCESS" ? (
            <>
              <GitMerge className="size-3 text-brand-700 shrink-0" />
              <span className="truncate">{task.processName || "Processo"}</span>
            </>
          ) : (
            <span className="uppercase text-[10px] tracking-wide text-slate-400">
              Tarefa avulsa
            </span>
          )}
        </div>
        <PriorityBadge priority={task.priority} size="sm" />
      </div>

      {/* Título da Tarefa com Link */}
      <Link
        href={`/tasks/${task.id}`}
        className="text-[14px] font-bold text-[var(--brand-900)] dark:text-foreground hover:text-brand-700 leading-snug line-clamp-2"
      >
        {task.title}
      </Link>

      {/* Badges de Status & SLA */}
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={task.status} size="sm" />
        {task.status === "PAUSED" && (
          <Badge
            variant="outline"
            className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-amber-50 text-amber-800 border-amber-200 flex items-center gap-1"
          >
            <Clock className="size-2.5 shrink-0" />
            Pausada
          </Badge>
        )}
        {task.status === "NEEDS_CORRECTION" && (
          <Badge
            variant="outline"
            className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-orange-50 text-orange-800 border-orange-200 flex items-center gap-1"
          >
            <AlertCircle className="size-2.5 shrink-0" />
            Correção solicitada
          </Badge>
        )}
        {task.slaExceeded && (
          <Badge
            variant="destructive"
            className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-red-100 text-red-800 border-red-200 flex items-center gap-1"
          >
            <AlertTriangle className="size-2.5 shrink-0" />
            SLA Excedido
          </Badge>
        )}
        {task.evidenceCount > 0 && (
          <span className="text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1 font-medium">
            <Camera className="size-3 text-slate-500" />
            {task.evidenceCount} comprovação(ões)
          </span>
        )}
      </div>

      {task.hasImpediment && (
        <div className="text-[11px] font-medium bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-2 flex items-start gap-1.5">
          <AlertCircle className="size-3.5 text-amber-700 shrink-0 mt-0.5" />
          <span className="line-clamp-2">
            <strong>Impedimento:</strong> {task.impedimentReason || "Operação interrompida"}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-border text-[11px] text-slate-500">
        {task.locationName && (
          <div className="flex items-center gap-1 truncate max-w-35" title={task.locationName}>
            <MapPin className="size-3 text-slate-400 shrink-0" />
            <span className="truncate">{task.locationName}</span>
          </div>
        )}

        {(task.deadlineAt || task.scheduledDate) && (
          <div
            className={`flex items-center gap-1 ml-auto font-medium ${task.slaExceeded || isOverdueCol
              ? "text-red-700 font-semibold"
              : "text-slate-600"
              }`}
          >
            <Clock className="size-3 shrink-0" />
            <span>
              {new Date(task.deadlineAt || task.scheduledDate!).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
              {" · "}
              {new Date(task.deadlineAt || task.scheduledDate!).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
              })}
            </span>
          </div>
        )}
      </div>

      <div className="pt-1 flex items-center justify-between gap-2">
        {task.isUnassigned ? (
          <div className="w-full">
            <ClaimTaskButton taskId={task.id} />
          </div>
        ) : isCompleted ? (
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            render={<Link href={`/tasks/${task.id}`} />}
            className="w-full h-8 text-xs font-semibold text-emerald-800 border-emerald-200 hover:bg-emerald-50"
          >
            <Eye className="size-3 mr-1" />
            Ver detalhes da entrega
          </Button>
        ) : task.status === "PAUSED" ? (
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            render={<Link href={`/tasks/${task.id}`} />}
            className="w-full h-8 text-xs font-semibold text-amber-800 border-amber-300 hover:bg-amber-50 justify-between"
          >
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5 text-amber-600" />
              <span>Retomar / Concluir</span>
            </span>
            <ArrowRight className="size-3 text-amber-600" />
          </Button>
        ) : task.hasRequiredEvidence ? (
          <Button
            nativeButton={false}
            size="sm"
            render={<Link href={`/tasks/${task.id}`} />}
            className="w-full h-8 text-xs font-semibold bg-brand-900 hover:bg-brand-600 text-white shadow-xs justify-between"
          >
            <span className="flex items-center gap-1.5 truncate">
              <Camera className="size-3.5 shrink-0" />
              <span>Anexar e concluir</span>
            </span>
            <ArrowRight className="size-3 text-white/80 shrink-0" />
          </Button>
        ) : (
          <QuickCompleteButton taskId={task.id} taskTitle={task.title} />
        )}
      </div>
    </Card>
  );
}
