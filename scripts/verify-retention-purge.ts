import { prisma } from "../src/infrastructure/database/prisma";
import { validateCronRequest } from "../src/infrastructure/security/cron-auth";
import {
  purgeTrashedTasks,
  purgeOperationalHistory,
  executeRetentionPurge,
} from "../src/application/jobs/retention-purge";
import { GET as getHistoryRoute, POST as postHistoryRoute } from "../src/app/api/jobs/retention/history/route";
import { GET as getTrashRoute, POST as postTrashRoute } from "../src/app/api/jobs/retention/trash/route";
import { storeEvidence, readEvidence } from "../src/infrastructure/storage/evidence-storage";

async function main() {
  console.log("=== INICIANDO VERIFICAÇÃO DE RETENÇÃO E ROTAS DE CRON ===");

  const TEST_SECRET = "super-secret-cron-token-with-sufficient-length-32";
  process.env.CRON_SECRET = TEST_SECRET;

  // 1. Testar autenticação do Cron
  console.log("\n[1] Testando autenticação do Cron...");

  // Sem credencial -> 401
  const reqNoAuth = new Request("http://localhost:3000/api/jobs/retention/trash");
  const authNoAuth = validateCronRequest(reqNoAuth);
  if (authNoAuth.authorized || authNoAuth.status !== 401) {
    throw new Error(`Esperado 401 sem token, recebido: ${JSON.stringify(authNoAuth)}`);
  }

  // Token incorreto -> 401
  const reqBadAuth = new Request("http://localhost:3000/api/jobs/retention/trash", {
    headers: { Authorization: "Bearer wrong-token-123456789" },
  });
  const authBad = validateCronRequest(reqBadAuth);
  if (authBad.authorized || authBad.status !== 401) {
    throw new Error(`Esperado 401 com token incorreto, recebido: ${JSON.stringify(authBad)}`);
  }

  // Bearer token válido -> autorizado
  const reqBearer = new Request("http://localhost:3000/api/jobs/retention/trash", {
    headers: { Authorization: `Bearer ${TEST_SECRET}` },
  });
  const authBearer = validateCronRequest(reqBearer);
  if (!authBearer.authorized) {
    throw new Error(`Esperado autorizado via Bearer, recebido: ${JSON.stringify(authBearer)}`);
  }

  // Header x-cron-secret válido -> autorizado
  const reqHeader = new Request("http://localhost:3000/api/jobs/retention/trash", {
    headers: { "x-cron-secret": TEST_SECRET },
  });
  const authHeader = validateCronRequest(reqHeader);
  if (!authHeader.authorized) {
    throw new Error(`Esperado autorizado via x-cron-secret, recebido: ${JSON.stringify(authHeader)}`);
  }

  // Query parameter válido -> autorizado
  const reqQuery = new Request(`http://localhost:3000/api/jobs/retention/trash?secret=${TEST_SECRET}`);
  const authQuery = validateCronRequest(reqQuery);
  if (!authQuery.authorized) {
    throw new Error(`Esperado autorizado via query secret, recebido: ${JSON.stringify(authQuery)}`);
  }
  console.log("✓ Autenticação timing-safe testada com sucesso (Bearer, Header, Query e Rejeição)!");

  // 2. Preparar Organização de Teste e Cenários
  console.log("\n[2] Criando organização de teste e dados de cenário...");
  const uniqueSuffix = Date.now().toString(36);
  const testOrg = await prisma.organization.create({
    data: {
      name: `Org Teste Retenção ${uniqueSuffix}`,
      slug: `org-retencao-${uniqueSuffix}`,
      status: "ACTIVE",
      settings: {
        operationalRetentionMonths: 6,
        delayRetentionDays: 60,
      },
    },
  });

  const testUser = await prisma.user.create({
    data: {
      name: `User Teste ${uniqueSuffix}`,
      email: `test-retencao-${uniqueSuffix}@marcai.local`,
    },
  });

  const member = await prisma.organizationMember.create({
    data: {
      organizationId: testOrg.id,
      userId: testUser.id,
      role: "EMPLOYEE",
    },
  });

  const testProcess = await prisma.process.create({
    data: {
      organizationId: testOrg.id,
      name: "Processo de Teste",
      status: "ACTIVE",
    },
  });

  const now = new Date();

  // Cenário Lixeira:
  // - Tarefa Ativa (não deve ser excluída)
  const activeTask = await prisma.task.create({
    data: {
      organizationId: testOrg.id,
      title: "Tarefa Ativa",
      status: "AVAILABLE",
    },
  });

  // - Tarefa excluída recentemente (deletedAt = 10 dias atrás, dentro de 60 dias -> NÃO DEVE SER EXCLUÍDA)
  const recentDeletedTask = await prisma.task.create({
    data: {
      organizationId: testOrg.id,
      title: "Tarefa Excluída Recente",
      status: "COMPLETED",
      deletedAt: new Date(now.getTime() - 10 * 86_400_000),
    },
  });

  // - Tarefa excluída há muito tempo (deletedAt = 70 dias atrás, mais que 60 dias -> DEVE SER EXCLUÍDA)
  const oldDeletedTask = await prisma.task.create({
    data: {
      organizationId: testOrg.id,
      title: "Tarefa Excluída Antiga",
      status: "COMPLETED",
      deletedAt: new Date(now.getTime() - 70 * 86_400_000),
    },
  });

  // Arquivo de evidência para a tarefa antiga da lixeira
  const dummyFileBytes = Buffer.from("conteudo-evidencia-antiga");
  const evidenceKeyTrash = await storeEvidence(dummyFileBytes);

  const reqTrash = await prisma.taskEvidenceRequirement.create({
    data: {
      taskId: oldDeletedTask.id,
      type: "PHOTO",
    },
  });

  await prisma.evidenceSubmission.create({
    data: {
      requirementId: reqTrash.id,
      submittedBy: member.id,
      storageKey: evidenceKeyTrash,
    },
  });

  // Notificação antiga (70 dias atrás -> deve ser expurgada)
  const oldNotif = await prisma.notification.create({
    data: {
      organizationId: testOrg.id,
      userId: testUser.id,
      type: "SLA_BREACH",
      title: "Alerta de atraso antigo",
      message: "Mensagem de alerta",
      createdAt: new Date(now.getTime() - 70 * 86_400_000),
    },
  });

  // - Notificação recente (5 dias atrás -> NÃO deve ser expurgada)
  const recentNotif = await prisma.notification.create({
    data: {
      organizationId: testOrg.id,
      userId: testUser.id,
      type: "SLA_BREACH",
      title: "Alerta de atraso recente",
      message: "Mensagem de alerta recente",
      createdAt: new Date(now.getTime() - 5 * 86_400_000),
    },
  });

  // - Template ativo (DRAFT -> NÃO deve ser expurgado)
  const activeTemplate = await prisma.reusableProcessTemplate.create({
    data: {
      organizationId: testOrg.id,
      name: "Template Ativo Rascunho",
      status: "DRAFT",
      draftDefinition: { name: "Template Ativo", tasks: [] },
    },
  });

  // - Template arquivado recente (10 dias atrás -> NÃO deve ser expurgado)
  const recentArchivedTemplate = await prisma.reusableProcessTemplate.create({
    data: {
      organizationId: testOrg.id,
      name: "Template Arquivado Recente",
      status: "ARCHIVED",
      archivedAt: new Date(now.getTime() - 10 * 86_400_000),
      draftDefinition: { name: "Template Arquivado Recente", tasks: [] },
    },
  });

  // - Template arquivado antigo (75 dias atrás -> DEVE SER EXPURGADO na lixeira)
  const oldArchivedTemplate = await prisma.reusableProcessTemplate.create({
    data: {
      organizationId: testOrg.id,
      name: "Template Arquivado Antigo",
      status: "ARCHIVED",
      archivedAt: new Date(now.getTime() - 75 * 86_400_000),
      draftDefinition: { name: "Template Arquivado Antigo", tasks: [] },
    },
  });

  // Cenário Histórico Operacional:
  // - Execução recente (1 mês atrás, dentro de 6 meses -> NÃO deve ser expurgada)
  const recentExec = await prisma.processExecution.create({
    data: {
      organizationId: testOrg.id,
      processId: testProcess.id,
      status: "COMPLETED",
      scheduledAt: new Date(now.getTime() - 30 * 86_400_000),
      availableAt: new Date(now.getTime() - 30 * 86_400_000),
      completedAt: new Date(now.getTime() - 30 * 86_400_000),
    },
  });

  const recentExecTask = await prisma.task.create({
    data: {
      organizationId: testOrg.id,
      executionId: recentExec.id,
      title: "Tarefa de Execução Recente",
      status: "COMPLETED",
      completedAt: new Date(now.getTime() - 30 * 86_400_000),
    },
  });

  // - Execução antiga (8 meses atrás, mais que 6 meses -> DEVE ser expurgada)
  const oldExecDate = new Date(now);
  oldExecDate.setMonth(oldExecDate.getMonth() - 8);

  const oldExec = await prisma.processExecution.create({
    data: {
      organizationId: testOrg.id,
      processId: testProcess.id,
      status: "COMPLETED",
      scheduledAt: oldExecDate,
      availableAt: oldExecDate,
      completedAt: oldExecDate,
    },
  });

  const evidenceKeyHistory = await storeEvidence(Buffer.from("evidencia-historico-antiga"));

  const oldExecTask = await prisma.task.create({
    data: {
      organizationId: testOrg.id,
      executionId: oldExec.id,
      title: "Tarefa de Execução Antiga",
      status: "COMPLETED",
      completedAt: oldExecDate,
    },
  });

  const reqHistory = await prisma.taskEvidenceRequirement.create({
    data: {
      taskId: oldExecTask.id,
      type: "PHOTO",
    },
  });

  await prisma.evidenceSubmission.create({
    data: {
      requirementId: reqHistory.id,
      submittedBy: member.id,
      storageKey: evidenceKeyHistory,
    },
  });

  // - Tarefa ad-hoc antiga (8 meses atrás -> DEVE ser expurgada)
  const oldAdHocTask = await prisma.task.create({
    data: {
      organizationId: testOrg.id,
      executionId: null,
      title: "Tarefa Ad-Hoc Antiga Concluída",
      status: "COMPLETED",
      completedAt: oldExecDate,
    },
  });

  console.log("✓ Dados de teste criados com sucesso.");

  // 3. Testar Rota de Cron da Lixeira
  console.log("\n[3] Testando Rota de Cron da Lixeira (/api/jobs/retention/trash)...");
  const trashReq = new Request(
    `http://localhost:3000/api/jobs/retention/trash?secret=${TEST_SECRET}&organizationId=${testOrg.id}`,
    { method: "GET" }
  );
  const trashResponse = await getTrashRoute(trashReq);
  const trashData = await trashResponse.json();
  console.log("Resposta do Cron Lixeira:", JSON.stringify(trashData));

  if (!trashData.success || trashData.trashedTasksPurged < 1) {
    throw new Error(`Falha no expurgo da lixeira: esperado pelo menos 1 tarefa expurgada. Dados: ${JSON.stringify(trashData)}`);
  }

  // Verificar que a tarefa antiga foi excluída e a recente foi preservada
  const checkOldDeletedTask = await prisma.task.findUnique({ where: { id: oldDeletedTask.id } });
  if (checkOldDeletedTask) throw new Error("A tarefa antiga da lixeira deveria ter sido excluída!");

  const checkRecentDeletedTask = await prisma.task.findUnique({ where: { id: recentDeletedTask.id } });
  if (!checkRecentDeletedTask) throw new Error("A tarefa recente da lixeira NÃO deveria ter sido excluída!");

  const checkActiveTask = await prisma.task.findUnique({ where: { id: activeTask.id } });
  if (!checkActiveTask) throw new Error("A tarefa ativa NÃO deveria ter sido excluída!");

  const checkOldNotif = await prisma.notification.findUnique({ where: { id: oldNotif.id } });
  if (checkOldNotif) throw new Error("A notificação antiga deveria ter sido excluída!");

  const checkRecentNotif = await prisma.notification.findUnique({ where: { id: recentNotif.id } });
  if (!checkRecentNotif) throw new Error("A notificação recente NÃO deveria ter sido excluída!");

  // Verificar expurgo de templates arquivados
  const checkOldArchivedTemplate = await prisma.reusableProcessTemplate.findUnique({ where: { id: oldArchivedTemplate.id } });
  if (checkOldArchivedTemplate) throw new Error("O template arquivado há 75 dias deveria ter sido expurgado!");

  const checkRecentArchivedTemplate = await prisma.reusableProcessTemplate.findUnique({ where: { id: recentArchivedTemplate.id } });
  if (!checkRecentArchivedTemplate) throw new Error("O template arquivado há 10 dias NÃO deveria ter sido expurgado!");

  const checkActiveTemplate = await prisma.reusableProcessTemplate.findUnique({ where: { id: activeTemplate.id } });
  if (!checkActiveTemplate) throw new Error("O template ativo rascunho NÃO deveria ter sido expurgado!");

  console.log("✓ Rota e lógica da lixeira e templates arquivados validadas com sucesso!");

  // 4. Testar Rota de Cron do Histórico
  console.log("\n[4] Testando Rota de Cron do Histórico (/api/jobs/retention/history)...");
  const historyReq = new Request(
    `http://localhost:3000/api/jobs/retention/history`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_SECRET}`,
      },
    }
  );
  const historyResponse = await postHistoryRoute(historyReq);
  const historyData = await historyResponse.json();
  console.log("Resposta do Cron Histórico:", JSON.stringify(historyData));

  if (!historyData.success || historyData.executionsPurged < 1) {
    throw new Error(`Falha no expurgo do histórico: esperado pelo menos 1 execução expurgada. Dados: ${JSON.stringify(historyData)}`);
  }

  // Verificar que a execução antiga foi removida
  const checkOldExec = await prisma.processExecution.findUnique({ where: { id: oldExec.id } });
  if (checkOldExec) throw new Error("A execução de 8 meses atrás deveria ter sido excluída!");

  const checkOldExecTask = await prisma.task.findUnique({ where: { id: oldExecTask.id } });
  if (checkOldExecTask) throw new Error("As tarefas da execução de 8 meses atrás deveriam ter sido excluídas!");

  const checkOldAdHocTask = await prisma.task.findUnique({ where: { id: oldAdHocTask.id } });
  if (checkOldAdHocTask) throw new Error("A tarefa ad-hoc antiga de 8 meses atrás deveria ter sido excluída!");

  // Verificar que a execução recente continua intacta
  const checkRecentExec = await prisma.processExecution.findUnique({ where: { id: recentExec.id } });
  if (!checkRecentExec) throw new Error("A execução recente NÃO deveria ter sido excluída!");

  const checkRecentExecTask = await prisma.task.findUnique({ where: { id: recentExecTask.id } });
  if (!checkRecentExecTask) throw new Error("As tarefas da execução recente NÃO deveriam ter sido excluídas!");

  // Verificar arquivo físico do histórico removido
  let evidenceHistoryStillExists = true;
  try {
    await readEvidence(evidenceKeyHistory);
  } catch {
    evidenceHistoryStillExists = false;
  }
  if (evidenceHistoryStillExists) throw new Error("O arquivo físico de evidência do histórico antigo deveria ter sido removido!");

  console.log("✓ Rota e lógica do histórico validadas com sucesso!");

  // 5. Testar executeRetentionPurge unificado (usado pelo painel)
  console.log("\n[5] Testando executeRetentionPurge unificado...");
  const manualResult = await executeRetentionPurge(testOrg.id);
  console.log("Resultado do expurgo unificado manual:", manualResult);
  if (
    typeof manualResult.trashedTasksPurged !== "number" ||
    typeof manualResult.executionsArchived !== "number" ||
    typeof manualResult.evidencesPurged !== "number"
  ) {
    throw new Error("Formato inválido retornado por executeRetentionPurge");
  }
  console.log("✓ Expurgo unificado manual validado com sucesso!");

  // 6. Limpeza dos dados de teste
  console.log("\n[6] Limpando dados de teste...");
  await prisma.activityLog.deleteMany({ where: { organizationId: testOrg.id } });
  await prisma.notification.deleteMany({ where: { organizationId: testOrg.id } });
  await prisma.reusableProcessTemplate.deleteMany({ where: { organizationId: testOrg.id } });
  await prisma.task.deleteMany({ where: { organizationId: testOrg.id } });
  await prisma.processExecution.deleteMany({ where: { organizationId: testOrg.id } });
  await prisma.process.deleteMany({ where: { organizationId: testOrg.id } });
  await prisma.organizationMember.deleteMany({ where: { organizationId: testOrg.id } });
  await prisma.organization.delete({ where: { id: testOrg.id } });
  await prisma.user.delete({ where: { id: testUser.id } });

  console.log("=== TODOS OS TESTES PASSARAM COM 100% DE SUCESSO! ===");
}

main()
  .catch((err) => {
    console.error("ERRO DURANTE O TESTE:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
