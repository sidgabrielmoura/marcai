import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { nextOccurrence } from "../src/domain/rules/schedule";
import { processDefinitionSchema, scheduleSchema, type ScheduleDefinition, type ProcessTaskDefinition } from "../src/domain/rules/process-definition";
import { taskTiming } from "../src/domain/rules/task-metrics";
import { canStartTask, canCompleteTask, canAccessTask, canEditTask } from "../src/domain/rules/task-rules";
import { evaluateTaskDependencies, type DependencyCheckItem } from "../src/domain/rules/dependency-rules";
import { canGenerateExecutionForRoutine, resolveExecutionInitialStatus } from "../src/domain/rules/routine-generator";

const cases: Array<[string, () => void]> = [];
function test(name: string, run: () => void) { cases.push([name, run]); }
const base: ScheduleDefinition = { frequency: "DAILY", interval: 1, weekdays: ["MO"], monthDay: 1, times: ["07:00"], startsAt: "2026-09-24", endsAt: "", timezone: "America/Sao_Paulo", generationLeadTime: 1440, pendingPreviousPolicy: "CREATE_NEW", skipDates: [] };
function occurrence(s: Partial<ScheduleDefinition>, after: string) {
  const schedule = { ...base, ...s };
  return nextOccurrence(JSON.stringify(schedule), new Date(schedule.startsAt), schedule.endsAt ? new Date(`${schedule.endsAt}T23:59:59Z`) : null, schedule.timezone, new Date(after))?.toISOString() ?? null;
}

test("07:00 São Paulo corresponde a 10:00Z", () => assert.equal(occurrence({}, "2026-09-24T00:00:00Z"), "2026-09-24T10:00:00.000Z"));
test("primeiro dia em fuso positivo não é cortado pela meia-noite UTC", () => assert.equal(occurrence({ timezone: "Asia/Tokyo" }, "2026-09-23T00:00:00Z"), "2026-09-23T22:00:00.000Z"));
test("próxima ocorrência é estritamente posterior à anterior", () => assert.equal(occurrence({}, "2026-09-24T10:00:00Z"), "2026-09-25T10:00:00.000Z"));
test("múltiplos horários escolhem o primeiro ainda futuro", () => assert.equal(occurrence({ times: ["17:00", "07:00", "12:30"] }, "2026-09-24T10:00:00Z"), "2026-09-24T15:30:00.000Z"));
test("exceção remove todos os horários daquele dia local", () => assert.equal(occurrence({ times: ["07:00", "17:00"], skipDates: ["2026-09-24"] }, "2026-09-24T00:00:00Z"), "2026-09-25T10:00:00.000Z"));
test("validade final inclui horário noturno que cai no dia UTC seguinte", () => assert.equal(occurrence({ times: ["23:30"], endsAt: "2026-09-24" }, "2026-09-24T10:00:00Z"), "2026-09-25T02:30:00.000Z"));
test("não gera depois do último dia local", () => assert.equal(occurrence({ endsAt: "2026-09-24" }, "2026-09-24T10:00:00Z"), null));
test("intervalo diário continua ancorado na data inicial", () => assert.equal(occurrence({ interval: 3 }, "2026-09-25T10:00:00Z"), "2026-09-27T10:00:00.000Z"));
test("semanal respeita dias selecionados", () => assert.equal(occurrence({ frequency: "WEEKLY", weekdays: ["MO", "WE"] }, "2026-09-24T00:00:00Z"), "2026-09-28T10:00:00.000Z"));
test("mensal dia 31 ignora mês sem esse dia", () => assert.equal(occurrence({ frequency: "MONTHLY", startsAt: "2026-01-01", monthDay: 31 }, "2026-01-31T10:00:00Z"), "2026-03-31T10:00:00.000Z"));
test("DST mantém 07:00 local após mudança de offset", () => assert.equal(occurrence({ timezone: "America/New_York", startsAt: "2026-03-01" }, "2026-03-07T12:00:00Z"), "2026-03-08T11:00:00.000Z"));
test("horário inexistente na transição DST é ignorado", () => assert.equal(occurrence({ timezone: "America/New_York", startsAt: "2026-03-01", times: ["02:30"] }, "2026-03-07T07:30:00Z"), "2026-03-09T06:30:00.000Z"));
test("horário ambíguo no fim do DST gera só a primeira ocorrência", () => assert.equal(occurrence({ timezone: "America/New_York", startsAt: "2026-10-01", times: ["01:30"] }, "2026-11-01T05:30:00Z"), "2026-11-02T06:30:00.000Z"));
test("offset fracionário é preservado", () => assert.equal(occurrence({ timezone: "Asia/Kathmandu" }, "2026-09-24T00:00:00Z"), "2026-09-24T01:15:00.000Z"));
test("RRULE legado respeita o fuso informado", () => assert.equal(nextOccurrence("FREQ=DAILY;BYHOUR=7;BYMINUTE=0;BYSECOND=0", new Date("2026-09-24T00:00:00Z"), null, "America/Sao_Paulo", new Date("2026-09-24T00:00:00Z"))?.toISOString(), "2026-09-24T10:00:00.000Z"));
test("RRULE legado de minuto não esgota a busca", () => assert.equal(nextOccurrence("FREQ=MINUTELY;INTERVAL=5;BYSECOND=0", new Date("2026-09-24T00:00:00Z"), null, "America/Sao_Paulo", new Date("2026-09-24T10:02:00Z"))?.toISOString(), "2026-09-24T10:05:00.000Z"));
test("DST de meia hora ignora o horário inexistente", () => assert.equal(occurrence({ timezone: "Australia/Lord_Howe", startsAt: "2026-10-01", times: ["02:15"] }, "2026-10-02T15:45:00Z"), "2026-10-04T15:15:00.000Z"));
test("mudança de linha internacional ignora um dia local inexistente", () => assert.equal(occurrence({ timezone: "Pacific/Apia", startsAt: "2011-12-29", times: ["00:00"] }, "2011-12-29T10:00:00Z"), "2011-12-30T10:00:00.000Z"));
test("recorrência inválida não interrompe processamento das demais", () => assert.equal(nextOccurrence("INVALID-RULE", new Date(base.startsAt), null, base.timezone, new Date(base.startsAt)), null));
test("data impossível é rejeitada", () => assert.equal(scheduleSchema.safeParse({ ...base, startsAt: "2026-02-30" }).success, false));
test("exceção vazia é rejeitada", () => assert.equal(scheduleSchema.safeParse({ ...base, skipDates: [""] }).success, false));
test("horários repetidos são rejeitados", () => assert.equal(scheduleSchema.safeParse({ ...base, times: ["07:00", "07:00"] }).success, false));

const task: ProcessTaskDefinition = { id: "one", title: "Conferir caixa", instructions: "", teamId: "team", primaryMemberId: "", estimatedDuration: 10, slaMinutes: 20, required: true, evidenceType: "PHOTO", dependsOn: [], dependencyType: "BLOCKING", dependencyLogic: "AND", approverIds: [], approvalMode: "SEQUENTIAL" };
function validTasks(tasks: ProcessTaskDefinition[]) { return processDefinitionSchema.safeParse({ name: "Abertura da loja", description: "", locationId: "location", criticality: "HIGH", validFrom: "", validUntil: "", schedule: base, tasks }).success; }
test("fluxo acíclico válido é aceito", () => assert.equal(validTasks([task, { ...task, id: "two", dependsOn: ["one"] }]), true));
test("ciclo é rejeitado", () => assert.equal(validTasks([{ ...task, dependsOn: ["two"] }, { ...task, id: "two", dependsOn: ["one"] }]), false));
test("dependência removida é rejeitada", () => assert.equal(validTasks([{ ...task, dependsOn: ["gone"] }]), false));
test("identificadores repetidos são rejeitados", () => assert.equal(validTasks([task, task]), false));
test("condição de aprovação exige aprovadores no predecessor", () => assert.equal(validTasks([task, { ...task, id: "two", dependsOn: ["one"], dependencyType: "APPROVAL_CONDITION" }]), false));
test("aprovadores duplicados são rejeitados", () => assert.equal(validTasks([{ ...task, approverIds: ["manager", "manager"] }]), false));

const dep: DependencyCheckItem = { dependsOnTaskId: "one", dependsOnStatus: "COMPLETED", type: "BLOCKING", logic: "AND" };
test("AND exige todas as dependências", () => assert.equal(evaluateTaskDependencies([dep, { ...dep, dependsOnTaskId: "two", dependsOnStatus: "IN_PROGRESS" }]).isBlocked, true));
test("OR permite qualquer dependência concluída", () => assert.equal(evaluateTaskDependencies([{ ...dep, logic: "OR" }, { ...dep, dependsOnTaskId: "two", dependsOnStatus: "IN_PROGRESS", logic: "OR" }]).isBlocked, false));
test("alternativa OR satisfeita não dispensa um requisito AND pendente", () => assert.equal(evaluateTaskDependencies([{ ...dep, logic: "OR" }, { ...dep, dependsOnTaskId: "two", dependsOnStatus: "IN_PROGRESS", logic: "AND" }]).isBlocked, true));
test("cancelamento do predecessor não conta como conclusão", () => assert.equal(evaluateTaskDependencies([{ ...dep, dependsOnStatus: "CANCELLED" }]).isBlocked, true));
test("aprovação pendente mantém dependência bloqueada", () => assert.equal(evaluateTaskDependencies([{ ...dep, type: "APPROVAL_CONDITION", dependsOnApprovalStatus: "PENDING" }]).isBlocked, true));
test("informativo não bloqueia", () => assert.equal(evaluateTaskDependencies([{ ...dep, type: "INFORMATIVE", dependsOnStatus: "IN_PROGRESS" }]).isBlocked, false));
test("pausa só é retomada pela ação própria", () => assert.equal(canStartTask("PAUSED").allowed, false));
test("tarefa bloqueada não inicia", () => assert.equal(canStartTask("AVAILABLE", true).allowed, false));
test("evidência respeita quantidade mínima", () => assert.equal(canCompleteTask("IN_PROGRESS", [{ id: "photo", required: true, minQuantity: 2, validSubmissionsCount: 1, failedAttemptsCount: 0 }]).allowed, false));
test("3 falhas geram exceção crítica", () => assert.equal(canCompleteTask("IN_PROGRESS", [{ id: "photo", required: true, minQuantity: 2, validSubmissionsCount: 0, failedAttemptsCount: 3 }]).generateOccurrence?.severity, "CRITICAL"));
test("exceção de uma evidência não dispensa outras pendentes", () => assert.equal(canCompleteTask("IN_PROGRESS", [{ id: "photo", required: true, validSubmissionsCount: 0, failedAttemptsCount: 3 }, { id: "text", required: true, validSubmissionsCount: 0, failedAttemptsCount: 0 }]).allowed, false));
test("funcionário não acessa tarefa atribuída a outro", () => assert.equal(canAccessTask("EMPLOYEE", "one", ["two"]), false));
test("gestor precisa de unidade E equipe permitidas", () => assert.equal(canAccessTask("MANAGER", "manager", [], { locationIds: ["loc"], teamIds: ["team"] }, "loc", "other"), false));
test("correção não libera edição da definição de tarefa", () => assert.equal(canEditTask("NEEDS_CORRECTION").allowed, false));
const now = new Date("2026-09-24T12:00:00Z");
const late = { deadlineAt: new Date("2026-09-24T10:00:00Z"), slaDueAt: new Date("2026-09-24T11:00:00Z"), completedAt: null };
for (const status of ["CANCELLED", "NOT_COMPLETED", "BLOCKED"]) test(`${status} não entra no atraso SLA`, () => assert.deepEqual(taskTiming({ ...late, status }, now), { isOverdue: false, slaExceeded: false, delayMinutes: 0 }));
test("atraso SLA usa vencimento do SLA, não prazo geral", () => assert.equal(taskTiming({ ...late, status: "PAUSED" }, now).delayMinutes, 60));
test("conclusão congela tempo medido", () => assert.equal(taskTiming({ ...late, status: "COMPLETED", completedAt: new Date("2026-09-24T11:15:00Z") }, now).delayMinutes, 15));
test("data futura produz execução programada", () => assert.equal(resolveExecutionInitialStatus(new Date(now.getTime() + 1), now), "SCHEDULED"));
test("horário atingido produz execução em andamento", () => assert.equal(resolveExecutionInitialStatus(now, now), "IN_PROGRESS"));
test("política bloqueia execução anterior pendente", () => assert.equal(canGenerateExecutionForRoutine("BLOCK_NEW", { id: "old", status: "PENDING_REVIEW", scheduledAt: now }).shouldGenerate, false));
test("cancelada não bloqueia próxima execução", () => assert.equal(canGenerateExecutionForRoutine("SKIP_IF_PENDING", { id: "old", status: "CANCELLED", scheduledAt: now }).shouldGenerate, true));

if (!process.env.OPERATIONAL_TEST_WORKER) {
  for (const timezone of ["UTC", "America/Sao_Paulo", "Asia/Tokyo"]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url)], { encoding: "utf8", env: { ...process.env, TZ: timezone, OPERATIONAL_TEST_WORKER: "1" } });
    process.stdout.write(result.stdout); process.stderr.write(result.stderr);
    if (result.status !== 0) process.exitCode = 1;
  }
} else {
  let failed = 0;
  for (const [name, run] of cases) try { run(); } catch (error) { failed++; console.error(`FALHOU (${process.env.TZ}): ${name}\n${String(error)}`); }
  console.log(`${process.env.TZ}: ${cases.length - failed}/${cases.length} verificações passaram.`);
  if (failed) process.exitCode = 1;
}
