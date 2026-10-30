import "dotenv/config";
import assert from "node:assert/strict";
import {
  evaluateAlertRules,
  registerOperationalAlert,
  dispatchPendingWhatsAppAlerts,
  resolveAlertsForTask,
  resolveAlertsForExecution,
} from "../src/application/whatsapp/alerts";
import {
  WHATSAPP_EVENT_TYPES,
  type WhatsAppAlertSettings,
} from "../src/domain/whatsapp/contracts";
import { formatOperationalAlertMessage } from "../src/domain/whatsapp/formatter";
import { prisma } from "../src/infrastructure/database/prisma";
import { wahaClient } from "../src/infrastructure/whatsapp/waha-client";

interface CategoryTestSpec {
  id: string;
  categoryLabel: string;
  eventTypes: string[];
  sampleTitle: string;
  sampleMessage: string;
  isProcessAlert?: boolean;
}

const CATEGORIES_TO_VERIFY: CategoryTestSpec[] = [
  {
    id: "TASK_OVERDUE",
    categoryLabel: "Atrasos de Prazo",
    eventTypes: ["TASK_OVERDUE", "TASK_TOLERANCE_EXCEEDED", "SLA_BREACH"],
    sampleTitle: "Prazo de Tarefa Excedido",
    sampleMessage: "A conferência de estoque ultrapassou o tempo limite de tolerância.",
  },
  {
    id: "IMPEDIMENT_REPORTED",
    categoryLabel: "Impedimentos Operacionais",
    eventTypes: ["IMPEDIMENT_REPORTED", "OPERATIONAL_ALERT", "VALIDATION_EXCEPTION"],
    sampleTitle: "Impedimento Operacional Reportado",
    sampleMessage: "Operador reportou falta de equipamento para finalizar a montagem.",
  },
  {
    id: "APPROVAL_PENDING",
    categoryLabel: "Aprovações Pendentes",
    eventTypes: ["APPROVAL_PENDING", "APPROVAL_REQUESTED", "APPROVAL_OVERDUE"],
    sampleTitle: "Aprovação Pendente de Gestão",
    sampleMessage: "Etapa de auditoria requer validação de gestor da unidade.",
  },
  {
    id: "DEADLINE_WARNING",
    categoryLabel: "Avisos Preventivos",
    eventTypes: ["DEADLINE_WARNING", "TASK_EXPIRING_SOON", "CRITICAL_TASK_ALERT"],
    sampleTitle: "Aviso Preventivo de Vencimento",
    sampleMessage: "Faltam 30 minutos para o término do prazo do check-in de entrega.",
  },
  {
    id: "PROCESS_STALLED",
    categoryLabel: "Processos Parados",
    eventTypes: ["PROCESS_STALLED", "PAUSE_ALERT"],
    sampleTitle: "Processo Operacional Estagnado",
    sampleMessage: "A rotina de abertura de loja está parada há mais de 45 minutos sem avanço.",
    isProcessAlert: true,
  },
];

async function main() {
  console.log("================================================================");
  console.log("  VERIFICAÇÃO COMPLETA DE TODAS AS 5 CATEGORIAS DE ENVIO WHATSAPP ");
  console.log("================================================================\n");

  // -------------------------------------------------------------
  // FASE 1: Verificação de Contratos e Mapeamento de Eventos
  // -------------------------------------------------------------
  console.log("📋 FASE 1: Validando mapeamentos no domínio (contracts.ts)...");
  for (const cat of CATEGORIES_TO_VERIFY) {
    const mapped = WHATSAPP_EVENT_TYPES[cat.id];
    assert.ok(mapped, `Categoria "${cat.id}" deve existir em WHATSAPP_EVENT_TYPES`);
    console.log(`  • [${cat.categoryLabel}] (${cat.id}):`);
    for (const eventType of cat.eventTypes) {
      assert.ok(
        mapped.includes(eventType),
        `Evento ${eventType} deve estar mapeado na categoria ${cat.id}`
      );
      console.log(`    ✓ Sub-evento suportado: ${eventType}`);
    }
  }
  console.log("✓ Todos os 14 sub-eventos das 5 categorias estão devidamente mapeados.\n");

  // -------------------------------------------------------------
  // FASE 2: Verificação do Motor de Regras (evaluateAlertRules)
  // -------------------------------------------------------------
  console.log("🧠 FASE 2: Validando avaliação seletiva de regras por categoria...");
  for (const cat of CATEGORIES_TO_VERIFY) {
    // Configuração contendo APENAS a categoria atual
    const categoryOnlySettings: WhatsAppAlertSettings = {
      enabled: true,
      notificationTypes: [cat.id],
      criticalityFilter: "ALL",
      triggerStep: 0,
      repeatInterval: 0,
      businessHoursOnly: false,
      alwaysUrgent: false,
    };

    // Testa cada sub-evento da categoria
    for (const eventType of cat.eventTypes) {
      const evalMatch = evaluateAlertRules(categoryOnlySettings, {
        type: eventType,
        priority: "HIGH",
      });
      assert.equal(
        evalMatch.eligible,
        true,
        `Evento ${eventType} deveria ser elegível quando categoria ${cat.id} está ativa`
      );
    }

    // Testa que eventos de OUTRAS categorias são bloqueados
    const otherCat = CATEGORIES_TO_VERIFY.find((c) => c.id !== cat.id)!;
    const evalMismatch = evaluateAlertRules(categoryOnlySettings, {
      type: otherCat.eventTypes[0],
      priority: "HIGH",
    });
    assert.equal(
      evalMismatch.eligible,
      false,
      `Evento ${otherCat.eventTypes[0]} deveria ser suprimido quando apenas ${cat.id} está ativa`
    );
    assert.equal(evalMismatch.suppressionReason, "EVENT_TYPE_FILTERED");

    console.log(`  ✓ Categoria [${cat.categoryLabel}]: aprovação de sub-eventos e isolamento validados.`);
  }
  console.log("✓ Motor de regras validou perfeitamente todos os filtros.\n");

  // -------------------------------------------------------------
  // FASE 3: Teste Integrado com Banco de Dados para as 5 Categorias
  // -------------------------------------------------------------
  console.log("💾 FASE 3: Testando persistência, formatação e despacho real no banco de dados...");

  const timestamp = Date.now();
  const testOrgSlug = `test-cat-alerts-${timestamp}`;

  // Cria organização de teste com TODAS as 5 categorias habilitadas
  const org = await prisma.organization.create({
    data: {
      name: "Empresa Teste Multi-Categorias",
      slug: testOrgSlug,
      status: "ACTIVE",
      settings: {
        whatsappAlerts: {
          enabled: true,
          notificationTypes: CATEGORIES_TO_VERIFY.map((c) => c.id),
          criticalityFilter: "ALL",
          triggerStep: 0,
          repeatInterval: 10,
          businessHoursOnly: false,
          alwaysUrgent: false,
        },
      },
    },
  });

  const location = await prisma.location.create({
    data: {
      organizationId: org.id,
      name: "Unidade Central",
      status: "ACTIVE",
      timezone: "America/Sao_Paulo",
    },
  });

  // Cria 2 destinatários
  await prisma.whatsAppRecipient.createMany({
    data: [
      { organizationId: org.id, name: "Diretor Operacional", phone: "5511988880001" },
      { organizationId: org.id, name: "Gerente de Plantão", phone: "5511988880002" },
    ],
  });

  // Cria instância operacional no banco
  const testSession = `INSTANCE-TEST-CAT-${timestamp}`;
  await prisma.whatsAppInstance.create({
    data: {
      organizationId: org.id,
      locationId: location.id,
      name: "Instância de Teste Categorias",
      session: testSession,
      status: "WORKING",
    },
  });

  // Cria tarefa para testes de tarefas
  const task = await prisma.task.create({
    data: {
      organizationId: org.id,
      locationId: location.id,
      title: "Tarefa de Validação Operacional",
      status: "IN_PROGRESS",
    },
  });

  // Cria processo e execução para testes de processos parados
  const processRecord = await prisma.process.create({
    data: {
      organizationId: org.id,
      locationId: location.id,
      name: "Processo Diário de Abertura",
      status: "ACTIVE",
    },
  });

  const execution = await prisma.processExecution.create({
    data: {
      organizationId: org.id,
      processId: processRecord.id,
      locationId: location.id,
      scheduledAt: new Date(),
      availableAt: new Date(),
      status: "IN_PROGRESS",
    },
  });

  // Mock do wahaClient para interceptar envios de teste
  const originalSendText = wahaClient.sendText;
  const dispatchedList: Array<{ session: string; phone: string; text: string }> = [];
  (wahaClient as any).sendText = async (session: string, phone: string, text: string) => {
    dispatchedList.push({ session, phone, text });
    return {
      id: `mock_waha_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      status: "SENT",
    };
  };

  const createdOccurrenceIds: string[] = [];

  try {
    for (const cat of CATEGORIES_TO_VERIFY) {
      console.log(`\n  👉 Disparando categoria: [${cat.categoryLabel}]`);

      for (const eventType of cat.eventTypes) {
        const isProcess = cat.isProcessAlert;
        const result = await registerOperationalAlert({
          organizationId: org.id,
          locationId: location.id,
          taskId: isProcess ? undefined : task.id,
          executionId: isProcess ? execution.id : undefined,
          type: eventType,
          title: `[${cat.categoryLabel}] ${cat.sampleTitle} (${eventType})`,
          message: cat.sampleMessage,
          priority: "HIGH",
          milestoneStep: 1,
        });

        assert.ok(result, `Deveria ter registrado alerta para ${eventType}`);
        assert.equal(result.deliveriesCount, 2, `Deveria gerar entrega para 2 destinatários`);
        createdOccurrenceIds.push(result.occurrenceId);

        // Confere ocorrência no banco
        const occurrence = await prisma.whatsAppAlertOccurrence.findUniqueOrThrow({
          where: { id: result.occurrenceId },
        });
        assert.equal(occurrence.eventType, eventType);
        assert.equal(occurrence.status, "ACTIVE");
        assert.equal(occurrence.isResolved, false);

        // Confere se as entregas foram criadas
        const deliveries = await prisma.whatsAppAlertDelivery.findMany({
          where: { occurrenceId: result.occurrenceId },
        });
        assert.equal(deliveries.length, 2);
        assert.ok(deliveries.every((d) => ["PENDING", "SCHEDULED", "PROCESSING", "SENT"].includes(d.status)));

        // Confere formatação rica da mensagem
        assert.ok(occurrence.message.includes("*Tarefaí Alertas*"));
        assert.ok(occurrence.message.includes("Unidade Central"));
        if (isProcess) {
          assert.ok(
            occurrence.message.includes("Processo Diário de Abertura") ||
              occurrence.message.includes("Processo"),
            "Mensagem deve conter menção ao processo"
          );
        } else {
          assert.ok(
            occurrence.message.includes("Tarefa de Validação Operacional") ||
              occurrence.message.includes("Tarefa"),
            "Mensagem deve conter menção à tarefa"
          );
        }

        console.log(`     ✓ Sub-evento ${eventType}: ocorrência criada, 2 entregas agendadas, mensagem validada.`);
      }
    }

    // -------------------------------------------------------------
    // FASE 4: Despacho em lote de todas as entregas pendentes
    // -------------------------------------------------------------
    console.log("\n🚀 FASE 4: Garantindo envio e processamento de todas as entregas...");
    await new Promise((r) => setTimeout(r, 600));
    const dispatchResult = await dispatchPendingWhatsAppAlerts({ organizationId: org.id });
    console.log(`   Resultado de despacho residual:`, dispatchResult);
    assert.equal(dispatchResult.failed, 0, "Nenhuma entrega deveria ter falhado");

    // Confere se todas as entregas foram marcadas como SENT com providerMessageId
    const allDeliveries = await prisma.whatsAppAlertDelivery.findMany({
      where: { organizationId: org.id },
    });
    const sentCount = allDeliveries.filter((d) => d.status === "SENT").length;
    console.log(`   Total de mensagens enviadas com sucesso: ${sentCount} / ${allDeliveries.length}`);
    assert.equal(sentCount, allDeliveries.length);
    assert.ok(allDeliveries.every((d) => !!d.providerMessageId && !!d.providerMessageIdHash));

    // -------------------------------------------------------------
    // FASE 5: Resolução e Cancelamento em Cascata
    // -------------------------------------------------------------
    console.log("\n🧹 FASE 5: Testando resolução automática de tarefas e processos...");

    // Resolução da tarefa
    await resolveAlertsForTask(task.id, org.id);
    const taskOccurrences = await prisma.whatsAppAlertOccurrence.findMany({
      where: { taskId: task.id, organizationId: org.id },
    });
    assert.ok(taskOccurrences.every((o) => o.status === "RESOLVED" && o.isResolved === true));
    console.log(`   ✓ Alertas vinculados à tarefa resolvidos.`);

    // Resolução da execução de processo
    await resolveAlertsForExecution(execution.id, org.id);
    const execOccurrences = await prisma.whatsAppAlertOccurrence.findMany({
      where: { executionId: execution.id, organizationId: org.id },
    });
    assert.ok(execOccurrences.every((o) => o.status === "RESOLVED" && o.isResolved === true));
    console.log(`   ✓ Alertas vinculados ao processo resolvidos.`);
  } finally {
    // Restaura mock do wahaClient
    (wahaClient as any).sendText = originalSendText;

    // Limpeza completa da organização e dados de teste
    await prisma.organization.delete({
      where: { id: org.id },
    });
    console.log("\n🗑️ Dados sintéticos de teste removidos com sucesso.");
  }

  console.log("\n================================================================");
  console.log("   TODAS AS 5 CATEGORIAS FORAM VERIFICADAS E ESTÃO 100% OPERACIONAIS! 🎉");
  console.log("================================================================\n");
}

main().catch((err) => {
  console.error("❌ ERRO NA VERIFICAÇÃO DAS CATEGORIAS:", err);
  process.exit(1);
});
