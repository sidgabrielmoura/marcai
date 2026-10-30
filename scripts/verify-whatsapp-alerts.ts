import "dotenv/config";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  evaluateAlertRules,
  registerOperationalAlert,
  dispatchPendingWhatsAppAlerts,
  resolveAlertsForTask,
} from "../src/application/whatsapp/alerts";
import {
  whatsappAlertSettingsSchema,
  type WhatsAppAlertSettings,
} from "../src/domain/whatsapp/contracts";
import { formatOperationalAlertMessage } from "../src/domain/whatsapp/formatter";
import { prisma } from "../src/infrastructure/database/prisma";
import { wahaClient } from "../src/infrastructure/whatsapp/waha-client";
import { whatsappRepository } from "../src/infrastructure/whatsapp/repository";

async function runTests() {
  const baseSettings: WhatsAppAlertSettings = {
    enabled: true,
    notificationTypes: ["TASK_OVERDUE", "IMPEDIMENT_REPORTED"],
    criticalityFilter: "CRITICAL_ONLY",
    triggerStep: 2,
    repeatInterval: 30,
    businessHoursOnly: false,
    alwaysUrgent: false,
  };

  const disabled = evaluateAlertRules({ ...baseSettings, enabled: false }, { type: "TASK_OVERDUE" });
  assert.equal(disabled.eligible, false);
  assert.equal(disabled.suppressionReason, "ALERTS_DISABLED");

  const noTypes = evaluateAlertRules({ ...baseSettings, notificationTypes: [] }, { type: "TASK_OVERDUE" });
  assert.equal(noTypes.eligible, false);
  assert.equal(noTypes.suppressionReason, "NO_NOTIFICATION_TYPES_CONFIGURED");

  const wrongType = evaluateAlertRules(baseSettings, { type: "PROCESS_STALLED" });
  assert.equal(wrongType.eligible, false);
  assert.equal(wrongType.suppressionReason, "EVENT_TYPE_FILTERED");
  const mappedType = evaluateAlertRules(baseSettings, { type: "SLA_BREACH", priority: "CRITICAL", milestoneStep: 2 });
  assert.equal(mappedType.eligible, true);

  const notCritical = evaluateAlertRules(baseSettings, { type: "TASK_OVERDUE", priority: "HIGH", milestoneStep: 2 });
  assert.equal(notCritical.eligible, false);
  assert.equal(notCritical.suppressionReason, "CRITICALITY_FILTERED");

  const highAccepted = evaluateAlertRules(
    { ...baseSettings, criticalityFilter: "HIGH_AND_CRITICAL" },
    { type: "TASK_OVERDUE", priority: "HIGH", milestoneStep: 2 }
  );
  assert.equal(highAccepted.eligible, true);

  const stepBelow = evaluateAlertRules(
    { ...baseSettings, criticalityFilter: "ALL" },
    { type: "TASK_OVERDUE", priority: "LOW", milestoneStep: 1 }
  );
  assert.equal(stepBelow.eligible, false);
  assert.equal(stepBelow.suppressionReason, "MILESTONE_STEP_BELOW_TRIGGER");

  const stepEqual = evaluateAlertRules(
    { ...baseSettings, criticalityFilter: "ALL" },
    { type: "TASK_OVERDUE", priority: "LOW", milestoneStep: 2 }
  );
  assert.equal(stepEqual.eligible, true);

  const urgentBypass = evaluateAlertRules(
    { ...baseSettings, alwaysUrgent: true },
    { type: "PROCESS_STALLED", priority: "CRITICAL", milestoneStep: 1 }
  );
  assert.equal(urgentBypass.eligible, true);

  // 1.10 Horário Comercial: quando fechado, agenda para a próxima abertura
  const closedLocation = {
    timezone: "America/Sao_Paulo",
    openingTime: "08:00",
    closingTime: "18:00",
    operatingDays: "MON,TUE,WED,THU,FRI",
  };
  const sundayNight = new Date("2026-10-25T23:00:00Z"); // Domingo
  const businessHoursSchedule = evaluateAlertRules(
    { ...baseSettings, criticalityFilter: "ALL", businessHoursOnly: true },
    { type: "TASK_OVERDUE", priority: "MEDIUM", milestoneStep: 2, location: closedLocation },
    sundayNight
  );
  assert.equal(businessHoursSchedule.eligible, true);
  assert.equal(businessHoursSchedule.suppressionReason, "WAITING_BUSINESS_HOURS");
  assert.ok(businessHoursSchedule.scheduledFor.getTime() > sundayNight.getTime());

  console.log("✓ Regras de avaliação aprovadas em todos os cenários.");

  // 2. TESTE DE FORMATAÇÃO DE MENSAGEM
  console.log("2. Testando formatOperationalAlertMessage...");
  const formatted = formatOperationalAlertMessage({
    organizationName: "Empresa Teste",
    title: "Atraso no Relatório",
    message: "O relatório mensal está com atraso de 30 minutos.",
    priority: "CRITICAL",
    milestoneStep: 3,
    taskTitle: "Relatório de Caixa",
    locationName: "Sede Centro",
    actionUrl: "https://app.tarefai.com.br/tasks/123",
  });
  assert.ok(formatted.includes("*Tarefaí Alertas* · _Empresa Teste_"));
  assert.ok(formatted.includes("🚨 *URGENTE / CRÍTICA*"));
  assert.ok(formatted.includes("3º Marco de Atraso"));
  assert.ok(formatted.includes("https://app.tarefai.com.br/tasks/123"));
  console.log("✓ Formatação rica aprovada.");

  // 3. TESTE INTEGRADO COM BANCO DE DADOS
  console.log("3. Testando persistência, idempotência e ciclo de vida...");

  // Localiza ou cria dados de teste isolados
  const testOrgSlug = "test-whatsapp-alerts-" + Date.now();
  const org = await prisma.organization.create({
    data: {
      name: "Org Teste Alertas",
      slug: testOrgSlug,
      status: "ACTIVE",
      settings: {
        whatsappAlerts: {
          enabled: true,
          notificationTypes: ["TASK_OVERDUE", "IMPEDIMENT_REPORTED"],
          criticalityFilter: "ALL",
          triggerStep: 1,
          repeatInterval: 15,
          businessHoursOnly: false,
          alwaysUrgent: false,
        },
      },
    },
  });

  const location = await prisma.location.create({
    data: {
      organizationId: org.id,
      name: "Unidade Teste",
      status: "ACTIVE",
      timezone: "America/Sao_Paulo",
    },
  });

  // Cria 2 destinatários
  await prisma.whatsAppRecipient.createMany({
    data: [
      { organizationId: org.id, name: "Gestor 1", phone: "5585999990001" },
      { organizationId: org.id, name: "Gestor 2", phone: "5585999990002" },
    ],
  });

  // Cria uma instância WORKING mockada
  const testSession = "INSTANCE-TEST-" + Date.now();
  const instance = await prisma.whatsAppInstance.create({
    data: {
      organizationId: org.id,
      locationId: location.id,
      name: "Zap Unidade",
      session: testSession,
      status: "WORKING",
    },
  });

  // Cria uma tarefa
  const task = await prisma.task.create({
    data: {
      organizationId: org.id,
      locationId: location.id,
      title: "Tarefa de Alerta Teste",
      status: "IN_PROGRESS",
    },
  });

  // Mock do wahaClient.sendText para teste antes do disparo assíncrono
  const originalSendText = wahaClient.sendText;
  const sentMessageIds: string[] = [];
  (wahaClient as any).sendText = async (session: string, phone: string, text: string) => {
    const msgId = `true_${phone}_TEST_${Date.now()}`;
    sentMessageIds.push(msgId);
    return { messageId: msgId };
  };

  let registered: any;
  try {
    // 3.1 Registrar alerta
    registered = await registerOperationalAlert({
      organizationId: org.id,
      locationId: location.id,
      taskId: task.id,
      type: "TASK_OVERDUE",
      title: "Tarefa Atrasada",
      message: "A tarefa excedeu o prazo limite.",
      priority: "HIGH",
      milestoneStep: 1,
    });

    assert.ok(registered);
    assert.equal(registered.deliveriesCount, 2);

    // 3.2 Idempotência: registrar o mesmo evento uma segunda vez NÃO cria duplicatas
    const duplicate = await registerOperationalAlert({
      organizationId: org.id,
      locationId: location.id,
      taskId: task.id,
      type: "TASK_OVERDUE",
      title: "Tarefa Atrasada",
      message: "A tarefa excedeu o prazo limite.",
      priority: "HIGH",
      milestoneStep: 1,
    });
    assert.ok(duplicate);
    assert.equal(duplicate.occurrenceId, registered.occurrenceId);

    // Confere contagem no banco
    const occurrencesCount = await prisma.whatsAppAlertOccurrence.count({
      where: { organizationId: org.id, taskId: task.id },
    });
    assert.equal(occurrencesCount, 1);

    // Aguarda despacho em background processar
    await new Promise(r => setTimeout(r, 200));

    const deliveries = await prisma.whatsAppAlertDelivery.findMany({
      where: { organizationId: org.id, occurrenceId: registered.occurrenceId },
    });
    assert.equal(deliveries.length, 2);
    console.log("✓ Persistência e idempotência de ocorrência e entregas aprovadas.");

    // 4. TESTE DE DESPACHO E CORRELAÇÃO DE ACK
    console.log("4. Testando despacho e correlação de ACK...");

    // Se ainda não foram enviados pelo background, despacha explicitamente
    await dispatchPendingWhatsAppAlerts({ organizationId: org.id });

    const sentDeliveries = await prisma.whatsAppAlertDelivery.findMany({
      where: { organizationId: org.id, occurrenceId: registered.occurrenceId },
    });
    assert.ok(sentDeliveries.every(d => d.status === "SENT"));
    assert.ok(sentDeliveries.every(d => d.providerAck === 1));
    assert.ok(sentDeliveries.every(d => !!d.providerMessageId));
    assert.ok(sentDeliveries.every(d => !!d.providerMessageIdHash));

    // 4.1 Simulação de recebimento de webhook message.ack com ACK 2 (DEVICE)
    const targetDelivery = sentDeliveries[0];
    assert.ok(targetDelivery.providerMessageId);

    await whatsappRepository.recordWebhook({
      id: "evt-test-ack-" + Date.now(),
      session: testSession,
      event: "message.ack",
      timestamp: Date.now(),
      data: {
        messageIdHash: targetDelivery.providerMessageIdHash!,
        ack: 2,
      },
    });

    const updatedAfterAck = await prisma.whatsAppAlertDelivery.findUniqueOrThrow({
      where: { id: targetDelivery.id },
    });
    assert.equal(updatedAfterAck.status, "DELIVERED");
    assert.equal(updatedAfterAck.providerAck, 2);
    assert.ok(updatedAfterAck.deliveredAt !== null);

    // 4.2 Simulação de ACK 3 (READ)
    await whatsappRepository.recordWebhook({
      id: "evt-test-read-" + Date.now(),
      session: testSession,
      event: "message.ack",
      timestamp: Date.now(),
      data: {
        messageIdHash: targetDelivery.providerMessageIdHash!,
        ack: 3,
      },
    });

    const updatedAfterRead = await prisma.whatsAppAlertDelivery.findUniqueOrThrow({
      where: { id: targetDelivery.id },
    });
    assert.equal(updatedAfterRead.status, "READ");
    assert.equal(updatedAfterRead.providerAck, 3);
    assert.ok(updatedAfterRead.readAt !== null);

    console.log("✓ Despacho e correlação de ACK (SENT -> DELIVERED -> READ) aprovados.");
  } finally {
    (wahaClient as any).sendText = originalSendText;
  }

  // 5. TESTE DE RESOLUÇÃO E CANCELAMENTO AUTOMÁTICO
  console.log("5. Testando cancelamento ao resolver tarefa...");
  await resolveAlertsForTask(task.id, org.id);

  const occAfterResolve = await prisma.whatsAppAlertOccurrence.findUniqueOrThrow({
    where: { id: registered.occurrenceId },
  });
  assert.equal(occAfterResolve.isResolved, true);
  assert.equal(occAfterResolve.status, "RESOLVED");

  // Limpeza dos dados sintéticos de teste
  await prisma.organization.delete({ where: { id: org.id } });
  console.log("✓ Ocorrências resolvidas e dados de teste limpos.");

  console.log("\n========================================================");
  console.log("TODOS OS TESTES DO MOTOR DE ALERTAS FORAM APROVADOS! 🚀");
  console.log("========================================================");
}

runTests().catch(err => {
  console.error("ERRO NOS TESTES:", err);
  process.exit(1);
});
