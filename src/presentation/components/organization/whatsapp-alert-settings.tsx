"use client";

import {
  MessageSquare,
  Bell,
  Clock,
  AlertTriangle,
  SlidersHorizontal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

interface WhatsAppAlertSettingsProps {
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  events: string[];
  onEventsChange: (value: string[]) => void;
  criticality: string;
  onCriticalityChange: (value: string) => void;
  trigger: number;
  onTriggerChange: (value: number) => void;
  repeat: number;
  onRepeatChange: (value: number) => void;
  businessHours: boolean;
  onBusinessHoursChange: (value: boolean) => void;
  urgent: boolean;
  onUrgentChange: (value: boolean) => void;
}

const NOTIFICATION_EVENTS = [
  {
    id: "TASK_OVERDUE",
    title: "Atrasos de prazo",
    description: "Notifica quando o tempo de execução exceder o limite + tolerância.",
  },
  {
    id: "IMPEDIMENT_REPORTED",
    title: "Impedimentos operacionais",
    description: "Avisa imediatamente quando um operador sinalizar um bloqueio na tarefa.",
  },
  {
    id: "APPROVAL_PENDING",
    title: "Aprovações pendentes",
    description: "Alerta o gestor quando tarefas finalizadas exigirem validação formal.",
  },
  {
    id: "DEADLINE_WARNING",
    title: "Avisos preventivos",
    description: "Notifica preventivamente antes do encerramento do prazo.",
  },
  {
    id: "PROCESS_STALLED",
    title: "Processos parados",
    description: "Sinaliza fluxos operacionais sem movimentação por período prolongado.",
  },
];

export function WhatsAppAlertSettings(props: WhatsAppAlertSettingsProps) {
  function toggleEvent(id: string) {
    if (props.events.includes(id)) {
      props.onEventsChange(props.events.filter((e) => e !== id));
    } else {
      props.onEventsChange([...props.events, id]);
    }
  }

  return (
    <Card className="p-6">
      <CardContent className="p-0 flex flex-col gap-6">
        {/* Cabeçalho com Switch de Ativação */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-border/60">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center shrink-0">
              <MessageSquare className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground">
                  Disparo Automático de Alertas
                </h3>
                <Badge
                  variant={props.enabled ? "default" : "secondary"}
                  className={cn(
                    "text-[10px] font-semibold px-2 py-0.5",
                    props.enabled
                      ? "bg-emerald-600 hover:bg-emerald-600 text-white"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {props.enabled ? "Ativado" : "Desativado"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-xl">
                Envie notificações diretas pelo WhatsApp para os gestores e números cadastrados nas unidades operacionais.
              </p>
            </div>
          </div>

          {/* Switch estilizado */}
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              role="switch"
              aria-label="Ativar alertas via WhatsApp"
              checked={props.enabled}
              onChange={(e) => props.onEnabledChange(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
          </label>
        </div>

        {/* Inputs ocultos para submissão no formulário */}
        <input type="hidden" name="hasWhatsappSettings" value="true" />
        <input type="hidden" name="whatsappAlertsEnabled" value={String(props.enabled)} />
        <input type="hidden" name="whatsappNotificationTypes" value={props.events.join(",")} />
        <input type="hidden" name="whatsappBusinessHoursOnly" value="true" />
        <input type="hidden" name="whatsappAlwaysUrgent" value={String(props.urgent)} />

        {/* Bloco 1: Seleção de Eventos e Gatilhos */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Bell className="size-3.5 text-emerald-600" />
              <span>Eventos e Gatilhos Notificados</span>
            </h4>
            <span className="text-[11px] text-muted-foreground">
              {props.events.length} de {NOTIFICATION_EVENTS.length} selecionados
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {NOTIFICATION_EVENTS.map((event) => {
              const selected = props.events.includes(event.id);
              return (
                <div
                  key={event.id}
                  onClick={() => toggleEvent(event.id)}
                  className={cn(
                    "p-3 rounded-xl border text-left cursor-pointer transition-all flex items-start gap-3 select-none",
                    selected
                      ? "border-emerald-500/60 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-2xs"
                      : "border-border/70 bg-card hover:bg-muted/30 hover:border-border"
                  )}
                >
                  <div
                    className={cn(
                      "size-4 rounded border mt-0.5 shrink-0 transition-colors",
                      selected
                        ? "bg-emerald-600 border-emerald-600"
                        : "border-muted-foreground/40 bg-background"
                    )}
                  />
                  <div className="flex flex-col gap-0.5">
                    <span
                      className={cn(
                        "text-xs font-semibold",
                        selected ? "text-foreground" : "text-foreground/80"
                      )}
                    >
                      {event.title}
                    </span>
                    <span className="text-[11px] text-muted-foreground leading-relaxed">
                      {event.description}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bloco 2: Filtros e Preferências Operacionais */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-border/50">
          {/* Criticidade */}
          <Field>
            <FieldLabel className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <span>Prioridade mínima da tarefa</span>
            </FieldLabel>
            <NativeSelect
              aria-label="Prioridade das tarefas"
              name="whatsappCriticalityFilter"
              value={props.criticality}
              onChange={(e) => props.onCriticalityChange(e.target.value)}
              className="w-full h-10 bg-muted/20 text-xs"
            >
              <NativeSelectOption value="CRITICAL_ONLY">
                Apenas tarefas críticas (recomendado)
              </NativeSelectOption>
              <NativeSelectOption value="HIGH_AND_CRITICAL">
                Alta prioridade e críticas
              </NativeSelectOption>
              <NativeSelectOption value="ALL">
                Todas as tarefas (incluindo normais)
              </NativeSelectOption>
            </NativeSelect>
            <FieldDescription className="text-[11px] text-muted-foreground">
              Evita sobrecarga de mensagens em demandas rotineiras.
            </FieldDescription>
          </Field>

          {/* Marco Padrão */}
          <Field>
            <FieldLabel className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <span>Marco inicial para alertas de atraso</span>
            </FieldLabel>
            <NativeSelect
              aria-label="Marco de envio"
              name="whatsappTriggerStep"
              value={props.trigger}
              onChange={(e) => props.onTriggerChange(Number(e.target.value))}
              className="w-full h-10 bg-muted/20 text-xs"
            >
              <NativeSelectOption value={1}>1º marco — início do atraso</NativeSelectOption>
              <NativeSelectOption value={2}>2º marco — atenção moderada</NativeSelectOption>
              <NativeSelectOption value={3}>3º marco — intervenção de gestão (recomendado)</NativeSelectOption>
              <NativeSelectOption value={4}>4º marco — incidente crítico</NativeSelectOption>
              <NativeSelectOption value={0}>Todos os marcos da timeline</NativeSelectOption>
            </NativeSelect>
            <FieldDescription className="text-[11px] text-muted-foreground">
              Define em qual etapa da timeline o primeiro aviso é disparado.
            </FieldDescription>
          </Field>
        </div>

        {/* Bloco 3: Diretrizes de Expediente e Urgência */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-border/50">
          {/* Horário comercial (Sempre ativo com badge) */}
          <div className="p-3.5 rounded-xl border border-border/70 bg-muted/20 flex items-start gap-3">
            <Clock className="size-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">
                  Respeitar horário da unidade
                </span>
                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.2 rounded-md">
                  Sempre ativo
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Mensagens são silenciadas fora do horário de funcionamento cadastrado na unidade da tarefa, evitando envios noturnos.
              </p>
            </div>
          </div>

          {/* Incidentes Urgentes */}
          <label className="p-3.5 rounded-xl border border-border/70 bg-card hover:bg-muted/20 transition-colors flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={props.urgent}
              onChange={(e) => props.onUrgentChange(e.target.checked)}
              className="size-4 rounded border-muted-foreground/40 text-emerald-600 focus:ring-emerald-500 shrink-0 mt-0.5"
            />
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold text-foreground">
                Disparo imediato em urgências
              </span>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Impedimentos graves furam a fila de espera e notificam a liderança imediatamente.
              </p>
            </div>
          </label>
        </div>
      </CardContent>
    </Card>
  );
}
