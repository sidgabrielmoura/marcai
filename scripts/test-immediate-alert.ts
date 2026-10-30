import "dotenv/config";
import { prisma } from "../src/infrastructure/database/prisma";
import { wahaClient } from "../src/infrastructure/whatsapp/waha-client";
import { registerOperationalAlert, dispatchPendingWhatsAppAlerts } from "../src/application/whatsapp/alerts";

async function main() {
  console.log("==================================================");
  console.log("   DISPARO DE TESTE IMEDIATO - WHATSAPP / WAHA    ");
  console.log("==================================================\n");

  // 1. Procurar instâncias no banco
  const instances = await prisma.whatsAppInstance.findMany({
    include: {
      organization: true,
      location: true,
    },
  });

  if (instances.length === 0) {
    console.error("❌ Nenhuma instância de WhatsApp encontrada no banco de dados.");
    console.log("Crie uma instância pela interface ou rode as migrações.");
    process.exit(1);
  }

  console.log(`📋 Instâncias cadastradas (${instances.length}):`);
  for (const inst of instances) {
    console.log(`  • Instância: "${inst.name}"`);
    console.log(`    - Sessão: ${inst.session}`);
    console.log(`    - Status no Banco: ${inst.status}`);
    console.log(`    - Unidade: ${inst.location?.name ?? "Sem unidade"} (ID: ${inst.locationId})`);
    console.log(`    - Organização: ${inst.organization?.name} (ID: ${inst.organizationId})`);
  }

  // 2. Verificar conexão remota no WAHA
  const endpoint = process.env.WAHA_BASE_URL || "https://whats.ax3code.com";
  console.log(`\n🌐 Verificando status no servidor WAHA (${endpoint}):`);
  for (const inst of instances) {
    try {
      const session = await wahaClient.getSession(inst.session);
      const remoteStatus = session?.status ?? (session === null ? "NOT_FOUND" : "desconhecido");
      console.log(`  • Sessão [${inst.session}]: ${remoteStatus}`);
      if (remoteStatus === "WORKING" && inst.status !== "WORKING") {
        await prisma.whatsAppInstance.update({
          where: { id: inst.id },
          data: { status: "WORKING" },
        });
        inst.status = "WORKING";
        console.log(`    ↳ Status atualizado para WORKING no banco local.`);
      }
    } catch (err: any) {
      console.log(`  • Sessão [${inst.session}]: erro ao consultar - ${err.message}`);
    }
  }

  // 3. Escolher instância operacional
  // Ignora instâncias sintéticas de teste (INSTANCE-TEST-) se houver instâncias reais
  const realInstances = instances.filter((i) => !i.session.startsWith("INSTANCE-TEST-"));
  const pool = realInstances.length > 0 ? realInstances : instances;
  const activeInstance = pool.find((i) => i.status === "WORKING") || pool[0];
  const targetOrg = activeInstance.organization;
  const targetLocation = activeInstance.location;

  if (!targetLocation) {
    console.error("❌ A instância selecionada não está vinculada a uma unidade ativa.");
    process.exit(1);
  }

  console.log(`\n🎯 Instância selecionada para o disparo: "${activeInstance.name}" (${activeInstance.session})`);
  console.log(`   Organização: ${targetOrg.name} (${targetOrg.id})`);
  console.log(`   Unidade: ${targetLocation.name} (${targetLocation.id})`);
  console.log(`   Status: ${activeInstance.status}`);

  // 4. Identificar número de telefone de destino
  const phoneArg = process.argv
    .find((arg) => arg.startsWith("--phone="))
    ?.split("=")[1]
    ?.replace(/\D/g, "")
    || process.argv[2]?.replace(/^--phone=/, "")?.replace(/\D/g, "");

  let targetPhone = phoneArg;

  if (!targetPhone) {
    // Buscar em WhatsAppRecipient da organização
    const existingRecipient = await prisma.whatsAppRecipient.findFirst({
      where: { organizationId: targetOrg.id },
    });
    if (existingRecipient?.phone) {
      targetPhone = existingRecipient.phone.replace(/\D/g, "");
      console.log(`\n📱 Usando telefone já cadastrado nos destinatários: +${targetPhone} (${existingRecipient.name})`);
    }
  }

  if (!targetPhone) {
    console.log("\n⚠️  NENHUM TELEFONE DE DESTINO FORNECIDO!");
    console.log("Para disparar para o seu próprio WhatsApp agora mesmo, execute:");
    console.log("   npm run test:whatsapp:send -- --phone=5511999999999\n");
    console.log("Substitua 5511999999999 pelo seu número real com código do país (55) e DDD.");
    process.exit(0);
  }

  console.log(`\n📲 Destinatário alvo: +${targetPhone}`);

  // 5. Garantir que o destinatário está cadastrado na tabela de recipients
  await prisma.whatsAppRecipient.upsert({
    where: {
      organizationId_phone: {
        organizationId: targetOrg.id,
        phone: targetPhone,
      },
    },
    update: { name: "Destinatário Teste" },
    create: {
      organizationId: targetOrg.id,
      phone: targetPhone,
      name: "Destinatário Teste",
    },
  });

  // 6. Garantir que as configurações de alerta da organização estão ativas
  const currentSettings = ((targetOrg.settings as any) || {}).whatsappAlerts || {};
  const updatedSettings = {
    ...currentSettings,
    enabled: true,
    notificationTypes: [
      "TASK_OVERDUE",
      "IMPEDIMENT_REPORTED",
      "APPROVAL_PENDING",
      "DEADLINE_WARNING",
      "PROCESS_STALLED",
    ],
    criticalityFilter: "ALL",
    alwaysUrgent: true,
    businessHoursOnly: false,
    repeatInterval: 0,
    triggerStep: 0,
  };

  await prisma.organization.update({
    where: { id: targetOrg.id },
    data: {
      settings: {
        ...((targetOrg.settings as object) || {}),
        whatsappAlerts: updatedSettings,
      },
    },
  });
  console.log("⚙️  Regras de alerta da organização configuradas para envio imediato.");

  // 7. Buscar ou associar tarefa de teste
  let task = await prisma.task.findFirst({
    where: { organizationId: targetOrg.id, locationId: targetLocation.id },
  });

  const nowIso = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const incidentKey = `manual-test-${Date.now()}`;

  console.log(`\n📝 Registrando alerta operacional no Tarefaí...`);
  const registered = await registerOperationalAlert({
    organizationId: targetOrg.id,
    locationId: targetLocation.id,
    taskId: task?.id,
    taskTitle: task?.title || "Higienização e Verificação de Padrão Operacional",
    locationName: targetLocation.name,
    type: "IMPEDIMENT_REPORTED",
    priority: "CRITICAL",
    title: "🚨 Teste Imediato de Alerta WhatsApp",
    message: `Disparo de validação em tempo real solicitado às ${nowIso}. Sistema operacional e mensageria integrados.`,
    actionUrl: `/tasks/${task?.id || "test-task"}`,
  });

  console.log("📊 Resultado do registro do alerta:", {
    occurrenceId: registered?.occurrenceId,
    deliveriesCount: registered?.deliveriesCount,
  });

  if (!registered || registered.deliveriesCount === 0) {
    console.error("❌ O alerta não gerou entregas. Verifique se há destinatários cadastrados.");
    process.exit(1);
  }

  // 8. Executar despacho de entregas pendentes via worker
  console.log("\n🚀 Executando despacho pendente para o WAHA...");
  const dispatchResult = await dispatchPendingWhatsAppAlerts();
  console.log("📦 Resultado do despacho:", dispatchResult);

  // 9. Verificar status da entrega no banco
  const deliveries = await prisma.whatsAppAlertDelivery.findMany({
    where: { occurrenceId: registered.occurrenceId },
  });

  console.log("\n📬 Status das entregas geradas:");
  for (const del of deliveries) {
    console.log(`  • Destinatário: +${del.recipientPhone}`);
    console.log(`    - Status: ${del.status}`);
    console.log(`    - ID da Mensagem WAHA: ${del.providerMessageId || "Nenhum"}`);
    if (del.lastError) {
      console.log(`    - Último Erro: ${del.lastError}`);
    }
  }

  if (deliveries.some((d) => d.status === "SENT")) {
    console.log("\n✅ Mensagem enviada com sucesso para o WhatsApp pelo WAHA!");
  } else if (deliveries.some((d) => d.status === "FAILED")) {
    console.log("\n⚠️ O envio falhou no WAHA. Verifique se a instância está conectada ao WhatsApp (status WORKING).");
  }

  console.log("\n==================================================");
  console.log("                  FIM DO TESTE                    ");
  console.log("==================================================");
}

main()
  .catch((err) => {
    console.error("\n❌ Erro durante o teste:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
