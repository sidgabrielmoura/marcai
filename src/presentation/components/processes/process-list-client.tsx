"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Calendar,
  Clock,
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
  ChevronRight,
  Layers,
} from "lucide-react";
import { PageHeader, EmptyState, StatusBadge, Modal } from "../shared";
import { toggleProcessStatusAction } from "@/presentation/actions/process-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { InputGroup, InputGroupInput, InputGroupAddon } from "@/components/ui/input-group";
import { toast } from "@/components/ui/toast";
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
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<{
    process: ProcessItem;
    status: "ACTIVE" | "PAUSED" | "ARCHIVED";
  } | null>(null);

  const activeCount = processes.filter((p) => p.status === "ACTIVE").length;
  const withScheduleCount = processes.filter((p) => p.routinesCount > 0).length;
  const pendingConfigCount = processes.filter((p) => !p.tasksCount || !p.routinesCount).length;

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

    try {
      const res = await toggleProcessStatusAction(target.process.id, target.status);
      if (res.error) {
        toast.add({
          title: "Erro ao alterar status",
          description: res.error,
          type: "error",
        });
      } else {
        const processName = target.process.name;
        const actionType = target.status;
        setTarget(null);

        if (actionType === "ARCHIVED") {
          toast.add({
            title: "Processo arquivado",
            description: `O processo "${processName}" foi arquivado e movido para Arquivados.`,
            type: "info",
          });
        } else if (actionType === "PAUSED") {
          toast.add({
            title: "Processo pausado",
            description: `O processo "${processName}" foi pausado. Novas execuções no cronograma não serão geradas.`,
            type: "warning",
          });
        } else {
          toast.add({
            title: "Processo reativado",
            description: `O processo "${processName}" foi reativado com sucesso.`,
            type: "success",
          });
        }

        router.refresh();
      }
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Não foi possível salvar a alteração. Tente novamente.",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Processos"
        subtitle="Acompanhe os fluxos da sua operação. Clique em qualquer processo para visualizar e configurar seu calendário e cronograma."
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

      {/* Metrics Summary Strip - Minimalist & Neutral */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex items-center gap-3 p-3.5 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl">
          <div className="size-8 rounded-lg bg-[var(--canvas)] text-[var(--text-primary)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
            <CheckCircle2 className="size-4 text-emerald-700" />
          </div>
          <div className="min-w-0">
            <span className="text-lg font-bold text-[var(--text-primary)] tabular-nums block leading-tight">
              {activeCount}
            </span>
            <span className="text-xs text-[var(--text-secondary)]">processos ativos</span>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3.5 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl">
          <div className="size-8 rounded-lg bg-[var(--canvas)] text-[var(--text-primary)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
            <Calendar className="size-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <span className="text-lg font-bold text-[var(--text-primary)] tabular-nums block leading-tight">
              {withScheduleCount}
            </span>
            <span className="text-xs text-[var(--text-secondary)]">com repetição ativa</span>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3.5 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl">
          <div className="size-8 rounded-lg bg-[var(--canvas)] text-[var(--text-primary)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
            <Layers className="size-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <span className="text-lg font-bold text-[var(--text-primary)] tabular-nums block leading-tight">
              {processes.length}
            </span>
            <span className="text-xs text-[var(--text-secondary)]">total cadastrado</span>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 max-w-2xl">
          <InputGroup className="flex-1 py-4.5!">
            <InputGroupAddon>
              <Search className="size-4 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              aria-label="Buscar processo"
              placeholder="Buscar por nome ou unidade"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="text-xs sm:text-sm!"
            />
          </InputGroup>

          <NativeSelect
            aria-label="Filtrar processos por status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="sm:w-44 text-xs h-10"
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

      {/* Process List - Minimalist, organized, clean */}
      {!filtered.length ? (
        <EmptyState
          title={processes.length ? "Nenhum processo encontrado" : "Nenhum processo cadastrado"}
          description={
            processes.length
              ? "Tente buscar com outro termo ou ajuste os filtros de status."
              : "Crie seu primeiro processo operacional para padronizar rotinas e tarefas."
          }
        />
      ) : (
        <div className="flex flex-col divide-y divide-[var(--border-subtle)] bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-none">
          {filtered.map((p) => {
            const isPaused = p.status === "PAUSED";

            return (
              <div
                key={p.id}
                className="group relative p-5 sm:p-6 hover:bg-[var(--canvas)]/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                {/* Main Link Wrapper - clicking row takes to show page */}
                <Link
                  href={`/management/processes/${p.id}`}
                  className="flex-1 min-w-0 flex flex-col gap-1.5 focus:outline-none"
                >
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-base font-semibold text-[var(--text-primary)] group-hover:text-[var(--brand-900)] transition-colors">
                      {p.name}
                    </h3>
                    <StatusBadge status={p.status} size="sm" />
                  </div>

                  <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] flex-wrap">
                    <span>{p.locationName || "Sem unidade vinculada"}</span>
                    <span>·</span>
                    <span>{p.tasksCount} {p.tasksCount === 1 ? "etapa" : "etapas"}</span>
                    <span>·</span>
                    <span>{p.routinesCount > 0 ? "Repetição ativa" : "Manual"}</span>
                  </div>

                  {p.description && (
                    <p className="text-xs text-[var(--text-secondary)] line-clamp-1 mt-0.5 max-w-2xl">
                      {p.description}
                    </p>
                  )}
                </Link>

                {/* Right Actions */}
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    nativeButton={false}
                    render={<Link href={`/management/processes/${p.id}`} />}
                    className="text-xs h-8.5 gap-1.5 border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--brand-900)]/40"
                  >
                    Ver processo
                    <ChevronRight className="size-3.5 text-muted-foreground" />
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--canvas)]"
                          aria-label={`Mais opções para ${p.name}`}
                        />
                      }
                    >
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        render={<Link href={`/management/processes/${p.id}`} />}
                      >
                        <Layers className="size-4 mr-2" />
                        <span>Abrir processo</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        render={<Link href={`/management/processes/${p.id}/edit`} />}
                      >
                        <Pencil className="size-4 mr-2" />
                        <span>Editar processo</span>
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
              </div>
            );
          })}
        </div>
      )}

      {target && (
        <Modal
          open
          title={`${label} processo`}
          onClose={() => {
            if (!busy) {
              setTarget(null);
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
                ? "O processo será movido para a aba de Arquivados. O calendário e cronograma serão suspensos, mas o histórico permanece preservado."
                : target.status === "ACTIVE"
                  ? "O processo voltará a gerar execuções conforme os horários do calendário cadastrado."
                  : "Novas execuções no cronograma deixarão de ser geradas. As tarefas já iniciadas e o histórico serão preservados."}
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setTarget(null);
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
                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5 text-white!"
                    : "bg-brand-900 hover:bg-brand-700 text-white! gap-1.5"
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
