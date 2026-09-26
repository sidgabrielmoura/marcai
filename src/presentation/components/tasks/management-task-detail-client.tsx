"use client";

import { useState } from "react";
import { canEditTaskDefinition } from "@/domain/rules/task-edit";
import { EditTaskDialog } from "./edit-task-dialog";
import { useRouter } from "next/navigation";
import {
  Clock,
  User,
  Pause,
  Play,
  Trash2,
  Camera,
  History,
  AlertCircle,
} from "lucide-react";
import {
  transferTaskAction,
  pauseTaskAction,
  resumeTaskAction,
  cancelTaskAction,
  trashTaskAction,
  submitApprovalDecisionAction,
} from "@/presentation/actions/management-task-actions";
import { uiLabel } from "../shared/ui-labels";

import {
  PageHeader,
  StatusBadge,
  PriorityBadge,
} from "@/presentation/components/shared";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Spinner } from "@/components/ui/spinner";

interface ManagementTaskDetailProps {
  task: {
    id: string;
    title: string;
    description: string | null;
    instructions: string | null;
    origin: string;
    status: string;
    startedAt: Date | string | null;
    priority: string;
    criticality: string;
    required: boolean;
    deadlineAt: Date | string | null;
    slaDurationMinutes: number | null;
    slaDueAt: Date | string | null;
    slaExceededAt: Date | string | null;
    estimatedDuration: number | null;
    actualDuration: number | null;
    locationName: string | null;
    teamName: string | null;
    assignments: Array<{
      id: string;
      memberId: string;
      memberName: string;
      memberEmail: string | null;
      type: string;
      assignedAt: Date | string;
    }>;
    evidenceRequirements: Array<{
      id: string;
      type: string;
      required: boolean;
      executionStage: string;
      submissions: Array<{
        id: string;
        value: string | null;
        storageKey: string | null;
        validationStatus: string;
        attemptNumber: number;
        createdAt: Date | string;
      }>;
    }>;
    dependencies: Array<{
      id: string;
      type: string;
      logic: string;
      dependsOnTask: {
        id: string;
        title: string;
        status: string;
      };
    }>;
    pauses: Array<{
      id: string;
      reasonCategoryId: string | null;
      note: string | null;
      startedAt: Date | string;
      endedAt: Date | string | null;
    }>;
    occurrences: Array<{
      id: string;
      type: string;
      category: string;
      reason: string;
      severity: string;
      createdAt: Date | string;
    }>;
    activityLogs: Array<{
      id: string;
      action: string;
      actorName: string | null;
      createdAt: Date | string;
      metadata: any;
    }>;
    approvalWorkflow?: {
      id: string;
      mode: string;
      status: string;
      steps: Array<{
        id: string;
        sequence: number;
        status: string;
        canDecide: boolean;
        decisions: Array<{
          id: string;
          decision: string;
          note: string | null;
          decidedBy: string;
          createdAt: Date | string;
        }>;
      }>;
    } | null;
  };
  availableMembers: Array<{ id: string; name: string; email: string | null }>;
  userRole: string;
}

export function ManagementTaskDetailClient({
  task,
  availableMembers,
  userRole,
}: ManagementTaskDetailProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modais de Controle
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState("");

  const [showTrashAlert, setShowTrashAlert] = useState(false);

  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [pauseReason, setPauseReason] = useState("SUPRIMENTOS");

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const [approvalStep, setApprovalStep] = useState<{
    stepId: string;
    decision: "APPROVED" | "REJECTED";
  } | null>(null);
  const [approvalNote, setApprovalNote] = useState("");

  const primaryAssignment = task.assignments.find((a) => a.type === "PRIMARY");

  const availableMemberItems = availableMembers.map((m) => ({
    label: `${m.name} (${m.email || "PIN"})`,
    value: m.id,
  }));

  async function handleTransfer() {
    if (!selectedMemberId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await transferTaskAction(task.id, selectedMemberId);
      if (res.error) setErrorMsg(res.error);
      else {
        setShowTransferModal(false);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmPause() {
    if (!pauseReason.trim()) return;
    setLoading(true);
    try {
      const res = await pauseTaskAction(task.id, pauseReason.trim());
      if (res.error) setErrorMsg(res.error);
      else {
        setShowPauseDialog(false);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResume() {
    setLoading(true);
    try {
      const res = await resumeTaskAction(task.id);
      if (res.error) setErrorMsg(res.error);
      else router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmCancel() {
    if (!cancelReason.trim()) return;
    setLoading(true);
    try {
      const res = await cancelTaskAction(task.id, cancelReason.trim());
      if (res.error) setErrorMsg(res.error);
      else {
        setShowCancelDialog(false);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmTrash() {
    setLoading(true);
    try {
      const res = await trashTaskAction(task.id);
      if (res.error) setErrorMsg(res.error);
      else router.push("/management/tasks");
    } finally {
      setLoading(false);
      setShowTrashAlert(false);
    }
  }

  async function handleConfirmApproval() {
    if (!approvalStep) return;
    setLoading(true);
    try {
      const res = await submitApprovalDecisionAction(
        approvalStep.stepId,
        approvalStep.decision,
        approvalNote.trim() || undefined,
      );
      if (res.error) setErrorMsg(res.error);
      else {
        setApprovalStep(null);
        setApprovalNote("");
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title={task.title}
        backHref="/management/tasks"
        backLabel="Voltar para tarefas"
        action={
          userRole !== "EMPLOYEE" ? (
            <div className="flex flex-wrap items-center gap-2">
              {canEditTaskDefinition(task) && <Button variant="outline" disabled={loading} onClick={() => setShowEditDialog(true)}>Editar tarefa</Button>}
              {task.status === "IN_PROGRESS" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPauseDialog(true)}
                  disabled={loading}
                  className="h-10 px-3.5 rounded-[12px] bg-amber-50 text-amber-900 border-amber-200 text-[length:var(--type-label)] font-semibold hover:bg-amber-100 flex items-center gap-1.5"
                >
                  <Pause data-icon="inline-start" className="size-3.5" />
                  <span>Pausar</span>
                </Button>
              )}

              {task.status === "PAUSED" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResume}
                  disabled={loading}
                  className="h-10 px-3.5 rounded-[12px] bg-emerald-50 text-emerald-900 border-emerald-200 text-[length:var(--type-label)] font-semibold hover:bg-emerald-100 flex items-center gap-1.5"
                >
                  <Play data-icon="inline-start" className="size-3.5" />
                  <span>Retomar</span>
                </Button>
              )}

              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCancelDialog(true)}
                disabled={loading || ["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(task.status)}
                className="h-10 px-3.5 rounded-[12px] bg-[var(--surface)] border-[var(--border-subtle)] text-[var(--brand-900)] text-[length:var(--type-label)] font-semibold hover:bg-[var(--canvas)]"
              >
                Cancelar
              </Button>

              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowTrashAlert(true)}
                disabled={loading}
                className="size-10 rounded-[12px] bg-red-50 text-red-700 border-red-200 hover:bg-red-100 flex items-center justify-center"
                title="Mover para a lixeira"
                aria-label="Mover para a lixeira"
              >
                <Trash2 data-icon="inline-start" className="size-4" />
              </Button>
            </div>
          ) : undefined
        }
      />

      {showEditDialog && <EditTaskDialog task={task} onClose={() => setShowEditDialog(false)} />}

      {errorMsg && (
        <Alert variant="destructive" className="rounded-[14px]">
          <AlertCircle data-icon="inline-start" />
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}

      <Card className="bg-[var(--surface)] rounded-[18px] p-5 shadow-none border-[var(--border-subtle)]">
        <div className="flex flex-wrap justify-between  items-center gap-2 mb-3">
          <div className="flex items-center gap-2">
            <StatusBadge status={task.status} size="sm" showIcon />
            <PriorityBadge priority={task.priority} size="sm" className="w-fit! flex-none!" />
          </div>
          <Badge
            variant="secondary"
            className="text-(length:--type-caption) font-semibold"
          >
            {task.origin === "PROCESS" ? "Processo" : "Tarefa avulsa"}
          </Badge>
        </div>

        <h2 className="text-[var(--text-primary)] mb-2 text-[length:var(--type-section-title)] font-bold">
          Sobre esta tarefa
        </h2>
        {task.description && (
          <p className="text-[length:var(--type-label)] text-[var(--text-secondary)] leading-relaxed mb-4">
            {task.description}
          </p>
        )}

        {/* Metadados de Localização, Prazo e SLA */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-[var(--border-subtle)] text-[length:var(--type-label)]">
          <div>
            <span className="text-[length:var(--type-caption)] uppercase font-semibold text-[var(--text-secondary)] block">
              Unidade
            </span>
            <span className="font-semibold text-[var(--brand-900)]">
              {task.locationName || "Sem unidade"}
            </span>
          </div>

          <div>
            <span className="text-[length:var(--type-caption)] uppercase font-semibold text-[var(--text-secondary)] block">
              Equipe
            </span>
            <span className="font-semibold text-[var(--brand-900)]">
              {task.teamName || "Sem equipe"}
            </span>
          </div>

          <div>
            <span className="text-[length:var(--type-caption)] uppercase font-semibold text-[var(--text-secondary)] block">
              Prazo final
            </span>
            <span className="font-semibold text-[var(--brand-900)]">
              {task.deadlineAt
                ? new Date(task.deadlineAt).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })
                : "Sem prazo fixo"}
            </span>
          </div>

          <div>
            <span className="text-[length:var(--type-caption)] uppercase font-semibold text-[var(--text-secondary)] block">
              Tempo limite (SLA)
            </span>
            <span className="font-semibold text-[var(--brand-900)]">
              {task.slaDurationMinutes
                ? `${task.slaDurationMinutes} min`
                : "Não configurado"}
            </span>
          </div>
        </div>
      </Card>

      <Card className="bg-[var(--surface)] rounded-[18px] p-5 shadow-none border-[var(--border-subtle)]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[var(--text-secondary)] text-[length:var(--type-card-title)] font-bold">
            Responsáveis
          </h3>
          {userRole !== "EMPLOYEE" && !["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(task.status) && (
            <Button
              type="button"
              variant="link"
              onClick={() => setShowTransferModal(true)}
              className="text-[length:var(--type-label)] font-semibold text-[var(--brand-700)] p-0 h-auto"
            >
              Alterar responsável
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between p-3 rounded-[14px] bg-[var(--canvas)] border border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[var(--brand-900)] text-white">
              <User className="size-4" />
            </div>
            <div>
              <div className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                {primaryAssignment?.memberName ||
                  "Nenhum responsável atribuído"}
              </div>
              <div className="text-[length:var(--type-caption)] text-[var(--text-secondary)]">
                {primaryAssignment?.memberEmail ||
                  "Aguardando definição do responsável"}
              </div>
            </div>
          </div>
          <Badge className="text-(length:--type-caption) font-semibold px-2 py-0.5 capitalize text-xs p-3 rounded-full text-white border-transparent">
            Responsável principal
          </Badge>
        </div>
      </Card>

      {/* Instruções de Execução */}
      {task.instructions && (
        <Card className="bg-[var(--surface)] rounded-[18px] p-5 shadow-none border-[var(--border-subtle)]">
          <h3 className="text-[var(--text-secondary)] mb-2 text-[length:var(--type-card-title)] font-bold">
            Instruções
          </h3>
          <div className="text-[length:var(--type-label)] text-[var(--brand-900)] bg-[var(--canvas)] p-3 rounded-[14px] border border-[var(--border-subtle)] whitespace-pre-line leading-relaxed">
            {task.instructions}
          </div>
        </Card>
      )}

      {/* Evidências Coletadas */}
      <Card className="bg-[var(--surface)] rounded-[18px] p-5 shadow-none border-[var(--border-subtle)]">
        <h3 className="text-[var(--text-secondary)] mb-3 text-[length:var(--type-card-title)] font-bold">
          Evidências
        </h3>

        {task.evidenceRequirements.length === 0 ? (
          <p className="text-[length:var(--type-label)] text-[var(--text-secondary)]">
            Esta tarefa não exige evidências.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {task.evidenceRequirements.map((req) => (
              <Card
                key={req.id}
                className="p-3.5 rounded-[16px] bg-[var(--canvas)] border-[var(--border-subtle)] shadow-none"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Camera className="size-4 text-[var(--brand-700)]" />
                    <span className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                      {uiLabel(req.type)}
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[length:var(--type-caption)] font-semibold px-2 py-0.5 rounded-full bg-[var(--surface)] border-[var(--border-subtle)] text-[var(--brand-900)]"
                  >
                    {({ START: "Antes de iniciar", DURING: "Durante a execução", COMPLETION: "Para concluir" } as Record<string, string>)[req.executionStage] || req.executionStage}
                  </Badge>
                </div>

                <div className="flex flex-col gap-1.5 mt-2">
                  {req.submissions.length === 0 ? (
                    <span className="text-[length:var(--type-label)] text-amber-800 font-medium">
                      Aguardando envio do colaborador.
                    </span>
                  ) : (
                    req.submissions.map((sub) => (
                      <Card
                        key={sub.id}
                        className="flex items-center justify-between p-2 rounded-[10px] bg-[var(--surface)] border-[var(--border-subtle)] text-[length:var(--type-label)] shadow-none"
                      >
                        <div>
                          <span className="font-semibold text-[var(--brand-900)]">
                            {sub.storageKey ? <a className="underline" href={`/api/evidence/${sub.id}`}>Baixar {sub.value || "arquivo"}</a> : sub.value || "Evidência enviada"}
                          </span>
                          <span className="text-[length:var(--type-caption)] text-[var(--text-secondary)] block">
                            Tentativa #{sub.attemptNumber} •{" "}
                            {new Date(sub.createdAt).toLocaleTimeString(
                              "pt-BR",
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </span>
                        </div>
                        <Badge
                          variant={
                            sub.validationStatus === "VALID"
                              ? "default"
                              : "destructive"
                          }
                          className={`text-[length:var(--type-caption)] font-semibold px-2 py-0.5 rounded-full ${sub.validationStatus === "VALID"
                            ? "bg-emerald-100 text-emerald-900 border-transparent"
                            : "bg-red-100 text-red-900 border-transparent"
                            }`}
                        >
                          {sub.validationStatus === "VALID" ? "Validada" : "Rejeitada"}
                        </Badge>
                      </Card>
                    ))
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>

      {/* Dependências Operacionais */}
      <Card className="bg-[var(--surface)] rounded-[18px] p-5 shadow-none border-[var(--border-subtle)]">
        <h3 className="text-[var(--text-secondary)] mb-3 text-[length:var(--type-card-title)] font-bold">
          Etapas anteriores
        </h3>

        {task.dependencies.length === 0 ? (
          <p className="text-[length:var(--type-label)] text-[var(--text-secondary)]">
            Esta tarefa pode começar sem aguardar outras etapas.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {task.dependencies.map((dep) => (
              <Card
                key={dep.id}
                className="flex items-center justify-between p-3 rounded-[12px] bg-[var(--canvas)] border-[var(--border-subtle)] text-[length:var(--type-label)] shadow-none"
              >
                <div>
                  <div className="font-semibold text-[var(--brand-900)]">
                    Depende de: {dep.dependsOnTask.title}
                  </div>
                  <div className="text-[length:var(--type-caption)] text-[var(--text-secondary)]">
                    {uiLabel(dep.type)} ·{" "}
                    {dep.logic === "AND"
                      ? "Todas as dependências"
                      : "Uma das dependências"}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className="text-[length:var(--type-caption)] font-semibold px-2 py-0.5 rounded-full bg-[var(--surface)] text-[var(--brand-900)] border-[var(--border-subtle)]"
                >
                  {uiLabel(dep.dependsOnTask.status)}
                </Badge>
              </Card>
            ))}
          </div>
        )}
      </Card>

      {/* Fluxo de Aprovação */}
      {task.approvalWorkflow && (
        <Card className="bg-[var(--surface)] rounded-[18px] p-5 shadow-none border-[var(--border-subtle)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[var(--text-secondary)] text-[length:var(--type-card-title)] font-bold">
              Aprovações
            </h3>
            <Badge
              variant="secondary"
              className="text-[length:var(--type-label)] font-semibold px-2 py-0.5 rounded-full bg-[var(--brand-soft)] text-[var(--brand-900)] border-transparent"
            >
              {uiLabel(task.approvalWorkflow.status)}
            </Badge>
          </div>

          <div className="flex flex-col gap-2.5">
            {task.approvalWorkflow.steps.map((step) => (
              <Card
                key={step.id}
                className="p-3 rounded-[14px] bg-[var(--canvas)] border-[var(--border-subtle)] flex items-center justify-between text-[length:var(--type-label)] shadow-none"
              >
                <div>
                  <span className="font-semibold text-[var(--brand-900)]">
                    Etapa {step.sequence} · {uiLabel(step.status)}
                  </span>
                </div>

                {step.canDecide && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        setApprovalStep({
                          stepId: step.id,
                          decision: "APPROVED",
                        })
                      }
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      Aprovar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        setApprovalStep({
                          stepId: step.id,
                          decision: "REJECTED",
                        })
                      }
                      className="bg-rose-600 text-white hover:bg-rose-700"
                    >
                      Solicitar correção
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </Card>
      )}

      {/* Histórico de Pausas e Ocorrências */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Pausas */}
        <Card className="bg-[var(--surface)] rounded-[18px] p-5 shadow-none border-[var(--border-subtle)]">
          <h3 className="text-[var(--text-secondary)] mb-2 text-[length:var(--type-card-title)] font-bold">
            Pausas
          </h3>
          {task.pauses.length === 0 ? (
            <p className="text-[length:var(--type-label)] text-[var(--text-secondary)]">
              Nenhuma pausa registrada.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {task.pauses.map((p) => (
                <Card
                  key={p.id}
                  className="p-2.5 rounded-[12px] bg-[var(--canvas)] border-[var(--border-subtle)] text-[length:var(--type-label)] shadow-none"
                >
                  <div className="font-semibold text-[var(--brand-900)]">
                    {p.reasonCategoryId || "Geral"}
                  </div>
                  {p.note && (
                    <div className="text-[length:var(--type-caption)] text-[var(--text-secondary)]">
                      {p.note}
                    </div>
                  )}
                  <div className="text-[length:var(--type-caption)] text-[var(--brand-700)] mt-1">
                    Início: {new Date(p.startedAt).toLocaleTimeString("pt-BR")}
                    {p.endedAt
                      ? ` • Fim: ${new Date(p.endedAt).toLocaleTimeString("pt-BR")}`
                      : " (Em curso)"}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Card>

        {/* Ocorrências */}
        <Card className="bg-[var(--surface)] rounded-[18px] p-5 shadow-none border-[var(--border-subtle)]">
          <h3 className="text-[var(--text-secondary)] mb-2 text-[length:var(--type-card-title)] font-bold">
            Ocorrências
          </h3>
          {task.occurrences.length === 0 ? (
            <p className="text-[length:var(--type-label)] text-[var(--text-secondary)]">
              Nenhuma ocorrência ou impedimento.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {task.occurrences.map((oc) => (
                <Card
                  key={oc.id}
                  className="p-2.5 rounded-[12px] bg-rose-50 border-rose-200 text-[length:var(--type-label)] text-rose-900 shadow-none"
                >
                  <div className="font-semibold">
                    [{oc.type}] {oc.category}
                  </div>
                  <div className="text-[length:var(--type-caption)] mt-0.5">
                    {oc.reason}
                  </div>
                  <Badge
                    variant="destructive"
                    className="text-[length:var(--type-caption)] font-semibold uppercase mt-1 w-fit"
                  >
                    Severidade: {oc.severity}
                  </Badge>
                </Card>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Auditoria Append-Only */}
      <Card className="bg-[var(--surface)] rounded-[18px] p-5 shadow-none border-[var(--border-subtle)]">
        <h3 className="text-[var(--text-secondary)] mb-3 flex items-center gap-1.5 text-[length:var(--type-card-title)] font-bold">
          <History className="size-4" />
          <span>Histórico de atividades</span>
        </h3>

        <div className="flex flex-col divide-y divide-[var(--border-subtle)] text-[length:var(--type-label)]">
          {task.activityLogs.map((log) => (
            <div
              key={log.id}
              className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between"
            >
              <div>
                <span className="font-semibold text-[var(--brand-900)]">
                  {uiLabel(log.action)}
                </span>
                <span className="text-[length:var(--type-caption)] text-[var(--text-secondary)] block">
                  Por: {log.actorName || "Sistema"}
                </span>
              </div>
              <span className="text-[length:var(--type-caption)] text-[var(--text-secondary)] font-mono">
                {new Date(log.createdAt).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Dialog open={showTransferModal} onOpenChange={setShowTransferModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar responsável</DialogTitle>
            <DialogDescription>
              Selecione um membro da equipe com acesso autorizado à unidade. O
              histórico anterior será preservado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Field>
              <FieldLabel className="text-(length:--type-label) font-semibold text-brand-900">
                Colaborador
              </FieldLabel>
              <Select
                items={availableMemberItems}
                value={selectedMemberId}
                onValueChange={(val) => {
                  if (val) setSelectedMemberId(val);
                }}
              >
                <SelectTrigger className="w-full text-(length:--type-label)">
                  <SelectValue placeholder="Selecione um colaborador..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup >
                    {availableMemberItems.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowTransferModal(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleTransfer}
              disabled={!selectedMemberId || loading}
            >
              {loading ? <Spinner data-icon="inline-start" /> : null}
              <span>Alterar responsável</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: PAUSAR TAREFA */}
      <Dialog open={showPauseDialog} onOpenChange={setShowPauseDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pausar tarefa</DialogTitle>
            <DialogDescription>
              Informe o motivo da pausa. Ele ficará registrado no histórico.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Field>
              <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                Motivo da pausa
              </FieldLabel>
              <Input
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                placeholder="Ex.: aguardando material"
                className="text-[length:var(--type-label)]"
              />
            </Field>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPauseDialog(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmPause}
              disabled={loading || !pauseReason.trim()}
            >
              {loading ? <Spinner data-icon="inline-start" /> : null}
              <span>Pausar tarefa</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: CANCELAR TAREFA */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar tarefa</DialogTitle>
            <DialogDescription>
              Explique por que a tarefa será cancelada. O motivo ficará no
              histórico.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Field>
              <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                Justificativa *
              </FieldLabel>
              <Textarea
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Descreva o motivo do cancelamento..."
                className="text-[length:var(--type-label)] resize-none"
              />
            </Field>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCancelDialog(false)}
            >
              Voltar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmCancel}
              disabled={loading || !cancelReason.trim()}
            >
              {loading ? <Spinner data-icon="inline-start" /> : null}
              <span>Cancelar tarefa</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: DECISÃO DE APROVAÇÃO */}
      <Dialog
        open={approvalStep !== null}
        onOpenChange={(open) => {
          if (!open) setApprovalStep(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {approvalStep?.decision === "APPROVED"
                ? "Aprovar etapa"
                : "Solicitar correção"}
            </DialogTitle>
            <DialogDescription>
              {approvalStep?.decision === "APPROVED"
                ? "Confirme a aprovação da etapa. Você pode incluir uma nota opcional."
                : "Descreva o que precisa ser corrigido antes da aprovação."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Field>
              <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                Observações
              </FieldLabel>
              <Textarea
                rows={3}
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder="Adicione uma observação, se necessário"
                className="text-[length:var(--type-label)] resize-none"
              />
            </Field>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setApprovalStep(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className={
                approvalStep?.decision === "APPROVED"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : ""
              }
              variant={
                approvalStep?.decision === "APPROVED"
                  ? "default"
                  : "destructive"
              }
              onClick={handleConfirmApproval}
              disabled={loading}
            >
              {loading ? <Spinner data-icon="inline-start" /> : null}
              <span>
                {approvalStep?.decision === "APPROVED"
                  ? "Aprovar etapa"
                  : "Solicitar correção"}
              </span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ALERT DIALOG: MOVER PARA LIXEIRA */}
      <AlertDialog open={showTrashAlert} onOpenChange={setShowTrashAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover tarefa para a lixeira?</AlertDialogTitle>
            <AlertDialogDescription>
              A tarefa sairá da lista de atividades. Você poderá restaurá-la na
              lixeira.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmTrash}
              disabled={loading}
            >
              {loading ? <Spinner data-icon="inline-start" /> : null}
              <span>Mover para a lixeira</span>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
