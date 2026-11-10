import "dotenv/config";
import {
  evaluateStrictProgressiveMilestone,
  resolveProgressiveMilestones,
  DEFAULT_PROGRESSIVE_MILESTONES,
  type ProgressiveMilestone,
  type TaskAlertExecutionRecord,
} from "../src/domain/rules/progressive-milestones";
import { evaluateAlertRules, hasManagerEnteredSystem, processDueRepeatAlerts } from "../src/application/whatsapp/alerts";
import { isLocationOpenAt, type LocationOperatingRules } from "../src/domain/rules/operating-hours";
import { prisma } from "../src/infrastructure/database/prisma";

async function runStrictVerification() {
  console.log("================================================================================");
  console.log("INICIANDO VERIFICAÇÃO INTEGRAL DOS ALERTAS PROGRESSIVOS E NOTIFICAÇÕES (MARCOS)");
  console.log("================================================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`✅ [PASS] ${testName}`);
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      if (detail) console.error(`   Detalhe: ${detail}`);
    }
  }

  // ---------------------------------------------------------------------------
  // TESTE 1: Resolução de Marcos Progressivos e Tolerância
  // ---------------------------------------------------------------------------
  console.log("--- 1. TESTE DE TOLERÂNCIA E RESOLUÇÃO DE MARCOS ---");
  const fallbackMilestones = resolveProgressiveMilestones({ delayMilestones: [15, 30, 60] });
  assert(
    fallbackMilestones.length === 3 &&
    fallbackMilestones[0].offsetMinutes === 15 &&
    fallbackMilestones[1].offsetMinutes === 15 &&
    fallbackMilestones[2].offsetMinutes === 30,
    "Fallback retroativo de delayMilestones calcula offsets relativos sequenciais"
  );

  const customConfig: ProgressiveMilestone[] = [
    {
      id: "m_1",
      stepIndex: 1,
      title: "1º Marco: Início do atraso",
      offsetMinutes: 10,
      target: "BOTH",
      message: "Operador e gestor alertados do início do atraso",
      repeatCount: 1,
      repeatIntervalMinutes: 5,
    },
    {
      id: "m_2",
      stepIndex: 2,
      title: "2º Marco: Atraso Crítico",
      offsetMinutes: 20,
      target: "MANAGERS",
      message: "Gestores alertados após finalização do 1º marco",
      repeatCount: 2,
      repeatIntervalMinutes: 15,
    },
  ];

  const baseDeadline = new Date("2026-11-09T10:00:00Z");
  const toleranceMinutes = 15;
  // Tolerância vence às 10:15:00Z
  const openLocation: LocationOperatingRules = {
    timezone: "UTC",
    openingTime: "08:00",
    closingTime: "18:00",
    operatingDays: "MON,TUE,WED,THU,FRI,SAT,SUN",
  };

  // Antes da tolerância expirar (ex: 10:10:00Z)
  const evalBeforeTolerance = evaluateStrictProgressiveMilestone({
    deadlineAt: baseDeadline,
    slaDueAt: baseDeadline,
    toleranceMinutes,
    milestones: customConfig,
    history: [],
    location: openLocation,
    now: new Date("2026-11-09T10:10:00Z"),
  });
  assert(
    !evalBeforeTolerance.shouldDispatch && evalBeforeTolerance.reason === "TOLERANCE_NOT_EXPIRED",
    "Tolerância respeitada: nenhum marco dispara antes do prazo + tolerância vencer"
  );

  // ---------------------------------------------------------------------------
  // TESTE 2: Ordem Estrita - Contagem Relativa APÓS a Última Notificação
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. TESTE DE ORDEM ESTRITA E TEMPO RELATIVO APÓS ÚLTIMA REPETIÇÃO ---");
  // Marco 1 tem offset de 10 minutos após o fim da tolerância (10:15 + 10 min = 10:25)
  const evalFirstDispatchTime = evaluateStrictProgressiveMilestone({
    deadlineAt: baseDeadline,
    slaDueAt: baseDeadline,
    toleranceMinutes,
    milestones: customConfig,
    history: [],
    location: openLocation,
    now: new Date("2026-11-09T10:25:00Z"),
  });
  assert(
    evalFirstDispatchTime.shouldDispatch &&
    evalFirstDispatchTime.milestone?.stepIndex === 1 &&
    evalFirstDispatchTime.round === 0,
    "1º Marco dispara no momento exato (tolerância + offsetMinutes)"
  );

  // Simula que o 1º Marco foi disparado às 10:25:00Z (round 0)
  const history1: TaskAlertExecutionRecord[] = [
    { milestoneStep: 1, round: 0, sentAt: new Date("2026-11-09T10:25:00Z") },
  ];

  // Marco 1 possui 1 repetição configurada com intervalo de 5 minutos (10:25 + 5 min = 10:30)
  // Às 10:28: ainda não deu o tempo da repetição
  const evalWaitingRepeat = evaluateStrictProgressiveMilestone({
    deadlineAt: baseDeadline,
    slaDueAt: baseDeadline,
    toleranceMinutes,
    milestones: customConfig,
    history: history1,
    location: openLocation,
    now: new Date("2026-11-09T10:28:00Z"),
  });
  assert(
    !evalWaitingRepeat.shouldDispatch && evalWaitingRepeat.reason === "WAITING_REPEAT_INTERVAL",
    "Marco 1 aguarda o intervalo configurado para disparar a repetição"
  );

  // Às 10:30: repetição (round 1) do Marco 1 deve disparar
  const evalRepeatDispatch = evaluateStrictProgressiveMilestone({
    deadlineAt: baseDeadline,
    slaDueAt: baseDeadline,
    toleranceMinutes,
    milestones: customConfig,
    history: history1,
    location: openLocation,
    now: new Date("2026-11-09T10:30:00Z"),
  });
  assert(
    evalRepeatDispatch.shouldDispatch &&
    evalRepeatDispatch.milestone?.stepIndex === 1 &&
    evalRepeatDispatch.isRepeat &&
    evalRepeatDispatch.round === 1,
    "Repetição do Marco 1 é disparada com sucesso (round 1)"
  );

  // Agora o histórico possui a última repetição do Marco 1 enviada às 10:30:00Z
  const history2: TaskAlertExecutionRecord[] = [
    { milestoneStep: 1, round: 0, sentAt: new Date("2026-11-09T10:25:00Z") },
    { milestoneStep: 1, round: 1, sentAt: new Date("2026-11-09T10:30:00Z") },
  ];

  // O Marco 2 foi configurado com offset de 20 minutos.
  // Regra fundamental: o Marco 2 deve começar a contar 20 minutos APÓS a última notificação (10:30 + 20 min = 10:50)
  // e NÃO em minutos fixos desde o início!
  // Teste às 10:45: se fosse minutos fixos (como no antigo), já teria disparado. No novo cron estrito, NÃO dispara!
  const evalBeforeNextMilestone = evaluateStrictProgressiveMilestone({
    deadlineAt: baseDeadline,
    slaDueAt: baseDeadline,
    toleranceMinutes,
    milestones: customConfig,
    history: history2,
    location: openLocation,
    now: new Date("2026-11-09T10:45:00Z"),
  });
  assert(
    !evalBeforeNextMilestone.shouldDispatch && evalBeforeNextMilestone.reason === "WAITING_NEXT_MILESTONE_OFFSET",
    "Ordem estrita preservada: Marco 2 NÃO dispara prematuramente antes de transcorrer o offset relativo à última repetição"
  );

  // Às 10:50: exatos 20 minutos após a última repetição do marco 1
  const evalSecondMilestoneDispatch = evaluateStrictProgressiveMilestone({
    deadlineAt: baseDeadline,
    slaDueAt: baseDeadline,
    toleranceMinutes,
    milestones: customConfig,
    history: history2,
    location: openLocation,
    now: new Date("2026-11-09T10:50:00Z"),
  });
  assert(
    evalSecondMilestoneDispatch.shouldDispatch &&
    evalSecondMilestoneDispatch.milestone?.stepIndex === 2 &&
    evalSecondMilestoneDispatch.milestone?.target === "MANAGERS" &&
    evalSecondMilestoneDispatch.round === 0,
    "Marco 2 inicia sua execução estritamente X tempo após a conclusão da última repetição anterior"
  );

  // ---------------------------------------------------------------------------
  // TESTE 3: Silenciamento Fora do Horário Comercial da Unidade da Tarefa
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. TESTE DE HORÁRIO COMERCIAL DA UNIDADE (SEMPRE ATIVO) ---");
  const closedLocation: LocationOperatingRules = {
    timezone: "UTC",
    openingTime: "08:00",
    closingTime: "18:00",
    operatingDays: "MON,TUE,WED,THU,FRI,SAT,SUN",
  };

  // Às 20:00 (fora do horário da unidade)
  const evalClosedHours = evaluateStrictProgressiveMilestone({
    deadlineAt: baseDeadline,
    slaDueAt: baseDeadline,
    toleranceMinutes,
    milestones: customConfig,
    history: [],
    location: closedLocation,
    now: new Date("2026-11-09T20:00:00Z"),
  });
  assert(
    !evalClosedHours.shouldDispatch && evalClosedHours.reason === "OUTSIDE_BUSINESS_HOURS",
    "Alerta silenciado fora do horário de funcionamento da unidade onde a tarefa foi criada"
  );

  const whatsappEvaluation = evaluateAlertRules(
    {
      enabled: true,
      notificationTypes: ["TASK_OVERDUE"],
      criticalityFilter: "ALL",
      triggerStep: 1,
      repeatInterval: 10,
      businessHoursOnly: true,
      alwaysUrgent: false,
    },
    {
      type: "TASK_OVERDUE",
      location: closedLocation,
    },
    new Date("2026-11-09T20:00:00Z")
  );
  assert(
    whatsappEvaluation.suppressionReason === "WAITING_BUSINESS_HOURS",
    "WhatsApp agenda para próxima abertura comercial quando fora do expediente da unidade"
  );

  // ---------------------------------------------------------------------------
  // TESTE 4: Parada de Repetições ao Gestor Entrar no Sistema
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. TESTE DE PARADA DE REPETIÇÃO QUANDO GESTOR ENTRA NO SISTEMA ---");
  // Criação de organização temporária de teste para validação no banco
  const testOrg = await prisma.organization.create({
    data: {
      name: "Empresa Teste Lembretes",
      slug: `test-org-${Date.now()}`,
      settings: {
        whatsappAlerts: {
          enabled: true,
          businessHoursOnly: true,
          repeatInterval: 5,
        },
      },
    },
  });

  const testUser = await prisma.user.create({
    data: {
      name: "Gestor Operacional Teste",
      email: `gestor.${Date.now()}@teste.com`,
    },
  });

  const testMember = await prisma.organizationMember.create({
    data: {
      organizationId: testOrg.id,
      userId: testUser.id,
      role: "MANAGER",
    },
  });

  const testTask = await prisma.task.create({
    data: {
      organizationId: testOrg.id,
      title: "Tarefa de Teste para Lembretes",
      status: "IN_PROGRESS",
    },
  });

  const testOccurrence = await prisma.whatsAppAlertOccurrence.create({
    data: {
      organizationId: testOrg.id,
      incidentKey: `task:${testTask.id}:TASK_OVERDUE:step_1`,
      eventType: "TASK_OVERDUE",
      title: "Alerta de Atraso",
      message: "Mensagem de alerta",
      status: "ACTIVE",
      isResolved: false,
      repeatInterval: 5,
      repeatCount: 1,
      nextRepeatAt: new Date(Date.now() - 1000), // Já venceu para repetição
      createdAt: new Date(Date.now() - 10 * 60 * 1000),
    },
  });

  // Antes do gestor entrar no sistema
  const managerBeforeEntry = await hasManagerEnteredSystem(
    testOrg.id,
    testTask.id,
    testOccurrence.createdAt
  );
  assert(!managerBeforeEntry, "Antes do gestor acessar o sistema: repetição permanece elegível");

  // O gestor entra no sistema e visualiza a tarefa (cria registro em ActivityLog)
  await prisma.activityLog.create({
    data: {
      organizationId: testOrg.id,
      actorId: testMember.id,
      action: "TASK_VIEWED",
      entityType: "TASK",
      entityId: testTask.id,
      createdAt: new Date(),
    },
  });

  // Após o gestor entrar no sistema
  const managerAfterEntry = await hasManagerEnteredSystem(
    testOrg.id,
    testTask.id,
    testOccurrence.createdAt
  );
  assert(managerAfterEntry, "Detectada entrada/atividade do gestor no sistema através de auditoria/sessão");

  // Executa processDueRepeatAlerts e verifica se a repetição é encerrada imediatamente
  await processDueRepeatAlerts({ organizationId: testOrg.id });

  const updatedOccurrence = await prisma.whatsAppAlertOccurrence.findUnique({
    where: { id: testOccurrence.id },
  });
  assert(
    updatedOccurrence?.status === "RESOLVED" && updatedOccurrence?.nextRepeatAt === null,
    "Repetição de WhatsApp do gestor parada imediatamente porque o gestor entrou no sistema"
  );

  // Limpeza dos dados de teste
  await prisma.activityLog.deleteMany({ where: { organizationId: testOrg.id } });
  await prisma.whatsAppAlertOccurrence.deleteMany({ where: { organizationId: testOrg.id } });
  await prisma.task.deleteMany({ where: { organizationId: testOrg.id } });
  await prisma.organizationMember.deleteMany({ where: { organizationId: testOrg.id } });
  await prisma.user.deleteMany({ where: { id: testUser.id } });
  await prisma.organization.delete({ where: { id: testOrg.id } });

  console.log("\n================================================================================");
  console.log(`RELATÓRIO FINAL: ${passedTests}/${totalTests} TESTES APROVADOS COM SUCESSO!`);
  console.log("================================================================================");

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runStrictVerification()
  .catch((err) => {
    console.error("Erro fatal no teste:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
