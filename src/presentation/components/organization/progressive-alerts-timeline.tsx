"use client";

import { useState, useRef, useMemo, type MouseEvent } from "react";
import {
  Clock,
  Plus,
  Users,
  UserCheck,
  ShieldAlert,
  Repeat,
  Trash2,
  Pencil,
} from "lucide-react";
import {
  type ProgressiveMilestone,
  type ProgressiveMilestoneTarget,
  DEFAULT_PROGRESSIVE_MILESTONES,
} from "@/domain/rules/progressive-milestones";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { Modal } from "@/presentation/components/shared/modal";
import { cn } from "@/lib/utils";

interface ProgressiveAlertsTimelineProps {
  initialMilestones: ProgressiveMilestone[];
  onChange?: (milestones: ProgressiveMilestone[]) => void;
}

const MILESTONE_OFFSET_OPTIONS = [
  { value: 5, label: "5 minutos" },
  { value: 10, label: "10 minutos" },
  { value: 15, label: "15 minutos" },
  { value: 20, label: "20 minutos" },
  { value: 25, label: "25 minutos" },
  { value: 30, label: "30 minutos" },
  { value: 45, label: "45 minutos" },
  { value: 60, label: "1 hora (60 min)" },
  { value: 90, label: "1 hora e 30 min" },
  { value: 120, label: "2 horas" },
  { value: 180, label: "3 horas" },
  { value: 240, label: "4 horas" },
  { value: 360, label: "6 horas" },
  { value: 480, label: "8 horas" },
  { value: 720, label: "12 horas" },
  { value: 1440, label: "24 horas (1 dia)" },
];

const REPEAT_INTERVAL_OPTIONS = [
  { value: 5, label: "A cada 5 minutos" },
  { value: 10, label: "A cada 10 minutos" },
  { value: 15, label: "A cada 15 minutos" },
  { value: 20, label: "A cada 20 minutos" },
  { value: 30, label: "A cada 30 minutos" },
  { value: 45, label: "A cada 45 minutos" },
  { value: 60, label: "A cada 1 hora" },
  { value: 120, label: "A cada 2 horas" },
];

function formatMinutesLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} minutos`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (remaining === 0) return `${hours} ${hours === 1 ? "hora" : "horas"}`;
  return `${hours}h ${remaining}min`;
}

export function ProgressiveAlertsTimeline({
  initialMilestones,
  onChange,
}: ProgressiveAlertsTimelineProps) {
  const [milestones, setMilestones] = useState<ProgressiveMilestone[]>(
    initialMilestones && initialMilestones.length > 0
      ? initialMilestones
      : DEFAULT_PROGRESSIVE_MILESTONES
  );

  // Estado do cursor magnético na timeline vertical (snap de 5 em 5 minutos)
  const [verticalHover, setVerticalHover] = useState<{
    visible: boolean;
    pixelY: number;
    percentage: number;
    snappedMinutes: number;
  }>({
    visible: false,
    pixelY: 0,
    percentage: 0,
    snappedMinutes: 15,
  });

  const verticalTrackRef = useRef<HTMLDivElement>(null);

  // Estado para o modal de criação/edição de marco
  const [editingMilestone, setEditingMilestone] = useState<{
    isOpen: boolean;
    isNew: boolean;
    id: string;
    stepIndex: number;
    title: string;
    offsetMinutes: number;
    target: ProgressiveMilestoneTarget;
    message: string;
    repeatCount: number;
    repeatIntervalMinutes: number;
  } | null>(null);

  const totalOffsetMinutes = useMemo(() => {
    return milestones.reduce((sum, m) => sum + m.offsetMinutes, 0);
  }, [milestones]);

  const timelineMaxMinutes = useMemo(() => {
    return Math.max(60, Math.ceil((totalOffsetMinutes + 20) / 15) * 15);
  }, [totalOffsetMinutes]);

  function updateMilestones(next: ProgressiveMilestone[]) {
    const reindexed = next.map((m, idx) => ({
      ...m,
      stepIndex: idx + 1,
    }));
    setMilestones(reindexed);
    onChange?.(reindexed);
  }

  // Manipulação do mouse na timeline vertical com snap magnético de 5 em 5 minutos
  function handleVerticalMouseMove(e: MouseEvent<HTMLDivElement>) {
    if (!verticalTrackRef.current) return;
    const rect = verticalTrackRef.current.getBoundingClientRect();
    const rawY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    const fraction = rawY / rect.height;
    const rawMinutes = fraction * timelineMaxMinutes;

    // Snap para múltiplos de 5 minutos
    const snappedMinutes = Math.max(5, Math.round(rawMinutes / 5) * 5);
    const snappedPercentage = Math.min(100, Math.max(0, (snappedMinutes / timelineMaxMinutes) * 100));

    setVerticalHover({
      visible: true,
      pixelY: rawY,
      percentage: snappedPercentage,
      snappedMinutes,
    });
  }

  function handleVerticalMouseLeave() {
    setVerticalHover((prev) => ({ ...prev, visible: false }));
  }

  function handleVerticalClick() {
    const minutes = verticalHover.snappedMinutes || 15;
    openCreateModal(minutes);
  }

  function openCreateModal(suggestedMinutes = 15) {
    const nextStep = milestones.length + 1;
    setEditingMilestone({
      isOpen: true,
      isNew: true,
      id: `m_${Date.now()}`,
      stepIndex: nextStep,
      title: `${nextStep}º Marco de Atraso`,
      offsetMinutes: suggestedMinutes,
      target: nextStep >= 3 ? "MANAGERS" : "BOTH",
      message:
        nextStep >= 3
          ? "Atraso crítico: intervenção da gestão necessária imediatamente."
          : "A tarefa excedeu a tolerância e requer atenção da equipe.",
      repeatCount: 1,
      repeatIntervalMinutes: 10,
    });
  }

  function openEditModal(milestone: ProgressiveMilestone) {
    setEditingMilestone({
      isOpen: true,
      isNew: false,
      id: milestone.id,
      stepIndex: milestone.stepIndex,
      title: milestone.title,
      offsetMinutes: milestone.offsetMinutes,
      target: milestone.target,
      message: milestone.message,
      repeatCount: milestone.repeatCount,
      repeatIntervalMinutes: milestone.repeatIntervalMinutes,
    });
  }

  function handleSaveMilestone() {
    if (!editingMilestone) return;

    if (editingMilestone.isNew) {
      const newMilestone: ProgressiveMilestone = {
        id: editingMilestone.id,
        stepIndex: editingMilestone.stepIndex,
        title: editingMilestone.title.trim() || `${editingMilestone.stepIndex}º Marco de Atraso`,
        offsetMinutes: Math.max(1, editingMilestone.offsetMinutes),
        target: editingMilestone.target,
        message: editingMilestone.message.trim() || "A tarefa excedeu a tolerância e requer atenção.",
        repeatCount: Math.max(0, editingMilestone.repeatCount),
        repeatIntervalMinutes: Math.max(1, editingMilestone.repeatIntervalMinutes),
      };
      updateMilestones([...milestones, newMilestone]);
    } else {
      const updated = milestones.map((m) =>
        m.id === editingMilestone.id
          ? {
            ...m,
            title: editingMilestone.title.trim() || m.title,
            offsetMinutes: Math.max(1, editingMilestone.offsetMinutes),
            target: editingMilestone.target,
            message: editingMilestone.message.trim() || m.message,
            repeatCount: Math.max(0, editingMilestone.repeatCount),
            repeatIntervalMinutes: Math.max(1, editingMilestone.repeatIntervalMinutes),
          }
          : m
      );
      updateMilestones(updated);
    }

    setEditingMilestone(null);
  }

  function handleDeleteMilestone(id: string) {
    if (milestones.length <= 1) return;
    const filtered = milestones.filter((m) => m.id !== id);
    updateMilestones(filtered);
  }

  // Minutos acumulados para sincronização retroativa
  const accumulatedDelays = useMemo(() => {
    let acc = 0;
    return milestones.map((m) => {
      acc += m.offsetMinutes;
      return acc;
    });
  }, [milestones]);

  return (
    <div className="flex flex-col gap-6">
      {/* Inputs ocultos para persistência no formData */}
      <input
        type="hidden"
        name="progressiveMilestones"
        value={JSON.stringify(milestones)}
      />
      <input
        type="hidden"
        name="delayMilestones"
        value={accumulatedDelays.join(",")}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/50">
        <div>
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Clock className="size-4 text-[var(--brand-700)]" />
            <span>Timeline Vertical de Alertas Progressivos</span>
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            A contagem de cada marco inicia estritamente após a conclusão da última repetição do marco anterior.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant="outline"
            className="text-xs font-medium border-border/60 bg-muted/30"
          >
            {milestones.length} {milestones.length === 1 ? "marco ativo" : "marcos ativos"}
          </Badge>
          <Button
            type="button"
            size="sm"
            onClick={() => openCreateModal(15)}
            className="bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-secondary)] text-xs h-8 shadow-none gap-1.5"
          >
            <Plus className="size-3.5" />
            <span>Adicionar marco</span>
          </Button>
        </div>
      </div>

      {/* Container Principal: Timeline Vertical na Esquerda + Cards na Direita */}
      <div className="relative flex flex-col pt-2 pb-2">
        {/* Linha vertical fininha conectando todos os marcos do topo até a bolinha final */}
        <div
          ref={verticalTrackRef}
          onMouseMove={handleVerticalMouseMove}
          onMouseLeave={handleVerticalMouseLeave}
          onClick={handleVerticalClick}
          className="absolute left-[15px] top-3 bottom-5 w-[2px] bg-slate-200 dark:bg-slate-700 cursor-pointer z-0 hover:bg-emerald-500/70 transition-colors"
          title="Passe o mouse pela linha e clique para adicionar um marco"
        >
          {/* Bolinha flutuante com Plus que salta de 5 em 5 minutos na vertical */}
          {verticalHover.visible && (
            <div
              style={{ top: `${verticalHover.percentage}%` }}
              className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 size-6 rounded-full bg-emerald-600 text-white border-2 border-white dark:border-slate-900 shadow-md z-30 flex items-center justify-center transition-all duration-75 pointer-events-none"
            >
              <Plus className="size-3 stroke-[3]" />

              {/* Tooltip flutuante lateral indicando o snap */}
              <div className="absolute left-8 px-2 py-0.5 rounded-md bg-slate-900 text-white text-[10px] font-semibold whitespace-nowrap shadow-md pointer-events-none flex items-center gap-1">
                <span>+{verticalHover.snappedMinutes} min</span>
              </div>
            </div>
          )}
        </div>

        {/* 1. Marco Zero: Término da Tolerância */}
        <div className="relative flex items-center gap-4 mb-6">
          {/* Ponto inicial discreto */}
          <div className="w-8 shrink-0 flex items-center justify-center z-10">
            <div className="size-2.5 rounded-full bg-slate-300 dark:bg-slate-600 ring-4 ring-slate-100 dark:ring-slate-800" />
          </div>

          {/* Rótulo de Início */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">
              Vencimento + Tolerância da Tarefa
            </span>
            <span className="text-[11px] text-muted-foreground font-mono bg-muted/40 px-2 py-0.5 rounded-md border border-border/40">
              0 min de atraso
            </span>
          </div>
        </div>

        {/* 2. Lista Vertical de Marcos: Ponto Minimalista Verde, Cards Minimalistas e Submarcos de Repetição */}
        <div className="flex flex-col gap-4">
          {milestones.map((milestone, idx) => {
            const isFirst = idx === 0;
            const targetLabel =
              milestone.target === "MANAGERS"
                ? "Apenas Gestores"
                : milestone.target === "OPERATORS"
                  ? "Apenas Operadores"
                  : "Gestores e Operadores";

            const repeats = Array.from(
              { length: milestone.repeatCount },
              (_, i) => i + 1
            );

            return (
              <div key={milestone.id} className="flex flex-col gap-2">
                {/* Marco Principal (Card Minimalista e Compacto) */}
                <div className="relative flex items-start gap-4 group">
                  {/* Ponto Minimalista Verde na Linha Vertical */}
                  <div className="w-8 shrink-0 flex flex-col items-center justify-center z-10 pt-2">
                    <div className="size-3 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20 border border-emerald-600 dark:border-emerald-400 shadow-2xs transition-transform group-hover:scale-125" />
                    <span className="mt-1 text-[10px] font-semibold text-muted-foreground font-mono">
                      +{milestone.offsetMinutes}m
                    </span>
                  </div>

                  {/* Card do Marco à Direita da Linha */}
                  <div className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl border border-border/80 bg-card hover:border-emerald-500/40 transition-all shadow-2xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <Badge
                          variant="outline"
                          className="text-[10px] font-semibold border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 px-1.5 py-0.5"
                        >
                          {milestone.stepIndex}º Marco
                        </Badge>

                        <h5 className="font-semibold text-xs sm:text-sm text-foreground truncate">
                          {milestone.title}
                        </h5>

                        <span className="text-[10px] text-muted-foreground font-mono bg-muted/40 px-1.5 py-0.5 rounded border border-border/40">
                          +{milestone.offsetMinutes} min {isFirst ? "após tolerância" : "após marco anterior"}
                        </span>

                        {/* Destinatário */}
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[10px] font-medium border gap-1 px-1.5 py-0.5",
                            milestone.target === "MANAGERS"
                              ? "bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300"
                              : milestone.target === "OPERATORS"
                                ? "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300"
                                : "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300"
                          )}
                        >
                          {milestone.target === "MANAGERS" ? (
                            <ShieldAlert className="size-2.5" />
                          ) : milestone.target === "OPERATORS" ? (
                            <UserCheck className="size-2.5" />
                          ) : (
                            <Users className="size-2.5" />
                          )}
                          <span>{targetLabel}</span>
                        </Badge>
                      </div>

                      {/* Botões de Ação */}
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(milestone)}
                          className="text-xs text-muted-foreground hover:text-foreground h-7 px-2 gap-1"
                        >
                          <Pencil className="size-3" />
                          <span className="hidden sm:inline">Editar</span>
                        </Button>

                        {milestones.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleDeleteMilestone(milestone.id)}
                            className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            title="Excluir marco"
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Mensagem Personalizada Discreta */}
                    {milestone.message && (
                      <p className="text-[11px] text-muted-foreground italic truncate mt-1">
                        &ldquo;{milestone.message}&rdquo;
                      </p>
                    )}
                  </div>
                </div>

                {/* Submarcos Menores para Representar Cada Repetição Configurada */}
                {repeats.map((repeatNum) => (
                  <div
                    key={`${milestone.id}_repeat_${repeatNum}`}
                    className="relative flex items-center gap-4 group"
                  >
                    {/* Subponto na Linha Vertical */}
                    <div className="w-8 shrink-0 flex flex-col items-center justify-center z-10">
                      <div className="size-2 rounded-full bg-emerald-400 dark:bg-emerald-500 ring-2 ring-emerald-500/20 border border-emerald-500" />
                      <span className="mt-0.5 text-[9px] font-mono text-muted-foreground/80">
                        +{milestone.repeatIntervalMinutes}m
                      </span>
                    </div>

                    {/* Card Menor do Submarco */}
                    <div className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-border/60 bg-muted/25 dark:bg-muted/15 hover:border-emerald-500/30 transition-all flex items-center justify-between gap-2 shadow-2xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <Repeat className="size-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span className="text-xs font-medium text-foreground">
                          {repeatNum}ª Repetição do {milestone.stepIndex}º Marco
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono bg-background/60 px-1.5 py-0.5 rounded border border-border/30">
                          +{milestone.repeatIntervalMinutes} min após {repeatNum === 1 ? "o marco" : "a repetição anterior"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-muted-foreground italic hidden md:inline">
                          Cancela se gestor acessar
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[9px] font-normal border-border/40 text-muted-foreground py-0 px-1.5"
                        >
                          {targetLabel}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* 3. Bolinha no Final da Linha para Adicionar Próximo Marco (sem botão de texto) */}
        <div className="relative flex items-center mt-4">
          <div className="w-8 shrink-0 flex items-center justify-center z-10">
            <button
              type="button"
              onClick={() => openCreateModal(15)}
              className="size-7 rounded-full border border-dashed border-emerald-500/70 hover:border-emerald-500 bg-emerald-50/60 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center transition-all cursor-pointer shadow-2xs group hover:scale-110"
              title="Adicionar próximo marco"
            >
              <Plus className="size-3.5 group-hover:rotate-90 transition-transform duration-200" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal Minimalista de Configuração do Marco */}
      {editingMilestone && editingMilestone.isOpen && (
        <Modal
          open
          title={editingMilestone.isNew ? "Novo marco de alerta" : "Editar marco de alerta"}
          onClose={() => setEditingMilestone(null)}
          className="sm:max-w-md p-5"
        >
          <div className="flex flex-col gap-4 pt-1">
            <Field>
              <FieldLabel className="text-xs font-semibold text-foreground">
                Título do marco
              </FieldLabel>
              <Input
                value={editingMilestone.title}
                onChange={(e) =>
                  setEditingMilestone((prev) =>
                    prev ? { ...prev, title: e.target.value } : null
                  )
                }
                placeholder="Ex: 1º Marco: Início do atraso"
                className="text-xs h-9 bg-muted/20"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel className="text-xs font-semibold text-foreground">
                  Tempo após o término anterior
                </FieldLabel>
                <select
                  value={editingMilestone.offsetMinutes}
                  onChange={(e) =>
                    setEditingMilestone((prev) =>
                      prev
                        ? { ...prev, offsetMinutes: Number(e.target.value) || 15 }
                        : null
                    )
                  }
                  className="w-full h-9 rounded-md border border-input bg-muted/20 px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {!MILESTONE_OFFSET_OPTIONS.some((opt) => opt.value === editingMilestone.offsetMinutes) && (
                    <option value={editingMilestone.offsetMinutes}>
                      {formatMinutesLabel(editingMilestone.offsetMinutes)}
                    </option>
                  )}
                  {MILESTONE_OFFSET_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field>
                <FieldLabel className="text-xs font-semibold text-foreground">
                  Destinatários
                </FieldLabel>
                <select
                  value={editingMilestone.target}
                  onChange={(e) =>
                    setEditingMilestone((prev) =>
                      prev
                        ? {
                          ...prev,
                          target: e.target.value as ProgressiveMilestoneTarget,
                        }
                        : null
                    )
                  }
                  className="w-full h-9 rounded-md border border-input bg-muted/20 px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="BOTH">Gestores e Operadores</option>
                  <option value="MANAGERS">Apenas Gestores</option>
                  <option value="OPERATORS">Apenas Operadores</option>
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel className="text-xs font-semibold text-foreground">
                  Quantidade de repetições
                </FieldLabel>
                <select
                  value={editingMilestone.repeatCount}
                  onChange={(e) =>
                    setEditingMilestone((prev) =>
                      prev ? { ...prev, repeatCount: Number(e.target.value) } : null
                    )
                  }
                  className="w-full h-9 rounded-md border border-input bg-muted/20 px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value={0}>Sem repetição (disparo único)</option>
                  <option value={1}>Repetir 1 vez</option>
                  <option value={2}>Repetir 2 vezes</option>
                  <option value={3}>Repetir 3 vezes</option>
                  <option value={5}>Repetir 5 vezes</option>
                </select>
              </Field>

              <Field>
                <FieldLabel className="text-xs font-semibold text-foreground">
                  Intervalo entre repetições
                </FieldLabel>
                <select
                  disabled={editingMilestone.repeatCount === 0}
                  value={editingMilestone.repeatIntervalMinutes}
                  onChange={(e) =>
                    setEditingMilestone((prev) =>
                      prev
                        ? {
                          ...prev,
                          repeatIntervalMinutes: Number(e.target.value) || 10,
                        }
                        : null
                    )
                  }
                  className="w-full h-9 rounded-md border border-input bg-muted/20 px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {!REPEAT_INTERVAL_OPTIONS.some((opt) => opt.value === editingMilestone.repeatIntervalMinutes) && (
                    <option value={editingMilestone.repeatIntervalMinutes}>
                      A cada {formatMinutesLabel(editingMilestone.repeatIntervalMinutes)}
                    </option>
                  )}
                  {REPEAT_INTERVAL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field>
              <FieldLabel className="text-xs font-semibold text-foreground">
                Mensagem do alerta
              </FieldLabel>
              <Textarea
                rows={3}
                value={editingMilestone.message}
                onChange={(e) =>
                  setEditingMilestone((prev) =>
                    prev ? { ...prev, message: e.target.value } : null
                  )
                }
                placeholder="Informe a mensagem personalizada enviada no alerta..."
                className="text-xs resize-none bg-muted/20"
              />
            </Field>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/40 mt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditingMilestone(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveMilestone}
                className="bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-secondary)] text-xs shadow-none"
              >
                Salvar marco
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
