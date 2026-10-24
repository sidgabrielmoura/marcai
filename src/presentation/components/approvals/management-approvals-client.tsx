"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Search,
  Filter,
  Eye,
  FileCheck,
  ClipboardCheck,
  MapPin,
  Users,
  Calendar,
  ChevronRight,
  ImageIcon,
  FileText,
  ExternalLink,
  ShieldAlert,
  ArrowRight,
  Download,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { PageHeader, EmptyState } from "@/presentation/components/shared";
import { uiLabel } from "@/presentation/components/shared/ui-labels";
import { toast } from "@/components/ui/toast";
import { submitApprovalDecisionAction } from "@/presentation/actions/management-task-actions";
import { formatDateInTimezone, formatDateTimeInTimezone } from "@/domain/rules/date-time";

export interface ApprovalTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  criticality: string;
  locationId: string | null;
  locationName: string | null;
  teamId: string | null;
  teamName: string | null;
  processName: string | null;
  primaryAssignee: {
    id: string;
    name: string;
    email: string | null;
    avatarUrl: string | null;
  } | null;
  createdAt: string;
  deadlineAt: string | null;
  slaDueAt: string | null;
  timezone?: string;
  evidenceRequirements: Array<{
    id: string;
    type: string;
    label?: string;
    required: boolean;
    submissions: Array<{
      id: string;
      value: string | null;
      fileUrl?: string | null;
      publicId?: string | null;
      storageKey: string | null;
      validationStatus: string;
      createdAt: string;
    }>;
  }>;
  formFields?: any;
  formAnswers?: any;
  occurrences: Array<{
    id: string;
    type: string;
    category: string;
    reason: string;
    severity: string;
    createdAt: string;
  }>;
  approvalWorkflow: {
    id: string;
    mode: string;
    status: string;
    activeStepId: string | null;
    steps: Array<{
      id: string;
      sequence: number;
      status: string;
      deadlineAt: string | null;
      decisions: Array<{
        id: string;
        decision: string;
        note: string | null;
        decidedByName: string;
        createdAt: string;
      }>;
    }>;
  } | null;
}

interface ManagementApprovalsClientProps {
  tasks: ApprovalTask[];
  locations: Array<{ id: string; name: string }>;
  teams: Array<{ id: string; name: string }>;
  initialSelectedTaskId?: string;
  userRole: string;
}

export function ManagementApprovalsClient({
  tasks: initialTasks,
  locations,
  teams,
  initialSelectedTaskId,
  userRole,
}: ManagementApprovalsClientProps) {
  const router = useRouter();
  const [tasks, setTasks] = useState<ApprovalTask[]>(initialTasks);
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("ALL");
  const [teamFilter, setTeamFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");

  const [selectedTask, setSelectedTask] = useState<ApprovalTask | null>(() => {
    if (initialSelectedTaskId) {
      return initialTasks.find((t) => t.id === initialSelectedTaskId) || null;
    }
    return null;
  });

  // Estado para decisão de aprovação
  const [decisionModal, setDecisionModal] = useState<{
    task: ApprovalTask;
    stepId: string;
    decision: "APPROVED" | "REJECTED";
  } | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  // Imagem em lightbox / modal
  const [previewMedia, setPreviewMedia] = useState<{
    url: string;
    title: string;
  } | null>(null);

  // Filtragem
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTitle = task.title.toLowerCase().includes(q);
        const matchAssignee = task.primaryAssignee?.name.toLowerCase().includes(q);
        const matchProcess = task.processName?.toLowerCase().includes(q);
        const matchLocation = task.locationName?.toLowerCase().includes(q);
        if (!matchTitle && !matchAssignee && !matchProcess && !matchLocation) return false;
      }
      if (locationFilter !== "ALL" && task.locationId !== locationFilter) return false;
      if (teamFilter !== "ALL" && task.teamId !== teamFilter) return false;
      if (priorityFilter !== "ALL" && task.priority !== priorityFilter) return false;
      return true;
    });
  }, [tasks, search, locationFilter, teamFilter, priorityFilter]);

  // Contadores
  const criticalCount = useMemo(
    () => tasks.filter((t) => t.priority === "CRITICAL" || t.priority === "HIGH").length,
    [tasks],
  );
  const withEvidenceCount = useMemo(
    () =>
      tasks.filter((t) =>
        t.evidenceRequirements.some((r) => r.submissions.length > 0),
      ).length,
    [tasks],
  );

  async function handleConfirmDecision() {
    if (!decisionModal) return;
    const { task, stepId, decision } = decisionModal;

    if (decision === "REJECTED" && !decisionNote.trim()) {
      toast.add({
        title: "Motivo obrigatório",
        description: "Por favor, explique o motivo da rejeição ou o que precisa ser corrigido.",
        type: "error",
      });
      return;
    }

    setActionBusy(true);
    try {
      const result = await submitApprovalDecisionAction(
        stepId,
        decision,
        decisionNote.trim() || undefined,
      );

      if (result.error) {
        toast.add({
          title: "Erro ao registrar decisão",
          description: result.error,
          type: "error",
        });
      } else {
        toast.add({
          title: decision === "APPROVED" ? "Entrega aprovada!" : "Correção solicitada!",
          description:
            decision === "APPROVED"
              ? `A tarefa “${task.title}” foi aprovada com sucesso.`
              : `A tarefa “${task.title}” foi devolvida para correção pelo colaborador.`,
          type: decision === "APPROVED" ? "success" : "warning",
        });

        // Remove a tarefa da lista pendente se aprovada ou enviada para correção
        setTasks((prev) => prev.filter((t) => t.id !== task.id));
        if (selectedTask?.id === task.id) {
          setSelectedTask(null);
        }
        setDecisionModal(null);
        setDecisionNote("");
        router.refresh();
      }
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Ocorreu uma falha na comunicação. Tente novamente.",
        type: "error",
      });
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Tarefas aguardando aprovação"
        subtitle="Analise as evidências das tarefas entregues pelos colaboradores e decida pela aprovação ou solicitação de ajuste."
      />

      {/* Métricas do topo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-[var(--border-subtle)] bg-[var(--surface)]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Aguardando Decisão
              </p>
              <p className="text-2xl font-bold text-[var(--brand-900)] mt-1">{tasks.length}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
              <Clock size={22} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[var(--border-subtle)] bg-[var(--surface)]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Prioridade Alta / Crítica
              </p>
              <p className="text-2xl font-bold text-rose-600 mt-1">{criticalCount}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-200">
              <ShieldAlert size={22} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[var(--border-subtle)] bg-[var(--surface)]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Com Evidências Anexadas
              </p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{withEvidenceCount}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
              <FileCheck size={22} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between bg-[var(--surface)] p-3 rounded-xl border border-[var(--border-subtle)]">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            placeholder="Buscar por tarefa, colaborador ou processo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {locations.length > 0 && (
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="h-9 px-2.5 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--canvas)] text-[var(--text-primary)]"
            >
              <option value="ALL">Todas as unidades</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          )}

          {teams.length > 0 && (
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="h-9 px-2.5 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--canvas)] text-[var(--text-primary)]"
            >
              <option value="ALL">Todas as equipes</option>
              {teams.map((tm) => (
                <option key={tm.id} value={tm.id}>
                  {tm.name}
                </option>
              ))}
            </select>
          )}

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="h-9 px-2.5 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--canvas)] text-[var(--text-primary)]"
          >
            <option value="ALL">Todas as prioridades</option>
            <option value="CRITICAL">Crítica</option>
            <option value="HIGH">Alta</option>
            <option value="MEDIUM">Média</option>
            <option value="LOW">Baixa</option>
          </select>
        </div>
      </div>

      {/* Lista de Tarefas ou Estado Vazio */}
      {filteredTasks.length === 0 ? (
        <EmptyState
          title="Nenhuma aprovação pendente"
          description={
            search || locationFilter !== "ALL" || teamFilter !== "ALL" || priorityFilter !== "ALL"
              ? "Nenhuma tarefa corresponde aos filtros selecionados."
              : "Excelente! Todas as entregas foram analisadas e não há tarefas aguardando aprovação no momento."
          }
          icon={CheckCircle2}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredTasks.map((task) => {
            const activeStep =
              task.approvalWorkflow?.steps.find((s) => s.status === "PENDING") ||
              task.approvalWorkflow?.steps[0];
            const hasSubmissions = task.evidenceRequirements.some(
              (r) => r.submissions.length > 0,
            );
            const totalEvidenceRequired = task.evidenceRequirements.length;
            const evidenceSubmitted = task.evidenceRequirements.filter(
              (r) => r.submissions.length > 0,
            ).length;

            return (
              <Card
                key={task.id}
                className="border-[var(--border-subtle)] hover:border-[var(--brand-primary)] transition-all bg-[var(--surface)] hover:shadow-sm"
              >
                <CardContent className="p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <Badge
                        variant={
                          task.priority === "CRITICAL"
                            ? "destructive"
                            : task.priority === "HIGH"
                              ? "destructive"
                              : "secondary"
                        }
                        className="text-[10px] font-bold uppercase tracking-wider"
                      >
                        {uiLabel(task.priority)}
                      </Badge>

                      {task.processName && (
                        <Badge variant="outline" className="text-[10px] font-semibold text-[var(--brand-900)]">
                          {task.processName}
                        </Badge>
                      )}

                      <Badge variant="secondary" className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] font-semibold">
                        Aguardando Aprovação
                      </Badge>
                    </div>

                    <h3 className="text-base font-bold text-[var(--brand-900)] leading-snug">
                      {task.title}
                    </h3>

                    {task.description && (
                      <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">
                        {task.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-xs text-[var(--text-muted)]">
                      {task.primaryAssignee && (
                        <div className="flex items-center gap-1.5 text-[var(--text-primary)] font-medium">
                          <Avatar className="size-5">
                            <AvatarFallback className="bg-[var(--brand-soft)] text-[var(--brand-900)] text-[10px]">
                              {task.primaryAssignee.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span>{task.primaryAssignee.name}</span>
                        </div>
                      )}

                      {task.locationName && (
                        <div className="flex items-center gap-1">
                          <MapPin size={13} />
                          <span>{task.locationName}</span>
                        </div>
                      )}

                      {task.teamName && (
                        <div className="flex items-center gap-1">
                          <Users size={13} />
                          <span>{task.teamName}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-1">
                        <FileCheck size={13} className={hasSubmissions ? "text-emerald-600" : ""} />
                        <span>
                          {evidenceSubmitted}/{totalEvidenceRequired} evidências
                        </span>
                      </div>

                      {task.occurrences.length > 0 && (
                        <div className="flex items-center gap-1 text-amber-700 font-medium">
                          <AlertTriangle size={13} />
                          <span>{task.occurrences.length} ocorrência(s)</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Ações Diretas */}
                  <div className="flex flex-wrap md:flex-nowrap items-center gap-2 w-full md:w-auto shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-[var(--border-subtle)]">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedTask(task)}
                      className="flex-1 md:flex-initial text-xs h-9"
                    >
                      <Eye size={14} className="mr-1.5" />
                      Ver evidências
                    </Button>

                    {activeStep && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setDecisionModal({
                              task,
                              stepId: activeStep.id,
                              decision: "REJECTED",
                            });
                            setDecisionNote("");
                          }}
                          className="flex-1 md:flex-initial text-xs h-9 bg-rose-600 hover:bg-rose-700 text-white"
                        >
                          <XCircle size={14} className="mr-1.5" />
                          Recusar
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            setDecisionModal({
                              task,
                              stepId: activeStep.id,
                              decision: "APPROVED",
                            });
                            setDecisionNote("");
                          }}
                          className="flex-1 md:flex-initial text-xs h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                        >
                          <CheckCircle2 size={14} className="mr-1.5" />
                          Aprovar
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedTask && (
        <Dialog open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
          <DialogContent className="max-w-2xl! w-full! max-h-[90vh] overflow-y-auto p-6">
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <Badge
                  variant={selectedTask.priority === "CRITICAL" ? "destructive" : "secondary"}
                  className="text-[10px] font-bold"
                >
                  {uiLabel(selectedTask.priority)}
                </Badge>
                {selectedTask.processName && (
                  <Badge variant="outline" className="text-[10px]">
                    {selectedTask.processName}
                  </Badge>
                )}
                <Badge variant="secondary" className="bg-amber-100 text-amber-900 border-amber-300 text-[10px]">
                  Aguardando Aprovação
                </Badge>
              </div>
              <DialogTitle className="text-xl font-bold text-[var(--brand-900)]">
                {selectedTask.title}
              </DialogTitle>
              {selectedTask.description && (
                <DialogDescription className="text-xs text-[var(--text-secondary)] mt-1">
                  {selectedTask.description}
                </DialogDescription>
              )}
            </DialogHeader>

            <div className="space-y-5 py-2">
              {/* Informações da Entrega */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-[var(--canvas)] border border-[var(--border-subtle)] text-xs">
                <div>
                  <span className="text-[var(--text-muted)] block">Colaborador</span>
                  <span className="font-semibold text-[var(--brand-900)]">
                    {selectedTask.primaryAssignee?.name ?? "Não informado"}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)] block">Unidade</span>
                  <span className="font-semibold text-[var(--brand-900)]">
                    {selectedTask.locationName ?? "Geral"}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)] block">Equipe</span>
                  <span className="font-semibold text-[var(--brand-900)]">
                    {selectedTask.teamName ?? "Geral"}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)] block">Data de Criação</span>
                  <span className="font-semibold text-[var(--brand-900)]">
                    {formatDateInTimezone(selectedTask.createdAt, selectedTask.timezone)}
                  </span>
                </div>
                {selectedTask.deadlineAt && (
                  <div>
                    <span className="text-[var(--text-muted)] block">Prazo Final</span>
                    <span className="font-semibold text-[var(--brand-900)]">
                      {formatDateTimeInTimezone(selectedTask.deadlineAt, selectedTask.timezone)}
                    </span>
                  </div>
                )}
              </div>

              {/* Seção de Evidências */}
              <div>
                <h4 className="text-sm font-bold text-[var(--brand-900)] flex items-center gap-1.5 mb-2.5">
                  <FileCheck size={16} className="text-emerald-600" />
                  Evidências Entregues
                </h4>

                {selectedTask.evidenceRequirements.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] italic">
                    Nenhum requisito formal de evidência foi anexado a esta tarefa.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {selectedTask.evidenceRequirements.map((req) => (
                      <Card key={req.id} className="p-3 bg-[var(--surface)] border-[var(--border-subtle)] shadow-none">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-[var(--brand-900)] flex items-center gap-1.5">
                            {req.type === "PHOTO" && <ImageIcon size={14} className="text-blue-600" />}
                            {req.type === "SIGNATURE" && <FileText size={14} className="text-purple-600" />}
                            {req.type === "FILE" && <Download size={14} className="text-amber-600" />}
                            {uiLabel(req.type)}
                            {req.required && <span className="text-rose-500 font-bold">*</span>}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {req.submissions.length} envio(s)
                          </Badge>
                        </div>

                        {req.submissions.length === 0 ? (
                          <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                            Nenhuma evidência enviada pelo colaborador para este item.
                          </p>
                        ) : (
                          <div className="space-y-2 mt-2">
                            {req.submissions.map((sub, idx) => (
                              <div
                                key={sub.id}
                                className="flex items-center justify-between p-2 rounded-lg bg-[var(--canvas)] border border-[var(--border-subtle)] text-xs"
                              >
                                <div className="min-w-0 flex-1">
                                  {req.type === "PHOTO" && (sub.fileUrl || sub.value) ? (
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setPreviewMedia({
                                            url: (sub.fileUrl || sub.value)!,
                                            title: `Evidência de Foto - ${selectedTask.title}`,
                                          })
                                        }
                                        className="relative size-12 rounded-lg overflow-hidden border border-[var(--border-subtle)] shrink-0 hover:opacity-80 transition-opacity"
                                      >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={(sub.fileUrl || sub.value)!}
                                          alt="Evidência"
                                          className="size-full object-cover"
                                        />
                                      </button>
                                      <div className="min-w-0">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPreviewMedia({
                                              url: (sub.fileUrl || sub.value)!,
                                              title: `Evidência de Foto - ${selectedTask.title}`,
                                            })
                                          }
                                          className="font-medium text-blue-600 hover:underline block truncate text-left"
                                        >
                                          Ver foto ampliada #{idx + 1}
                                        </button>
                                        <span className="text-[10px] text-[var(--text-muted)] block">
                                          Enviado em {formatDateTimeInTimezone(sub.createdAt, selectedTask.timezone)}
                                        </span>
                                      </div>
                                    </div>
                                  ) : req.type === "SIGNATURE" && (sub.fileUrl || sub.value) ? (
                                    <div className="flex items-center gap-2">
                                      <div className="size-12 rounded-lg bg-white border border-[var(--border-subtle)] p-1 shrink-0">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={(sub.fileUrl || sub.value)!}
                                          alt="Assinatura"
                                          className="size-full object-contain"
                                        />
                                      </div>
                                      <div className="min-w-0">
                                        <span className="font-medium text-[var(--text-primary)] block">
                                          Assinatura Digital Coletada
                                        </span>
                                        <span className="text-[10px] text-[var(--text-muted)] block">
                                          Enviado em {formatDateTimeInTimezone(sub.createdAt, selectedTask.timezone)}
                                        </span>
                                      </div>
                                    </div>
                                  ) : (sub.fileUrl || sub.storageKey) ? (
                                    <div>
                                      <a
                                        href={sub.fileUrl || `/api/evidence/${sub.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-medium text-blue-600 hover:underline flex items-center gap-1"
                                      >
                                        <Download size={13} />
                                        Baixar {sub.value || "arquivo anexo"}
                                      </a>
                                      <span className="text-[10px] text-[var(--text-muted)] block">
                                        Enviado em {formatDateTimeInTimezone(sub.createdAt, selectedTask.timezone)}
                                      </span>
                                    </div>
                                  ) : (
                                    <div>
                                      <span className="font-medium text-[var(--text-primary)] block">
                                        {sub.value || "Evidência registrada"}
                                      </span>
                                      <span className="text-[10px] text-[var(--text-muted)] block">
                                        Enviado em {formatDateTimeInTimezone(sub.createdAt, selectedTask.timezone)}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Respostas de Formulário (se houver) */}
              {selectedTask.formAnswers && (
                <div>
                  <h4 className="text-sm font-bold text-[var(--brand-900)] flex items-center gap-1.5 mb-2">
                    <FileText size={16} className="text-indigo-600" />
                    Respostas do Formulário
                  </h4>
                  <div className="p-3 rounded-xl bg-[var(--canvas)] border border-[var(--border-subtle)] text-xs space-y-2">
                    {Object.entries(selectedTask.formAnswers).map(([key, val]) => {
                      const isFileObj = typeof val === "object" && val !== null && ("fileUrl" in (val as any) || "storageKey" in (val as any));
                      const fileUrl = isFileObj ? ((val as any).fileUrl || `/api/tasks/${selectedTask.id}/form-file/${key}`) : null;
                      const fileName = isFileObj ? ((val as any).fileName || (val as any).originalName || "Arquivo anexo") : null;
                      return (
                        <div key={key} className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[var(--border-subtle)] pb-1.5 last:border-b-0 last:pb-0">
                          <span className="text-[var(--text-muted)] font-medium">{key}</span>
                          {isFileObj ? (
                            <a
                              href={fileUrl!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold text-blue-600 hover:underline flex items-center gap-1"
                            >
                              <Download size={12} />
                              {fileName}
                            </a>
                          ) : (
                            <span className="font-semibold text-[var(--brand-900)]">
                              {typeof val === "object" ? JSON.stringify(val) : String(val)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Histórico do Fluxo de Aprovação */}
              {selectedTask.approvalWorkflow && (
                <div>
                  <h4 className="text-sm font-bold text-[var(--brand-900)] flex items-center gap-1.5 mb-2">
                    <ClipboardCheck size={16} className="text-amber-600" />
                    Etapas de Aprovação
                  </h4>

                  <div className="space-y-2">
                    {selectedTask.approvalWorkflow.steps.map((step) => (
                      <div
                        key={step.id}
                        className={`p-3 rounded-xl border text-xs ${step.status === "PENDING"
                          ? "bg-amber-50/60 border-amber-200"
                          : step.status === "APPROVED"
                            ? "bg-emerald-50/60 border-emerald-200"
                            : "bg-[var(--canvas)] border-[var(--border-subtle)]"
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[var(--brand-900)]">
                            Etapa {step.sequence}
                          </span>
                          <Badge
                            variant={
                              step.status === "APPROVED"
                                ? "default"
                                : step.status === "REJECTED"
                                  ? "destructive"
                                  : "secondary"
                            }
                            className={`text-[10px] ${step.status === "APPROVED"
                              ? "bg-emerald-600 text-white"
                              : step.status === "PENDING"
                                ? "bg-amber-200 text-amber-900"
                                : ""
                              }`}
                          >
                            {uiLabel(step.status)}
                          </Badge>
                        </div>

                        {step.decisions.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-[var(--border-subtle)] space-y-1">
                            {step.decisions.map((dec) => (
                              <div key={dec.id} className="text-[11px]">
                                <span className="font-semibold text-[var(--brand-900)]">
                                  {dec.decidedByName}:
                                </span>{" "}
                                <span className={dec.decision === "APPROVED" ? "text-emerald-700" : "text-rose-700"}>
                                  {dec.decision === "APPROVED" ? "Aprovou" : "Recusou"}
                                </span>
                                {dec.note && (
                                  <p className="mt-0.5 text-[var(--text-secondary)] italic bg-white p-1.5 rounded border border-[var(--border-subtle)]">
                                    “{dec.note}”
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-4 border-t border-[var(--border-subtle)]">
              <Button
                variant="outline"
                onClick={() => setSelectedTask(null)}
                className="w-full sm:w-auto"
              >
                Fechar
              </Button>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  variant="destructive"
                  onClick={() => {
                    const activeStep =
                      selectedTask.approvalWorkflow?.steps.find((s) => s.status === "PENDING") ||
                      selectedTask.approvalWorkflow?.steps[0];
                    if (activeStep) {
                      setDecisionModal({
                        task: selectedTask,
                        stepId: activeStep.id,
                        decision: "REJECTED",
                      });
                      setDecisionNote("");
                    }
                  }}
                  className="flex-1 sm:flex-initial bg-rose-600 hover:bg-rose-700 text-white text-xs h-9"
                >
                  <XCircle size={14} className="mr-1.5" />
                  Recusar entrega
                </Button>

                <Button
                  onClick={() => {
                    const activeStep =
                      selectedTask.approvalWorkflow?.steps.find((s) => s.status === "PENDING") ||
                      selectedTask.approvalWorkflow?.steps[0];
                    if (activeStep) {
                      setDecisionModal({
                        task: selectedTask,
                        stepId: activeStep.id,
                        decision: "APPROVED",
                      });
                      setDecisionNote("");
                    }
                  }}
                  className="flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 font-semibold"
                >
                  <CheckCircle2 size={14} className="mr-1.5" />
                  Aprovar entrega
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de Confirmação da Decisão (Aprovar / Recusar) */}
      {decisionModal && (
        <Dialog open={!!decisionModal} onOpenChange={(open) => !open && setDecisionModal(null)}>
          <DialogContent className="max-w-md p-6">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-[var(--brand-900)] flex items-center gap-2">
                {decisionModal.decision === "APPROVED" ? (
                  <>
                    <CheckCircle2 className="text-emerald-600 size-5" />
                    Confirmar Aprovação
                  </>
                ) : (
                  <>
                    <XCircle className="text-rose-600 size-5" />
                    Solicitar Correção / Recusar
                  </>
                )}
              </DialogTitle>
              <DialogDescription className="text-xs text-[var(--text-secondary)] mt-1">
                {decisionModal.decision === "APPROVED"
                  ? `Você está prestes a aprovar a entrega da tarefa “${decisionModal.task.title}”. O status será atualizado para concluído.`
                  : `A tarefa “${decisionModal.task.title}” será devolvida para o colaborador com status de Necessita Correção.`}
              </DialogDescription>
            </DialogHeader>

            <div className="py-3">
              <label className="text-xs font-semibold text-[var(--text-primary)] block mb-1.5">
                {decisionModal.decision === "REJECTED" ? (
                  <span>
                    Motivo da recusa / Orientações de correção <span className="text-rose-500">*</span>
                  </span>
                ) : (
                  "Observações adicionais (opcional)"
                )}
              </label>
              <Textarea
                rows={4}
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder={
                  decisionModal.decision === "REJECTED"
                    ? "Explique detalhadamente o que o colaborador precisa ajustar ou corrigir nesta entrega..."
                    : "Escreva uma observação ou elogio sobre a entrega se desejar..."
                }
                className="text-sm! resize-none"
              />
              {decisionModal.decision === "REJECTED" && !decisionNote.trim() && (
                <p className="text-[11px] text-rose-500 mt-1 font-medium">
                  É obrigatório informar o motivo da recusa para orientar o colaborador.
                </p>
              )}
            </div>

            <DialogFooter className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setDecisionModal(null)}
                disabled={actionBusy}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmDecision}
                disabled={actionBusy || (decisionModal.decision === "REJECTED" && !decisionNote.trim())}
                className={
                  decisionModal.decision === "APPROVED"
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                    : "bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
                }
              >
                {actionBusy
                  ? "Registrando..."
                  : decisionModal.decision === "APPROVED"
                    ? "Confirmar Aprovação"
                    : "Confirmar Recusa"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de Lightbox para fotos */}
      {previewMedia && (
        <Dialog open={!!previewMedia} onOpenChange={() => setPreviewMedia(null)}>
          <DialogContent className="max-w-3xl p-4 bg-black/95 border-none text-white">
            <DialogHeader className="mb-2">
              <DialogTitle className="text-sm font-semibold text-white/90">
                {previewMedia.title}
              </DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center max-h-[75vh] overflow-hidden rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewMedia.url}
                alt="Visualização ampliada"
                className="max-h-[75vh] w-auto max-w-full object-contain"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
