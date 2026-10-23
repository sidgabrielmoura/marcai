import "dotenv/config";
import { prisma } from "../src/infrastructure/database/prisma";
import { purgeOrganization } from "../src/application/superadmin/purge-organization";
import crypto from "crypto";

async function main() {
  console.log("=== INICIANDO TESTE DO EXPURGO COMPLETO DE ORGANIZAÇÃO ===");

  const barbeariaOrgId = "cmvfnxecg00079g8fh7qjhdb6";
  const superadminId = "cmue5wl1i0000908fuprrmwbq";

  const testOrgSlug = `test-purge-${Date.now()}`;
  let createdOrgId: string | null = null;
  let testUserId: string | null = null;

  try {
    // 1. Criar organização de teste com dados completos
    console.log("[1] Criando organização de teste e dados acoplados...");
    const testOrg = await prisma.organization.create({
      data: {
        name: "Empresa de Teste Expurgo",
        slug: testOrgSlug,
        status: "ACTIVE",
      },
    });
    createdOrgId = testOrg.id;

    // Criar um usuário exclusivo desta organização
    const testUser = await prisma.user.create({
      data: {
        name: "Funcionário Teste Expurgo",
        email: `purge-user-${Date.now()}@teste.com`,
      },
    });
    testUserId = testUser.id;

    // Criar membro
    const member = await prisma.organizationMember.create({
      data: {
        organizationId: testOrg.id,
        userId: testUser.id,
        role: "EMPLOYEE",
      },
    });

    // Criar localização
    const loc = await prisma.location.create({
      data: {
        organizationId: testOrg.id,
        name: "Unidade Teste",
      },
    });

    // Criar processo e rotina
    const proc = await prisma.process.create({
      data: {
        organizationId: testOrg.id,
        name: "Processo Teste Expurgo",
      },
    });

    const routine = await prisma.routine.create({
      data: {
        processId: proc.id,
        recurrenceRule: JSON.stringify({ frequency: "DAILY" }),
        startsAt: new Date(),
      },
    });

    // Criar job state para a rotina
    const routineJobName = `retry:routine:${routine.id}`;
    await prisma.scheduledJobState.create({
      data: {
        name: routineJobName,
        failures: 2,
      },
    });

    // Criar tarefa
    const task = await prisma.task.create({
      data: {
        organizationId: testOrg.id,
        processId: proc.id,
        locationId: loc.id,
        title: "Tarefa de Teste Expurgo",
        priority: "MEDIUM",
        status: "AVAILABLE",
      },
    });

    // Criar sessão web
    const sessionId = crypto.randomUUID();
    await prisma.webAuthSession.create({
      data: {
        id: sessionId,
        userId: testUser.id,
        memberId: member.id,
        organizationId: testOrg.id,
        credentialVersion: "v1",
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    // Criar evento mobile
    await prisma.nativeEvent.create({
      data: {
        organizationId: testOrg.id,
        userId: testUser.id,
        taskId: task.id,
        kind: "TASK_CREATED",
      },
    });

    // Criar request mobile
    await prisma.nativeRequest.create({
      data: {
        userId: testUser.id,
        organizationId: testOrg.id,
        key: crypto.randomUUID(),
        fingerprint: "fp-test",
        response: { ok: true },
      },
    });

    console.log("Organização de teste e registros criados com sucesso.");

    // 2. Executar o expurgo completo via purgeOrganization
    console.log("[2] Executando purgeOrganization()...");
    const result = await prisma.$transaction(async (tx) => {
      return purgeOrganization(tx, testOrg.id);
    });
    console.log("Resultado do expurgo:", result);

    // 3. Validar se TUDO foi apagado
    console.log("[3] Verificando se os dados foram 100% expurgados...");

    const checkOrg = await prisma.organization.findUnique({ where: { id: testOrg.id } });
    if (checkOrg) throw new Error("A organização ainda existe!");

    const checkUser = await prisma.user.findUnique({ where: { id: testUser.id } });
    if (checkUser) throw new Error("O usuário exclusivo da empresa ainda existe!");

    const checkMember = await prisma.organizationMember.findMany({ where: { organizationId: testOrg.id } });
    if (checkMember.length > 0) throw new Error("Membros ainda existem!");

    const checkTasks = await prisma.task.findMany({ where: { organizationId: testOrg.id } });
    if (checkTasks.length > 0) throw new Error("Tarefas ainda existem!");

    const checkProcs = await prisma.process.findMany({ where: { organizationId: testOrg.id } });
    if (checkProcs.length > 0) throw new Error("Processos ainda existem!");

    const checkJobState = await prisma.scheduledJobState.findUnique({ where: { name: routineJobName } });
    if (checkJobState) throw new Error("O job state da rotina ainda existe!");

    const checkWebSession = await prisma.webAuthSession.findUnique({ where: { id: sessionId } });
    if (checkWebSession) throw new Error("A sessão web ainda existe!");

    const checkEvents = await prisma.nativeEvent.findMany({ where: { organizationId: testOrg.id } });
    if (checkEvents.length > 0) throw new Error("Eventos mobile ainda existem!");

    const checkRequests = await prisma.nativeRequest.findMany({ where: { organizationId: testOrg.id } });
    if (checkRequests.length > 0) throw new Error("Requests mobile ainda existem!");

    // 4. Validar que Barbearia-SG e Superadmin continuam intactos
    const barbearia = await prisma.organization.findUnique({ where: { id: barbeariaOrgId } });
    if (!barbearia) throw new Error("Atenção: barbearia-sg foi afetada!");

    const superadmin = await prisma.user.findUnique({ where: { id: superadminId } });
    if (!superadmin) throw new Error("Atenção: Superadmin foi afetado!");

    console.log("✔ TODOS OS DADOS DA ORGANIZAÇÃO FORAM EXPURGADOS COM SUCESSO!");
    console.log("✔ BARBEARIA-SG E SUPERADMIN SE MANTÊM 100% INTACTOS!");
  } catch (error) {
    console.error("ERRO NO TESTE:", error);
    // Cleanup de segurança caso falhe no meio
    if (createdOrgId) {
      await prisma.organization.deleteMany({ where: { id: createdOrgId } }).catch(() => {});
    }
    if (testUserId) {
      await prisma.user.deleteMany({ where: { id: testUserId } }).catch(() => {});
    }
    process.exit(1);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
