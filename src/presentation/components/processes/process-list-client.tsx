"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  CalendarClock,
  PlayCircle,
  MapPin,
  Archive,
  Pause,
  Play,
  Search,
  MoreHorizontal,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ListChecks,
} from "lucide-react";
import { PageHeader, EmptyState, StatusBadge, Modal } from "../shared";
import { toggleProcessStatusAction } from "@/presentation/actions/process-actions";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { InputGroup, InputGroupInput, InputGroupAddon } from "@/components/ui/input-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface ProcessItem {
  id: string;
  name: string;
  description: string | null;
  status: string;
  criticality: string;
  locationName: string | null;
  routinesCount: number;
  tasksCount: number;
  executionsCount: number;
  validFrom: Date | string | null;
  validUntil: Date | string | null;
}

const CRITICALITY_LABELS: Record<string, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

export function ProcessListClient({
  processes,
  userRole,
}: {
  processes: ProcessItem[];
  userRole: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ message: string; showArchivedLink?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<{
    process: ProcessItem;
    status: "ACTIVE" | "PAUSED" | "ARCHIVED";
  } | null>(null);

  const activeCount = processes.filter((p) => p.status === "ACTIVE").length;
  const totalRoutines = processes.reduce((n, p) => n + p.routinesCount, 0);
  const needsConfigCount = processes.filter((p) => !p.tasksCount || !p.routinesCount).length;

  const filtered = processes.filter((p) => {
    const text = `${p.name} ${p.locationName ?? ""}`.toLocaleLowerCase("pt-BR");
    const matchesQuery = text.includes(query.toLocaleLowerCase("pt-BR"));
    const matchesStatus = statusFilter === "ALL" || p.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  const label =
    target?.status === "ARCHIVED"
      ? "Arquivar"
      : target?.status === "PAUSED"
        ? "Pausar"
        : "Reativar";

  async function handleConfirmStatus() {
    if (!target) return;
    setBusy(true);
    setError("");

    try {
      const res = await toggleProcessStatusAction(target.process.id, target.status);
      if (res.error) {
        setError(res.error);
      } else {
        const processName = target.process.name;
        const actionType = target.status;
        setTarget(null);

        if (actionType === "ARCHIVED") {
          setNotice({
            message: `O processo "${processName}" foi arquivado e movido para a nova aba de Arquivados.`,
            showArchivedLink: true,
          });
        } else if (actionType === "PAUSED") {
          setNotice({
            message: `O processo "${processName}" foi pausado. Novas execuções não serão geradas.`,
          });
        } else {
          setNotice({
            message: `O processo "${processName}" foi reativado com sucesso.`,
          });
        }

        router.refresh();
      }
    } catch {
      setError("Não foi possível salvar a alteração. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Processos"
        subtitle="Gerencie e organize os procedimentos da sua equipe. Defina tarefas, vincule rotinas e acompanhe execuções."
        actions={
          <Button
            nativeButton={false}
            render={<Link href="/management/processes/new" />}
            className="bg-[var(--brand-900)] hover:bg-[var(--brand-700)] text-white shadow-none gap-1.5"
          >
            <Plus data-icon="inline-start" className="size-4" />
            Criar processo
          </Button>
        }
      />

      {notice && (
        <Alert className="bg-[var(--brand-soft)] border-[var(--sage-400)]/40 text-[var(--brand-900)]">
          <AlertDescription className="flex items-center justify-between gap-4 flex-wrap">
            <span>{notice.message}</span>
            {notice.showArchivedLink && (
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<Link href="/management/processes/archived" />}
                className="text-xs h-7 gap-1 border-[var(--brand-700)]/30 text-[var(--brand-900)]"
              >
                Ver aba de arquivados
                <ArrowRight className="size-3" />
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* KPI Stats Bar - Minimalist and Clean */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex items-center gap-3 p-3.5 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl">
          <div className="size-10 rounded-lg bg-[var(--brand-soft)] text-[var(--brand-900)] flex items-center justify-center shrink-0">
            <CheckCircle2 className="size-5" />
          </div>
          <div className="min-w-0">
            <span className="text-xl font-bold text-[var(--text-primary)] tabular-nums block leading-tight">
              {activeCount}
            </span>
            <span className="text-xs text-[var(--text-secondary)]">processos ativos</span>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3.5 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl">
          <div className="size-10 rounded-lg bg-emerald-50 text-emerald-800 flex items-center justify-center shrink-0">
            <CalendarClock className="size-5" />
          </div>
          <div className="min-w-0">
            <span className="text-xl font-bold text-[var(--text-primary)] tabular-nums block leading-tight">
              {totalRoutines}
            </span>
            <span className="text-xs text-[var(--text-secondary)]">rotinas configuradas</span>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3.5 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl">
          <div className="size-10 rounded-lg bg-amber-50 text-amber-800 flex items-center justify-center shrink-0">
            <AlertCircle className="size-5" />
          </div>
          <div className="min-w-0">
            <span className="text-xl font-bold text-[var(--text-primary)] tabular-nums block leading-tight">
              {needsConfigCount}
            </span>
            <span className="text-xs text-[var(--text-secondary)]">precisam de configuração</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 max-w-2xl">
          <InputGroup className="flex-1 py-5.5!">
            <InputGroupAddon>
              <Search className="size-4 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              aria-label="Buscar processo"
              placeholder="Buscar por nome ou unidade"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="text-sm!"
            />
          </InputGroup>

          <NativeSelect
            aria-label="Filtrar processos por status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="sm:w-44 text-xs"
          >
            <NativeSelectOption value="ALL">Todos os status</NativeSelectOption>
            <NativeSelectOption value="ACTIVE">Apenas ativos</NativeSelectOption>
            <NativeSelectOption value="PAUSED">Apenas pausados</NativeSelectOption>
          </NativeSelect>
        </div>

        <span className="text-xs text-[var(--text-secondary)] whitespace-nowrap self-end sm:self-center">
          {filtered.length} {filtered.length === 1 ? "processo" : "processos"}
        </span>
      </div>

      {!filtered.length ? (
        <EmptyState
          title={processes.length ? "Nenhum processo neste filtro" : "Comece pelo primeiro processo"}
          description={
            processes.length
              ? "Experimente buscar outro nome ou altere o status selecionado."
              : "Descreva um procedimento recorrente, como a abertura de unidade ou checagem diária, e organize suas tarefas."
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((p) => {
            const isPaused = p.status === "PAUSED";
            const needsConfig = !p.tasksCount || !p.routinesCount;

            return (
              <Card
                key={p.id}
                className="bg-surface border border-(--border-subtle) rounded-2xl p-5! hover:border-(--brand-700)/30 transition-all flex flex-col justify-between gap-4 shadow-none"
              >
                <CardHeader className="p-0 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={p.status} showIcon />
                      <Badge
                        variant="outline"
                        className="text-xs font-normal text-[var(--text-secondary)] bg-[var(--canvas)] border-[var(--border-subtle)]"
                      >
                        Criticidade {CRITICALITY_LABELS[p.criticality] ?? p.criticality}
                      </Badge>
                      {p.locationName && (
                        <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                          <MapPin className="size-3 text-muted-foreground" />
                          {p.locationName}
                        </span>
                      )}
                    </div>

                    {/* Context Menu for Secondary Actions */}
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="size-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--canvas)]"
                            aria-label={`Mais opções para ${p.name}`}
                          />
                        }
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          render={<Link href={`/management/processes/${p.id}/edit`} />}
                        >
                          <Pencil className="size-4 mr-2" />
                          <span>Editar processo</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          render={<Link href={`/management/routines?process=${p.id}`} />}
                        >
                          <CalendarClock className="size-4 mr-2" />
                          <span>Ver rotinas</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          render={<Link href={`/management/executions?process=${p.id}`} />}
                        >
                          <PlayCircle className="size-4 mr-2" />
                          <span>Ver execuções</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() =>
                            setTarget({
                              process: p,
                              status: isPaused ? "ACTIVE" : "PAUSED",
                            })
                          }
                        >
                          {isPaused ? (
                            <>
                              <Play className="size-4 mr-2" />
                              <span>Reativar processo</span>
                            </>
                          ) : (
                            <>
                              <Pause className="size-4 mr-2" />
                              <span>Pausar processo</span>
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setTarget({ process: p, status: "ARCHIVED" })}
                        >
                          <Archive className="size-4 mr-2" />
                          <span>Arquivar processo</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div>
                    <CardTitle className="text-base font-bold text-[var(--text-primary)]">
                      {p.name}
                    </CardTitle>
                    {p.description && (
                      <CardDescription className="text-xs text-[var(--text-secondary)] line-clamp-2 mt-1">
                        {p.description}
                      </CardDescription>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="p-0 flex flex-col gap-3">
                  {/* Micro-metrics */}
                  <div className="flex items-center gap-4 py-2 px-3 bg-[var(--canvas)] rounded-xl text-xs text-[var(--text-secondary)]">
                    <span className="flex items-center gap-1">
                      <ListChecks className="size-3.5 text-[var(--brand-700)]" />
                      <strong>{p.tasksCount}</strong> tarefas
                    </span>
                    <span className="flex items-center gap-1">
                      <CalendarClock className="size-3.5 text-[var(--brand-700)]" />
                      <strong>{p.routinesCount}</strong> rotinas
                    </span>
                    <span className="flex items-center gap-1">
                      <PlayCircle className="size-3.5 text-[var(--brand-700)]" />
                      <strong>{p.executionsCount}</strong> execuções
                    </span>
                  </div>

                  {needsConfig && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50/70 border border-amber-200/50 rounded-lg text-xs text-amber-900">
                      <AlertCircle className="size-3.5 shrink-0 text-amber-600" />
                      <span>
                        {!p.tasksCount
                          ? "Pendente: cadastre as tarefas deste processo."
                          : "Pendente: programe a rotina para gerar execuções."}
                      </span>
                    </div>
                  )}

                  {(p.validFrom || p.validUntil) && (
                    <p className="text-[11px] text-muted-foreground">
                      Validade:{" "}
                      {p.validFrom
                        ? new Date(p.validFrom).toLocaleDateString("pt-BR", { timeZone: "UTC" })
                        : "sem início"}{" "}
                      até{" "}
                      {p.validUntil
                        ? new Date(p.validUntil).toLocaleDateString("pt-BR", { timeZone: "UTC" })
                        : "indeterminada"}
                    </p>
                  )}
                </CardContent>

                <CardFooter className="p-0 pt-2 bg-transparent! flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      render={<Link href={`/management/routines?process=${p.id}`} />}
                      className="text-xs h-8 gap-1.5 border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--canvas)]"
                    >
                      <CalendarClock className="size-3.5 text-[var(--brand-700)]" />
                      Rotinas ({p.routinesCount})
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      nativeButton={false}
                      render={<Link href={`/management/executions?process=${p.id}`} />}
                      className="text-xs h-8 gap-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      <PlayCircle className="size-3.5" />
                      Execuções ({p.executionsCount})
                    </Button>
                  </div>

                  <Button
                    size="sm"
                    variant="default"
                    nativeButton={false}
                    render={<Link href={`/management/processes/${p.id}/edit`} />}
                    className="text-xs h-8 gap-1.5 bg-[var(--brand-900)] hover:bg-[var(--brand-700)] text-white shadow-none"
                  >
                    <Pencil className="size-3.5" />
                    Editar
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal */}
      {target && (
        <Modal
          open
          title={`${label} processo`}
          onClose={() => {
            if (!busy) {
              setTarget(null);
              setError("");
            }
          }}
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-[var(--text-primary)]">
              Deseja realmente {label.toLowerCase()} o processo{" "}
              <strong>{target.process.name}</strong>?
            </p>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {target.status === "ARCHIVED"
                ? "O processo será movido para a nova aba de Arquivados e não aparecerá na lista principal. Suas rotinas serão suspensas, mas o histórico de execuções continuará preservado."
                : target.status === "ACTIVE"
                  ? "O processo voltará a gerar execuções conforme os horários de suas rotinas cadastradas."
                  : "Novas execuções automáticas deixarão de ser geradas. As tarefas já iniciadas e o histórico serão preservados."}
            </p>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setTarget(null);
                  setError("");
                }}
              >
                Voltar
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={handleConfirmStatus}
                className={
                  target.status === "ARCHIVED"
                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5"
                    : "bg-[var(--brand-900)] hover:bg-[var(--brand-700)] text-white gap-1.5"
                }
              >
                {busy && <Spinner className="size-3.5" />}
                {label} processo
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
