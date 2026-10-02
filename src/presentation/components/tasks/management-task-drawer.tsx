"use client";

import { useEffect, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import {
  getManagementTaskDrawerAction,
  type ManagementTaskDrawerResult,
  cancelTaskAction,
  trashTaskAction,
  submitApprovalDecisionAction,
} from "@/presentation/actions/management-task-actions";
import { StatusBadge, PriorityBadge } from "../shared";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { LogoLoader } from "@/components/loader/logo-loader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  X,
  RefreshCw,
  MapPin,
  Users,
  Clock,
  FileCheck2,
  Activity,
  Check,
  ExternalLink,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ListTodo,
  ChevronRight,
} from "lucide-react";

interface ManagementTaskDrawerProps {
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskUpdated?: () => void;
  userRole: string;
}

const actionLabels: Record<string, string> = {
  TASK_CREATED: "Criada",
  TASK_STARTED: "Iniciada",
  TASK_PAUSED: "Pausada",
  TASK_RESUMED: "Retomada",
  TASK_COMPLETED: "Concluída",
  TASK_SUBMITTED: "Enviada para aprovação",
  TASK_CANCELLED: "Cancelada",
  TASK_TRASHED: "Lixeira",
  EVIDENCE_SUBMITTED: "Evidência enviada",
  EVIDENCE_APPROVED: "Evidência aprovada",
  EVIDENCE_REJECTED: "Evidência rejeitada",
  APPROVAL_REQUESTED: "Aprovação solicitada",
  APPROVAL_APPROVED: "Aprovação concedida",
  APPROVAL_REJECTED: "Aprovação negada",
  TASK_ASSIGNED: "Atribuída",
  TASK_TRANSFERRED: "Reatribuída",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}

function fmtDuration(secs: number | null): string {
  if (!secs) return "—";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

export function ManagementTaskDrawer({
  taskId,
  open,
  onOpenChange,
  onTaskUpdated,
  userRole,
}: ManagementTaskDrawerProps) {
  const router = useRouter();
  const [task, setTask] = useState<ManagementTaskDrawerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showTrashAlert, setShowTrashAlert] = useState(false);
  const [approvalStep, setApprovalStep] = useState<{
    stepId: string;
    decision: "APPROVED" | "REJECTED";
  } | null>(null);
  const [approvalNote, setApprovalNote] = useState("");

  const loadTask = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await getManagementTaskDrawerAction(id);
      if (res.error) {
        toast.add({
          title: "Erro ao carregar detalhes",
          description: res.error,
          type: "error",
        });
        setTask(null);
      } else if (res.task) {
        setTask(res.task);
      }
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Não foi possível carregar os detalhes da tarefa.",
        type: "error",
      });
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && taskId) {
      loadTask(taskId);
    } else if (!open) {
      const timer = setTimeout(() => {
        setTask(null);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [open, taskId, loadTask]);

  async function runAction(
    action: () => Promise<{ success?: boolean; error?: string }>,
    successMessage: string = "Operação realizada com sucesso."
  ) {
    setActionBusy(true);
    try {
      const res = await action();
      if (res.error) {
        toast.add({
          title: "Erro na operação",
          description: res.error,
          type: "error",
        });
      } else {
        toast.add({
          title: "Sucesso",
          description: successMessage,
          type: "success",
        });
        if (taskId) await loadTask(taskId);
        onTaskUpdated?.();
        router.refresh();
      }
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Erro ao executar ação.",
        type: "error",
      });
    } finally {
      setActionBusy(false);
    }
  }

  async function handleConfirmCancel() {
    if (!task || !cancelReason.trim()) return;
    await runAction(
      () => cancelTaskAction(task.id, cancelReason.trim()),
      "Tarefa cancelada com sucesso."
    );
    setShowCancelDialog(false);
    setCancelReason("");
  }

  async function handleConfirmTrash() {
    if (!task) return;
    await runAction(
      () => trashTaskAction(task.id),
      "Tarefa movida para a lixeira."
    );
    setShowTrashAlert(false);
    onOpenChange(false);
  }

  async function handleConfirmApproval() {
    if (!approvalStep) return;
    await runAction(
      () =>
        submitApprovalDecisionAction(
          approvalStep.stepId,
          approvalStep.decision,
          approvalNote.trim() || undefined,
        ),
      approvalStep.decision === "APPROVED"
        ? "Etapa de aprovação aprovada."
        : "Etapa de aprovação rejeitada."
    );
    setApprovalStep(null);
    setApprovalNote("");
  }

  const primaryAssignee = task?.assignments.find((a) => a.type === "PRIMARY");
  const pendingApprovalStep = task?.approvalWorkflow?.steps?.find(
    (s) => s.status === "PENDING" && s.canDecide,
  );

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle={true} swipeDirection="down">
        <DrawerContent className="w-full h-[92dvh] max-h-[92dvh] sm:max-w-2xl sm:mx-auto border-t border-(--border-subtle) bg-surface text-(--text-primary) rounded-t-[24px] shadow-2xl flex flex-col focus:outline-none">

          {/* ── Header ── */}
          <DrawerHeader className="relative px-5 pt-2 pb-3.5 border-b border-(--border-subtle) text-left shrink-0">
            <div className="flex items-center justify-between gap-3 pr-8">
              <DrawerClose
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-3.5 top-2.5 size-8 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-muted"
                  />
                }
              >
                <X className="size-4" />
                <span className="sr-only">Fechar</span>
              </DrawerClose>
            </div>

            <DrawerTitle className="text-base sm:text-lg font-bold leading-snug text-(--text-primary) mt-1.5 text-start!">
              {loading ? <Skeleton className="h-6 w-3/4" /> : task?.title || "Detalhes da tarefa"}
            </DrawerTitle>

            <DrawerDescription
              render={<div />}
              className="flex flex-col items-start gap-x-3 gap-y-1 text-xs text-(--text-secondary) mt-1"
            >
              {loading ? (
                <Skeleton className="h-4 w-1/2" />
              ) : task ? (
                <>
                  <div className="w-full flex gap-1 items-center">
                    <StatusBadge status={task.status} size="sm" className="flex-1!" />
                    <PriorityBadge priority={task.priority} size="sm" className="max-w-fit! flex-1!" />
                    {task.slaExceeded && (
                      <Badge className="text-[10px] flex-1! truncate font-semibold text-red-700 bg-red-50 border-red-200 px-1.5 py-0.5 rounded-md flex items-center! gap-1">
                        <AlertTriangle className="size-2" />
                        SLA
                      </Badge>
                    )}
                  </div>
                  {task.deadlineAt && (
                    <span className="inline-flex items-center gap-1 font-medium">
                      <Clock className="size-3 text-slate-400" />
                      Prazo: {new Date(task.deadlineAt).toLocaleString("pt-BR", {
                        timeZone: "America/Sao_Paulo",
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  )}
                </>
              ) : null}
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 flex flex-col gap-4">

            {!task && !loading && taskId && (
              <div className="py-8 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
                <p>Não foi possível exibir a tarefa.</p>
                <Button size="sm" variant="outline" className="h-7 text-xs px-2.5" onClick={() => loadTask(taskId)}>
                  <RefreshCw data-icon="inline-start" className="size-3" />
                  Tentar de novo
                </Button>
              </div>
            )}

            {loading ? (
              <div className="flex flex-col items-center justify-center p-12 gap-3 min-h-[300px]">
                <LogoLoader size={64} text="Carregando detalhes da tarefa..." />
              </div>
            ) : task ? (
              <>
                <Card className="shrink-0 rounded-xl p-0 border border-(--border-subtle) bg-surface shadow-none overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50/80 dark:bg-muted/30 border-b border-(--border-subtle) flex items-center gap-2">
                    <ListTodo className="size-4 text-brand-900 dark:text-primary" />
                    <h3 className="font-bold text-xs uppercase tracking-wider text-(--text-primary)">Informações gerais</h3>
                  </div>
                  <CardContent className="p-4 flex flex-col gap-3 text-xs">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <div>
                        <span className="text-[10px] uppercase tracking-wide font-semibold text-(--text-secondary) block mb-0.5">Unidade</span>
                        <span className="font-medium flex items-center gap-1">
                          <MapPin className="size-3 text-brand-700 shrink-0" />
                          {task.locationName || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase tracking-wide font-semibold text-(--text-secondary) block mb-0.5">Equipe</span>
                        <span className="font-medium flex items-center gap-1">
                          <Users className="size-3 text-brand-700 shrink-0" />
                          {task.teamName || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase tracking-wide font-semibold text-(--text-secondary) block mb-0.5">Responsável</span>
                        <span className="font-medium">
                          {primaryAssignee?.memberName || <span className="text-amber-700">Sem responsável</span>}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase tracking-wide font-semibold text-(--text-secondary) block mb-0.5">Origem</span>
                        <span className="font-medium">{task.origin === "PROCESS" ? "Processo" : "Avulsa"}</span>
                      </div>
                      {task.startedAt && (
                        <div>
                          <span className="text-[10px] uppercase tracking-wide font-semibold text-(--text-secondary) block mb-0.5">Iniciada</span>
                          <span className="font-medium">{fmtDate(task.startedAt)}</span>
                        </div>
                      )}
                      {task.completedAt && (
                        <div>
                          <span className="text-[10px] uppercase tracking-wide font-semibold text-(--text-secondary) block mb-0.5">Concluída</span>
                          <span className="font-medium">{fmtDate(task.completedAt)}</span>
                        </div>
                      )}
                      {task.actualDuration !== null && (
                        <div>
                          <span className="text-[10px] uppercase tracking-wide font-semibold text-(--text-secondary) block mb-0.5">Duração real</span>
                          <span className="font-medium">{fmtDuration(task.actualDuration)}</span>
                        </div>
                      )}
                      {task.estimatedDuration !== null && (
                        <div>
                          <span className="text-[10px] uppercase tracking-wide font-semibold text-(--text-secondary) block mb-0.5">Estimativa</span>
                          <span className="font-medium">{fmtDuration(task.estimatedDuration)}</span>
                        </div>
                      )}
                    </div>

                    {task.description && (
                      <div className="p-3 rounded-lg bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 text-blue-950 dark:text-blue-100 mt-1">
                        <span className="font-semibold block mb-1 text-[11px] uppercase tracking-wide text-blue-800">Descrição</span>
                        <p className="text-xs">{task.description}</p>
                      </div>
                    )}

                    {task.instructions && (
                      <div className="space-y-1">
                        <span className="font-semibold text-xs block">Instruções:</span>
                        <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-300 bg-slate-50/50 dark:bg-muted/10 p-3 rounded-lg border border-(--border-subtle) text-xs">
                          {task.instructions}
                        </p>
                      </div>
                    )}

                    <Link
                      href={`/management/tasks/${task.id}`}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-900 hover:text-brand-700 mt-1"
                    >
                      <ExternalLink className="size-3.5" />
                      Ver página completa
                    </Link>
                  </CardContent>
                </Card>

                {/* ── Dependências ── */}
                {task.dependencies.length > 0 && (
                  <Card className="shrink-0 rounded-xl p-0 border border-(--border-subtle) bg-surface shadow-none overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50/80 dark:bg-muted/30 border-b border-(--border-subtle) flex items-center gap-2">
                      <ChevronRight className="size-4 text-brand-900" />
                      <h3 className="font-bold text-xs uppercase tracking-wider text-(--text-primary)">Dependências</h3>
                    </div>
                    <CardContent className="p-4 flex flex-col gap-2">
                      {task.dependencies.map((d) => (
                        <div key={d.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white dark:bg-card border border-slate-200 text-xs">
                          <span className="truncate font-medium">{d.dependsOnTask.title}</span>
                          <StatusBadge status={d.dependsOnTask.status} />
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* ── Comprovações ── */}
                {task.evidenceRequirements.length > 0 && (
                  <Card className="shrink-0 rounded-xl p-0 border border-(--border-subtle) bg-surface shadow-none overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50/80 dark:bg-muted/30 border-b border-(--border-subtle) flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileCheck2 className="size-4 text-brand-900 dark:text-primary" />
                        <h3 className="font-bold text-xs uppercase tracking-wider text-(--text-primary)">Comprovações</h3>
                      </div>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-muted text-slate-800 dark:text-foreground">
                        {task.evidenceRequirements.filter((r) => r.submissions.filter((s) => s.validationStatus === "VALID").length >= r.minQuantity).length}
                        /{task.evidenceRequirements.length}
                      </span>
                    </div>
                    <CardContent className="p-4 flex flex-col gap-3">
                      {task.evidenceRequirements.map((req) => {
                        const valid = req.submissions.filter((s) => s.validationStatus === "VALID");
                        const isDone = valid.length >= req.minQuantity;
                        return (
                          <div
                            key={req.id}
                            className={`p-3 rounded-xl border text-xs transition-colors ${isDone
                              ? "bg-emerald-50/40 border-emerald-200"
                              : "bg-slate-50/60 border-(--border-subtle)"
                              }`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span className="font-semibold text-(--text-primary)">{req.type} · {req.executionStage}</span>
                              <Badge
                                className={`text-[10px] font-semibold ${isDone
                                  ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                  : req.required
                                    ? "border-amber-300 text-amber-800 bg-amber-50"
                                    : "text-slate-500"
                                  }`}
                                variant="outline"
                              >
                                {isDone ? "Entregue" : req.required ? "Obrigatória" : "Opcional"}
                              </Badge>
                            </div>
                            {req.submissions.length === 0 ? (
                              <p className="text-muted-foreground">Nenhum envio ainda.</p>
                            ) : (
                              <div className="flex flex-col gap-1.5">
                                {req.submissions.map((s) => (
                                  <div key={s.id} className="flex items-center gap-1.5">
                                    {s.validationStatus === "VALID"
                                      ? <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
                                      : s.validationStatus === "REJECTED"
                                        ? <XCircle className="size-3.5 text-red-600 shrink-0" />
                                        : <Clock className="size-3.5 text-slate-400 shrink-0" />}
                                    {s.storageKey ? (
                                      <a href={`/api/evidence/${s.id}`} className="underline text-blue-600 hover:text-blue-800 font-medium truncate" target="_blank" rel="noopener noreferrer">
                                        Ver comprovação #{s.attemptNumber}
                                      </a>
                                    ) : (
                                      <span className="truncate text-slate-700">{s.value || `Envio #${s.attemptNumber}`}</span>
                                    )}
                                    <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{fmtDate(s.createdAt)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}

                {/* ── Aprovação ── */}
                {task.approvalWorkflow && (
                  <Card className="shrink-0 rounded-xl p-0 border border-(--border-subtle) bg-surface shadow-none overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50/80 dark:bg-muted/30 border-b border-(--border-subtle) flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-brand-900" />
                        <h3 className="font-bold text-xs uppercase tracking-wider text-(--text-primary)">Aprovação</h3>
                      </div>
                      <Badge
                        className={`text-[10px] font-semibold ${task.approvalWorkflow.status === "APPROVED"
                          ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                          : task.approvalWorkflow.status === "REJECTED"
                            ? "bg-red-100 text-red-800 border-red-200"
                            : "bg-amber-50 text-amber-800 border-amber-200"
                          }`}
                        variant="outline"
                      >
                        {task.approvalWorkflow.status === "APPROVED" ? "Aprovado"
                          : task.approvalWorkflow.status === "REJECTED" ? "Rejeitado"
                            : "Aguardando"}
                      </Badge>
                    </div>
                    <CardContent className="p-4 flex flex-col gap-2 text-xs">
                      {task.approvalWorkflow.steps.map((step) => (
                        <div key={step.id} className="p-2.5 rounded-lg border border-(--border-subtle) bg-white dark:bg-card">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold">Etapa {step.sequence}</span>
                            <StatusBadge status={step.status} />
                          </div>
                          {step.decisions.map((d) => (
                            <div key={d.id} className="text-[11px] text-muted-foreground flex items-start gap-1.5 mt-1">
                              {d.decision === "APPROVED"
                                ? <Check className="size-3 text-emerald-600 shrink-0 mt-0.5" />
                                : <XCircle className="size-3 text-red-600 shrink-0 mt-0.5" />}
                              <span>{d.decidedBy} — {d.note || d.decision}</span>
                            </div>
                          ))}
                        </div>
                      ))}

                      {pendingApprovalStep && userRole !== "EMPLOYEE" && (
                        <div className="flex gap-2 pt-1">
                          <Button
                            type="button"
                            size="sm"
                            className="flex-1 h-9 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                            disabled={actionBusy}
                            onClick={() => setApprovalStep({ stepId: pendingApprovalStep.id, decision: "APPROVED" })}
                          >
                            <Check data-icon="inline-start" className="size-3.5" />
                            Aprovar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            className="flex-1 h-9 text-xs font-semibold cursor-pointer"
                            disabled={actionBusy}
                            onClick={() => setApprovalStep({ stepId: pendingApprovalStep.id, decision: "REJECTED" })}
                          >
                            <XCircle data-icon="inline-start" className="size-3.5" />
                            Rejeitar
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* ── Ocorrências ── */}
                {task.occurrences.length > 0 && (
                  <Card className="shrink-0 rounded-xl border border-red-200 bg-red-50/20 shadow-none overflow-hidden">
                    <div className="px-4 py-2.5 bg-red-50/60 border-b border-red-200 flex items-center gap-2">
                      <AlertTriangle className="size-4 text-red-600" />
                      <span className="font-bold text-[11px] uppercase tracking-wide text-red-900">Ocorrências</span>
                    </div>
                    <CardContent className="p-3.5 flex flex-col gap-2">
                      {task.occurrences.map((occ) => (
                        <div key={occ.id} className="p-2.5 rounded-lg bg-white dark:bg-card border border-red-200 text-xs flex flex-col gap-0.5">
                          <span className="font-semibold text-red-800">{occ.reason}</span>
                          <span className="text-[10px] text-muted-foreground">{fmtDate(occ.createdAt)}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* ── Histórico ── */}
                {task.activityLogs.length > 0 && (
                  <Card className="shrink-0 rounded-xl p-0 border border-(--border-subtle) bg-surface shadow-none overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50/80 dark:bg-muted/30 border-b border-(--border-subtle) flex items-center gap-2">
                      <Activity className="size-4 text-brand-900" />
                      <h3 className="font-bold text-xs uppercase tracking-wider text-(--text-primary)">Histórico</h3>
                    </div>
                    <CardContent className="p-4 flex flex-col gap-2 text-xs">
                      {task.activityLogs.map((log) => (
                        <div key={log.id} className="flex items-start gap-2">
                          <div className="size-1.5 rounded-full bg-brand-900 mt-1.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold text-(--text-primary)">
                              {actionLabels[log.action] || log.action}
                            </span>
                            {log.actorName && <span className="text-muted-foreground"> por {log.actorName}</span>}
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0">{fmtDate(log.createdAt)}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </>
            ) : null}
          </div>

          {/* ── Footer com ações ── */}
          {task && userRole !== "EMPLOYEE" && (
            <DrawerFooter className="px-4 sm:px-6 py-3.5 border-t border-(--border-subtle) bg-surface shrink-0 flex flex-col gap-2">
              <div className="flex gap-2">
                {!["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(task.status) && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex-1 h-10 text-xs font-semibold rounded-xl text-amber-800 hover:bg-amber-50 cursor-pointer"
                    disabled={actionBusy}
                    onClick={() => { setCancelReason(""); setShowCancelDialog(true); }}
                  >
                    <XCircle data-icon="inline-start" className="size-3.5" />
                    Cancelar
                  </Button>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 w-10 text-xs font-semibold rounded-xl text-red-700 hover:bg-red-50 cursor-pointer shrink-0"
                  disabled={actionBusy}
                  onClick={() => setShowTrashAlert(true)}
                  title="Mover para lixeira"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </DrawerFooter>
          )}
        </DrawerContent>
      </Drawer>

      {/* Cancelar */}
      <Dialog open={showCancelDialog} onOpenChange={(o) => { if (!o) setShowCancelDialog(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar tarefa</DialogTitle>
            <DialogDescription>Informe o motivo do cancelamento.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Field>
              <FieldLabel className="text-xs font-semibold">Motivo *</FieldLabel>
              <Textarea rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Descreva o motivo..." className="text-xs resize-none" />
            </Field>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>Voltar</Button>
            <Button variant="destructive" onClick={handleConfirmCancel} disabled={actionBusy || !cancelReason.trim()}>
              {actionBusy && <Spinner data-icon="inline-start" />}
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lixeira */}
      <AlertDialog open={showTrashAlert} onOpenChange={(o) => { if (!o) setShowTrashAlert(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover para a lixeira?</AlertDialogTitle>
            <AlertDialogDescription>
              A tarefa sairá da lista de atividades. Você poderá restaurá-la na lixeira.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowTrashAlert(false)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmTrash} disabled={actionBusy}>
              {actionBusy && <Spinner data-icon="inline-start" />}
              Mover para lixeira
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Aprovar / Rejeitar */}
      <Dialog open={approvalStep !== null} onOpenChange={(o) => { if (!o) { setApprovalStep(null); setApprovalNote(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {approvalStep?.decision === "APPROVED" ? "Aprovar entrega" : "Rejeitar entrega"}
            </DialogTitle>
            <DialogDescription>
              {approvalStep?.decision === "APPROVED"
                ? "Confirme a aprovação desta etapa."
                : "Informe o motivo da rejeição para o operador."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Field>
              <FieldLabel className="text-xs font-semibold">
                Observação {approvalStep?.decision === "REJECTED" ? "*" : "(opcional)"}
              </FieldLabel>
              <Textarea rows={3} value={approvalNote} onChange={(e) => setApprovalNote(e.target.value)} placeholder="Escreva uma observação..." className="text-xs resize-none" />
            </Field>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setApprovalStep(null); setApprovalNote(""); }}>Voltar</Button>
            <Button
              variant={approvalStep?.decision === "APPROVED" ? "default" : "destructive"}
              onClick={handleConfirmApproval}
              disabled={actionBusy || (approvalStep?.decision === "REJECTED" && !approvalNote.trim())}
              className={approvalStep?.decision === "APPROVED" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
            >
              {actionBusy && <Spinner data-icon="inline-start" />}
              {approvalStep?.decision === "APPROVED" ? "Confirmar aprovação" : "Confirmar rejeição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
