import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/infrastructure/database/prisma";
import { operationalTick } from "../src/application/processes/operational-tick";
import { registerOperationalAlert, evaluateAlertRules } from "../src/application/whatsapp/alerts";
import { formatOperationalAlertMessage } from "../src/domain/whatsapp/formatter";
import { WHATSAPP_EVENT_TYPES, type WhatsAppAlertSettings } from "../src/domain/whatsapp/contracts";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`✔ PASSOU: ${name}`);
  } catch (err) {
    console.error(`✖ FALHOU: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function run() {
  console.log("=== INICIANDO TESTES: ALERTAS EM TEMPO REAL E WHATSAPP ===");

  const timestamp = Date.now();
  const testPhone = "5511999998888";

  // 1. Criar Organização de Teste com configuração de WhatsApp habilitada para TASK_OVERDUE
  const org = await prisma.organization.create({
    data: {
      name: `Org Alertas RT ${timestamp}`,
      slug: `org-alert-rt-${timestamp}`,
      status: "ACTIVE",
      settings: {
        delayMilestones: [15, 30, 60],
        whatsappAlerts: {
          enabled: true,
          notificationTypes: ["TASK_OVERDUE", "IMPEDIMENT_REPORTED"],
          criticalityFilter: "CRITICAL_ONLY",
          triggerStep: 0,
          repeatInterval: 30,
          businessHoursOnly: false,
          alwaysUrgent: true,
        },
      },
    },
  });

  // 2. Criar Unidade (Location)
  const location = await prisma.location.create({
    data: {
      organizationId: org.id,
      name: `Unidade Central ${timestamp}`,
      status: "ACTIVE",
      timezone: "America/Sao_Paulo",
      openingTime: "08:00",
      closingTime: "22:00",
      operatingDays: "MON,TUE,WED,THU,FRI,SAT,SUN",
    },
  });

  // 3. Criar Usuário Gestor (OWNER)
  const user = await prisma.user.create({
    data: {
      name: `Gestor Operacional ${timestamp}`,
      email: `gestor-${timestamp}@tarefai.test`,
      status: "ACTIVE",
    },
  });

  const member = await prisma.organizationMember.create({
    data: {
      organizationId: org.id,
      userId: user.id,
      role: "OWNER",
      status: "ACTIVE",
    },
  });

  // 4. Cadastrar Destinatário de WhatsApp
  await prisma.whatsAppRecipient.create({
    data: {
      organizationId: org.id,
      name: "Gestor WhatsApp",
      phone: testPhone,
    },
  });

  try {
    // TESTE 1: Avaliação de regras de alerta (evaluateAlertRules)
    await test("evaluateAlertRules respeita tipo TASK_OVERDUE e criticidade", () => {
      const settings: WhatsAppAlertSettings = {
        enabled: true,
        notificationTypes: ["TASK_OVERDUE"],
        criticalityFilter: "CRITICAL_ONLY",
        triggerStep: 0,
        repeatInterval: 0,
        businessHoursOnly: false,
        alwaysUrgent: false,
      };

      // Não crítico deve ser suprimido
      const evalNonCritical = evaluateAlertRules(settings, {
        type: "TASK_OVERDUE",
        priority: "HIGH",
      });
      assert.equal(evalNonCritical.eligible, false);
      assert.equal(evalNonCritical.suppressionReason, "CRITICALITY_FILTERED");

      // Crítico deve ser elegível
      const evalCritical = evaluateAlertRules(settings, {
        type: "TASK_OVERDUE",
        priority: "CRITICAL",
      });
      assert.equal(evalCritical.eligible, true);

      // Tipo incompatível deve ser filtrado
      const evalFiltered = evaluateAlertRules(settings, {
        type: "TASK_CLAIMED",
        priority: "CRITICAL",
      });
      assert.equal(evalFiltered.eligible, false);
      assert.equal(evalFiltered.suppressionReason, "EVENT_TYPE_FILTERED");
    });

    // TESTE 2: Formatação de mensagem do alerta WhatsApp com URL normalizada
    await test("formatOperationalAlertMessage formata URL sem barras duplas", () => {
      const formatted = formatOperationalAlertMessage({
        organizationName: org.name,
        title: "Prazo limite excedido",
        message: "A tarefa excedeu o prazo previsto.",
        type: "TASK_OVERDUE",
        priority: "CRITICAL",
        taskTitle: "Limpeza de Dutos",
        locationName: location.name,
        actionUrl: "/tasks/task_123",
      });

      assert.ok(formatted.includes("🚨 *URGENTE / CRÍTICA*"));
      assert.ok(formatted.includes("Limpeza de Dutos"));
      assert.ok(formatted.includes("Unidade Central"));
      assert.ok(formatted.includes("/management/tasks/task_123"));
      assert.ok(!formatted.includes("//tasks/task_123"));
    });

    // TESTE 3: Disparo em tempo real via operationalTick com tarefa atrasada
    let taskId = "";
    await test("operationalTick detecta SLA_BREACH, notifica gestor com TASK_OVERDUE e gera ocorrência de WhatsApp", async () => {
      const pastSla = new Date(Date.now() - 20 * 60000); // Venceu há 20 minutos

      const task = await prisma.task.create({
        data: {
          organizationId: org.id,
          locationId: location.id,
          title: "Auditoria Crítica de Segurança",
          status: "AVAILABLE",
          priority: "HIGH",
          criticality: "CRITICAL",
          slaDueAt: pastSla,
          toleranceMinutes: 20,
        },
      });
      taskId = task.id;

      // Executa o operationalTick focado na fase de SLA
      const result = await operationalTick(new Date(), {
        organizationId: org.id,
        phases: ["TASKS"],
      });

      assert.equal(result.alerts >= 1, true, "Deve registrar pelo menos 1 alerta");

      // 1. Verifica Notificação criada para o gestor
      const notification = await prisma.notification.findFirst({
        where: {
          organizationId: org.id,
          userId: user.id,
          type: "TASK_OVERDUE",
        },
      });
      assert.ok(notification, "Notificação TASK_OVERDUE deve existir para o gestor");
      assert.equal(notification.priority, "CRITICAL", "Prioridade deve ser elevada para CRITICAL devido à criticality");
      assert.ok(notification.title.includes("Prazo"), "Título deve indicar prazo excedido");

      const notifData = notification.data as Record<string, unknown>;
      assert.equal(notifData.taskId, task.id);
      assert.equal(notifData.taskTitle, task.title);

      // 2. Verifica WhatsAppAlertOccurrence criada
      const occurrence = await prisma.whatsAppAlertOccurrence.findFirst({
        where: {
          organizationId: org.id,
          taskId: task.id,
          eventType: "TASK_OVERDUE",
        },
      });
      assert.ok(occurrence, "WhatsAppAlertOccurrence deve ter sido criada");
      assert.equal(occurrence.status, "ACTIVE");
      assert.equal(occurrence.isResolved, false);

      // 3. Verifica WhatsAppAlertDelivery para o destinatário cadastrado
      const delivery = await prisma.whatsAppAlertDelivery.findFirst({
        where: {
          occurrenceId: occurrence.id,
          recipientPhone: testPhone,
        },
      });
      assert.ok(delivery, "WhatsAppAlertDelivery deve ter sido criada para o telefone de teste");
      assert.ok(["PENDING", "SENT"].includes(delivery.status), `Status da entrega deve ser PENDING ou SENT, recebido: ${delivery.status}`);
    });

    // TESTE 4: Idempotência do ciclo de atraso
    await test("Novo operationalTick não duplica ocorrência nem entrega para o mesmo marco", async () => {
      const occurrencesBefore = await prisma.whatsAppAlertOccurrence.count({
        where: { organizationId: org.id, taskId },
      });
      const deliveriesBefore = await prisma.whatsAppAlertDelivery.count({
        where: { organizationId: org.id },
      });

      // Executa novamente no mesmo instante
      await operationalTick(new Date(), {
        organizationId: org.id,
        phases: ["TASKS"],
      });

      const occurrencesAfter = await prisma.whatsAppAlertOccurrence.count({
        where: { organizationId: org.id, taskId },
      });
      const deliveriesAfter = await prisma.whatsAppAlertDelivery.count({
        where: { organizationId: org.id },
      });

      assert.equal(occurrencesAfter, occurrencesBefore, "Ocorrências não devem duplicar");
      assert.equal(deliveriesAfter, deliveriesBefore, "Entregas não devem duplicar");
    });

    // TESTE 5: Resolução automática ao concluir tarefa
    await test("Conclusão de tarefa resolve ocorrências e cancela entregas pendentes", async () => {
      const { resolveAlertsForTask } = await import("../src/application/whatsapp/alerts");

      // Resolve a tarefa
      await resolveAlertsForTask(taskId, org.id);

      const occurrence = await prisma.whatsAppAlertOccurrence.findFirst({
        where: { taskId, organizationId: org.id },
      });
      assert.ok(occurrence);
      assert.equal(occurrence.status, "RESOLVED");
      assert.equal(occurrence.isResolved, true);
      assert.ok(occurrence.resolvedAt !== null);

      const pendingDeliveries = await prisma.whatsAppAlertDelivery.findMany({
        where: {
          occurrenceId: occurrence.id,
          status: { in: ["PENDING", "PROCESSING", "SCHEDULED"] },
        },
      });
      assert.equal(pendingDeliveries.length, 0, "Nenhuma entrega deve permanecer pendente após resolução");
    });

  } finally {
    // Limpeza de teardown
    await prisma.whatsAppAlertDelivery.deleteMany({ where: { organizationId: org.id } }).catch(() => {});
    await prisma.whatsAppAlertOccurrence.deleteMany({ where: { organizationId: org.id } }).catch(() => {});
    await prisma.notification.deleteMany({ where: { organizationId: org.id } }).catch(() => {});
    await prisma.taskOccurrence.deleteMany({ where: { task: { organizationId: org.id } } }).catch(() => {});
    await prisma.activityLog.deleteMany({ where: { organizationId: org.id } }).catch(() => {});
    await prisma.task.deleteMany({ where: { organizationId: org.id } }).catch(() => {});
    await prisma.whatsAppRecipient.deleteMany({ where: { organizationId: org.id } }).catch(() => {});
    await prisma.organizationMember.deleteMany({ where: { organizationId: org.id } }).catch(() => {});
    await prisma.location.deleteMany({ where: { organizationId: org.id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: user.id } }).catch(() => {});
    await prisma.organization.deleteMany({ where: { id: org.id } }).catch(() => {});
  }

  console.log(`\n=== TODOS OS ${passed} TESTES DE ALERTAS EM TEMPO REAL PASSARAM COM SUCESSO! ===`);
}

run().catch((err) => {
  console.error("Erro fatal no runner de testes:", err);
  process.exit(1);
});
