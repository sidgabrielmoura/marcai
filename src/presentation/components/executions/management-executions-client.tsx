"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  History,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  Search,
  Filter,
  MapPin,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Layers,
  ArrowRight,
  User,
  GitMerge,
  Calendar,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader, EmptyState } from "@/presentation/components/shared";
import { uiLabel } from "@/presentation/components/shared/ui-labels";
import { formatRoutineRule } from "@/domain/rules/schedule";

export interface ExecutionItem {
  id: string;
  processId: string;
  processName: string;
  processCriticality: string;
  routineName: string | null;
  locationId: string | null;
  locationName: string | null;
  status: string;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    criticality: string;
    deadlineAt: string | null;
    completedAt: string | null;
    assigneeName: string | null;
    assigneeAvatar: string | null;
  }>;
}

interface ManagementExecutionsClientProps {
  executions: ExecutionItem[];
  locations: Array<{ id: string; name: string }>;
  processes: Array<{ id: string; name: string }>;
  initialExecutionId?: string;
  currentPeriod: string;
  currentStatus: string;
}

function executionStatusBadgeStyle(status: string) {
  switch (status) {
    case "COMPLETED":
      return {
        variant: "default" as const,
        className: "bg-emerald-600 text-white border-transparent",
      };
    case "IN_PROGRESS":
      return {
        variant: "secondary" as const,
        className: "bg-blue-600 text-white border-transparent",
      };
    case "SCHEDULED":
      return {
        variant: "outline" as const,
        className:
          "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800",
      };
    case "AVAILABLE":
      return {
        variant: "outline" as const,
        className:
          "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
      };
    case "CANCELLED":
      return {
        variant: "destructive" as const,
        className: "bg-neutral-600 text-white border-transparent",
      };
    case "NOT_COMPLETED":
      return {
        variant: "destructive" as const,
        className: "bg-rose-600 text-white border-transparent",
      };
    case "NEEDS_CORRECTION":
    case "PENDING_REVIEW":
      return {
        variant: "outline" as const,
        className:
          "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
      };
    case "PAUSED":
      return {
        variant: "outline" as const,
        className: "bg-neutral-100 text-neutral-700 border-neutral-300",
      };
    default:
      return { variant: "outline" as const, className: "" };
  }
}

export function ManagementExecutionsClient({
  executions,
  locations,
  processes,
  initialExecutionId,
  currentPeriod,
  currentStatus,
}: ManagementExecutionsClientProps) {
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("ALL");
  const [processFilter, setProcessFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState(currentStatus || "ALL");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const set = new Set<string>();
    if (initialExecutionId) set.add(initialExecutionId);
    return set;
  });

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Filtragem
  const filtered = useMemo(() => {
    return executions.filter((exec) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const formattedRoutine = formatRoutineRule(exec.routineName);
        const matchProcess = exec.processName.toLowerCase().includes(q);
        const matchRoutine =
          exec.routineName?.toLowerCase().includes(q) ||
          formattedRoutine?.toLowerCase().includes(q);
        const matchLocation = exec.locationName?.toLowerCase().includes(q);
        const matchTasks = exec.tasks.some(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.assigneeName?.toLowerCase().includes(q),
        );
        if (!matchProcess && !matchRoutine && !matchLocation && !matchTasks) return false;
      }
      if (locationFilter !== "ALL" && exec.locationId !== locationFilter) return false;
      if (processFilter !== "ALL" && exec.processId !== processFilter) return false;
      if (statusFilter !== "ALL") {
        if (statusFilter === "COMPLETED" && exec.status !== "COMPLETED") return false;
        if (statusFilter === "IN_PROGRESS" && exec.status !== "IN_PROGRESS") return false;
        if (statusFilter === "CANCELLED" && exec.status !== "CANCELLED") return false;
        if (
          statusFilter === "PENDING_OR_CORRECTION" &&
          !["NEEDS_CORRECTION", "PENDING_REVIEW", "PAUSED"].includes(exec.status)
        )
          return false;
      }
      return true;
    });
  }, [executions, search, locationFilter, processFilter, statusFilter]);

  // Contadores
  const totalCount = executions.length;
  const completedCount = executions.filter((e) => e.status === "COMPLETED").length;
  const inProgressCount = executions.filter((e) => e.status === "IN_PROGRESS").length;
  const cancelledCount = executions.filter(
    (e) => e.status === "CANCELLED" || e.status === "NOT_COMPLETED",
  ).length;
  const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  function formatDuration(startedAt: string | null, completedAt: string | null) {
    if (!startedAt || !completedAt) return null;
    const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
    if (ms < 0) return null;
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins} min`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m`;
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Histórico de execuções"
        subtitle="Acompanhe o ciclo de vida completo de cada processo e rotina executada pelas equipes e unidades."
      />

      {/* Cartões de Indicadores */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-[var(--border-subtle)] bg-[var(--surface)]">
          <CardContent className="p-4">
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">
              Total de Execuções
            </span>
            <p className="text-2xl font-bold text-[var(--brand-900)] mt-1">{totalCount}</p>
          </CardContent>
        </Card>

        <Card className="border-[var(--border-subtle)] bg-[var(--surface)]">
          <CardContent className="p-4">
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">
              Concluídas
            </span>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{completedCount}</p>
          </CardContent>
        </Card>

        <Card className="border-[var(--border-subtle)] bg-[var(--surface)]">
          <CardContent className="p-4">
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">
              Em Andamento
            </span>
            <p className="text-2xl font-bold text-blue-600 mt-1">{inProgressCount}</p>
          </CardContent>
        </Card>

        <Card className="border-[var(--border-subtle)] bg-[var(--surface)]">
          <CardContent className="p-4">
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">
              Taxa de Conclusão
            </span>
            <p className="text-2xl font-bold text-[var(--brand-900)] mt-1">{completionRate}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between bg-[var(--surface)] p-3 rounded-xl border border-[var(--border-subtle)]">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            placeholder="Buscar por processo, rotina, unidade ou tarefa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {locations.length > 0 && (
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="h-9 px-2.5 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--canvas)] text-[var(--text-primary)]"
            >
              <option value="ALL">Todas as unidades</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          )}

          {processes.length > 0 && (
            <select
              value={processFilter}
              onChange={(e) => setProcessFilter(e.target.value)}
              className="h-9 px-2.5 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--canvas)] text-[var(--text-primary)]"
            >
              <option value="ALL">Todos os processos</option>
              {processes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-2.5 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--canvas)] text-[var(--text-primary)]"
          >
            <option value="ALL">Todos os status</option>
            <option value="COMPLETED">Concluídos</option>
            <option value="IN_PROGRESS">Em andamento</option>
            <option value="CANCELLED">Cancelados</option>
            <option value="PENDING_OR_CORRECTION">Com pendências</option>
          </select>
        </div>
      </div>

      {/* Lista de Execuções */}
      {filtered.length === 0 ? (
        <EmptyState
          title="Nenhuma execução encontrada"
          description={
            search || locationFilter !== "ALL" || processFilter !== "ALL" || statusFilter !== "ALL"
              ? "Nenhuma execução corresponde aos filtros aplicados."
              : "Não há registros de execuções finalizadas ou ativas neste período."
          }
          icon={History}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((exec) => {
            const isExpanded = expandedIds.has(exec.id);
            const totalTasks = exec.tasks.length;
            const completedTasks = exec.tasks.filter((t) => t.status === "COMPLETED").length;
            const percent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
            const duration = formatDuration(exec.startedAt, exec.completedAt);

            return (
              <Card
                key={exec.id}
                className={`border-[var(--border-subtle)] bg-[var(--surface)] transition-all ${
                  isExpanded ? "ring-1 ring-[var(--brand-primary)]" : "hover:border-[var(--brand-primary)]"
                }`}
              >
                <CardContent className="p-4 sm:p-5">
                  <div
                    className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 cursor-pointer"
                    onClick={() => toggleExpand(exec.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        {(() => {
                          const badgeStyle = executionStatusBadgeStyle(exec.status);
                          return (
                            <Badge
                              variant={badgeStyle.variant}
                              className={`text-[10px] font-bold ${badgeStyle.className}`}
                            >
                              {uiLabel(exec.status)}
                            </Badge>
                          );
                        })()}

                        {exec.processCriticality && (
                          <Badge variant="outline" className="text-[10px] font-semibold">
                            {uiLabel(exec.processCriticality)}
                          </Badge>
                        )}

                        {exec.locationName && (
                          <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                            <MapPin size={12} />
                            {exec.locationName}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-[var(--brand-900)]">
                          {exec.processName}
                        </h3>
                        {(() => {
                          const formatted = formatRoutineRule(exec.routineName);
                          if (!formatted) return null;
                          return (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--canvas)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] font-medium">
                              <Clock size={11} className="text-[var(--text-muted)]" />
                              {formatted}
                            </span>
                          );
                        })()}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-[var(--text-muted)]">
                        <span className="flex items-center gap-1">
                          <Calendar size={13} />
                          Agendado: {new Date(exec.scheduledAt).toLocaleDateString("pt-BR")}
                        </span>

                        {exec.completedAt && (
                          <span className="flex items-center gap-1 text-emerald-700 font-medium">
                            <CheckCircle2 size={13} />
                            Concluído em:{" "}
                            {new Date(exec.completedAt).toLocaleString("pt-BR", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </span>
                        )}

                        {duration && (
                          <span className="flex items-center gap-1">
                            <Clock size={13} />
                            Duração: {duration}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Progresso e Botão Expandir */}
                    <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end pt-2 md:pt-0 border-t md:border-t-0 border-[var(--border-subtle)]">
                      <div className="text-right">
                        <span className="text-xs font-bold text-[var(--brand-900)] block">
                          {completedTasks}/{totalTasks} tarefas ({percent}%)
                        </span>
                        <div className="w-28 h-2 bg-[var(--canvas)] rounded-full overflow-hidden mt-1 border border-[var(--border-subtle)]">
                          <div
                            className={`h-full rounded-full transition-all ${
                              percent === 100 ? "bg-emerald-600" : "bg-[var(--brand-primary)]"
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="p-1 h-auto text-[var(--text-muted)] hover:text-[var(--brand-900)]"
                        aria-label={isExpanded ? "Recolher tarefas" : "Expandir tarefas"}
                      >
                        {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                      </Button>
                    </div>
                  </div>

                  {/* Painel Expandido com Lista de Tarefas da Execução */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] space-y-2">
                      <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                        Tarefas desta Execução
                      </h4>

                      {exec.tasks.length === 0 ? (
                        <p className="text-xs text-[var(--text-muted)] italic">
                          Nenhuma tarefa foi gerada nesta execução.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {exec.tasks.map((task) => (
                            <div
                              key={task.id}
                              className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--canvas)] border border-[var(--border-subtle)] text-xs hover:border-[var(--brand-primary)] transition-colors"
                            >
                              <div className="min-w-0 flex-1 flex items-center gap-2">
                                <Badge
                                  variant={
                                    task.status === "COMPLETED"
                                      ? "default"
                                      : task.status === "IN_PROGRESS"
                                        ? "secondary"
                                        : "outline"
                                  }
                                  className={`text-[9px] font-bold ${
                                    task.status === "COMPLETED"
                                      ? "bg-emerald-600 text-white"
                                      : ""
                                  }`}
                                >
                                  {uiLabel(task.status)}
                                </Badge>

                                <span className="font-semibold text-[var(--brand-900)] truncate">
                                  {task.title}
                                </span>

                                {task.assigneeName && (
                                  <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1 shrink-0">
                                    <User size={11} />
                                    {task.assigneeName}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {task.completedAt ? (
                                  <span className="text-[10px] text-emerald-700 font-medium">
                                    {new Date(task.completedAt).toLocaleTimeString("pt-BR", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                ) : task.deadlineAt ? (
                                  <span className="text-[10px] text-[var(--text-muted)]">
                                    Prazo:{" "}
                                    {new Date(task.deadlineAt).toLocaleTimeString("pt-BR", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                ) : null}

                                <Link
                                  href={`/management/tasks/${task.id}`}
                                  className="text-[11px] font-semibold text-[var(--brand-primary)] hover:underline flex items-center gap-0.5 ml-2"
                                >
                                  Ver tarefa
                                  <ArrowRight size={11} />
                                </Link>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
