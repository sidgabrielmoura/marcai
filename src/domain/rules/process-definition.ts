import { z } from "zod";

const calendarDate = z.string().refine(value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Data inválida.");
const date = z.union([z.literal(""), calendarDate]);
export const scheduleSchema = z.object({
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  interval: z.number().int().min(1).max(365),
  weekdays: z.array(z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"])).max(7).refine(values => new Set(values).size === values.length, "Não repita os dias da semana."),
  monthDay: z.number().int().min(1).max(31),
  times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1, "Informe um horário.").max(12).refine(values => new Set(values).size === values.length, "Não repita os horários."),
  startsAt: calendarDate,
  endsAt: date,
  timezone: z.string().refine(v => { try { new Intl.DateTimeFormat("pt-BR", { timeZone: v }); return true; } catch { return false; } }, "Fuso horário inválido."),
  generationLeadTime: z.number().int().min(0).max(43200),
  pendingPreviousPolicy: z.enum(["CREATE_NEW", "SKIP_IF_PENDING", "BLOCK_NEW"]),
  skipDates: z.array(calendarDate).max(365).refine(values => new Set(values).size === values.length, "Não repita as datas de exceção."),
}).strict().superRefine((s, ctx) => {
  if (s.frequency === "WEEKLY" && !s.weekdays.length) ctx.addIssue({ code: "custom", message: "Selecione pelo menos um dia da semana.", path: ["weekdays"] });
  if (s.endsAt && s.endsAt < s.startsAt) ctx.addIssue({ code: "custom", message: "A data final deve ser igual ou posterior à inicial.", path: ["endsAt"] });
});
export type ScheduleDefinition = z.infer<typeof scheduleSchema>;

export function defaultSchedule(): ScheduleDefinition {
  return { frequency: "DAILY", interval: 1, weekdays: ["MO", "TU", "WE", "TH", "FR"], monthDay: 1, times: ["07:00"], startsAt: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }), endsAt: "", timezone: "America/Sao_Paulo", generationLeadTime: 1440, pendingPreviousPolicy: "CREATE_NEW", skipDates: [] };
}

export const processTaskSchema = z.object({
  id: z.string().min(1).max(100), title: z.string().trim().min(3, "Cada tarefa precisa de um nome com pelo menos 3 caracteres.").max(200),
  instructions: z.string().max(5000), teamId: z.string().min(1, "Escolha a equipe de cada tarefa."), primaryMemberId: z.string(),
  estimatedDuration: z.number().int().min(1).max(43200), slaMinutes: z.number().int().min(1).max(43200),
  required: z.boolean(), evidenceType: z.enum(["", "PHOTO", "VIDEO", "FILE", "TEXT", "NUMBER", "SIGNATURE", "LOCATION"]),
  dependsOn: z.array(z.string().min(1)).max(100).refine(values => new Set(values).size === values.length, "Não repita as dependências."), dependencyType: z.enum(["BLOCKING", "INFORMATIVE", "APPROVAL_CONDITION"]), dependencyLogic: z.enum(["AND", "OR"]),
  approverIds: z.array(z.string().min(1)).max(10).refine(values => new Set(values).size === values.length, "Não repita os aprovadores."), approvalMode: z.enum(["SEQUENTIAL", "PARALLEL"]),
}).strict();
export const processDefinitionSchema = z.object({
  name: z.string().trim().min(3, "Informe um nome com pelo menos 3 caracteres.").max(150),
  description: z.string().max(1000), locationId: z.string().min(1, "Escolha a unidade."),
  criticality: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]), validFrom: date, validUntil: date,
  tasks: z.array(processTaskSchema).min(1, "Adicione pelo menos uma tarefa.").max(100),
  schedule: scheduleSchema.nullable(),
}).strict().superRefine((p, ctx) => {
  if (p.validFrom && p.validUntil && p.validUntil < p.validFrom) ctx.addIssue({ code: "custom", message: "A validade final deve ser posterior à inicial." });
  const ids = new Set(p.tasks.map(t => t.id));
  if (ids.size !== p.tasks.length) ctx.addIssue({ code: "custom", message: "As tarefas precisam de identificadores únicos." });
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    for (const parent of p.tasks.find(t => t.id === id)?.dependsOn ?? []) if (!ids.has(parent) || !visit(parent)) return false;
    visiting.delete(id); visited.add(id); return true;
  };
  if (p.tasks.some(t => !visit(t.id))) ctx.addIssue({ code: "custom", message: "As dependências têm um ciclo ou apontam para uma tarefa removida." });
  for (const t of p.tasks) if (t.dependencyType === "APPROVAL_CONDITION" && t.dependsOn.some(id => !p.tasks.find(parent => parent.id === id)?.approverIds.length)) ctx.addIssue({ code: "custom", message: "Uma dependência por aprovação precisa de aprovadores na tarefa anterior." });
});
export type ProcessDefinition = z.infer<typeof processDefinitionSchema>;
export type ProcessTaskDefinition = z.infer<typeof processTaskSchema>;

export function readProcessDefinition(value: unknown): ProcessDefinition | null {
  const parsed = processDefinitionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export const weekdayLabels: Record<string, string> = { MO: "Seg", TU: "Ter", WE: "Qua", TH: "Qui", FR: "Sex", SA: "Sáb", SU: "Dom" };
export function describeSchedule(s: ScheduleDefinition) {
  const frequency = s.frequency === "DAILY" ? (s.interval === 1 ? "Todos os dias" : `A cada ${s.interval} dias`) : s.frequency === "WEEKLY" ? `${s.weekdays.map(d => weekdayLabels[d]).join(", ")}${s.interval > 1 ? `, a cada ${s.interval} semanas` : ""}` : `Dia ${s.monthDay}, a cada ${s.interval} ${s.interval === 1 ? "mês" : "meses"}`;
  return `${frequency} às ${s.times.join(" e ")}`;
}
