"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { LogoLoader } from "@/components/loader/logo-loader";
import { toast } from "@/components/ui/toast";
import { StatusBadge } from "../shared";
import {
  getEmployeeProcessExecutionAction,
  completeProcessExecutionAction,
  type EmployeeProcessExecutionDetail,
} from "@/presentation/actions/process-actions";
import { EmployeeTaskDetailDrawer } from "./task-detail-drawer";
import {
  X,
  Calendar,
  MapPin,
  Check,
  Lock,
  ListTodo,
  FileCheck2,
  ChevronRight,
  RotateCcw,
  AlertCircle,
  Info,
} from "lucide-react";

interface ProcessDetailDrawerProps {
  executionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}

export function EmployeeProcessDetailDrawer({
  executionId,
  open,
  onOpenChange,
  onUpdated,
}: ProcessDetailDrawerProps) {
  const router = useRouter();
  const [execution, setExecution] = useState<EmployeeProcessExecutionDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  const loadExecution = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getEmployeeProcessExecutionAction(id);
      if (result.error) {
        setError(result.error);
        setExecution(null);
      } else if (result.execution) {
        setExecution(result.execution);
        setError(null);
      }
    } catch {
      setError("Não foi possível carregar os detalhes do processo.");
      setExecution(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && executionId) {
      loadExecution(executionId);
    } else if (!open) {
      setLoading(false);
      const timer = setTimeout(() => {
        setExecution(null);
        setSelectedId(null);
        setError(null);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [open, executionId, revision, loadExecution]);

  const total =
    execution?.requiredTotal ??
    execution?.tasks.filter((t) => t.required).length ??
    0;
  const completed =
    execution?.requiredCompleted ??
    execution?.tasks.filter((t) => t.required && t.status === "COMPLETED").length ??
    0;
  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

  const canFinish =
    !!execution &&
    (execution.canComplete ??
      (total === completed &&
        !["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(execution.status) &&
        new Date(execution.scheduledAt).getTime() <= Date.now()));

  const updated = () => {
    setSelectedId(null);
    setRevision((v) => v + 1);
    onUpdated?.();
    router.refresh();
  };

  const finish = async () => {
    if (!execution || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await completeProcessExecutionAction(execution.id);
      if (result.error) {
        setError(result.error);
        toast.add({
          title: "Erro ao finalizar",
          description: result.error,
          type: "error",
        });
      } else {
        toast.add({
          title: "Processo finalizado",
          description: "Todas as etapas foram concluídas com sucesso.",
          type: "success",
        });
        updated();
      }
    } catch {
      const msg = "Não foi possível finalizar o processo. Tente novamente.";
      setError(msg);
      toast.add({
        title: "Erro inesperado",
        description: msg,
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const bodyContent = (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 flex flex-col gap-4">
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 gap-3 min-h-[300px]">
          <LogoLoader size={64} text="Carregando processo..." />
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-xs text-red-800 dark:text-red-300 flex flex-col items-center gap-3 text-center my-auto">
          <AlertCircle className="size-6 text-red-600" />
          <p className="font-medium">{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRevision((v) => v + 1)}
            className="text-xs h-8 cursor-pointer"
          >
            <RotateCcw className="size-3.5 mr-1.5" />
            Tentar novamente
          </Button>
        </div>
      ) : execution ? (
        <>
          {execution.hasHiddenSteps && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-muted/30 border border-slate-200 dark:border-border text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2.5 shrink-0">
              <Info className="size-4 text-slate-500 shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold block mb-0.5">Etapas compartilhadas</strong>
                Outros colaboradores também participam deste processo. Etapas fora da sua alocação são gerenciadas por eles.
              </div>
            </div>
          )}

          {/* Card: Progresso do Processo */}
          <Card className="shrink-0 rounded-xl p-0 border border-[var(--border-subtle)] bg-[var(--surface)] shadow-none overflow-hidden">
            <div className="px-4 py-3 bg-slate-50/80 dark:bg-muted/30 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck2 className="size-4 text-[var(--brand-900)] dark:text-primary" />
                <h3 className="font-bold text-xs uppercase tracking-wider text-[var(--text-primary)]">
                  Progresso do processo
                </h3>
              </div>
              <Badge
                variant="outline"
                className="text-[10px] font-semibold border-slate-200 text-slate-700 bg-white dark:bg-slate-800 dark:text-slate-300"
              >
                {progressPercent}% concluído
              </Badge>
            </div>

            <CardContent className="p-4 flex flex-col gap-3 text-xs leading-relaxed">
              {execution.processDescription && (
                <div className="p-3 rounded-lg bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 text-blue-950 dark:text-blue-100">
                  <span className="font-semibold block mb-1 text-[11px] uppercase tracking-wide text-blue-800 dark:text-blue-300">
                    Resumo do processo
                  </span>
                  <p className="font-medium text-xs leading-relaxed">{execution.processDescription}</p>
                </div>
              )}

              <div className="flex flex-col gap-1.5 pt-0.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-600 dark:text-slate-400">Etapas obrigatórias</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {completed} de {total} ({progressPercent}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--brand-900)] transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Obrigatórias</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {completed} de {total}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold block">No seu acesso</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {execution.personalCompleted ?? execution.tasks.filter((t) => t.status === "COMPLETED").length} de{" "}
                    {execution.personalTotal ?? execution.tasks.length}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card: Etapas do Processo */}
          <Card className="shrink-0 rounded-xl p-0 border border-[var(--border-subtle)] bg-[var(--surface)] shadow-none overflow-hidden">
            <div className="px-4 py-3 bg-slate-50/80 dark:bg-muted/30 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListTodo className="size-4 text-[var(--brand-900)] dark:text-primary" />
                <h3 className="font-bold text-xs uppercase tracking-wider text-[var(--text-primary)]">
                  Etapas do processo
                </h3>
              </div>
              <Badge
                variant="outline"
                className="text-[10px] font-semibold border-slate-200 text-slate-700 bg-white dark:bg-slate-800 dark:text-slate-300"
              >
                {execution.tasks.length} {execution.tasks.length === 1 ? "etapa" : "etapas"}
              </Badge>
            </div>

            <CardContent className="p-3.5 flex flex-col gap-2 text-xs">
              {execution.tasks.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  Nenhuma etapa encontrada neste processo.
                </div>
              ) : (
                execution.tasks.map((task, idx) => {
                  const isCompleted = task.status === "COMPLETED";
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setSelectedId(task.id)}
                      className="w-full text-left p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-[var(--brand-700)] dark:hover:border-primary/50 bg-white dark:bg-slate-900/40 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-all flex items-center justify-between gap-3 group cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`size-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-semibold ${
                            isCompleted
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : task.isBlocked
                                ? "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                                : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                        >
                          {isCompleted ? (
                            <Check className="size-3.5" />
                          ) : task.isBlocked ? (
                            <Lock className="size-3.5" />
                          ) : (
                            <span>{task.orderIndex || idx + 1}</span>
                          )}
                        </div>

                        <div className="flex flex-col min-w-0">
                          <span
                            className={`text-xs font-semibold truncate ${
                              isCompleted
                                ? "text-slate-500 dark:text-slate-400 line-through opacity-80"
                                : "text-slate-900 dark:text-slate-100"
                            }`}
                          >
                            {task.title}
                          </span>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                            <span>{task.required ? "Obrigatória" : "Opcional"}</span>
                            {task.assignedMemberName && (
                              <>
                                <span>·</span>
                                <span className="truncate">{task.assignedMemberName}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={task.status} />
                        <ChevronRight className="size-4 text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );

  const footerContent = execution ? (
    <>
      {execution.status === "COMPLETED" ? (
        <div className="p-2.5 text-center rounded-lg bg-slate-100 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 font-medium">
          Processo finalizado. Histórico e etapas preservados.
        </div>
      ) : execution.status === "CANCELLED" ? (
        <div className="p-2.5 text-center rounded-lg bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-400 font-medium">
          Este processo foi cancelado.
        </div>
      ) : canFinish ? (
        <div className="flex flex-col gap-2">
          <Button
            className="w-full h-11 text-xs font-semibold rounded-xl bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)] cursor-pointer"
            disabled={busy}
            onClick={() => {
              void finish();
            }}
          >
            {busy ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}
            Finalizar processo
          </Button>
        </div>
      ) : (
        <div className="p-2.5 text-center rounded-lg bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 font-medium">
          {total - completed > 0
            ? `Ainda restam ${total - completed} ${total - completed === 1 ? "etapa obrigatória" : "etapas obrigatórias"} pendentes para liberar a finalização.`
            : "Aguardando horário programado para finalização."}
        </div>
      )}
    </>
  ) : null;

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      showSwipeHandle={true}
      swipeDirection="down"
    >
      <DrawerContent className="fixed inset-x-0 bottom-0 top-auto w-full h-[92dvh] max-h-[92dvh] sm:max-w-2xl! sm:mx-auto border-t border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--text-primary)] rounded-t-[24px] shadow-2xl flex flex-col focus:outline-none overflow-hidden p-0">
        <DrawerHeader className="p-4 sm:p-5 border-b border-[var(--border-subtle)] bg-[var(--surface)] shrink-0">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="outline"
                className="text-[10px] font-semibold border-slate-200 text-slate-700 bg-slate-50 dark:bg-slate-800/60 dark:text-slate-300"
              >
                Processo
              </Badge>
              {execution && <StatusBadge status={execution.status} />}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="size-8 rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
            >
              <X className="size-4" />
              <span className="sr-only">Fechar</span>
            </Button>
          </div>

          <DrawerTitle className="text-base sm:text-lg font-bold text-[var(--text-primary)] leading-snug">
            {loading ? <Skeleton className="h-6 w-3/4" /> : execution?.processName || "Detalhes do processo"}
          </DrawerTitle>

          <DrawerDescription
            render={<div />}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)] mt-1"
          >
            {loading ? (
              <Skeleton className="h-4 w-1/2" />
            ) : (
              <>
                {execution?.scheduledAt && (
                  <span className="inline-flex items-center gap-1 font-medium">
                    <Calendar className="size-3 text-slate-400" />
                    Agendado:{" "}
                    {new Date(execution.scheduledAt).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                )}
                {execution?.locationName && (
                  <span className="inline-flex items-center gap-1 font-medium">
                    <MapPin className="size-3 text-slate-400" />
                    {execution.locationName}
                  </span>
                )}
              </>
            )}
          </DrawerDescription>
        </DrawerHeader>

        {bodyContent}

        {footerContent && (
          <DrawerFooter className="px-4 sm:px-6 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--surface)] shrink-0 flex flex-col gap-2">
            {footerContent}
          </DrawerFooter>
        )}

        {/* Sub-tela deslizante para execução da etapa selecionada com o mesmo drawer */}
        <EmployeeTaskDetailDrawer
          taskId={selectedId}
          open={!!selectedId}
          onOpenChange={(value) => {
            if (!value) {
              setSelectedId(null);
            }
          }}
          onBack={() => setSelectedId(null)}
          embedded={true}
          onTaskUpdated={updated}
        />
      </DrawerContent>
    </Drawer>
  );
}
