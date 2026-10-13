import { z } from "zod";
import { defaultSchedule, formFieldSchema, processDefinitionSchema, processTaskSchema, scheduleSchema, type ProcessDefinition } from "./process-definition";

export const templateJobs = {
  RETAIL: "Varejo", FOOD: "Alimentação", FACILITIES: "Limpeza e facilities",
  LOGISTICS: "Estoque e logística", MAINTENANCE: "Manutenção e serviços", CUSTOM: "Personalizado",
} as const;
export type TemplateJob = keyof typeof templateJobs;
export const templateJobSchema = z.enum(["RETAIL", "FOOD", "FACILITIES", "LOGISTICS", "MAINTENANCE", "CUSTOM"]);
const slotSchema = z.object({ id: z.string().min(1).max(100), label: z.string().trim().max(100) }).strict();
const memberSlotSchema = slotSchema.extend({ kind: z.enum(["EXECUTOR", "APPROVER"]) });
export const templateScheduleSchema = z.object({
  frequency: scheduleSchema.shape.frequency, interval: scheduleSchema.shape.interval,
  weekdays: scheduleSchema.shape.weekdays, monthDay: scheduleSchema.shape.monthDay,
  times: scheduleSchema.shape.times, generationLeadTime: scheduleSchema.shape.generationLeadTime,
}).strict();
const templateTaskSchema = processTaskSchema.omit({
  teamId: true, primaryMemberId: true, approverIds: true, deadlineAt: true,
}).extend({
  title: z.string().trim().max(200),
  formFields: z.array(formFieldSchema.extend({ question: z.string().trim().max(500), options: z.array(z.string().trim().max(300)).max(20).default([]) })).max(50).default([]),
  teamSlotId: z.string().max(100), assigneeSlotId: z.string().max(100).default(""),
  approverSlotIds: z.array(z.string().min(1).max(100)).max(10),
});
export const reusableTemplateDraftSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().trim().max(150), description: z.string().max(1000),
  jobKey: templateJobSchema, criticality: processDefinitionSchema.shape.criticality,
  teamSlots: z.array(slotSchema).max(50), memberSlots: z.array(memberSlotSchema).max(50),
  tasks: z.array(templateTaskSchema).max(100), schedule: templateScheduleSchema.nullable(),
}).strict().superRefine((d, ctx) => {
  for (const [label, ids] of [
    ["tarefas", d.tasks.map(t => t.id)], ["papéis", [...d.teamSlots, ...d.memberSlots].map(s => s.id)],
  ] as const) if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Os identificadores de " + label + " precisam ser únicos." });
});
export type ReusableTemplateDefinition = z.infer<typeof reusableTemplateDraftSchema>;
export type TemplateBindings = {
  locationId: string; timezone: string;
  teams: Record<string, string>; members: Record<string, string>;
};
export const reusableTemplateDefinitionSchema = reusableTemplateDraftSchema.superRefine((d, ctx) => {
  if (!d.teamSlots.length || d.teamSlots.some(s => s.label.length < 2) || d.memberSlots.some(s => s.label.length < 2)) {
    ctx.addIssue({ code: "custom", message: "Dê um nome a cada papel e adicione pelo menos uma equipe." });
  }
  for (const t of d.tasks) {
    if (!d.teamSlots.some(s => s.id === t.teamSlotId)) ctx.addIssue({ code: "custom", message: "Escolha uma equipe para cada tarefa." });
    if (t.assigneeSlotId && !d.memberSlots.some(s => s.id === t.assigneeSlotId && s.kind === "EXECUTOR")) ctx.addIssue({ code: "custom", message: "Papel de executor inválido." });
    if (t.approverSlotIds.some(id => !d.memberSlots.some(s => s.id === id && s.kind === "APPROVER"))) ctx.addIssue({ code: "custom", message: "Papel de aprovação inválido." });
  }
  const operational = templateToProcess(d, {
    locationId: "template", timezone: "America/Sao_Paulo",
    teams: Object.fromEntries(d.teamSlots.map(s => [s.id, s.id])),
    members: Object.fromEntries(d.memberSlots.map(s => [s.id, s.id])),
  }, false);
  const parsed = processDefinitionSchema.safeParse(operational);
  if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ code: "custom", message: issue.message, path: issue.path });
});

export function emptyReusableTemplate(): ReusableTemplateDefinition {
  return { schemaVersion: 1, name: "", description: "", jobKey: "CUSTOM", criticality: "MEDIUM",
    teamSlots: [{ id: "team-1", label: "Operação" }],
    memberSlots: [{ id: "executor-1", label: "Executor", kind: "EXECUTOR" }, { id: "approver-1", label: "Gestor", kind: "APPROVER" }],
    tasks: [], schedule: null };
}

export function inferDependencyMode(tasks: Array<{ id: string; dependsOn: string[] }>): "FREE" | "STRICT" | "CUSTOM" {
  if (!tasks.some(t => t.dependsOn.length)) return "FREE";
  return tasks.every((t, i) => i === 0 ? !t.dependsOn.length : t.dependsOn.length === 1 && t.dependsOn[0] === tasks[i - 1].id) ? "STRICT" : "CUSTOM";
}

// Unbound copies are editor state only. Only processDefinitionSchema-validated,
// authorized concrete definitions may be persisted or materialized.
export function templateToProcess(d: ReusableTemplateDefinition, bindings: TemplateBindings, freshIds = true, makeId = () => crypto.randomUUID()): ProcessDefinition {
  const ids = new Map(d.tasks.map(t => [t.id, freshIds ? makeId() : t.id]));
  const defaults = defaultSchedule();
  return {
    name: d.name, description: d.description, criticality: d.criticality,
    locationId: bindings.locationId, validFrom: "", validUntil: "",
    schedule: d.schedule ? { ...defaults, ...d.schedule, timezone: bindings.timezone,
      startsAt: new Date().toLocaleDateString("en-CA", { timeZone: bindings.timezone }), endsAt: "", skipDates: [] } : null,
    tasks: d.tasks.map(t => {
      const { teamSlotId, assigneeSlotId, approverSlotIds, ...content } = t;
      return { ...content, id: ids.get(t.id)!, deadlineAt: "",
        formFields: t.formFields.map(f => ({ ...f, id: freshIds ? makeId() : f.id })),
        teamId: bindings.teams[teamSlotId] ?? "", primaryMemberId: bindings.members[assigneeSlotId] ?? "",
        approverIds: approverSlotIds.map(id => bindings.members[id] ?? "").filter(Boolean),
        dependsOn: t.dependsOn.map(id => ids.get(id) ?? id) };
    }),
  };
}

export function wizardToTemplate(d: ProcessDefinition, slots: Pick<ReusableTemplateDefinition, "teamSlots" | "memberSlots" | "jobKey">): ReusableTemplateDefinition {
  return {
    schemaVersion: 1, name: d.name, description: d.description, criticality: d.criticality, ...slots,
    schedule: d.schedule ? { frequency: d.schedule.frequency, interval: d.schedule.interval,
      weekdays: d.schedule.weekdays, monthDay: d.schedule.monthDay, times: d.schedule.times, generationLeadTime: d.schedule.generationLeadTime } : null,
    tasks: d.tasks.map(t => {
      const { teamId, primaryMemberId, approverIds, deadlineAt: _deadline, ...content } = t;
      return { ...content, teamSlotId: teamId, assigneeSlotId: primaryMemberId, approverSlotIds: approverIds };
    }),
  };
}

export function processToReusableTemplate(d: ProcessDefinition, jobKey: TemplateJob, teamNames: Record<string, string> = {}): ReusableTemplateDefinition {
  const teamIds = [...new Set(d.tasks.map(t => t.teamId))];
  const executorIds = [...new Set(d.tasks.map(t => t.primaryMemberId).filter(Boolean))];
  const approverIds = [...new Set(d.tasks.flatMap(t => t.approverIds))];
  const teams = new Map(teamIds.map((id, i) => [id, "team-" + (i + 1)]));
  const executors = new Map(executorIds.map((id, i) => [id, "executor-" + (i + 1)]));
  const approvers = new Map(approverIds.map((id, i) => [id, "approver-" + (i + 1)]));
  const ids = new Map(d.tasks.map((t, i) => [t.id, "task-" + (i + 1)]));
  const portable = wizardToTemplate({
    ...d,
    tasks: d.tasks.map(t => ({ ...t, id: ids.get(t.id)!, teamId: teams.get(t.teamId)!,
      primaryMemberId: executors.get(t.primaryMemberId) ?? "", approverIds: t.approverIds.map(id => approvers.get(id)!),
      dependsOn: t.dependsOn.map(id => ids.get(id)!), deadlineAt: "",
      formFields: t.formFields.map((f, i) => ({ ...f, id: "field-" + (i + 1) })),
    })),
  }, {
    jobKey, teamSlots: teamIds.map((id, i) => ({ id: teams.get(id)!, label: teamNames[id] ?? "Equipe " + (i + 1) })),
    memberSlots: [
      ...executorIds.map((id, i) => ({ id: executors.get(id)!, label: "Executor " + (i + 1), kind: "EXECUTOR" as const })),
      ...approverIds.map((id, i) => ({ id: approvers.get(id)!, label: "Aprovador " + (i + 1), kind: "APPROVER" as const })),
    ],
  });
  return reusableTemplateDraftSchema.parse(portable);
}

export type TemplateItem = {
  reference: string; id: string; name: string; description: string; jobKey: TemplateJob;
  origin: "CATALOG" | "ORGANIZATION"; status: string; version: number; revision?: number;
  hasDraft?: boolean; updatedAt?: string; definition: ReusableTemplateDefinition;
};
export function processTemplateHref(reference: string) {
  return "/management/processes/new?template=" + encodeURIComponent(reference);
}
