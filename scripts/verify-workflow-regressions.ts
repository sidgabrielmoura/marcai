import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/infrastructure/database/prisma";
import { resolveExecutionStatus, effectiveWorkSeconds } from "../src/domain/rules/execution-state";
import { canEditTaskDefinition, taskEditSchema } from "../src/domain/rules/task-edit";
import { memberAccessSchema, canManageMember } from "../src/domain/rules/member-access";
import { totpAt, verifyTotp, sealTotp, openTotp, secondFactorProof, hasSecondFactorProof } from "../src/infrastructure/security/totp";
import { changeExecutionState } from "../src/application/processes/execution-lifecycle";
import { synchronizeExecution } from "../src/application/tasks/synchronize-execution";
import { getEvidenceRound, evidenceInRound } from "../src/application/tasks/evidence-round";
import { updateMemberAccess } from "../src/application/security/update-member-access";
import { eligibleMember, taskScope } from "../src/application/security/operational-scope";
import type { AuthenticatedContext } from "../src/application/security/auth-context";

let passed = 0;
function test(name: string, run: () => void) { run(); passed++; console.log(`OK: ${name}`); }
const now = new Date("2026-09-25T12:00:00Z");
const item = { required: true, status: "AVAILABLE", startedAt: null as Date | null };
const execution = { status: "AVAILABLE", availableAt: now, tasks: [item] };
test("opcionais não bloqueiam nem quando todas as tarefas são opcionais", () => assert.equal(resolveExecutionStatus({ ...execution, tasks: [{ ...item, required: false }] }, now), "COMPLETED"));
test("execução futura só se encerra após disponibilidade", () => assert.equal(resolveExecutionStatus({ ...execution, availableAt: new Date(now.getTime() + 1), tasks: [{ ...item, required: false }] }, now), "SCHEDULED"));
test("aprovação obrigatória pendente impede conclusão", () => assert.equal(resolveExecutionStatus({ ...execution, tasks: [{ ...item, status: "COMPLETED", approvalWorkflow: { status: "PENDING" } }] }, now), "PENDING_REVIEW"));
test("tarefa pausada se reflete na execução", () => assert.equal(resolveExecutionStatus({ ...execution, tasks: [{ ...item, status: "PAUSED", startedAt: now }] }, now), "PAUSED"));
test("atualização opcional não reabre execução concluída", () => assert.equal(resolveExecutionStatus({ ...execution, status: "COMPLETED" }, now), "COMPLETED"));
test("duração efetiva desconta pausa de 2 minutos", () => assert.equal(effectiveWorkSeconds([{ startedAt: new Date(now.getTime() - 600000), endedAt: null, pauses: [{ startedAt: new Date(now.getTime() - 180000), endedAt: new Date(now.getTime() - 60000) }] }], now), 480));
test("admin não altera proprietário nem outro admin", () => { assert.equal(canManageMember("ADMIN", "actor", { id: "target", role: "OWNER" }), false); assert.equal(canManageMember("ADMIN", "actor", { id: "target", role: "ADMIN" }), false); });
test("gestor não concede acesso e admin não promove a admin", () => { assert.equal(canManageMember("MANAGER", "actor", { id: "target", role: "EMPLOYEE" }), false); assert.equal(canManageMember("ADMIN", "actor", { id: "target", role: "EMPLOYEE" }, "ADMIN"), false); });
test("acesso temporário precisa de início e fim válidos", () => assert.equal(memberAccessSchema.safeParse({ memberId: "member", role: "EMPLOYEE", teamIds: [], primaryTeamId: "", locations: [{ locationId: "location", type: "TEMPORARY", startsAt: null, expiresAt: null }] }).success, false));

test("transferência não permite editar definição já iniciada", () => assert.equal(canEditTaskDefinition({status: "AVAILABLE", startedAt: now}), false));
test("definição disponível e ainda não iniciada pode ser editada", () => assert.equal(canEditTaskDefinition({status: "AVAILABLE", startedAt: null}), true));
test("edição rejeita duração negativa e data inválida", () => assert.equal(taskEditSchema.safeParse({title: "Tarefa", description: "", instructions: "", priority: "MEDIUM", criticality: "MEDIUM", required: true, deadlineAt: "invalid", estimatedDuration: -1}).success, false));

const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
for (const [time, expected] of [[59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"], [1234567890, "89005924"], [2000000000, "69279037"], [20000000000, "65353130"]] as const) test(`TOTP vetor RFC 6238 em ${time}`, () => assert.equal(totpAt(secret, time * 1000, 8), expected));
test("TOTP rejeita replay e código fora da janela", () => { const code = totpAt(secret, now.getTime()); const counter = verifyTotp(secret, code, -1, now.getTime()); assert.notEqual(counter, null); assert.equal(verifyTotp(secret, code, counter!, now.getTime()), null); assert.equal(verifyTotp(secret, code, -1, now.getTime() + 120000), null); });
test("segredo cifrado e prova resistem a adulteração", () => {
  const record = { secret, lastCounter: -1, failures: 0, lockedUntil: 0 };
  const encrypted = sealTotp(record);
  assert.deepEqual(openTotp(encrypted), record);
  assert.equal(encrypted.includes(secret), false);
  const bytes = Buffer.from(encrypted.slice(3), "base64url"); bytes[30] ^= 1;
  assert.throws(() => openTotp("v1:" + bytes.toString("base64url")));
  assert.equal(hasSecondFactorProof({ twoFactorEnabled: true, twoFactorSecret: encrypted }, secondFactorProof(encrypted)), true);
  assert.equal(hasSecondFactorProof({ twoFactorEnabled: true, twoFactorSecret: encrypted }, "wrong"), false);
  assert.equal(hasSecondFactorProof({ platformRole: "SUPERADMIN", twoFactorEnabled: false, twoFactorSecret: null }), false);
});

async function integration() {
  // Every fixture and every mutation below is rolled back, including on failure.
  const rollback = new Error("ROLLBACK_TEST_FIXTURES");
  try { await prisma.$transaction(async tx => {
    const key = randomUUID();
    const a = await tx.organization.create({ data: { name: "Regression A", slug: `regression-a-${key}` } });
    const b = await tx.organization.create({ data: { name: "Regression B", slug: `regression-b-${key}` } });
    const user = await tx.user.create({ data: { name: "Regression user" } });
    const owner = await tx.organizationMember.create({ data: { organizationId: a.id, userId: user.id, role: "OWNER" } });
    const employeeUser = await tx.user.create({ data: { name: "Regression employee" } });
    const member = await tx.organizationMember.create({ data: { organizationId: a.id, userId: employeeUser.id, role: "EMPLOYEE" } });
    const location = await tx.location.create({ data: { organizationId: a.id, name: "Regression location" } });
    const team = await tx.team.create({ data: { organizationId: a.id, name: "Regression team" } });
    const foreignTeam = await tx.team.create({ data: { organizationId: b.id, name: "Foreign team" } });
    const c: AuthenticatedContext = { userId: user.id, memberId: owner.id, userName: user.name, userEmail: null, role: "OWNER", organizationId: a.id, organizationName: a.name, organizationSlug: a.slug };
    const input = { memberId: member.id, role: "EMPLOYEE", teamIds: [team.id], primaryTeamId: team.id, locations: [{ locationId: location.id, type: "TEMPORARY", startsAt: "2020-01-01T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z" }] };
    assert.equal((await updateMemberAccess(tx, c, input)).success, true);
    const savedAccess = await tx.organizationMember.findUniqueOrThrow({where:{id:member.id},include:{teamMemberships:true,locationAccesses:true}});
    test("equipe principal e acesso temporal são persistidos", () => { assert.equal(savedAccess.teamMemberships[0].teamId, team.id); assert.equal(savedAccess.teamMemberships[0].isPrimary,true); assert.equal(savedAccess.locationAccesses[0].expiresAt?.toISOString(),input.locations[0].expiresAt.replace("Z", ".000Z")); });
    assert.ok(await eligibleMember(a.id, member.id, location.id, team.id, tx));
    const foreignGrant = await updateMemberAccess(tx, c, { ...input, teamIds: [foreignTeam.id], primaryTeamId: foreignTeam.id });
    test("não concede equipe de outro tenant", () => assert.ok(foreignGrant.error));
    const foreignEdit = await updateMemberAccess(tx, { ...c, organizationId: b.id }, input);
    test("não altera pessoa de outro tenant", () => assert.ok(foreignEdit.error));
    const process = await tx.process.create({ data: { organizationId: a.id, name: "Regression process", locationId: location.id, createdBy: owner.id } });
    const exec = await tx.processExecution.create({ data: { organizationId: a.id, processId: process.id, locationId: location.id, scheduledAt: now, availableAt: now, status: "IN_PROGRESS" } });
    const task = await tx.task.create({ data: { organizationId: a.id, executionId: exec.id, locationId: location.id, teamId: team.id, title: "Regression task", status: "PAUSED", startedAt: now, assignments: { create: { memberId: member.id } }, sessions: { create: { memberId: member.id, startedAt: now, pauses: { create: { startedAt: now } } } }, evidenceRequirements: { create: { type: "TEXT", submissions: { create: { submittedBy: member.id, value: "Original evidence", createdAt: new Date("2020-01-01") } } } } } });
    const done = await tx.task.create({ data: { organizationId: a.id, executionId: exec.id, title: "Completed", status: "COMPLETED", completedAt: now, required: false } });
    assert.ok((await changeExecutionState(tx, { ...c, organizationId: b.id }, exec.id, "CANCEL", "Wrong tenant")).error);
    assert.ok((await changeExecutionState(tx, { ...c, role: "MANAGER", scope: { locationIds: [location.id], teamIds: [] } }, exec.id, "CANCEL", "Outside team")).error);
    assert.equal((await changeExecutionState(tx, c, exec.id, "CANCEL", "Operational reason")).success, true);
    const cancelled = await tx.task.findUniqueOrThrow({ where: { id: task.id }, include: { sessions: { include: { pauses: true } } } });
    test("cancelamento encerra tarefa, sessão e pausa", () => { assert.equal(cancelled.status, "CANCELLED"); assert.ok(cancelled.sessions[0].endedAt); assert.ok(cancelled.sessions[0].pauses[0].endedAt); });
    const preserved = await tx.task.findUniqueOrThrow({ where: { id: done.id } });
    test("tarefa concluída é preservada", () => assert.equal(preserved.status, "COMPLETED"));
    assert.equal(await tx.notification.count({ where: { organizationId: a.id, userId: employeeUser.id, type: "TASK_CANCELLED" } }), 1);
    assert.ok((await changeExecutionState(tx, c, exec.id, "CANCEL", "Repeated cancel")).error);
    const notices = await tx.notification.count({ where: { organizationId: a.id, userId: employeeUser.id, type: "TASK_CANCELLED" } });
    test("cancelamento repetido não duplica aviso", () => assert.equal(notices, 1));
    await tx.processExecution.update({ where: { id: exec.id }, data: { status: "COMPLETED", completedAt: now } });
    await tx.task.update({ where: { id: task.id }, data: { status: "COMPLETED", completedAt: now } });
    assert.equal((await changeExecutionState(tx, c, exec.id, "REOPEN", "Need new evidence")).success, true);
    const round = await getEvidenceRound(tx, a.id, task.id);
    const previous = await tx.evidenceSubmission.findMany({ where: { requirement: { taskId: task.id } } });
    test("reabertura preserva histórico sem aceitar evidência antiga", () => { assert.equal(previous.length, 1); assert.ok(round); assert.equal(evidenceInRound(previous, round).length, 0); });
    await synchronizeExecution(tx, a.id, exec.id);
    assert.equal((await tx.processExecution.findUniqueOrThrow({ where: { id: exec.id } })).status, "NEEDS_CORRECTION");
    const expired = { ...input, locations: [{ ...input.locations[0], expiresAt: "2020-01-02T00:00:00Z" }] };
    assert.equal((await updateMemberAccess(tx, c, expired)).success, true);
    const expiredEligibility = await eligibleMember(a.id, member.id, location.id, team.id, tx);
    const employeeContext = { ...c, userId: employeeUser.id, memberId: member.id, role: "EMPLOYEE" as const, scope: { locationIds: [], teamIds: [team.id] } };
    const visibleTasks = await tx.task.count({ where: taskScope(employeeContext) });
    test("expiração revoga execução e leitura de tarefas atribuídas", () => {assert.equal(expiredEligibility, null);assert.equal(visibleTasks,0);});
    await tx.task.update({ where: { id: task.id }, data: { status: "BLOCKED" } });
    await synchronizeExecution(tx, a.id, exec.id);
    const blocked = await tx.task.findUniqueOrThrow({ where: { id: task.id } });
    test("dependência não libera executor com acesso vencido", () => assert.equal(blocked.status, "BLOCKED"));
    throw rollback;
  }, { maxWait: 30000, timeout: 120000 }); } catch (error) { if (error !== rollback) throw error; }
}

integration().then(() => console.log(`${passed} verificações passaram; fixtures revertidas.`)).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
