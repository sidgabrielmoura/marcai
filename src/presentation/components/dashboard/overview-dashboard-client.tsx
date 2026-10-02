"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Download,
  Printer,
  CalendarPlus,
  Clock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { PageHeader, EmptyState, StatusBadge, PriorityBadge } from "../shared";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Modal } from "../shared/modal";
import { toast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { createScheduledReportAction } from "@/presentation/actions/report-actions";
import type { TaskStatus, Priority, Criticality } from "@/domain/types";

export interface OverviewTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  criticality: Criticality;
  origin: string;
  locationId: string | null;
  teamId: string | null;
  processId: string | null;
  locationName: string;
  teamName: string;
  processName: string;
  deadlineAt: string | null;
  completedAt: string | null;
  createdAt: string;
  isOverdue: boolean;
  slaExceeded: boolean;
  delayMinutes: number;
  hasActiveImpediment: boolean;
  impedimentReason?: string;
  isPaused: boolean;
  pendingApproval: boolean;
  assigneeName: string;
  estimatedDuration: number | null;
  actualDuration: number | null;
}

interface Options {
  locations: { id: string; name: string }[];
  teams: { id: string; name: string }[];
  processes: { id: string; name: string }[];
}

export function OverviewDashboardClient({
  tasks,
  options,
  role,
  userName,
  orgName,
}: {
  tasks: OverviewTask[];
  options: Options;
  role: string;
  userName: string;
  orgName: string;
}) {
  const [period, setPeriod] = useState("30");
  const [location, setLocation] = useState("ALL");
  const [team, setTeam] = useState("ALL");
  const [process, setProcess] = useState("ALL");
  const [assignee, setAssignee] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");

  // Paginação da tabela detalhada de tarefas
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Modal de Agendamento de Relatórios
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      const matchPeriod =
        new Date(t.createdAt).getTime() >=
        Date.now() - Number(period) * 86400000;
      const matchLocation = location === "ALL" || t.locationId === location;
      const matchTeam = team === "ALL" || t.teamId === team;
      const matchProcess = process === "ALL" || t.processId === process;
      const matchAssignee = assignee === "ALL" || t.assigneeName === assignee;
      const matchStatus =
        statusFilter === "ALL" ||
        (statusFilter === "OPEN"
          ? ["AVAILABLE", "IN_PROGRESS"].includes(t.status)
          : statusFilter === "BLOCKED"
            ? ["BLOCKED", "PAUSED"].includes(t.status)
            : t.status === statusFilter);
      const matchPriority =
        priorityFilter === "ALL" || t.priority === priorityFilter;

      return (
        matchPeriod &&
        matchLocation &&
        matchTeam &&
        matchProcess &&
        matchAssignee &&
        matchStatus &&
        matchPriority
      );
    });
  }, [tasks, period, location, team, process, assignee, statusFilter, priorityFilter]);

  // Reset page when filters change
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedTasks = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const completed = filtered.filter((t) => t.status === "COMPLETED");
  const pending = filtered.filter(
    (t) => !["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(t.status),
  );
  const breached = filtered.filter((t) => t.slaExceeded);
  const impediments = filtered.filter((t) => t.status === "NOT_COMPLETED");
  const rework = filtered.filter((t) => t.status === "NEEDS_CORRECTION");
  const cancelled = filtered.filter((t) => t.status === "CANCELLED");

  const averageDelay = breached.length
    ? Math.round(
      breached.reduce((n, t) => n + t.delayMinutes, 0) / breached.length,
    )
    : 0;

  const durations = completed.filter(
    (t) => t.actualDuration !== null && t.estimatedDuration !== null,
  );
  const deviation = durations.length
    ? Math.round(
      durations.reduce(
        (n, t) => n + t.actualDuration! / 60 - t.estimatedDuration!,
        0,
      ) / durations.length,
    )
    : null;

  const activity = useMemo(() => {
    const days = Number(period);
    const step = days === 7 ? 1 : days === 30 ? 5 : 15;
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - days + 1);

    return Array.from({ length: Math.ceil(days / step) }, (_, i) => {
      const from = new Date(start.getTime() + i * step * 86400000);
      const to = new Date(from.getTime() + step * 86400000);
      return {
        label: from.toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          timeZone: "UTC",
        }),
        count: completed.filter(
          (t) =>
            t.completedAt &&
            new Date(t.completedAt) >= from &&
            new Date(t.completedAt) < to,
        ).length,
      };
    });
  }, [completed, period]);

  const max = Math.max(1, ...activity.map((a) => a.count));

  const people = useMemo(() => {
    return [...new Set(filtered.map((t) => t.assigneeName))]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => {
        const items = filtered.filter((t) => t.assigneeName === name);
        return {
          name,
          total: items.length,
          done: items.filter((t) => t.status === "COMPLETED").length,
          late: items.filter((t) => t.slaExceeded).length,
        };
      });
  }, [filtered]);

  const criticalities = [
    { id: "CRITICAL", label: "Crítica" },
    { id: "HIGH", label: "Alta" },
    { id: "MEDIUM", label: "Média" },
    { id: "LOW", label: "Baixa" },
  ];

  function exportCSV() {
    const headers = [
      "ID",
      "Título",
      "Origem",
      "Processo",
      "Unidade",
      "Equipe",
      "Responsável",
      "Status",
      "Prioridade",
      "Criticidade",
      "Criada em",
      "Prazo",
      "Concluída em",
      "Atraso (min)",
      "SLA Excedido",
    ];

    const lines = filtered.map((t) => [
      t.id,
      `"${t.title.replace(/"/g, '""')}"`,
      t.origin,
      `"${t.processName.replace(/"/g, '""')}"`,
      `"${t.locationName.replace(/"/g, '""')}"`,
      `"${t.teamName.replace(/"/g, '""')}"`,
      `"${t.assigneeName.replace(/"/g, '""')}"`,
      t.status,
      t.priority,
      t.criticality,
      t.createdAt,
      t.deadlineAt || "",
      t.completedAt || "",
      t.delayMinutes,
      t.slaExceeded ? "SIM" : "NÃO",
    ]);

    const summaryBlock = [
      ["# RELATÓRIO OPERACIONAL - INDICADORES CONSOLIDADOS"],
      [`# Empresa: ${orgName}`],
      [`# Período: Últimos ${period} dias`],
      [`# Total de Tarefas: ${filtered.length}`],
      [`# Concluídas: ${completed.length}`],
      [`# SLA Excedido: ${breached.length}`],
      [`# Média de Atraso: ${averageDelay} min`],
      [""],
    ];

    const csvContent = [
      ...summaryBlock.map((row) => row.join(";")),
      headers.join(";"),
      ...lines.map((row) => row.join(";")),
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `relatorio-operacional-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function exportPDF() {
    window.print();
  }

  async function handleScheduleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setScheduleLoading(true);
    const formData = new FormData(e.currentTarget);
    formData.set("filters", JSON.stringify({ period, location, team, process }));
    try {
      const res = await createScheduledReportAction(formData);
      if (res.error) {
        toast.add({
          title: "Erro ao agendar relatório",
          description: res.error,
          type: "error",
        });
      } else {
        toast.add({
          title: "Relatório agendado",
          description: "Relatório agendado com sucesso!",
          type: "success",
        });
        setShowScheduleModal(false);
      }
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Erro ao agendar envio.",
        type: "error",
      });
    } finally {
      setScheduleLoading(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Visão geral e Relatórios"
        subtitle={`Olá, ${userName.split(" ")[0]}. Acompanhe os indicadores, exporte relatórios e analise a operação.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportCSV}
              className="gap-1.5 h-9"
              title="Baixar planilha em formato CSV com indicadores consolidados"
            >
              <Download className="size-4" />
              <span>Exportar CSV</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={exportPDF}
              className="gap-1.5 h-9"
              title="Salvar como PDF ou imprimir esta visão"
            >
              <Printer className="size-4" />
              <span>Salvar PDF</span>
            </Button>

            {["OWNER", "ADMIN"].includes(role) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowScheduleModal(true);
                }}
                className="gap-1.5 h-9"
                title="Agendar envio periódico por e-mail"
              >
                <CalendarPlus className="size-4" />
                <span>Agendar envio</span>
              </Button>
            )}
          </div>
        }
      />

      {/* Barra de Filtros Unificada */}
      <Card>
        <CardContent className="p-4">
          <FieldGroup className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Field>
              <FieldLabel htmlFor="dashboard-period">Período</FieldLabel>
              <NativeSelect
                id="dashboard-period"
                className="w-full h-9 text-xs"
                value={period}
                onChange={(e) => {
                  setPeriod(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <NativeSelectOption value="7">Últimos 7 dias</NativeSelectOption>
                <NativeSelectOption value="30">Últimos 30 dias</NativeSelectOption>
                <NativeSelectOption value="90">Últimos 90 dias</NativeSelectOption>
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel htmlFor="dashboard-unit">Unidade</FieldLabel>
              <NativeSelect
                id="dashboard-unit"
                className="w-full h-9 text-xs"
                value={location}
                onChange={(e) => {
                  setLocation(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <NativeSelectOption value="ALL">Todas as unidades</NativeSelectOption>
                {options.locations.map((item) => (
                  <NativeSelectOption key={item.id} value={item.id}>
                    {item.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel htmlFor="dashboard-team">Equipe</FieldLabel>
              <NativeSelect
                id="dashboard-team"
                className="w-full h-9 text-xs"
                value={team}
                onChange={(e) => {
                  setTeam(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <NativeSelectOption value="ALL">Todas as equipes</NativeSelectOption>
                {options.teams.map((item) => (
                  <NativeSelectOption key={item.id} value={item.id}>
                    {item.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel htmlFor="dashboard-process">Processo</FieldLabel>
              <NativeSelect
                id="dashboard-process"
                className="w-full h-9 text-xs"
                value={process}
                onChange={(e) => {
                  setProcess(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <NativeSelectOption value="ALL">Todos os processos</NativeSelectOption>
                {options.processes.map((item) => (
                  <NativeSelectOption key={item.id} value={item.id}>
                    {item.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel htmlFor="dashboard-status">Status</FieldLabel>
              <NativeSelect
                id="dashboard-status"
                className="w-full h-9 text-xs"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <NativeSelectOption value="ALL">Todos os status</NativeSelectOption>
                <NativeSelectOption value="OPEN">Abertas</NativeSelectOption>
                <NativeSelectOption value="BLOCKED">Bloqueadas</NativeSelectOption>
                <NativeSelectOption value="COMPLETED">Concluídas</NativeSelectOption>
                <NativeSelectOption value="SUBMITTED">Em aprovação</NativeSelectOption>
                <NativeSelectOption value="NEEDS_CORRECTION">Em correção</NativeSelectOption>
                <NativeSelectOption value="NOT_COMPLETED">Não realizadas</NativeSelectOption>
                <NativeSelectOption value="CANCELLED">Canceladas</NativeSelectOption>
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel htmlFor="dashboard-priority">Prioridade</FieldLabel>
              <NativeSelect
                id="dashboard-priority"
                className="w-full h-9 text-xs"
                value={priorityFilter}
                onChange={(e) => {
                  setPriorityFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <NativeSelectOption value="ALL">Todas</NativeSelectOption>
                <NativeSelectOption value="CRITICAL">Urgente</NativeSelectOption>
                <NativeSelectOption value="HIGH">Alta</NativeSelectOption>
                <NativeSelectOption value="MEDIUM">Média</NativeSelectOption>
                <NativeSelectOption value="LOW">Baixa</NativeSelectOption>
              </NativeSelect>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      {/* Cards de Métricas Principais */}
      <div className="metric-grid">
        {[
          {
            title: "Concluídas",
            value: completed.length,
            note: `${filtered.length} tarefas no período`,
            featured: true,
          },
          {
            title: "Pendentes",
            value: pending.length,
            note: `${pending.filter((t) => t.isOverdue).length} com prazo vencido`,
          },
          {
            title: "SLA excedido",
            value: breached.length,
            note: "Entregas com atraso além do limite",
          },
          {
            title: "Média de atraso",
            value: `${averageDelay} min`,
            note: `${breached.length} tarefas com SLA violado`,
          },
        ].map((m) => (
          <Card
            className={`metric-card ${m.featured ? "metric-featured" : ""}`}
            key={m.title}
          >
            <CardContent className="p-0">
              <h2>{m.title}</h2>
              <strong className="metric-value">{m.value}</strong>
              <p className="metric-description">{m.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {!filtered.length && (
        <EmptyState
          title="Nenhuma atividade neste recorte"
          description="Altere os filtros acima para consultar outros resultados da sua operação."
        />
      )}

      {/* Gráficos e Detalhes Analíticos */}
      <div className="analytics-grid">
        <Card>
          <CardHeader>
            <CardTitle>Entregas ao longo do período</CardTitle>
            <CardDescription>
              Volume de conclusões das tarefas no recorte selecionado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="activity-chart"
              role="img"
              aria-label={activity
                .map((a) => `${a.label}: ${a.count} concluídas`)
                .join("; ")}
            >
              {activity.map((a, i) => (
                <div className="activity-column" key={a.label}>
                  <div className="activity-track">
                    <span
                      className={`activity-bar tone-${i % 3} ${!a.count ? "is-empty" : ""}`}
                      style={{
                        height: `${a.count ? Math.max(10, (a.count / max) * 100) : 2}%`,
                      }}
                    >
                      <span className="bar-count">{a.count}</span>
                    </span>
                  </div>
                  <span className="activity-label">{a.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ocorrências e duração</CardTitle>
            <CardDescription>
              Impedimentos e cancelamentos ficam fora da média de SLA.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="analytics-facts">
              {[
                [
                  "Não realizadas (Impedimentos)",
                  `${impediments.length} (${filtered.length ? Math.round((impediments.length / filtered.length) * 100) : 0}%)`,
                ],
                ["Canceladas", cancelled.length],
                ["Em correção", rework.length],
                [
                  "Aguardando aprovação",
                  filtered.filter((t) => t.pendingApproval).length,
                ],
                ["Bloqueadas", filtered.filter((t) => t.status === "BLOCKED" || t.isPaused).length],
                [
                  "Desvio médio de duração",
                  deviation === null
                    ? "Sem registros"
                    : `${deviation > 0 ? "+" : ""}${deviation} min`,
                ],
              ].map(([l, val]) => (
                <div key={l}>
                  <dt>{l}</dt>
                  <dd>{val}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pendências por criticidade</CardTitle>
            <CardDescription>Impacto operacional das tarefas ainda abertas.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="analytics-facts">
              {criticalities.map((level) => (
                <div key={level.id}>
                  <dt>{level.label}</dt>
                  <dd>
                    {pending.filter((t) => t.criticality === level.id).length}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Volume por responsável</CardTitle>
            <CardDescription>Distribuição de tarefas por pessoa na equipe.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Concluídas</TableHead>
                  <TableHead>Atrasadas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((p) => (
                  <TableRow key={p.name}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.total}</TableCell>
                    <TableCell className="text-emerald-700 font-semibold">
                      {p.done}
                    </TableCell>
                    <TableCell
                      className={p.late > 0 ? "text-red-600 font-bold" : ""}
                    >
                      {p.late}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de Detalhamento das Tarefas com Paginação */}
      <Card className="bg-[var(--surface)] rounded-2xl overflow-hidden shadow-none border border-[var(--border-subtle)]">
        <CardHeader className="px-6 py-5 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold text-[var(--text-primary)]">
              Detalhamento operacional das tarefas
            </CardTitle>
            <CardDescription className="text-xs text-[var(--text-secondary)] mt-0.5">
              Lista granular para auditoria e controle de prazos da operação.
            </CardDescription>
          </div>
          <div className="text-xs text-[var(--text-secondary)]">
            Total: <strong className="font-semibold text-[var(--text-primary)]">{filtered.length}</strong> tarefas
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="w-full text-left">
              <TableHeader className="bg-[var(--canvas)]/70 border-b border-[var(--border-subtle)] text-[var(--text-secondary)] text-xs font-semibold">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-5 py-3.5 font-semibold text-[var(--text-primary)]">
                    Tarefa
                  </TableHead>
                  <TableHead className="px-4 py-3.5 font-semibold text-[var(--text-primary)]">
                    Local e Equipe
                  </TableHead>
                  <TableHead className="px-4 py-3.5 font-semibold text-[var(--text-primary)]">
                    Responsável
                  </TableHead>
                  <TableHead className="px-4 py-3.5 font-semibold text-[var(--text-primary)]">
                    Prioridade
                  </TableHead>
                  <TableHead className="px-4 py-3.5 font-semibold text-[var(--text-primary)]">
                    Status
                  </TableHead>
                  <TableHead className="px-5 py-3.5 text-right font-semibold text-[var(--text-primary)]">
                    Prazo
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-[var(--border-subtle)]">
                {paginatedTasks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                      Nenhuma tarefa encontrada com os filtros selecionados.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedTasks.map((task) => (
                    <TableRow key={task.id} className="hover:bg-[var(--canvas)]/50 transition-colors">
                      <TableCell className="px-5 py-4">
                        <Link
                          href={`/management/tasks/${task.id}`}
                          className="font-medium text-sm text-[var(--text-primary)] hover:text-[var(--brand-900)] hover:underline block truncate max-w-xs transition-colors"
                        >
                          {task.title}
                        </Link>
                        {task.processName && (
                          <span className="text-xs text-[var(--text-secondary)] block truncate max-w-xs mt-0.5">
                            {task.processName}
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="px-4 py-4 whitespace-nowrap text-xs text-[var(--text-secondary)]">
                        <span>{task.locationName || "Sem unidade"}</span>
                        {task.teamName && (
                          <>
                            <span className="mx-1 text-muted-foreground">·</span>
                            <span className="text-[var(--text-primary)]">{task.teamName}</span>
                          </>
                        )}
                      </TableCell>

                      <TableCell className="px-4 py-4 whitespace-nowrap text-xs text-[var(--text-secondary)]">
                        {task.assigneeName || <span className="text-muted-foreground">-</span>}
                      </TableCell>

                      <TableCell className="px-4 py-4 whitespace-nowrap">
                        <PriorityBadge priority={task.priority} size="sm" />
                      </TableCell>

                      <TableCell className="px-4 py-4 whitespace-nowrap">
                        <StatusBadge status={task.status} size="sm" />
                      </TableCell>

                      <TableCell className="px-5 py-4 text-right whitespace-nowrap text-xs">
                        {task.deadlineAt ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className={task.slaExceeded ? "text-red-600 font-medium" : "text-[var(--text-secondary)]"}>
                              {new Date(task.deadlineAt).toLocaleString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {task.slaExceeded && (
                              <span className="inline-flex items-center text-[10px] text-red-600 bg-red-50 border border-red-200/60 px-1.5 py-0.5 rounded font-medium">
                                +{task.delayMinutes}m atraso
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Sem prazo</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Controles de Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border-subtle)] bg-[var(--canvas)]/30">
              <div className="text-xs text-[var(--text-secondary)]">
                Página <strong className="font-semibold text-[var(--text-primary)]">{safePage}</strong> de{" "}
                <strong className="font-semibold text-[var(--text-primary)]">{totalPages}</strong> (
                {filtered.length} tarefas)
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="gap-1 h-8 text-xs cursor-pointer border-[var(--border-subtle)] hover:bg-[var(--canvas)]"
                >
                  <ChevronLeft className="size-3.5" />
                  <span>Anterior</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="gap-1 h-8 text-xs cursor-pointer border-[var(--border-subtle)] hover:bg-[var(--canvas)]"
                >
                  <span>Próxima</span>
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Agendamento Automático de Relatórios */}
      {showScheduleModal && (
        <Modal
          open
          title="Agendar envio de relatório por e-mail"
          onClose={() => {
            if (!scheduleLoading) setShowScheduleModal(false);
          }}
        >
          <p className="text-xs text-muted-foreground mb-4">
            Configure para que os gestores recebam este relatório consolidado periodicamente em suas caixas de entrada.
          </p>

          <form onSubmit={handleScheduleSubmit} className="flex flex-col gap-3">
            <Field>
              <FieldLabel className="text-xs font-semibold text-brand-900">
                Nome do agendamento *
              </FieldLabel>
              <Input
                name="name"
                defaultValue={`Relatório Semanal - ${orgName}`}
                required
                className="h-10 text-xs"
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field>
                <FieldLabel className="text-xs font-semibold text-brand-900">
                  Frequência *
                </FieldLabel>
                <NativeSelect name="frequency" className="h-10 text-xs w-full">
                  <NativeSelectOption value="WEEKLY">Semanal (Toda segunda-feira)</NativeSelectOption>
                  <NativeSelectOption value="MONTHLY">Mensal (Todo dia 1º)</NativeSelectOption>
                  <NativeSelectOption value="DAILY">Diário (Todo dia às 07:00)</NativeSelectOption>
                </NativeSelect>
              </Field>

              <Field>
                <FieldLabel className="text-xs font-semibold text-brand-900">
                  Formato do anexo *
                </FieldLabel>
                <NativeSelect name="format" className="h-10 text-xs w-full">
                  <NativeSelectOption value="CSV">Planilha CSV</NativeSelectOption>
                  <NativeSelectOption value="PDF">Documento PDF</NativeSelectOption>
                </NativeSelect>
              </Field>
            </div>

            <Field>
              <FieldLabel className="text-xs font-semibold text-brand-900">
                Destinatários (e-mails) *
              </FieldLabel>
              <Input
                name="recipients"
                placeholder="gerente@empresa.com, diretoria@empresa.com"
                required
                className="h-10 text-xs"
              />
            </Field>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-(--border-subtle)">
              <Button
                type="button"
                variant="outline"
                disabled={scheduleLoading}
                onClick={() => setShowScheduleModal(false)}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={scheduleLoading}
                className="bg-brand-900 text-white text-xs hover:bg-brand-700"
              >
                {scheduleLoading ? (
                  <Spinner className="size-3.5" data-icon="inline-start" />
                ) : (
                  <CalendarPlus className="size-3.5" data-icon="inline-start" />
                )}
                <span>Salvar agendamento</span>
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
