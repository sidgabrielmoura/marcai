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
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { PageHeader, EmptyState, StatusBadge, PriorityBadge } from "../shared";
import { formatDateTimeInTimezone } from "@/domain/rules/date-time";
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
  timezone?: string;
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
  actualDuration: number | null;
}

interface Options {
  locations: { id: string; name: string }[];
  teams: { id: string; name: string }[];
  processes: { id: string; name: string }[];
}

function formatMinutesHuman(totalMinutes: number): string {
  if (!totalMinutes || totalMinutes <= 0) return "0 min";
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const mins = totalMinutes % 60;

  if (days > 0) {
    if (hours > 0) return `${days}d ${hours}h`;
    return `${days}d`;
  }
  if (mins > 0) return `${hours}h ${mins}m`;
  return `${hours}h`;
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

  const completed = filtered.filter((t) => t.status === "COMPLETED");
  const pending = filtered.filter(
    (t) => !["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(t.status),
  );
  const breached = filtered.filter((t) => t.slaExceeded);
  const impediments = filtered.filter((t) => t.status === "NOT_COMPLETED");
  const rework = filtered.filter((t) => t.status === "NEEDS_CORRECTION");
  const cancelled = filtered.filter((t) => t.status === "CANCELLED");

  const bottlenecks = useMemo(() => {
    return filtered.filter(
      (t) =>
        t.slaExceeded ||
        t.pendingApproval ||
        t.status === "NOT_COMPLETED" ||
        t.status === "NEEDS_CORRECTION",
    );
  }, [filtered]);

  const averageDelay = breached.length
    ? Math.round(
      breached.reduce((n, t) => n + t.delayMinutes, 0) / breached.length,
    )
    : 0;



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
      "Prazo Excedido",
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
      [`# Prazo Excedido: ${breached.length}`],
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
            title: "Prazo excedido",
            value: breached.length,
            note: "Entregas com atraso além do limite",
          },
          {
            title: "Média de atraso",
            value: formatMinutesHuman(averageDelay),
            note: `${breached.length} tarefas com prazo excedido${averageDelay >= 60 ? ` (${averageDelay} min totais)` : ""}`,
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

        <Card className="bg-[linear-gradient(125deg,#12472f,#248458)] text-white border-0 shadow-sm overflow-hidden">
          <CardHeader>
            <CardTitle className="text-white">Volume por responsável</CardTitle>
            <CardDescription className="text-emerald-100/80">
              Distribuição de tarefas por pessoa na equipe.
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-50! overflow-y-auto">
            <Table className="rounded-2xl!">
              <TableHeader>
                <TableRow className="bg-transparent border-transparent! hover:bg-white/5!">
                  <TableHead className="text-emerald-100! font-semibold bg-transparent! border-transparent!">Responsável</TableHead>
                  <TableHead className="text-emerald-100! font-semibold bg-transparent! border-transparent!">Total</TableHead>
                  <TableHead className="text-emerald-100! font-semibold bg-transparent! border-transparent!">Concluídas</TableHead>
                  <TableHead className="text-emerald-100! font-semibold bg-transparent! border-transparent!">Atrasadas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-white/10">
                {people.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-emerald-100/70">
                      Nenhum responsável com tarefas no período.
                    </TableCell>
                  </TableRow>
                ) : (
                  people.map((p) => (
                    <TableRow key={p.name} className="hover:bg-white/5! border-transparent! transition-colors">
                      <TableCell className="font-medium text-white">{p.name}</TableCell>
                      <TableCell className="text-white">{p.total}</TableCell>
                      <TableCell className="text-emerald-200 font-semibold">
                        {p.done}
                      </TableCell>
                      <TableCell
                        className={p.late > 0 ? "text-amber-300 font-bold" : "text-white/80"}
                      >
                        {p.late}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
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

        {/* Ocorrências (no lugar do card de volume, sem métricas de duração) */}
        <Card>
          <CardHeader>
            <CardTitle>Ocorrências</CardTitle>
            <CardDescription>
              Impedimentos, cancelamentos e retrabalhos registrados no período.
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
              ].map(([l, val]) => (
                <div key={l}>
                  <dt>{l}</dt>
                  <dd>{val}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Radar de Ações Imediatas & Gargalos Operacionais */}
      <Card className="bg-[var(--surface)] rounded-2xl overflow-hidden shadow-none border border-[var(--border-subtle)]">
        <CardHeader className="px-6 py-5 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4.5 text-amber-600 shrink-0" />
              <CardTitle className="text-base font-semibold text-[var(--text-primary)]">
                Radar de Ações Imediatas & Gargalos Operacionais
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-[var(--text-secondary)] mt-1">
              Foco executivo nas tarefas que exigem intervenção de liderança (atrasos, aprovações pendentes ou impedimentos).
            </CardDescription>
          </div>
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            render={<Link href="/management/tasks" />}
            className="gap-1.5 text-xs h-9 shrink-0"
          >
            <span>Ir para Painel de Tarefas</span>
            <ArrowRight className="size-3.5" />
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          {bottlenecks.length === 0 ? (
            <div className="p-8 text-center flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <div className="size-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600 mb-1">
                <CheckCircle2 className="size-5" />
              </div>
              <h3 className="font-semibold text-sm text-[var(--text-primary)]">Operação fluindo sem gargalos críticos</h3>
              <p className="text-xs max-w-md">
                Nenhuma tarefa com prazo excedido, impedimento operacional ou pendência de aprovação no recorte selecionado.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {bottlenecks.slice(0, 8).map((task) => (
                <div
                  key={task.id}
                  className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[var(--canvas)]/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/management/tasks/${task.id}`}
                        className="font-medium text-sm text-[var(--text-primary)] hover:text-[var(--brand-900)] hover:underline truncate transition-colors"
                      >
                        {task.title}
                      </Link>

                      {task.slaExceeded && (
                        <Badge variant="destructive" className="text-[10px] py-0 px-2">
                          Prazo Excedido (+{task.delayMinutes}m)
                        </Badge>
                      )}
                      {task.pendingApproval && (
                        <Badge variant="secondary" className="text-[10px] py-0 px-2 bg-purple-50 text-purple-700 border-purple-200">
                          Aguardando aprovação
                        </Badge>
                      )}
                      {task.status === "NOT_COMPLETED" && (
                        <Badge variant="destructive" className="text-[10px] py-0 px-2 bg-amber-50 text-amber-800 border-amber-200">
                          Impedimento operacional
                        </Badge>
                      )}
                      {task.status === "NEEDS_CORRECTION" && (
                        <Badge variant="destructive" className="text-[10px] py-0 px-2 bg-orange-50 text-orange-800 border-orange-200">
                          Necessita correção
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)] mt-1.5">
                      <span>{task.locationName || "Sem unidade"}</span>
                      {task.teamName && (
                        <>
                          <span>·</span>
                          <span className="text-[var(--text-primary)]">{task.teamName}</span>
                        </>
                      )}
                      {task.assigneeName && (
                        <>
                          <span>·</span>
                          <span>Responsável: <strong>{task.assigneeName}</strong></span>
                        </>
                      )}
                      {task.deadlineAt && (
                        <>
                          <span>·</span>
                          <span className={task.slaExceeded ? "text-red-600 font-semibold" : ""}>
                            Prazo: {formatDateTimeInTimezone(task.deadlineAt, task.timezone)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <Button
                      nativeButton={false}
                      size="sm"
                      variant="outline"
                      render={<Link href={`/management/tasks/${task.id}`} />}
                      className="h-8 text-xs gap-1"
                    >
                      <span>Abrir tarefa</span>
                      <ArrowRight className="size-3" />
                    </Button>
                  </div>
                </div>
              ))}
              {bottlenecks.length > 8 && (
                <div className="px-6 py-3 bg-[var(--canvas)]/30 text-xs text-[var(--text-secondary)] text-center">
                  Mais {bottlenecks.length - 8} tarefas exigindo atenção.{" "}
                  <Link href="/management/tasks" className="font-semibold text-[var(--brand-900)] underline">
                    Ver todas no painel de tarefas →
                  </Link>
                </div>
              )}
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
