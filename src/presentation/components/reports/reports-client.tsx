"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, Printer, ArrowUpRight, FileBarChart } from "lucide-react";
import {
  PageHeader,
  StatusBadge,
  PriorityBadge,
  EmptyState,
  SegmentedControl,
} from "../shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  SelectGroup,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";

interface ReportTaskItem {
  id: string;
  title: string;
  origin: string;
  status: string;
  priority: string;
  criticality: string;
  locationName: string;
  assigneeName: string;
  deadline: string;
  actualDurationMinutes: number | null;
  createdAt: string;
  slaExceeded: boolean;
  delayMinutes: number;
}

interface ReportsClientProps {
  indicators: {
    totalTasks: number;
    completedTasks: number;
    completionRate: number;
    slaExceededCount: number;
    averageDelayMinutes: number;
    impedimentCount: number;
    cancelledCount: number;
  };
  tasks: ReportTaskItem[];
  locations: Array<{ id: string; name: string }>;
  userRole: string;
  orgName: string;
}

export function ReportsClient({
  tasks,
  locations,
  orgName,
  userRole,
}: ReportsClientProps) {
  const [period, setPeriod] = useState<"7" | "30" | "90">("30");
  const [location, setLocation] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const start = Date.now() - Number(period) * 86400000;
  const filtered = tasks.filter(
    (task) =>
      new Date(task.createdAt).getTime() >= start &&
      (location === "ALL" || task.locationName === location) &&
      (statusFilter === "ALL" ||
        (statusFilter === "OPEN"
          ? ["AVAILABLE", "IN_PROGRESS"].includes(task.status)
          : task.status === statusFilter)) &&
      (priorityFilter === "ALL" || task.priority === priorityFilter),
  );
  const completed = filtered.filter(
    (task) => task.status === "COMPLETED",
  ).length;
  const delayed = filtered.filter((task) => task.slaExceeded);
  const averageDelay = delayed.length
    ? Math.round(
      delayed.reduce((sum, task) => sum + task.delayMinutes, 0) /
      delayed.length,
    )
    : 0;

  function exportCSV() {
    const cell = (value: string | number | null) => {
      const text = String(value ?? "");
      return `"${(/^[=+@\-\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`;
    };
    const rows = [
      ["# RELATORIO OPERACIONAL - " + orgName.toUpperCase(), ""],
      ["Periodo:", `Ultimos ${period} dias`],
      ["Unidade:", location === "ALL" ? "Todas as unidades" : location],
      ["Filtro Status:", statusFilter === "ALL" ? "Todos os status" : statusFilter],
      ["Filtro Prioridade:", priorityFilter === "ALL" ? "Todas as prioridades" : priorityFilter],
      ["Data de Geracao:", new Date().toLocaleString("pt-BR")],
      ["", ""],
      ["# INDICADORES CONSOLIDADOS", ""],
      ["Total de Tarefas:", filtered.length],
      ["Tarefas Concluidas:", completed],
      ["Taxa de Conclusao:", `${filtered.length ? Math.round((completed / filtered.length) * 100) : 0}%`],
      ["Tarefas com Atraso de SLA:", delayed.length],
      ["Tempo Medio de Atraso (min):", averageDelay],
      ["Impedimentos Operacionais:", filtered.filter(t => t.status === "NOT_COMPLETED").length],
      ["Tarefas Canceladas:", filtered.filter(t => t.status === "CANCELLED").length],
      ["", ""],
      ["# DETALHAMENTO DE TAREFAS", ""],
      [
        "Tarefa",
        "Origem",
        "Status",
        "Prioridade",
        "Unidade",
        "Responsavel",
        "Prazo",
        "Duracao (min)",
        "Atraso SLA (min)",
      ],
      ...filtered.map((task) => [
        task.title,
        task.origin,
        task.status,
        task.priority,
        task.locationName,
        task.assigneeName,
        task.deadline,
        task.actualDurationMinutes,
        task.delayMinutes,
      ]),
    ];
    const blob = new Blob(
      ["\uFEFF", rows.map((row) => row.map(cell).join(";")).join("\r\n")],
      { type: "text/csv;charset=utf-8;" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `marcai_relatorio_${period}dias.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="page-stack reports-page">
      <PageHeader
        title="Relatórios"
        subtitle={`${orgName} · Resultados da operação no período selecionado.`}
        actions={
          ["OWNER", "ADMIN"].includes(userRole) ? <div className="print:hidden flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => window.print()}
            >
              <Printer className="size-4" data-icon="inline-start" />
              <span>Salvar PDF / imprimir</span>
            </Button>
            <Button
              type="button"
              onClick={exportCSV}
              disabled={!filtered.length}
              className="bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)] shadow-none"
            >
              <Download className="size-4" data-icon="inline-start" />
              <span>Exportar CSV</span>
            </Button>
          </div> : undefined
        }
      />

      <div className="report-filters flex flex-col sm:flex-row sm:items-end gap-4 p-4 rounded-[18px] bg-[var(--surface)] border border-[var(--border-subtle)]">
        <div>
          <span className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)] block mb-1.5">
            Período de criação
          </span>
          <SegmentedControl
            value={period}
            onChange={setPeriod}
            options={[
              { id: "7", label: "7 dias" },
              { id: "30", label: "30 dias" },
              { id: "90", label: "90 dias" },
            ]}
          />
        </div>
        <Field className="w-full sm:w-64">
          <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
            Unidade
          </FieldLabel>
          <Select
            items={[
              { value: "ALL", label: "Todas as unidades" },
              ...locations.map((item) => ({
                value: item.name,
                label: item.name,
              })),
            ]}
            value={location}
            onValueChange={(val) => setLocation((val as string) ?? "ALL")}
          >
            <SelectTrigger
              aria-label="Unidade"
              className="bg-canvas border-(--border-subtle) text-(length:--type-label) h-10 w-full"
            >
              <SelectValue placeholder="Todas as unidades" />
            </SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value="ALL">Todas as unidades</SelectItem>
              {locations.map((item) => (
                <SelectItem key={item.id} value={item.name}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectGroup></SelectContent>
          </Select>
        </Field>

        <Field className="w-full sm:w-48">
          <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
            Status
          </FieldLabel>
          <Select
            items={[
              { value: "ALL", label: "Todos os status" },
              { value: "OPEN", label: "Abertas" },
              { value: "BLOCKED", label: "Bloqueadas" },
              { value: "COMPLETED", label: "Concluídas" },
              { value: "NOT_COMPLETED", label: "Impedimentos" },
              { value: "CANCELLED", label: "Canceladas" },
            ]}
            value={statusFilter}
            onValueChange={(val) => setStatusFilter((val as string) ?? "ALL")}
          >
            <SelectTrigger
              aria-label="Status"
              className="bg-[var(--canvas)] border-[var(--border-subtle)] text-[length:var(--type-label)] h-10 w-full"
            >
              <SelectValue placeholder="Todos os status" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="ALL">Todos os status</SelectItem>
                <SelectItem value="OPEN">Abertas</SelectItem>
                <SelectItem value="BLOCKED">Bloqueadas</SelectItem>
                <SelectItem value="COMPLETED">Concluídas</SelectItem>
                <SelectItem value="NOT_COMPLETED">Impedimentos</SelectItem>
                <SelectItem value="CANCELLED">Canceladas</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field className="w-full sm:w-48">
          <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
            Prioridade
          </FieldLabel>
          <Select
            items={[
              { value: "ALL", label: "Todas as prioridades" },
              { value: "CRITICAL", label: "Crítica" },
              { value: "HIGH", label: "Alta" },
              { value: "MEDIUM", label: "Média" },
              { value: "LOW", label: "Baixa" },
            ]}
            value={priorityFilter}
            onValueChange={(val) => setPriorityFilter((val as string) ?? "ALL")}
          >
            <SelectTrigger
              aria-label="Prioridade"
              className="bg-[var(--canvas)] border-[var(--border-subtle)] text-[length:var(--type-label)] h-10 w-full"
            >
              <SelectValue placeholder="Todas as prioridades" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="ALL">Todas as prioridades</SelectItem>
                <SelectItem value="CRITICAL">Crítica</SelectItem>
                <SelectItem value="HIGH">Alta</SelectItem>
                <SelectItem value="MEDIUM">Média</SelectItem>
                <SelectItem value="LOW">Baixa</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="metric-grid">
        {[
          {
            label: "Tarefas no período",
            value: filtered.length,
            note: "Nos filtros selecionados",
          },
          {
            label: "Concluídas",
            value: completed,
            note: `${filtered.length ? Math.round((completed / filtered.length) * 100) : 0}% das tarefas`,
          },
          {
            label: "SLA excedido",
            value: delayed.length,
            note: "Tarefas com prazo excedido",
          },
          {
            label: "Atraso médio",
            value: `${averageDelay} min`,
            note: "Nas tarefas com SLA excedido",
          },
        ].map((item, index) => (
          <Card
            key={item.label}
            className={`metric-card ${index === 0 ? "metric-featured" : ""}`}
          >
            <CardContent className="p-0">
              <div className="metric-heading">
                <h2>{item.label}</h2>
                <ArrowUpRight size={16} />
              </div>
              <strong className="metric-value">{item.value}</strong>
              <p className="metric-description">{item.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="panel">
        <CardContent className="p-0 flex flex-col gap-4">
          <div className="panel-heading">
            <h2>Detalhamento das tarefas</h2>
            <span className="muted-copy">{filtered.length} registros</span>
          </div>

          {!filtered.length ? (
            <EmptyState
              title="Nenhum resultado encontrado"
              description="Escolha outra unidade ou período para consultar as tarefas."
              icon={FileBarChart}
            />
          ) : (
            <>
              <div className="desktop-report-table">
                <Table className="data-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tarefa</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Prioridade</TableHead>
                      <TableHead>Unidade</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead>Prazo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell>
                          <Link
                            className="font-medium hover:underline text-[var(--brand-900)]"
                            href={`/management/tasks/${task.id}`}
                          >
                            {task.title}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={task.status} size="sm" />
                        </TableCell>
                        <TableCell>
                          <PriorityBadge priority={task.priority} size="sm" />
                        </TableCell>
                        <TableCell>{task.locationName}</TableCell>
                        <TableCell>{task.assigneeName}</TableCell>
                        <TableCell>{task.deadline}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mobile-report-list flex flex-col gap-2">
                {filtered.map((task) => (
                  <Link
                    href={`/management/tasks/${task.id}`}
                    className="report-task block no-underline"
                    key={task.id}
                  >
                    <Card className="p-3 hover:bg-[var(--canvas)] transition-colors">
                      <strong className="text-[length:var(--type-body)] font-semibold text-[var(--brand-900)] block mb-1">
                        {task.title}
                      </strong>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <StatusBadge status={task.status} size="sm" />
                        <PriorityBadge priority={task.priority} size="sm" />
                      </div>
                      <p className="text-[length:var(--type-label)] text-[var(--text-secondary)]">
                        {task.locationName} · {task.assigneeName}
                      </p>
                      <span className="text-[length:var(--type-caption)] text-[var(--text-secondary)]">
                        {task.deadline}
                      </span>
                    </Card>
                  </Link>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <p className="muted-copy text-[length:var(--type-label)] text-[var(--text-secondary)]">
        Os filtros se aplicam aos indicadores, à lista e ao arquivo exportado.
        Use “Imprimir” para salvar uma cópia em PDF.
      </p>
    </div>
  );
}
