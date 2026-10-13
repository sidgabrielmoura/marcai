import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { templateCatalog } from "../src/infrastructure/templates/catalog";
import { reusableTemplateDefinitionSchema, reusableTemplateDraftSchema, templateToProcess, processToReusableTemplate, inferDependencyMode, emptyReusableTemplate } from "../src/domain/rules/reusable-template-definition";
import { processDefinitionSchema } from "../src/domain/rules/process-definition";
import { prisma } from "../src/infrastructure/database/prisma";
import { listTemplateLibrary, resolvePublishedTemplate, saveReusableTemplate, duplicateReusableTemplate, changeTemplateArchive, saveProcessAsReusableTemplate } from "../src/application/templates/template-library";
import { saveProcessInTransaction } from "../src/application/processes/save-process";
import { generateRoutineExecution } from "../src/application/processes/generate-execution";
import type { AuthenticatedContext } from "../src/application/security/auth-context";
import { validateFormAnswers } from "../src/domain/rules/form-answers";

let passed = 0;
function test(name: string, run: () => void) { run(); passed++; console.log("OK: " + name); }
async function rejects(name: string, run: () => Promise<unknown>) { await assert.rejects(run); passed++; console.log("OK: " + name); }
const clone = <T>(d: T): T => structuredClone(d);
test("respostas de múltipla escolha e tipos são validados; Não é resposta válida", () => {
  const fields = [{ id: "choice", type: "MULTIPLE_CHOICE", required: true, options: ["OK", "Revisar"] }, { id: "boolean", type: "BOOLEAN", required: true }, { id: "rating", type: "RATING" }];
  assert.equal(validateFormAnswers(fields, { choice: "OK", boolean: false, rating: 4 }), null);
  assert.ok(validateFormAnswers(fields, { choice: "Inventado", boolean: false }));
  assert.ok(validateFormAnswers(fields, { choice: "OK", boolean: "false" }));
  assert.ok(validateFormAnswers(fields, { choice: "OK", boolean: false, rating: 6 }));
});
test("15 templates completos, três por área e 75 etapas", () => {
  assert.equal(templateCatalog.length, 15);
  for (const key of ["RETAIL", "FOOD", "FACILITIES", "LOGISTICS", "MAINTENANCE"]) assert.equal(templateCatalog.filter(t => t.jobKey === key).length, 3);
  assert.equal(templateCatalog.reduce((sum, t) => sum + t.definition.tasks.length, 0), 75);
  for (const t of templateCatalog) assert.ok(reusableTemplateDefinitionSchema.safeParse(t.definition).success);
});
test("rascunho vazio é permitido; publicação exige etapas", () => { assert.ok(reusableTemplateDraftSchema.safeParse(emptyReusableTemplate()).success); assert.equal(reusableTemplateDefinitionSchema.safeParse(emptyReusableTemplate()).success, false); });
test("templates rejeitam IDs operacionais, resultados e datas herdadas", () => {
  const d = templateCatalog[0].definition;
  for (const field of ["locationId", "organizationId", "formAnswers", "validFrom"]) assert.equal(reusableTemplateDraftSchema.safeParse({ ...d, [field]: "private" }).success, false);
  assert.equal(reusableTemplateDraftSchema.safeParse({ ...d, tasks: [{ ...d.tasks[0], teamId: "private" }] }).success, false);
});
test("cópias recebem novos IDs e preservam o grafo", () => {
  const d = templateCatalog.find(t => t.id === "L01")!.definition;
  const bindings = { locationId: "unit", timezone: "Asia/Tokyo", teams: { "team-1": "team" }, members: { "approver-1": "approver" } };
  const a = templateToProcess(d, bindings); const b = templateToProcess(d, bindings);
  assert.equal(a.tasks[4].dependsOn.length, 4); assert.equal(inferDependencyMode(a.tasks), "CUSTOM");
  assert.ok(a.tasks.every(t => !b.tasks.some(other => other.id === t.id)));
  assert.ok(a.tasks[4].dependsOn.every(id => a.tasks.some(t => t.id === id)));
  assert.ok(a.tasks.every(t => t.deadlineAt === "")); assert.deepEqual(a.schedule?.skipDates, []); assert.equal(a.schedule?.timezone, "Asia/Tokyo");
});
test("ciclos, perguntas vazias e papéis removidos impedem publicação", () => {
  const d = clone(templateCatalog[0].definition); d.tasks[0].dependsOn = [d.tasks[4].id]; assert.equal(reusableTemplateDefinitionSchema.safeParse(d).success, false);
  const f = clone(templateCatalog.find(t => t.definition.tasks.some(t => t.taskType === "FORM"))!.definition); f.tasks.find(t => t.taskType === "FORM")!.formFields[0].question = ""; assert.equal(reusableTemplateDefinitionSchema.safeParse(f).success, false);
  assert.equal(reusableTemplateDefinitionSchema.safeParse({ ...templateCatalog[0].definition, teamSlots: [] }).success, false);
});

async function integration() {
  const key = randomUUID(); const orgIds: string[] = []; const userIds: string[] = [];
  try {
    const a = await prisma.organization.create({ data: { name: "Template regression A", slug: "template-test-a-" + key } }); orgIds.push(a.id);
    const b = await prisma.organization.create({ data: { name: "Template regression B", slug: "template-test-b-" + key } }); orgIds.push(b.id);
    const user = await prisma.user.create({ data: { name: "Template test owner" } }); userIds.push(user.id);
    const owner = await prisma.organizationMember.create({ data: { organizationId: a.id, userId: user.id, role: "OWNER" } });
    const location = await prisma.location.create({ data: { organizationId: a.id, name: "Test unit" } });
    const team = await prisma.team.create({ data: { organizationId: a.id, name: "Test team" } });
    const foreign = await prisma.team.create({ data: { organizationId: b.id, name: "Foreign team" } });
    const c: AuthenticatedContext = { userId: user.id, memberId: owner.id, userName: user.name, userEmail: null, role: "OWNER", organizationId: a.id, organizationName: a.name, organizationSlug: a.slug };
    const manager = { ...c, role: "MANAGER" as const, scope: { locationIds: [location.id], teamIds: [team.id] } };
    const d = clone(templateCatalog.find(t => t.id === "A02")!.definition);
    const saved = await saveReusableTemplate(c, { definition: d, publish: false });
    const managerDrafts = await listTemplateLibrary(manager);
    test("gestor vê catálogo; rascunhos privados ficam com o admin", () => assert.equal(managerDrafts.some(t => t.id === saved.id), false));
    await rejects("gestor não publica templates", () => saveReusableTemplate(manager, { definition: d, publish: true }));
    await rejects("outro tenant não altera rascunho", () => saveReusableTemplate({ ...c, organizationId: b.id }, { id: saved.id, revision: saved.revision, definition: d, publish: true }));
    const pub = await saveReusableTemplate(c, { id: saved.id, revision: saved.revision, definition: d, publish: true });
    const item = (await listTemplateLibrary(manager)).find(t => t.id === pub.id)!;
    assert.ok(item); assert.ok(await resolvePublishedTemplate(manager, item.reference));
    assert.equal(await resolvePublishedTemplate({ ...c, role: "EMPLOYEE" }, item.reference), null);
    assert.equal(await resolvePublishedTemplate({ ...c, organizationId: b.id }, item.reference), null);
    const originalVersion = await prisma.reusableProcessTemplateVersion.findUniqueOrThrow({ where: { id: item.reference.slice(13) } });
    const now = new Date();
    const concrete = templateToProcess(d, { locationId: location.id, timezone: location.timezone, teams: { "team-1": team.id }, members: { "approver-1": owner.id } }); concrete.schedule = null;
    concrete.tasks[0].deadlineAt = new Date(now.getTime() + 120 * 60000).toISOString(); concrete.tasks[0].priority = "HIGH"; concrete.tasks[0].criticality = "LOW";
    concrete.tasks[1].title = concrete.tasks[0].title; // task identity must not depend on labels
    assert.ok(processDefinitionSchema.safeParse(concrete).success);
    const requestId = randomUUID();
    const [one, two] = await Promise.all([1, 2].map(() => prisma.$transaction(tx => saveProcessInTransaction(tx, manager, concrete, { requestId, templateReference: item.reference }, now), { timeout: 30000 })));
    test("duplo envio gera exatamente um processo e uma execução", () => assert.equal(one.id, two.id));
    const p = await prisma.process.findUniqueOrThrow({ where: { id: one.id }, include: { sourceTemplateVersion: true, executions: { include: { tasks: { include: { approvalWorkflow: true, evidenceRequirements: true, dependencies: true } } } } } });
    test("formulários, prioridades, evidências e grafo sobrevivem à geração manual", () => {
      assert.equal(p.executions.length, 1); assert.equal(p.originReusableTemplateVersionId, originalVersion.id);
      for (const [i, t] of concrete.tasks.entries()) { const task = p.executions[0].tasks.find(v => v.definitionTaskId === t.id)!;
        assert.equal(task.definitionOrder, i); assert.equal(task.taskType, t.taskType); assert.deepEqual(task.formFields, t.formFields); assert.equal(task.priority, t.priority); assert.equal(task.criticality, t.criticality);
        assert.equal(task.dependencies.length, t.dependsOn.length); assert.equal(!!task.approvalWorkflow, !!t.approverIds.length); assert.equal(task.evidenceRequirements.length, t.evidenceType ? 1 : 0);
      }
      assert.equal(p.executions[0].tasks.find(t => t.definitionOrder === 0)!.deadlineAt!.getTime(), new Date(concrete.tasks[0].deadlineAt).getTime());
    });
    const edited = clone(concrete); edited.name = "Process edited independently"; edited.tasks[0].instructions = "New instruction for future executions";
    await prisma.$transaction(tx => saveProcessInTransaction(tx, manager, edited, { processId: p.id }));
    const preserved = await prisma.processExecution.findUniqueOrThrow({ where: { id: p.executions[0].id } });
    const concreteVersion = await prisma.process.findUniqueOrThrow({ where: { id: p.id }, include: { sourceTemplateVersion: true } });
    test("edição do processo cria versão própria e preserva sua execução anterior", () => { assert.deepEqual(preserved.definitionSnapshot, concrete); assert.notEqual(concreteVersion.sourceTemplateVersionId, p.sourceTemplateVersionId); assert.equal((concreteVersion.sourceTemplateVersion?.definition as { name: string }).name, edited.name); });
    await prisma.teamMember.create({ data: { teamId: team.id, organizationMemberId: owner.id } });
    await prisma.memberLocationAccess.create({ data: { memberId: owner.id, locationId: location.id } });
    const beforeTasks = await prisma.task.count({ where: { organizationId: a.id } });
    const beforeNotifications = await prisma.notification.count({ where: { organizationId: a.id } });
    const rollback = new Error("ROLLBACK_TEMPLATE_TEST");
    await assert.rejects(() => prisma.$transaction(async tx => {
      const assigned = clone(concrete); assigned.tasks[0].primaryMemberId = owner.id;
      const generated = await saveProcessInTransaction(tx, c, assigned, { requestId: randomUUID() });
      assert.ok(generated.notifications.length > 0);
      throw rollback;
    }, { timeout: 30000 }), error => error === rollback);
    const afterTasks = await prisma.task.count({ where: { organizationId: a.id } });
    const afterNotifications = await prisma.notification.count({ where: { organizationId: a.id } });
    test("falha reverte tarefas e notificações antes de qualquer entrega externa", () => { assert.equal(afterTasks, beforeTasks); assert.equal(afterNotifications, beforeNotifications); });
    d.name = "Changed draft";
    const draft = await saveReusableTemplate(c, { id: saved.id, revision: pub.revision, definition: d, publish: false });
    test("editar rascunho preserva a publicação e snapshots existentes", () => assert.deepEqual(p.executions[0].definitionSnapshot, concrete));
    assert.equal((await listTemplateLibrary(manager)).find(t => t.id === saved.id)!.name, item.name);
    assert.deepEqual((await prisma.reusableProcessTemplateVersion.findUniqueOrThrow({ where: { id: originalVersion.id } })).definition, originalVersion.definition);
    await rejects("revisão antiga impede sobrescrita concorrente", () => saveReusableTemplate(c, { id: saved.id, revision: pub.revision, definition: d, publish: true }));
    await rejects("processo rejeita equipe externa sem criar registros", () => prisma.$transaction(tx => saveProcessInTransaction(tx, c, { ...concrete, tasks: concrete.tasks.map(t => ({ ...t, teamId: foreign.id })) }, { requestId: randomUUID() })));
    await rejects("gestor não usa unidade fora do seu escopo", () => prisma.$transaction(tx => saveProcessInTransaction(tx, { ...manager, scope: { teamIds: [team.id], locationIds: [] } }, concrete, {})));
    const fromProcess = await saveProcessAsReusableTemplate(c, { processId: p.id, name: "Saved from process", jobKey: "FOOD", routineId: "" });
    const converted = await prisma.reusableProcessTemplate.findUniqueOrThrow({ where: { id: fromProcess.id } });
    test("salvar processo remove pessoas, equipes reais, datas e execução", () => { const content = JSON.stringify(converted.draftDefinition); for (const id of [location.id, team.id, owner.id, p.id, p.executions[0].id]) assert.equal(content.includes(id), false); });
    await duplicateReusableTemplate(c, "draft:" + fromProcess.id);
    const schedule = templateToProcess(templateCatalog[0].definition, { locationId: location.id, timezone: location.timezone, teams: { "team-1": team.id }, members: { "approver-1": owner.id } });
    const scheduled = await prisma.$transaction(tx => saveProcessInTransaction(tx, c, schedule, { requestId: randomUUID() }), { timeout: 30000 });
    const generation = await generateRoutineExecution(scheduled.routineId!, c);
    assert.ok(generation.success);
    const tasks = await prisma.task.findMany({ where: { processId: scheduled.id } });
    test("rotina usa a mesma materialização e ordenação do processo manual", () => { assert.equal(tasks.length, schedule.tasks.length); for (const [i, t] of schedule.tasks.entries()) { const task = tasks.find(v => v.definitionTaskId === t.id)!; assert.equal(task.definitionOrder, i); assert.deepEqual(task.formFields, t.formFields); } });
    await prisma.$transaction(tx => saveProcessInTransaction(tx, c, { ...schedule, schedule: null }, { processId: scheduled.id }));
    const paused = await prisma.routine.findUniqueOrThrow({ where: { id: scheduled.routineId! } });
    const count = await prisma.processExecution.count({ where: { processId: scheduled.id } });
    test("remover programação pausa a rotina e preserva execução", () => { assert.equal(paused.status, "PAUSED"); assert.equal(count, 1); });
    await changeTemplateArchive(c, saved.id, draft.revision!, true);
    assert.equal(await resolvePublishedTemplate(c, item.reference), null);
    await rejects("arquivado não pode iniciar novos processos", () => prisma.$transaction(tx => saveProcessInTransaction(tx, c, concrete, { templateReference: item.reference, requestId: randomUUID() })));
    const archived = await prisma.reusableProcessTemplate.findUniqueOrThrow({ where: { id: saved.id } });
    await changeTemplateArchive(c, saved.id, archived.draftRevision, false);
    assert.ok(await resolvePublishedTemplate(c, item.reference));
    test("arquivar e restaurar não muda processos existentes", () => assert.equal(p.originReusableTemplateVersionId, originalVersion.id));
    const restored = await prisma.reusableProcessTemplate.findUniqueOrThrow({ where: { id: saved.id } });
    await saveReusableTemplate(c, { id: saved.id, revision: restored.draftRevision, definition: d, publish: true });
    const stale = await resolvePublishedTemplate(c, item.reference);
    const currentProcess = await prisma.process.findUniqueOrThrow({ where: { id: p.id } });
    test("nova publicação rejeita seleção antiga e mantém origem do processo", () => { assert.equal(stale, null); assert.equal(currentProcess.originReusableTemplateVersionId, originalVersion.id); });
    const roundtrip = processToReusableTemplate(concrete, "FOOD"); assert.ok(reusableTemplateDefinitionSchema.safeParse(roundtrip).success);
  } finally {
    if (orgIds.length) await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}
integration().then(() => console.log(passed + " verificações de templates passaram; fixtures removidas.")).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
