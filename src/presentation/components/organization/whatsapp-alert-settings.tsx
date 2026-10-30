"use client";

import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

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

const events = [
  { id: "TASK_OVERDUE", label: "Atrasos de prazo" },
  { id: "IMPEDIMENT_REPORTED", label: "Impedimentos operacionais" },
  { id: "APPROVAL_PENDING", label: "Aprovações pendentes" },
  { id: "DEADLINE_WARNING", label: "Avisos preventivos" },
  { id: "PROCESS_STALLED", label: "Processos parados" },
];

const label = "flex flex-col gap-2 text-sm font-medium text-[var(--text-primary)]";
const control = "h-10 w-full bg-[var(--surface)] text-sm";
const checkbox = "size-4 shrink-0 accent-[var(--brand-900)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-700)]";

export function WhatsAppAlertSettings(props: WhatsAppAlertSettingsProps) {
  return (
    <section aria-labelledby="whatsapp-alert-title" className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 sm:p-7">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-lg">
          <h3 id="whatsapp-alert-title" className="text-base font-semibold tracking-tight text-[var(--text-primary)]">Alertas via WhatsApp</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">Escolha quais avisos enviar aos números cadastrados abaixo.</p>
        </div>
        <label className="flex min-h-10 shrink-0 cursor-pointer items-center gap-3 self-start text-sm text-[var(--text-primary)]">
          <input type="checkbox" role="switch" aria-label="Ativar alertas via WhatsApp" checked={props.enabled} onChange={event => props.onEnabledChange(event.target.checked)} className="peer sr-only" />
          <span aria-hidden="true" className="relative h-6 w-10 rounded-full bg-[var(--border-subtle)] transition-colors after:absolute after:left-1 after:top-1 after:size-4 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-[var(--brand-900)] peer-checked:after:translate-x-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-[var(--brand-700)]" />
          {props.enabled ? "Ativados" : "Desativados"}
        </label>
      </header>

      <input type="hidden" name="hasWhatsappSettings" value="true" />
      <input type="hidden" name="whatsappAlertsEnabled" value={String(props.enabled)} />
      <input type="hidden" name="whatsappNotificationTypes" value={props.events.join(",")} />
      <input type="hidden" name="whatsappBusinessHoursOnly" value={String(props.businessHours)} />
      <input type="hidden" name="whatsappAlwaysUrgent" value={String(props.urgent)} />

      <div className="mt-7 flex flex-col gap-7 border-t border-(--border-subtle) pt-7">
        <fieldset className="">
          <legend className="sr-only">Quais avisos enviar</legend>
          <h4 aria-hidden="true" className="mb-3 text-sm font-semibold text-(--text-primary)">Quais avisos enviar</h4>
          <div className="grid gap-x-8 sm:grid-cols-2">
            {events.map(event => (
              <label key={event.id} className="flex min-h-11 cursor-pointer items-center gap-3 py-2 text-sm text-[var(--text-primary)]">
                <input type="checkbox" className={checkbox} checked={props.events.includes(event.id)} onChange={change => props.onEventsChange(change.target.checked ? [...props.events, event.id] : props.events.filter(id => id !== event.id))} />
                {event.label}
              </label>
            ))}
          </div>
          <label className={`${label} mt-5 max-w-sm`}>
            Prioridade das tarefas
            <NativeSelect aria-label="Prioridade das tarefas" name="whatsappCriticalityFilter" value={props.criticality} onChange={event => props.onCriticalityChange(event.target.value)} className={control}>
              <NativeSelectOption value="CRITICAL_ONLY">Apenas críticas (urgentes)</NativeSelectOption>
              <NativeSelectOption value="HIGH_AND_CRITICAL">Alta prioridade e críticas</NativeSelectOption>
              <NativeSelectOption value="ALL">Todas as tarefas</NativeSelectOption>
            </NativeSelect>
          </label>
        </fieldset>

        <details className="group border-t border-[var(--border-subtle)] pt-5">
          <summary className="cursor-pointer rounded-sm text-sm font-medium text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-700)]">Preferências de envio</summary>
          <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">Ajuste o marco de atraso, a repetição e os horários dos avisos.</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className={label}>
              Marco de envio
              <NativeSelect aria-label="Marco de envio" name="whatsappTriggerStep" value={props.trigger} onChange={event => props.onTriggerChange(Number(event.target.value))} className={control}>
                <NativeSelectOption value={1}>1º marco — início do atraso</NativeSelectOption>
                <NativeSelectOption value={2}>2º marco — atenção moderada</NativeSelectOption>
                <NativeSelectOption value={3}>3º marco — gestores (recomendado)</NativeSelectOption>
                <NativeSelectOption value={4}>4º marco — incidente grave</NativeSelectOption>
                <NativeSelectOption value={0}>Todos os marcos</NativeSelectOption>
              </NativeSelect>
            </label>
            <label className={label}>
              Repetição
              <NativeSelect aria-label="Repetição" name="whatsappRepeatInterval" value={props.repeat} onChange={event => props.onRepeatChange(Number(event.target.value))} className={control}>
                <NativeSelectOption value={0}>Uma única vez</NativeSelectOption>
                <NativeSelectOption value={15}>A cada 15 minutos</NativeSelectOption>
                <NativeSelectOption value={30}>A cada 30 minutos</NativeSelectOption>
                <NativeSelectOption value={60}>A cada 1 hora</NativeSelectOption>
              </NativeSelect>
            </label>
          </div>
          <div className="mt-5 flex flex-col gap-1">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 py-2 text-sm text-[var(--text-primary)]"><input type="checkbox" checked={props.urgent} onChange={event => props.onUrgentChange(event.target.checked)} className={checkbox} />Notificar incidentes urgentes imediatamente</label>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 py-2 text-sm text-[var(--text-primary)]"><input type="checkbox" checked={props.businessHours} onChange={event => props.onBusinessHoursChange(event.target.checked)} className={checkbox} />Silenciar fora do horário comercial</label>
          </div>
        </details>
      </div>
      <p className="mt-7 border-t border-[var(--border-subtle)] pt-4 text-xs leading-relaxed text-[var(--text-secondary)]">Os alertas usam o WhatsApp conectado à unidade. Use “Salvar configurações” para aplicar as regras.</p>
    </section>
  );
}
