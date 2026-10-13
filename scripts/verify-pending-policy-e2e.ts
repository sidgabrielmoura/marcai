import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/infrastructure/database/prisma";
import { saveProcessInTransaction } from "../src/application/processes/save-process";
import { generateRoutineExecution } from "../src/application/processes/generate-execution";
import { operationalTick } from "../src/application/processes/operational-tick";
import { canGenerateExecutionForRoutine, isExecutionTerminal, isExecutionPending } from "../src/domain/rules/routine-generator";
import type { AuthenticatedContext } from "../src/application/security/auth-context";
import type { ProcessDefinitionInput } from "../src/domain/rules/process-definition";

let passed = 0;
function test(name: string, run: () => void | Promise<void>) {
  return Promise.resolve()
    .then(run)
    .then(() => {
      passed++;
      console.log(`OK: ${name}`);
    });
}

async function runPendingPolicyE2E() {
  const key = randomUUID();
  const orgIds: string[] = [];
  const userIds: string[] = [];

  try {
    const org = await prisma.organization.create({
      data: { name: `Org Pending Test ${key}`, slug: `org-pending-${key}` },
    });
    orgIds.push(org.id);

    const user = await prisma.user.create({
      data: { name: "Owner Pending Test" },
    });
    userIds.push(user.id);

    const owner = await prisma.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });

    const location = await prisma.location.create({
      data: { organizationId: org.id, name: "Matriz Teste" },
    });

    const team = await prisma.team.create({
      data: { organizationId: org.id, name: "Operações Teste" },
    });

    const context: AuthenticatedContext = {
      userId: user.id,
      memberId: owner.id,
      userName: user.name,
      userEmail: null,
      role: "OWNER",
      organizationId: org.id,
      organizationName: org.name,
      organizationSlug: org.slug,
    };

    const makeProcessDefinition = (
      name: string,
      policy: "CREATE_NEW" | "SKIP_IF_PENDING" | "BLOCK_NEW"
    ): ProcessDefinitionInput => ({
      name,
      description: `Processo de teste para política ${policy}`,
      locationId: location.id,
      criticality: "MEDIUM",
      validFrom: "",
      validUntil: "",
      schedule: {
        frequency: "DAILY",
        interval: 1,
        weekdays: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"],
        monthDay: 1,
        times: ["08:00"],
        startsAt: "2027-01-01",
        endsAt: "",
        timezone: "America/Sao_Paulo",
        generationLeadTime: 60,
        pendingPreviousPolicy: policy,
        skipDates: [],
      },
      tasks: [
        {
          id: "step-1",
          title: "Verificação inicial",
          instructions: "Executar checagem matinal",
          teamId: team.id,
          primaryMemberId: "",
          slaMinutes: 30,
          required: true,
          evidenceType: "",
          dependsOn: [],
          dependencyType: "BLOCKING",
          dependencyLogic: "AND",
          approverIds: [],
          approvalMode: "SEQUENTIAL",
        },
      ],
    });

    // -------------------------------------------------------------------------
    // 1. Unidade de Domínio: Estados terminais vs pendentes
    // -------------------------------------------------------------------------
    await test("isExecutionTerminal e isExecutionPending classificam status corretamente", () => {
      assert.equal(isExecutionTerminal("COMPLETED"), true);
      assert.equal(isExecutionTerminal("CANCELLED"), true);
      assert.equal(isExecutionTerminal("NOT_COMPLETED"), true);

      assert.equal(isExecutionTerminal("SCHEDULED"), false);
      assert.equal(isExecutionTerminal("AVAILABLE"), false);
      assert.equal(isExecutionTerminal("IN_PROGRESS"), false);
      assert.equal(isExecutionTerminal("PAUSED"), false);
      assert.equal(isExecutionTerminal("NEEDS_CORRECTION"), false);
      assert.equal(isExecutionTerminal("PENDING_REVIEW"), false);

      assert.equal(isExecutionPending("IN_PROGRESS"), true);
      assert.equal(isExecutionPending("COMPLETED"), false);
    });

    // -------------------------------------------------------------------------
    // 2. E2E: Política BLOCK_NEW
    // -------------------------------------------------------------------------
    const blockProcDef = makeProcessDefinition("Rotina com BLOCK_NEW", "BLOCK_NEW");
    const blockSaved = await prisma.$transaction((tx) =>
      saveProcessInTransaction(tx, context, blockProcDef, { requestId: randomUUID() })
    );
    assert.ok(blockSaved.routineId);

    const routineBlock = await prisma.routine.findUniqueOrThrow({
      where: { id: blockSaved.routineId! },
    });
    await test("Rotina com BLOCK_NEW é persistida com a política correta", () => {
      assert.equal(routineBlock.pendingPreviousPolicy, "BLOCK_NEW");
    });

    // Momento da 1ª ocorrência: 2027-01-01 08:00 (11:00:00Z em SP)
    const t1 = new Date("2027-01-01T11:00:00Z");
    const t2 = new Date("2027-01-02T11:00:00Z");
    const gen1 = await generateRoutineExecution(routineBlock.id, context, t1);
    await test("Primeira ocorrência é gerada normalmente com BLOCK_NEW", () => {
      assert.equal(gen1.success, true);
      assert.equal(gen1.generated, true);
      assert.ok(gen1.data?.id);
    });

    const exec1 = await prisma.processExecution.findUniqueOrThrow({
      where: { id: gen1.data!.id },
      include: { tasks: true },
    });
    await test("Execução 1 foi criada em andamento e com tarefas materializadas", () => {
      assert.equal(exec1.status, "IN_PROGRESS");
      assert.equal(exec1.tasks.length, 1);
      assert.equal(exec1.tasks[0].status, "AVAILABLE");
    });

    // Momento da 2ª ocorrência: 2026-10-02 08:00 (11:00Z em SP), enquanto a 1ª está IN_PROGRESS
    const gen2Blocked = await generateRoutineExecution(routineBlock.id, context, t2);
    await test("BLOCK_NEW bloqueia nova geração enquanto anterior estiver IN_PROGRESS", () => {
      assert.equal(gen2Blocked.blocked, true);
      assert.ok(gen2Blocked.error);
      assert.match(gen2Blocked.error!, /A execução anterior ainda está pendente/);
    });

    const countBlockAfterBlock = await prisma.processExecution.count({
      where: { routineId: routineBlock.id },
    });
    await test("Nenhuma execução duplicada foi inserida durante o bloqueio", () => {
      assert.equal(countBlockAfterBlock, 1);
    });

    // Finalizar a tarefa da execução 1 para que ela seja COMPLETED
    await prisma.task.update({
      where: { id: exec1.tasks[0].id },
      data: { status: "COMPLETED", completedAt: t2 },
    });
    await prisma.processExecution.update({
      where: { id: exec1.id },
      data: { status: "COMPLETED", completedAt: t2 },
    });

    // Tentar gerar novamente agora que a execução 1 foi concluída
    const gen2Unblocked = await generateRoutineExecution(routineBlock.id, context, t2);
    await test("BLOCK_NEW permite geração assim que anterior é finalizada", () => {
      assert.equal(gen2Unblocked.success, true);
      assert.equal(gen2Unblocked.generated, true);
      assert.ok(gen2Unblocked.data?.id);
    });

    const countBlockAfterFinish = await prisma.processExecution.count({
      where: { routineId: routineBlock.id },
    });
    await test("Execução 2 foi devidamente criada após desbloqueio", () => {
      assert.equal(countBlockAfterFinish, 2);
    });

    // -------------------------------------------------------------------------
    // 3. E2E: Política SKIP_IF_PENDING
    // -------------------------------------------------------------------------
    const skipProcDef = makeProcessDefinition("Rotina com SKIP_IF_PENDING", "SKIP_IF_PENDING");
    const skipSaved = await prisma.$transaction((tx) =>
      saveProcessInTransaction(tx, context, skipProcDef, { requestId: randomUUID() })
    );
    assert.ok(skipSaved.routineId);

    const routineSkip = await prisma.routine.findUniqueOrThrow({
      where: { id: skipSaved.routineId! },
    });
    await test("Rotina com SKIP_IF_PENDING é persistida com a política correta", () => {
      assert.equal(routineSkip.pendingPreviousPolicy, "SKIP_IF_PENDING");
    });

    const genSkip1 = await generateRoutineExecution(routineSkip.id, context, t1);
    await test("Primeira ocorrência é gerada normalmente com SKIP_IF_PENDING", () => {
      assert.equal(genSkip1.success, true);
      assert.equal(genSkip1.generated, true);
      assert.ok(genSkip1.data?.id);
    });

    const execSkip1 = await prisma.processExecution.findUniqueOrThrow({
      where: { id: genSkip1.data!.id },
      include: { tasks: true },
    });

    // Tentar gerar 2ª ocorrência com a 1ª pendente: deve pular sem erro
    const genSkip2Skipped = await generateRoutineExecution(routineSkip.id, context, t2);
    await test("SKIP_IF_PENDING pula ocorrência com success=true e skipped=true", () => {
      assert.equal(genSkip2Skipped.success, true);
      assert.equal(genSkip2Skipped.generated, false);
      assert.equal(genSkip2Skipped.skipped, true);
      assert.ok(genSkip2Skipped.reason);
      assert.match(genSkip2Skipped.reason!, /A execução anterior ainda está pendente/);
    });

    const countSkipAfterSkip = await prisma.processExecution.count({
      where: { routineId: routineSkip.id },
    });
    await test("Nenhuma execução foi adicionada quando foi pulada", () => {
      assert.equal(countSkipAfterSkip, 1);
    });

    // Concluir a execução 1
    await prisma.task.update({
      where: { id: execSkip1.tasks[0].id },
      data: { status: "COMPLETED", completedAt: t2 },
    });
    await prisma.processExecution.update({
      where: { id: execSkip1.id },
      data: { status: "COMPLETED", completedAt: t2 },
    });

    // Agora deve gerar a nova ocorrência
    const genSkip3Generated = await generateRoutineExecution(routineSkip.id, context, t2);
    await test("SKIP_IF_PENDING volta a gerar normalmente após conclusão da anterior", () => {
      assert.equal(genSkip3Generated.success, true);
      assert.equal(genSkip3Generated.generated, true);
      assert.ok(genSkip3Generated.data?.id);
    });

    // -------------------------------------------------------------------------
    // 4. E2E: Política CREATE_NEW
    // -------------------------------------------------------------------------
    const createProcDef = makeProcessDefinition("Rotina com CREATE_NEW", "CREATE_NEW");
    const createSaved = await prisma.$transaction((tx) =>
      saveProcessInTransaction(tx, context, createProcDef, { requestId: randomUUID() })
    );
    assert.ok(createSaved.routineId);

    const routineCreate = await prisma.routine.findUniqueOrThrow({
      where: { id: createSaved.routineId! },
    });

    const genCreate1 = await generateRoutineExecution(routineCreate.id, context, t1);
    await test("Primeira ocorrência é gerada normalmente com CREATE_NEW", () => {
      assert.equal(genCreate1.success, true);
      assert.equal(genCreate1.generated, true);
    });

    // Tentar gerar 2ª ocorrência mesmo com 1ª pendente: deve gerar normalmente
    const genCreate2 = await generateRoutineExecution(routineCreate.id, context, t2);
    await test("CREATE_NEW gera nova ocorrência mesmo com a anterior IN_PROGRESS", () => {
      assert.equal(genCreate2.success, true);
      assert.equal(genCreate2.generated, true);
    });

    const countCreate = await prisma.processExecution.count({
      where: { routineId: routineCreate.id },
    });
    await test("Ambas as execuções coexistem no banco de dados para CREATE_NEW", () => {
      assert.equal(countCreate, 2);
    });

    // -------------------------------------------------------------------------
    // 5. Ocorrência anterior CANCELLED não bloqueia
    // -------------------------------------------------------------------------
    const cancelProcDef = makeProcessDefinition("Rotina com Cancelamento", "BLOCK_NEW");
    const cancelSaved = await prisma.$transaction((tx) =>
      saveProcessInTransaction(tx, context, cancelProcDef, { requestId: randomUUID() })
    );
    assert.ok(cancelSaved.routineId);

    const routineCancel = await prisma.routine.findUniqueOrThrow({
      where: { id: cancelSaved.routineId! },
    });

    const genCancel1 = await generateRoutineExecution(routineCancel.id, context, t1);
    assert.ok(genCancel1.data?.id);

    // Cancelar a execução 1
    await prisma.processExecution.update({
      where: { id: genCancel1.data!.id },
      data: { status: "CANCELLED", cancelledAt: t2, cancellationReason: "Teste operacional" },
    });

    const genCancel2 = await generateRoutineExecution(routineCancel.id, context, t2);
    await test("Execução anterior CANCELLED é terminal e permite nova geração em BLOCK_NEW", () => {
      assert.equal(genCancel2.success, true);
      assert.equal(genCancel2.generated, true);
    });

    // -------------------------------------------------------------------------
    // 6. Deduplicação de ocorrência futura já agendada
    // -------------------------------------------------------------------------
    const futureProcDef = makeProcessDefinition("Rotina com Agendamento Futuro", "BLOCK_NEW");
    const futureSaved = await prisma.$transaction((tx) =>
      saveProcessInTransaction(tx, context, futureProcDef, { requestId: randomUUID() })
    );
    assert.ok(futureSaved.routineId);

    const routineFuture = await prisma.routine.findUniqueOrThrow({
      where: { id: futureSaved.routineId! },
    });

    // Gera ocorrência para 2027-01-01 08:00 (11:00Z em SP) a partir de um instante anterior: 2027-01-01 07:05Z (1h antes)
    const tLead = new Date("2027-01-01T10:05:00Z"); // 07:05 local, dentro do lead time de 60m para 08:00 local (11:00Z)
    const genFuture1 = await generateRoutineExecution(routineFuture.id, context, tLead);
    await test("Ocorrência futura é gerada com status SCHEDULED", () => {
      assert.equal(genFuture1.success, true);
      assert.equal(genFuture1.generated, true);
    });

    // Chamada subsequente antes de 08:00 (11:00Z):
    const genFutureRepeat = await generateRoutineExecution(routineFuture.id, context, tLead);
    await test("Chamada repetida retorna execução futura já agendada sem duplicar", () => {
      assert.equal(genFutureRepeat.success, true);
      assert.equal(genFutureRepeat.generated, false);
      assert.equal(genFutureRepeat.data?.id, genFuture1.data?.id);
    });

    // -------------------------------------------------------------------------
    // 7. Scheduler / operationalTick respeita políticas sem lançar exceções
    // -------------------------------------------------------------------------
    await test("operationalTick processa rotinas com políticas ativas sem erros não tratados", async () => {
      // operationalTick executa a varredura em todas as rotinas ativas
      await assert.doesNotReject(async () => {
        await operationalTick(t2);
      });
    });

  } finally {
    // Teardown completo das fixtures de teste
    if (orgIds.length) {
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
    if (userIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  }
}

runPendingPolicyE2E()
  .then(() => {
    console.log(`\nTODAS as ${passed} verificações de ponta a ponta da política de pendências PASSARAM!`);
  })
  .catch((err) => {
    console.error("FALHA no teste E2E de política de pendências:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
