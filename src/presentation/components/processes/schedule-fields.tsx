"use client";
import { useState } from "react";
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldSet, FieldLegend } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { describeSchedule, weekdayLabels, type ScheduleDefinition } from "@/domain/rules/process-definition";
import { Plus, X, CalendarClock, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function ScheduleFields({ value: s, onChange }: { value: ScheduleDefinition; onChange: (s: ScheduleDefinition) => void }) {
  const update = (patch: Partial<ScheduleDefinition>) => onChange({ ...s, ...patch });
  const [newSkipDate, setNewSkipDate] = useState("");

  function addSkipDate() {
    if (!newSkipDate) return;
    if (!s.skipDates.includes(newSkipDate)) {
      update({ skipDates: [...s.skipDates, newSkipDate].sort() });
    }
    setNewSkipDate("");
  }

  function removeSkipDate(dateToRemove: string) {
    update({ skipDates: s.skipDates.filter(d => d !== dateToRemove) });
  }

  return (
    <FieldGroup className="gap-5">
      <FieldGroup className="form-grid">
        <Field>
          <FieldLabel htmlFor="frequency">Frequência</FieldLabel>
          <NativeSelect id="frequency" className="w-full" value={s.frequency} onChange={e => update({ frequency: e.target.value as ScheduleDefinition["frequency"] })}>
            <NativeSelectOption value="DAILY">Diariamente (Todos os dias)</NativeSelectOption>
            <NativeSelectOption value="WEEKLY">Semanalmente (Dias específicos)</NativeSelectOption>
            <NativeSelectOption value="MONTHLY">Mensalmente</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="interval">A cada quantos {s.frequency === "DAILY" ? "dias" : s.frequency === "WEEKLY" ? "semanas" : "meses"}?</FieldLabel>
          <Input id="interval" type="number" min={1} max={365} value={s.interval} onChange={e => update({ interval: Number(e.target.value) || 1 })} className="py-5" />
        </Field>
      </FieldGroup>

      {s.frequency === "WEEKLY" && (
        <FieldSet>
          <FieldLegend>Dias da semana em que a rotina acontece</FieldLegend>
          <div className="flex flex-wrap gap-4 pt-1">
            {Object.entries(weekdayLabels).map(([day, label]) => (
              <Field key={day} orientation="horizontal" className="w-auto">
                <Checkbox
                  id={`day-${day}`}
                  checked={s.weekdays.includes(day as typeof s.weekdays[number])}
                  onCheckedChange={checked => update({ weekdays: checked ? [...s.weekdays, day as typeof s.weekdays[number]] : s.weekdays.filter(d => d !== day) })}
                />
                <FieldLabel htmlFor={`day-${day}`}>{label}</FieldLabel>
              </Field>
            ))}
          </div>
        </FieldSet>
      )}

      {s.frequency === "MONTHLY" && (
        <Field>
          <FieldLabel htmlFor="month-day">Dia do mês (1 a 31)</FieldLabel>
          <Input id="month-day" type="number" min={1} max={31} value={s.monthDay} onChange={e => update({ monthDay: Number(e.target.value) || 1 })} />
          <FieldDescription>Meses sem o dia escolhido serão ignorados.</FieldDescription>
        </Field>
      )}

      <FieldSet>
        <FieldLegend>Horários em que a rotina deve começar</FieldLegend>
        <div className="flex flex-wrap gap-3 items-center pt-1">
          {s.times.map((time, i) => (
            <div key={i} className="flex items-center gap-1 bg-surface p-1 rounded-lg border border-(--border-subtle)">
              <Input
                aria-label={`Horário ${i + 1}`}
                type="time"
                value={time}
                className="w-28 h-9 border-0 bg-transparent text-sm font-semibold"
                onChange={e => update({ times: s.times.map((v, n) => n === i ? e.target.value : v) })}
              />
              {s.times.length > 1 && (
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label={`Remover horário ${i + 1}`} onClick={() => update({ times: s.times.filter((_, n) => n !== i) })}>
                  <X className="size-3.5" />
                </Button>
              )}
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="h-9" disabled={s.times.length >= 12} onClick={() => update({ times: [...s.times, "08:00"] })}>
            <Plus data-icon="inline-start" className="size-4" />
            Adicionar outro horário
          </Button>
        </div>
      </FieldSet>

      <FieldGroup className="form-grid">
        <Field>
          <FieldLabel htmlFor="schedule-start">Data de início da rotina</FieldLabel>
          <Input id="schedule-start" type="date" required value={s.startsAt} onChange={e => update({ startsAt: e.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="schedule-end">Data de término (opcional)</FieldLabel>
          <Input id="schedule-end" type="date" min={s.startsAt} value={s.endsAt} onChange={e => update({ endsAt: e.target.value })} />
          <FieldDescription>Deixe vazio se a rotina for contínua.</FieldDescription>
        </Field>
      </FieldGroup>

      <Field>
        <FieldLabel htmlFor="schedule-zone">Fuso horário da unidade</FieldLabel>
        <NativeSelect id="schedule-zone" className="w-full" value={s.timezone} onChange={e => update({ timezone: e.target.value })}>
          {["America/Sao_Paulo", "America/Manaus", "America/Rio_Branco", "America/Noronha", "UTC"].map(zone => (
            <NativeSelectOption key={zone} value={zone}>
              {zone === "America/Sao_Paulo" ? "Horário de Brasília (São Paulo)" : zone.replace("America/", "").replaceAll("_", " ")}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>

      {/* Datas de exceção com seletor interativo de data */}
      <FieldSet>
        <FieldLegend>Datas em que a rotina NÃO deve acontecer (feriados, reformas, etc.)</FieldLegend>
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center gap-2 max-w-sm">
            <Input
              type="date"
              value={newSkipDate}
              onChange={e => setNewSkipDate(e.target.value)}
              className="h-9"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addSkipDate}
              disabled={!newSkipDate}
              className="h-9 shrink-0 gap-1"
            >
              <Calendar className="size-3.5" />
              Adicionar data
            </Button>
          </div>

          {s.skipDates.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {s.skipDates.map(date => {
                const [year, month, day] = date.split("-");
                return (
                  <Badge key={date} variant="secondary" className="gap-1.5 py-1 px-2.5 text-xs font-medium">
                    <span>{`${day}/${month}/${year}`}</span>
                    <button
                      type="button"
                      onClick={() => removeSkipDate(date)}
                      className="hover:text-destructive cursor-pointer"
                      aria-label={`Remover data ${date}`}
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Nenhuma data de exceção adicionada.</p>
          )}
        </div>
      </FieldSet>

      <Alert className="bg-brand-soft/40 border-brand-200">
        <CalendarClock className="size-4 text-brand-900" />
        <AlertDescription className="text-brand-900 font-medium">
          {describeSchedule(s)}
        </AlertDescription>
      </Alert>
    </FieldGroup>
  );
}
