"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  CalendarClock,
  Pencil,
  Play,
  Pause,
  PlayCircle,
  Clock,
  MoreHorizontal,
  CheckCircle2,
  Layers,
  ArrowRight,
} from "lucide-react";
import {
  createRoutineAction,
  triggerExecutionGenerationAction,
  toggleRoutineAction,
} from "@/presentation/actions/process-actions";
import { PageHeader, EmptyState, Modal, StatusBadge } from "../shared";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Field, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ScheduleFields } from "./schedule-fields";
import {
  defaultSchedule,
  describeSchedule,
  type ScheduleDefinition,
} from "@/domain/rules/process-definition";
import { readSchedule } from "@/domain/rules/schedule";

interface RoutineItem {
  id: string;
  processId: string;
  processName: string;
  recurrenceRule: string;
  timezone: string;
  generationLeadTime: number;
  startsAt: Date | string;
  endsAt: Date | string | null;
  pendingPreviousPolicy: string;
  status: string;
  executionsCount: number;
  nextAt?: string | null;
  processStatus?: string;
}

function label(r: RoutineItem) {
  const s = readSchedule(r.recurrenceRule);
  if (s) return describeSchedule(s);
  const hour = r.recurrenceRule.match(/BYHOUR=(\d+)/)?.[1] ?? "7";
  return `${r.recurrenceRule.includes("WEEKLY") ? "Semanalmente" : r.recurrenceRule.includes("MONTHLY") ? "Mensalmente" : "Diariamente"} às ${hour.padStart(2, "0")}:00`;
}

const POLICY_LABELS: Record<string, string> = {
  CREATE_NEW: "Geração independente",
  SKIP_IF_PENDING: "Pula se houver pendência",
  WAIT_PREVIOUS: "Aguarda conclusão anterior",
};

export function RoutinesClient({
  routines,
  processes,
}: {
  routines: RoutineItem[];
  processes: Array<{ id: string; name: string }>;
  userRole: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const [filter, setFilter] = useState(params.get("process") || "ALL");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState("");
  const [processId, setProcessId] = useState("");
  const [schedule, setSchedule] = useState<ScheduleDefinition>(defaultSchedule);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const filtered = routines.filter((r) => filter === "ALL" || r.processId === filter);

  const activeRoutinesCount = routines.filter((r) => r.status === "ACTIVE").length;
  const coveredProcessesCount = new Set(
    routines.filter((r) => r.status === "ACTIVE").map((r) => r.processId),
  ).size;
  const totalExecutionsCount = routines.reduce((acc, r) => acc + r.executionsCount, 0);

  function edit(r?: RoutineItem) {
    setError("");
    setEditId(r?.id || "");
    setProcessId(r?.processId || (filter !== "ALL" ? filter : processes[0]?.id || ""));
    setSchedule(
      r
        ? readSchedule(r.recurrenceRule) ?? {
          ...defaultSchedule(),
          startsAt: new Date(r.startsAt).toISOString().slice(0, 10),
          endsAt: r.endsAt ? new Date(r.endsAt).toISOString().slice(0, 10) : "",
          timezone: r.timezone,
          generationLeadTime: r.generationLeadTime,
          pendingPreviousPolicy: r.pendingPreviousPolicy as ScheduleDefinition["pendingPreviousPolicy"],
          times: [
            `${(r.recurrenceRule.match(/BYHOUR=(\d+)/)?.[1] || "7").padStart(2, "0")}:00`,
          ],
        }
        : defaultSchedule(),
    );
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    setError("");
    try {
      const form = new FormData();
      form.set("processId", processId);
      form.set("routineId", editId);
      form.set("schedule", JSON.stringify(schedule));
      const r = await createRoutineAction(form);
      if (r.error) {
        setError(r.error);
      } else {
        setOpen(false);
        setNotice("Programação da rotina salva com sucesso.");
        router.refresh();
      }
    } catch {
      setError("Não foi possível salvar a rotina. Tente novamente.");
    } finally {
      setBusy("");
    }
  }

  async function run(r: RoutineItem, toggle = false) {
    setBusy(r.id);
    setError("");
    setNotice("");
    try {
      const result = toggle
        ? await toggleRoutineAction(r.id)
        : await triggerExecutionGenerationAction(r.id);
      if (result.error) {
        setError(result.error);
      } else {
        setNotice(
          toggle
            ? "Status da rotina atualizado."
            : "Próxima execução gerada com sucesso! Acompanhe as tarefas em Execuções.",
        );
        router.refresh();
      }
    } catch {
      setError("Não foi possível concluir a operação. Tente novamente.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Rotinas"
        subtitle="Programe a frequência e os horários em que cada processo da sua equipe deve ser executado."
        actions={
          <Button
            disabled={!processes.length}
            onClick={() => edit()}
            className="bg-[var(--brand-900)] hover:bg-[var(--brand-700)] text-white shadow-none gap-1.5"
          >
            <Plus data-icon="inline-start" className="size-4" />
            Programar rotina
          </Button>
        }
      />

      {error && !open && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {notice && (
        <Alert className="bg-[var(--brand-soft)] border-[var(--sage-400)]/40 text-[var(--brand-900)]">
          <AlertDescription className="flex items-center justify-between gap-4 flex-wrap">
            <span>{notice}</span>
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href="/management/executions" />}
              className="text-xs h-7 gap-1 border-[var(--brand-700)]/30 text-[var(--brand-900)]"
            >
              Ver execuções
              <ArrowRight className="size-3" />
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* KPI Stats Bar - Minimalist and Clean */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex items-center gap-3 p-3.5 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl">
          <div className="size-10 rounded-lg bg-[var(--brand-soft)] text-[var(--brand-900)] flex items-center justify-center shrink-0">
            <CalendarClock className="size-5" />
          </div>
          <div className="min-w-0">
            <span className="text-xl font-bold text-[var(--text-primary)] tabular-nums block leading-tight">
              {activeRoutinesCount}
            </span>
            <span className="text-xs text-[var(--text-secondary)]">rotinas ativas</span>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3.5 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl">
          <div className="size-10 rounded-lg bg-emerald-50 text-emerald-800 flex items-center justify-center shrink-0">
            <Layers className="size-5" />
          </div>
          <div className="min-w-0">
            <span className="text-xl font-bold text-[var(--text-primary)] tabular-nums block leading-tight">
              {coveredProcessesCount}
            </span>
            <span className="text-xs text-[var(--text-secondary)]">processos com rotina</span>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3.5 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl">
          <div className="size-10 rounded-lg bg-neutral-100 text-neutral-800 flex items-center justify-center shrink-0">
            <PlayCircle className="size-5" />
          </div>
          <div className="min-w-0">
            <span className="text-xl font-bold text-[var(--text-primary)] tabular-nums block leading-tight">
              {totalExecutionsCount}
            </span>
            <span className="text-xs text-[var(--text-secondary)]">execuções geradas</span>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 max-w-sm w-full">
          <NativeSelect
            id="routine-process-filter"
            aria-label="Filtrar por processo"
            className="w-full text-xs"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <NativeSelectOption value="ALL">Todos os processos</NativeSelectOption>
            {Array.from(
              new Map(
                [
                  ...processes,
                  ...routines.map((r) => ({ id: r.processId, name: r.processName })),
                ].map((p) => [p.id, p]),
              ).values(),
            ).map((p) => (
              <NativeSelectOption key={p.id} value={p.id}>
                {p.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>

        <span className="text-xs text-[var(--text-secondary)] whitespace-nowrap self-end sm:self-center">
          {filtered.length} {filtered.length === 1 ? "rotina encontrada" : "rotinas encontradas"}
        </span>
      </div>

      {!filtered.length ? (
        <EmptyState
          title="Nenhuma rotina encontrada"
          description={
            processes.length
              ? "Escolha um processo e programe a frequência para começar a gerar execuções automáticas."
              : "Crie e ative um processo antes de programar a rotina."
          }
          icon={CalendarClock}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((r) => {
            const isProcessActive = r.processStatus === "ACTIVE";

            return (
              <Card
                key={r.id}
                className="bg-surface border border-(--border-subtle) rounded-2xl p-5! hover:border-(--brand-700)/30 transition-all flex flex-col justify-between gap-4 shadow-none"
              >
                <CardHeader className="p-0 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={r.status} showIcon />
                      {!isProcessActive && (
                        <Badge
                          variant="outline"
                          className="text-xs font-normal"
                        >
                          Processo inativo ou pausado
                        </Badge>
                      )}
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="size-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--canvas)]"
                            aria-label={`Mais opções para a rotina de ${r.processName}`}
                          />
                        }
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          render={
                            <Link href={`/management/executions?process=${r.processId}`} />
                          }
                        >
                          <PlayCircle className="size-4 mr-2" />
                          <span>Ver histórico</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => edit(r)} disabled={!isProcessActive}>
                          <Pencil className="size-4 mr-2" />
                          <span>Editar rotina</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={!!busy}
                          onClick={() => run(r, true)}
                        >
                          {r.status === "ACTIVE" ? (
                            <>
                              <Pause className="size-4 mr-2 text-amber-600" />
                              <span>Pausar rotina</span>
                            </>
                          ) : (
                            <>
                              <Play className="size-4 mr-2 text-emerald-600" />
                              <span>Reativar rotina</span>
                            </>
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div>
                    <CardTitle className="text-base font-bold text-[var(--text-primary)]">
                      {r.processName}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-1.5 text-xs font-semibold text-[var(--brand-900)] mt-1">
                      <CalendarClock className="size-3.5 text-[var(--brand-700)]" />
                      {label(r)}
                    </CardDescription>
                  </div>
                </CardHeader>

                <CardContent className="p-0 flex flex-col gap-3">
                  {/* Next Occurrence & Policy Container */}
                  <div className="bg-[var(--canvas)] rounded-xl p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Clock className="size-4 text-[var(--brand-700)] shrink-0" />
                        <div>
                          <span className="text-[11px] text-[var(--text-secondary)] block">
                            Próxima ocorrência
                          </span>
                          <strong className="text-xs font-semibold text-[var(--text-primary)]">
                            {r.nextAt
                              ? new Date(r.nextAt).toLocaleString("pt-BR", {
                                timeZone: r.timezone,
                                dateStyle: "short",
                                timeStyle: "short",
                              })
                              : "Sem ocorrência na validade"}
                          </strong>
                        </div>
                      </div>

                      <Badge
                        variant="outline"
                        className="text-[11px] font-normal text-[var(--text-secondary)] bg-[var(--surface)] border-[var(--border-subtle)]"
                      >
                        {POLICY_LABELS[r.pendingPreviousPolicy] ?? r.pendingPreviousPolicy}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] px-1">
                    <span>Fuso: {r.timezone.replace("America/", "").replaceAll("_", " ")}</span>
                    <span>{r.executionsCount} execuções criadas</span>
                  </div>
                </CardContent>

                <CardFooter className="p-0 pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!isProcessActive}
                      onClick={() => edit(r)}
                      className="text-xs h-8 gap-1.5 border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--canvas)]"
                    >
                      <Pencil className="size-3.5 text-[var(--brand-700)]" />
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!!busy}
                      onClick={() => run(r, true)}
                      className="text-xs h-8 gap-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      {r.status === "ACTIVE" ? (
                        <Pause className="size-3.5" />
                      ) : (
                        <Play className="size-3.5" />
                      )}
                      {r.status === "ACTIVE" ? "Pausar" : "Reativar"}
                    </Button>
                  </div>

                  <Button
                    size="sm"
                    disabled={!!busy || r.status !== "ACTIVE" || !isProcessActive}
                    onClick={() => run(r)}
                    className="text-xs h-8 gap-1.5 bg-[var(--brand-900)] hover:bg-[var(--brand-700)] text-white shadow-none"
                  >
                    {busy === r.id ? (
                      <Spinner className="size-3.5" />
                    ) : (
                      <PlayCircle className="size-3.5" />
                    )}
                    Gerar execução agora
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {open && (
        <Modal
          open
          title={editId ? "Editar rotina" : "Programar rotina"}
          onClose={() => {
            if (!busy) setOpen(false);
          }}
          className="max-w-3xl! w-full!"
        >
          <form onSubmit={save} className="flex flex-col gap-5">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Field>
              <FieldLabel htmlFor="routine-process">Processo</FieldLabel>
              <NativeSelect
                id="routine-process"
                className="w-full"
                required
                disabled={!!editId}
                value={processId}
                onChange={(e) => setProcessId(e.target.value)}
              >
                <NativeSelectOption value="">Selecione um processo</NativeSelectOption>
                {processes.map((p) => (
                  <NativeSelectOption key={p.id} value={p.id}>
                    {p.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>

            <ScheduleFields value={schedule} onChange={setSchedule} />

            <div className="flex justify-end gap-2 h-10 pt-2 border-t border-[var(--border-subtle)]">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!!busy}
                onClick={() => setOpen(false)}
                className={"py-5"}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!!busy}
                className="bg-brand-900 hover:bg-brand-700 text-white gap-1.5 py-5"
              >
                {busy && <Spinner className="size-3.5" />}
                Salvar rotina
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
