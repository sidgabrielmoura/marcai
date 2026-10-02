"use client";

import { useState } from "react";
import {
  Calendar,
  Clock,
  Plus,
  X,
  CalendarClock,
  Sparkles,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  describeSchedule,
  weekdayLabels,
  type ScheduleDefinition,
} from "@/domain/rules/process-definition";

const ALL_WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

export function ScheduleFields({
  value: s,
  onChange,
}: {
  value: ScheduleDefinition;
  onChange: (s: ScheduleDefinition) => void;
}) {
  const update = (patch: Partial<ScheduleDefinition>) => onChange({ ...s, ...patch });
  const [newSkipDate, setNewSkipDate] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  function toggleWeekday(day: (typeof ALL_WEEKDAYS)[number]) {
    const next = s.weekdays.includes(day)
      ? s.weekdays.filter((d) => d !== day)
      : [...s.weekdays, day];
    update({ weekdays: next });
  }

  function setWeekdaysShortcut(type: "WEEKDAYS" | "ALL" | "WEEKEND" | "CLEAR") {
    if (type === "WEEKDAYS") {
      update({ weekdays: ["MO", "TU", "WE", "TH", "FR"] });
    } else if (type === "ALL") {
      update({ weekdays: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] });
    } else if (type === "WEEKEND") {
      update({ weekdays: ["SA", "SU"] });
    } else {
      update({ weekdays: [] });
    }
  }

  function addSkipDate() {
    if (!newSkipDate) return;
    if (!s.skipDates.includes(newSkipDate)) {
      update({ skipDates: [...s.skipDates, newSkipDate].sort() });
    }
    setNewSkipDate("");
  }

  function removeSkipDate(dateToRemove: string) {
    update({ skipDates: s.skipDates.filter((d) => d !== dateToRemove) });
  }

  function addTime() {
    if (s.times.length >= 12) return;
    const defaultNewTime = s.times.length === 0 ? "08:00" : "14:00";
    if (!s.times.includes(defaultNewTime)) {
      update({ times: [...s.times, defaultNewTime].sort() });
    } else {
      update({ times: [...s.times, "18:00"] });
    }
  }

  function removeTime(index: number) {
    if (s.times.length <= 1) return;
    update({ times: s.times.filter((_, i) => i !== index) });
  }

  function updateTime(index: number, val: string) {
    update({
      times: s.times.map((t, i) => (i === index ? val : t)),
    });
  }

  // Convert generationLeadTime (minutes) to hours for friendly UI
  const leadHours = Math.round(s.generationLeadTime / 60);

  return (
    <div className="space-y-5">
      {/* Live Summary Banner */}
      <div className="flex items-start gap-3 p-3.5 bg-brand-soft/40 border border-brand-200/60 rounded-xl text-brand-900">
        <div className="size-8 rounded-lg bg-brand-soft flex items-center justify-center shrink-0 mt-0.5 text-brand-900">
          <CalendarClock className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-semibold text-brand-800 uppercase tracking-wider block">
            Resumo da programação
          </span>
          <p className="text-sm font-bold text-brand-900 leading-snug mt-0.5">
            {describeSchedule(s)}
          </p>
        </div>
      </div>

      {/* Frequency Segmented Control */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-(--text-primary)">
          Frequência de repetição
        </label>
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-canvas border border-(--border-subtle) rounded-xl">
          <button
            type="button"
            onClick={() => update({ frequency: "DAILY" })}
            className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${s.frequency === "DAILY"
              ? "bg-surface text-(--text-primary) shadow-xs border border-(--border-subtle)/60"
              : "text-(--text-secondary) hover:text-(--text-primary)"
              }`}
          >
            <Calendar className="size-3.5" />
            <span>Diário</span>
          </button>

          <button
            type="button"
            onClick={() => update({ frequency: "WEEKLY" })}
            className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${s.frequency === "WEEKLY"
              ? "bg-surface text-(--text-primary) shadow-xs border border-(--border-subtle)/60"
              : "text-(--text-secondary) hover:text-(--text-primary)"
              }`}
          >
            <CalendarClock className="size-3.5" />
            <span>Semanal</span>
          </button>

          <button
            type="button"
            onClick={() => update({ frequency: "MONTHLY" })}
            className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${s.frequency === "MONTHLY"
              ? "bg-surface text-(--text-primary) shadow-xs border border-(--border-subtle)/60"
              : "text-(--text-secondary) hover:text-(--text-primary)"
              }`}
          >
            <Sparkles className="size-3.5" />
            <span>Mensal</span>
          </button>
        </div>
      </div>

      {/* WEEKLY: Days of the week selector (Pills design matching the show view) */}
      {s.frequency === "WEEKLY" && (
        <div className="p-4 bg-canvas/60 border border-(--border-subtle) rounded-xl space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-semibold text-(--text-primary)">
              Dias da semana ativos
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setWeekdaysShortcut("WEEKDAYS")}
                className="text-[11px] px-2 py-0.5 rounded text-brand-900 hover:bg-brand-soft/60 transition-colors"
              >
                Seg a Sex
              </button>
              <span className="text-muted-foreground text-xs">•</span>
              <button
                type="button"
                onClick={() => setWeekdaysShortcut("ALL")}
                className="text-[11px] px-2 py-0.5 rounded text-brand-900 hover:bg-brand-soft/60 transition-colors"
              >
                Todos
              </button>
              <span className="text-muted-foreground text-xs">•</span>
              <button
                type="button"
                onClick={() => setWeekdaysShortcut("CLEAR")}
                className="text-[11px] px-2 py-0.5 rounded text-(--text-secondary) hover:text-destructive transition-colors"
              >
                Limpar
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap pt-1">
            {ALL_WEEKDAYS.map((dayKey) => {
              const active = s.weekdays.includes(dayKey);
              return (
                <button
                  key={dayKey}
                  type="button"
                  onClick={() => toggleWeekday(dayKey)}
                  className={`h-9 min-w-10 w-12 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center ${active
                    ? "bg-brand-900 text-white shadow-xs scale-102"
                    : "bg-surface text-muted-foreground hover:text-(--text-primary) border border-(--border-subtle)"
                    }`}
                  title={`${weekdayLabels[dayKey]}: ${active ? "Ativo" : "Inativo"}`}
                >
                  {weekdayLabels[dayKey]}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-(--border-subtle)/50 text-xs text-(--text-secondary)">
            <span>Repetir a cada</span>
            <Input
              type="number"
              min={1}
              max={52}
              value={s.interval}
              onChange={(e) => update({ interval: Number(e.target.value) || 1 })}
              className="w-16 h-8 text-center text-xs font-semibold py-0"
            />
            <span>semana(s)</span>
          </div>
        </div>
      )}

      {/* DAILY: Interval */}
      {s.frequency === "DAILY" && (
        <div className="p-4 bg-canvas/60 border border-(--border-subtle) rounded-xl flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <span className="text-xs font-semibold text-(--text-primary) block">
              Intervalo de dias
            </span>
            <span className="text-[11px] text-(--text-secondary)">
              Escolha de quantos em quantos dias o processo deve rodar.
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-(--text-secondary) shrink-0">
            <span>A cada</span>
            <Input
              type="number"
              min={1}
              max={365}
              value={s.interval}
              onChange={(e) => update({ interval: Number(e.target.value) || 1 })}
              className="w-16 h-8 text-center text-xs font-semibold py-0"
            />
            <span>dia(s)</span>
          </div>
        </div>
      )}

      {/* MONTHLY: Day of Month & Interval */}
      {s.frequency === "MONTHLY" && (
        <div className="p-4 bg-canvas/60 border border-(--border-subtle) rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label htmlFor="modal-month-day" className="text-xs font-semibold text-(--text-primary)">
              Dia do mês
            </label>
            <Input
              id="modal-month-day"
              type="number"
              min={1}
              max={31}
              value={s.monthDay}
              onChange={(e) => update({ monthDay: Number(e.target.value) || 1 })}
              className="h-9 text-xs"
            />
            <span className="text-[10px] text-muted-foreground">Ex: dia 5 para fechamento.</span>
          </div>
          <div className="space-y-1">
            <label htmlFor="modal-month-interval" className="text-xs font-semibold text-(--text-primary)">
              Intervalo de meses
            </label>
            <Input
              id="modal-month-interval"
              type="number"
              min={1}
              max={12}
              value={s.interval}
              onChange={(e) => update({ interval: Number(e.target.value) || 1 })}
              className="h-9 text-xs"
            />
            <span className="text-[10px] text-muted-foreground">Ex: 1 = todo mês, 3 = trimestral.</span>
          </div>
        </div>
      )}

      {/* Execution Times Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-semibold text-(--text-primary) flex items-center gap-1.5">
            <Clock className="size-3.5 text-brand-700" />
            <span>Horários de disparo</span>
          </label>
          <span className="text-[11px] text-(--text-secondary)">
            {s.times.length} {s.times.length === 1 ? "horário configurado" : "horários configurados"}
          </span>
        </div>

        <div className="flex flex-wrap gap-2.5 items-center">
          {s.times.map((time, idx) => (
            <div
              key={idx}
              className="flex items-center gap-1 px-2.5 py-1 bg-surface border border-(--border-subtle) rounded-lg shadow-2xs transition-all hover:border-brand-700/40"
            >
              <input
                aria-label={`Horário ${idx + 1}`}
                type="time"
                value={time}
                onChange={(e) => updateTime(idx, e.target.value)}
                className="w-20 bg-transparent text-xs font-bold text-(--text-primary) focus:outline-none cursor-pointer"
              />
              {s.times.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeTime(idx)}
                  className="size-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  aria-label={`Remover horário ${time}`}
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          ))}

          {s.times.length < 12 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addTime}
              className="h-8 text-xs gap-1 border-dashed border-(--border-subtle) text-(--text-secondary) hover:text-(--text-primary)"
            >
              <Plus className="size-3.5" />
              Adicionar horário
            </Button>
          )}
        </div>
      </div>

      {/* Date Range: Start and End Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <div className="space-y-1">
          <label htmlFor="modal-starts-at" className="text-xs font-semibold text-(--text-primary)">
            Início da programação
          </label>
          <Input
            id="modal-starts-at"
            type="date"
            required
            value={s.startsAt}
            onChange={(e) => update({ startsAt: e.target.value })}
            className="h-9 text-xs"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label htmlFor="modal-ends-at" className="text-xs font-semibold text-(--text-primary)">
              Término (opcional)
            </label>
            <span className="text-[10px] text-muted-foreground">Vazio = contínuo</span>
          </div>
          <Input
            id="modal-ends-at"
            type="date"
            min={s.startsAt}
            value={s.endsAt}
            onChange={(e) => update({ endsAt: e.target.value })}
            className="h-9 text-xs"
          />
        </div>
      </div>

      {/* Timezone */}
      <div className="space-y-1">
        <label htmlFor="modal-timezone" className="text-xs font-semibold text-(--text-primary)">
          Fuso horário
        </label>
        <NativeSelect
          id="modal-timezone"
          className="w-full text-xs h-9"
          value={s.timezone}
          onChange={(e) => update({ timezone: e.target.value })}
        >
          <NativeSelectOption value="America/Sao_Paulo">
            Horário de Brasília (São Paulo, Rio, Sul, Sudeste, Centro-Oeste)
          </NativeSelectOption>
          <NativeSelectOption value="America/Manaus">
            Horário do Amazonas (Manaus)
          </NativeSelectOption>
          <NativeSelectOption value="America/Rio_Branco">
            Horário do Acre (Rio Branco)
          </NativeSelectOption>
          <NativeSelectOption value="America/Noronha">
            Horário de Fernando de Noronha
          </NativeSelectOption>
          <NativeSelectOption value="UTC">UTC (Universal)</NativeSelectOption>
        </NativeSelect>
      </div>

      {/* Advanced Settings Accordion / Toggle */}
      <div className="border border-(--border-subtle) rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="w-full p-3.5 bg-canvas/40 hover:bg-canvas transition-colors flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-(--text-primary)">
              Configurações avançadas
            </span>
            <span className="text-[10px] text-(--text-secondary)">
              (Exceções/Feriados, Antecedência e Políticas)
            </span>
          </div>
          {advancedOpen ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </button>

        {advancedOpen && (
          <div className="p-4 bg-surface space-y-4 border-t border-(--border-subtle)">
            {/* Exceptions / Skip Dates */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-(--text-primary) block">
                Datas de exceção (Feriados, reformas, etc.)
              </label>
              <div className="flex items-center gap-2 max-w-sm">
                <Input
                  type="date"
                  value={newSkipDate}
                  onChange={(e) => setNewSkipDate(e.target.value)}
                  className="h-8 text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addSkipDate}
                  disabled={!newSkipDate}
                  className="h-8 text-xs shrink-0 gap-1 border-(--border-subtle)"
                >
                  <Plus className="size-3" />
                  Pular data
                </Button>
              </div>

              {s.skipDates.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {s.skipDates.map((dateStr) => {
                    const [year, month, day] = dateStr.split("-");
                    return (
                      <Badge
                        key={dateStr}
                        variant="secondary"
                        className="text-[11px] font-mono py-0.5 px-2 gap-1.5 bg-canvas border border-(--border-subtle) text-(--text-primary)"
                      >
                        <span>{`${day}/${month}/${year}`}</span>
                        <button
                          type="button"
                          onClick={() => removeSkipDate(dateStr)}
                          className="text-muted-foreground hover:text-destructive cursor-pointer"
                          aria-label={`Remover ${dateStr}`}
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Nenhuma data de exceção adicionada. O processo rodará normalmente.
                </p>
              )}
            </div>

            {/* Generation Lead Time */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-(--border-subtle)/50">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-(--text-primary) block">
                  Antecedência de geração
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <Input
                    type="number"
                    min={0}
                    max={720}
                    value={leadHours}
                    onChange={(e) =>
                      update({
                        generationLeadTime: (Number(e.target.value) || 0) * 60,
                      })
                    }
                    className="h-8 w-20 text-center text-xs! font-semibold py-0"
                  />
                  <span className="text-(--text-secondary)">horas antes do horário</span>
                </div>
                <span className="text-[10px] text-muted-foreground block">
                  Padrão: 24 horas (as tarefas surgem um dia antes).
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-(--text-primary) block">
                  Política de pendência
                </label>
                <NativeSelect
                  className="w-full text-xs! h-8"
                  value={s.pendingPreviousPolicy}
                  onChange={(e) =>
                    update({
                      pendingPreviousPolicy: e.target
                        .value as ScheduleDefinition["pendingPreviousPolicy"],
                    })
                  }
                >
                  <NativeSelectOption value="CREATE_NEW" className="text-sm!">
                    Criar nova execução normalmente
                  </NativeSelectOption>
                  <NativeSelectOption value="SKIP_IF_PENDING" className="text-sm!">
                    Pular se houver anterior pendente
                  </NativeSelectOption>
                  <NativeSelectOption value="BLOCK_NEW" className="text-sm!">
                    Bloquear até que anterior finalize
                  </NativeSelectOption>
                </NativeSelect>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
