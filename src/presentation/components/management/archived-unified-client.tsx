"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  RotateCcw,
  Search,
  GitMerge,
  Calendar,
  CheckSquare,
  MapPin,
  Clock,
  Layers,
  ArrowRight,
  Filter,
} from "lucide-react";
import { PageHeader, EmptyState, Modal } from "../shared";
import {
  toggleProcessStatusAction,
  toggleRoutineAction,
} from "@/presentation/actions/process-actions";
import { restoreTaskAction } from "@/presentation/actions/management-task-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InputGroup, InputGroupInput, InputGroupAddon } from "@/components/ui/input-group";
import { toast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";

export interface ArchivedUnifiedProps {
  processes: Array<{
    id: string;
    name: string;
    description: string | null;
    criticality: string;
    locationName: string | null;
    tasksCount: number;
    routinesCount: number;
    archivedAt: string;
  }>;
  routines: Array<{
    id: string;
    processId: string;
    processName: string;
    locationName: string | null;
    recurrenceRule: string;
    status: string;
    updatedAt: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    description: string | null;
    priority: string;
    locationName: string | null;
    teamName: string | null;
    deletedAt: string;
  }>;
  userRole: string;
}

type TabType = "ALL" | "PROCESSES" | "ROUTINES" | "TASKS";

export function ArchivedUnifiedClient({
  processes,
  routines,
  tasks,
  userRole,
}: ArchivedUnifiedProps) {
  const router = useRouter();
  const [currentTab, setCurrentTab] = useState<TabType>("ALL");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Restore Target Modal
  const [restoreTarget, setRestoreTarget] = useState<{
    id: string;
    title: string;
    type: "PROCESS" | "ROUTINE" | "TASK";
  } | null>(null);

  // Filter items
  const q = query.trim().toLocaleLowerCase("pt-BR");

  const filteredProcesses = processes.filter((p) => {
    if (!q) return true;
    return (
      p.name.toLocaleLowerCase("pt-BR").includes(q) ||
      (p.locationName && p.locationName.toLocaleLowerCase("pt-BR").includes(q))
    );
  });

  const filteredRoutines = routines.filter((r) => {
    if (!q) return true;
    return (
      r.processName.toLocaleLowerCase("pt-BR").includes(q) ||
      (r.locationName && r.locationName.toLocaleLowerCase("pt-BR").includes(q))
    );
  });

  const filteredTasks = tasks.filter((t) => {
    if (!q) return true;
    return (
      t.title.toLocaleLowerCase("pt-BR").includes(q) ||
      (t.teamName && t.teamName.toLocaleLowerCase("pt-BR").includes(q)) ||
      (t.locationName && t.locationName.toLocaleLowerCase("pt-BR").includes(q))
    );
  });

  const allItemsCount = processes.length + routines.length + tasks.length;

  async function handleConfirmRestore() {
    if (!restoreTarget) return;
    setBusyId(restoreTarget.id);

    try {
      if (restoreTarget.type === "PROCESS") {
        const res = await toggleProcessStatusAction(restoreTarget.id, "ACTIVE");
        if (res.error) {
          toast.add({
            title: "Erro ao restaurar processo",
            description: res.error,
            type: "error",
          });
        } else {
          toast.add({
            title: "Processo restaurado",
            description: `Processo "${restoreTarget.title}" restaurado com sucesso!`,
            type: "success",
          });
          setRestoreTarget(null);
          router.refresh();
        }
      } else if (restoreTarget.type === "ROUTINE") {
        const res = await toggleRoutineAction(restoreTarget.id);
        if (res.error) {
          toast.add({
            title: "Erro ao restaurar calendário",
            description: res.error,
            type: "error",
          });
        } else {
          toast.add({
            title: "Calendário restaurado",
            description: `Calendário da rotina restaurado com sucesso!`,
            type: "success",
          });
          setRestoreTarget(null);
          router.refresh();
        }
      } else if (restoreTarget.type === "TASK") {
        const res = await restoreTaskAction(restoreTarget.id);
        if (res.error) {
          toast.add({
            title: "Erro ao restaurar tarefa",
            description: res.error,
            type: "error",
          });
        } else {
          toast.add({
            title: "Tarefa restaurada",
            description: `Tarefa avulsa "${restoreTarget.title}" restaurada para a lista de tarefas.`,
            type: "success",
          });
          setRestoreTarget(null);
          router.refresh();
        }
      }
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Erro ao restaurar o item selecionado.",
        type: "error",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page-stack w-full mx-auto space-y-6">
      <PageHeader
        title="Arquivados"
        subtitle="Central de itens arquivados e inativos da organização. Restaure processos, calendários ou tarefas avulsas quando necessário."
      />

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-canvas rounded-xl border border-(--border-subtle) overflow-x-auto">
          <button
            type="button"
            onClick={() => setCurrentTab("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${currentTab === "ALL"
              ? "bg-surface text-(--text-primary) shadow-xs"
              : "text-(--text-secondary) hover:text-(--text-primary)"
              }`}
          >
            <span>Todos</span>
            <span className="text-[10px] bg-(--border-subtle)/70 px-1.5 py-0.2 rounded-full">
              {allItemsCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentTab("PROCESSES")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${currentTab === "PROCESSES"
              ? "bg-surface text-(--text-primary) shadow-xs"
              : "text-(--text-secondary) hover:text-(--text-primary)"
              }`}
          >
            <GitMerge className="size-3 text-muted-foreground" />
            <span>Processos</span>
            <span className="text-[10px] bg-(--border-subtle)/70 px-1.5 py-0.2 rounded-full">
              {processes.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentTab("ROUTINES")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${currentTab === "ROUTINES"
              ? "bg-surface text-(--text-primary) shadow-xs"
              : "text-(--text-secondary) hover:text-(--text-primary)"
              }`}
          >
            <Calendar className="size-3 text-muted-foreground" />
            <span>Calendários</span>
            <span className="text-[10px] bg-(--border-subtle)/70 px-1.5 py-0.2 rounded-full">
              {routines.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentTab("TASKS")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${currentTab === "TASKS"
              ? "bg-surface text-(--text-primary) shadow-xs"
              : "text-(--text-secondary) hover:text-(--text-primary)"
              }`}
          >
            <CheckSquare className="size-3 text-muted-foreground" />
            <span>Tarefas avulsas</span>
            <span className="text-[10px] bg-(--border-subtle)/70 px-1.5 py-0.2 rounded-full">
              {tasks.length}
            </span>
          </button>
        </div>

        <div className="w-full sm:w-72">
          <InputGroup className="py-4.5!">
            <InputGroupAddon>
              <Search className="size-3.5 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              aria-label="Buscar nos arquivados"
              placeholder="Buscar por título ou unidade"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="text-xs!"
            />
          </InputGroup>
        </div>
      </div>

      {/* Unified List View */}
      {allItemsCount === 0 ? (
        <EmptyState
          title="Nenhum item arquivado"
          description="Quando você arquivar processos, desativar calendários ou excluir tarefas avulsas, eles ficarão disponíveis aqui para restauração."
        />
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl divide-y divide-[var(--border-subtle)] overflow-hidden shadow-none">
          {/* PROCESSES SECTION */}
          {(currentTab === "ALL" || currentTab === "PROCESSES") &&
            filteredProcesses.map((p) => (
              <div
                key={`proc-${p.id}`}
                className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[var(--canvas)]/40 transition-colors"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap text-xs text-[var(--text-secondary)]">
                    <span className="inline-flex items-center text-[11px] font-medium text-[var(--text-secondary)] bg-[var(--canvas)] border border-[var(--border-subtle)] px-2 py-0.5 rounded-md">
                      Processo
                    </span>
                    <span>·</span>
                    <span>{p.locationName || "Sem unidade"}</span>
                    <span>·</span>
                    <span>{p.tasksCount} {p.tasksCount === 1 ? "etapa" : "etapas"}</span>
                  </div>

                  <h3 className="text-sm sm:text-base font-semibold text-[var(--text-primary)]">
                    {p.name}
                  </h3>

                  {p.description && (
                    <p className="text-xs text-[var(--text-secondary)] line-clamp-1 max-w-2xl">
                      {p.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === p.id}
                    onClick={() =>
                      setRestoreTarget({
                        id: p.id,
                        title: p.name,
                        type: "PROCESS",
                      })
                    }
                    className="text-xs h-8.5 gap-1.5 text-[var(--text-primary)] border-[var(--border-subtle)] hover:bg-[var(--canvas)] hover:border-[var(--brand-900)]/40"
                  >
                    <RotateCcw className="size-3.5 text-muted-foreground" />
                    Restaurar
                  </Button>
                </div>
              </div>
            ))}

          {/* ROUTINES (CALENDARS) SECTION */}
          {(currentTab === "ALL" || currentTab === "ROUTINES") &&
            filteredRoutines.map((r) => (
              <div
                key={`routine-${r.id}`}
                className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[var(--canvas)]/40 transition-colors"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap text-xs text-[var(--text-secondary)]">
                    <span className="inline-flex items-center text-[11px] font-medium text-[var(--text-secondary)] bg-[var(--canvas)] border border-[var(--border-subtle)] px-2 py-0.5 rounded-md">
                      Calendário
                    </span>
                    <span>·</span>
                    <span>{r.locationName || "Sem unidade"}</span>
                  </div>

                  <h3 className="text-sm sm:text-base font-semibold text-[var(--text-primary)]">
                    {r.processName}
                  </h3>

                  <p className="text-xs text-[var(--text-secondary)] line-clamp-1">
                    Regra de repetição automática programada para este processo.
                  </p>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === r.id}
                    onClick={() =>
                      setRestoreTarget({
                        id: r.id,
                        title: `Calendário de ${r.processName}`,
                        type: "ROUTINE",
                      })
                    }
                    className="text-xs h-8.5 gap-1.5 text-[var(--text-primary)] border-[var(--border-subtle)] hover:bg-[var(--canvas)] hover:border-[var(--brand-900)]/40"
                  >
                    <RotateCcw className="size-3.5 text-muted-foreground" />
                    Reativar
                  </Button>
                </div>
              </div>
            ))}

          {/* TASKS (AD-HOC) SECTION */}
          {(currentTab === "ALL" || currentTab === "TASKS") &&
            filteredTasks.map((t) => (
              <div
                key={`task-${t.id}`}
                className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[var(--canvas)]/40 transition-colors"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap text-xs text-[var(--text-secondary)]">
                    <span className="inline-flex items-center text-[11px] font-medium text-[var(--text-secondary)] bg-[var(--canvas)] border border-[var(--border-subtle)] px-2 py-0.5 rounded-md">
                      Tarefa avulsa
                    </span>
                    <span>·</span>
                    <span>{t.locationName || "Sem unidade"}</span>
                    {t.teamName && (
                      <>
                        <span>·</span>
                        <span>{t.teamName}</span>
                      </>
                    )}
                  </div>

                  <h3 className="text-sm sm:text-base font-semibold text-[var(--text-primary)]">
                    {t.title}
                  </h3>

                  {t.description && (
                    <p className="text-xs text-[var(--text-secondary)] line-clamp-1 max-w-2xl">
                      {t.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === t.id}
                    onClick={() =>
                      setRestoreTarget({
                        id: t.id,
                        title: t.title,
                        type: "TASK",
                      })
                    }
                    className="text-xs h-8.5 gap-1.5 text-[var(--text-primary)] border-[var(--border-subtle)] hover:bg-[var(--canvas)] hover:border-[var(--brand-900)]/40"
                  >
                    <RotateCcw className="size-3.5 text-muted-foreground" />
                    Restaurar
                  </Button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* MODAL: Confirm Restore */}
      {restoreTarget && (
        <Modal
          open
          title="Restaurar item"
          onClose={() => {
            if (!busyId) setRestoreTarget(null);
          }}
        >
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-primary)]">
              Deseja realmente restaurar{" "}
              <strong>
                {restoreTarget.type === "PROCESS"
                  ? "o processo"
                  : restoreTarget.type === "ROUTINE"
                    ? "o calendário"
                    : "a tarefa avulsa"}{" "}
                “{restoreTarget.title}”
              </strong>
              ?
            </p>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              O item voltará a ficar ativo na sua área operacional correspondente.
            </p>

            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
              <Button
                variant="outline"
                size="sm"
                disabled={Boolean(busyId)}
                onClick={() => setRestoreTarget(null)}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                disabled={Boolean(busyId)}
                onClick={handleConfirmRestore}
                className="bg-[var(--brand-900)] hover:bg-[var(--brand-700)] text-white gap-1.5"
              >
                {busyId && <Spinner className="size-3.5" />}
                Confirmar restauração
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
