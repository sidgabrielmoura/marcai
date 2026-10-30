import "dotenv/config";
import { prisma } from "../src/infrastructure/database/prisma";

async function main() {
  console.log("=== INSPEÇÃO DO BANCO DE DADOS ===");

  // 1. Notificações recentes
  const recentNotifs = await prisma.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      organizationId: true,
      userId: true,
      type: true,
      priority: true,
      title: true,
      message: true,
      data: true,
      createdAt: true,
      readAt: true,
    },
  });
  console.log("\nÚltimas 5 notificações:");
  console.dir(recentNotifs, { depth: null });

  // 2. Organizações
  const orgs = await prisma.organization.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      slug: true,
      settings: true,
    },
  });
  console.log("\nOrganizações e settings.whatsappAlerts:");
  for (const org of orgs) {
    const raw = (org.settings as any)?.whatsappAlerts;
    console.log(`- Org: "${org.name}" (${org.id})`);
    console.log(`  whatsappAlerts:`, raw);
  }

  // 3. WhatsApp Recipient
  const recipients = await prisma.whatsAppRecipient.findMany();
  console.log("\nDestinatários cadastrados:", recipients);

  // 4. WhatsApp Instances
  const instances = await prisma.whatsAppInstance.findMany({
    select: {
      id: true,
      organizationId: true,
      locationId: true,
      name: true,
      session: true,
      status: true,
    },
  });
  console.log("\nInstâncias cadastradas:", instances);

  // 5. WhatsApp Alert Occurrences
  const occurrences = await prisma.whatsAppAlertOccurrence.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  console.log("\nÚltimas 5 ocorrências de alerta WhatsApp:", occurrences);

  // 6. WhatsApp Alert Deliveries
  const deliveries = await prisma.whatsAppAlertDelivery.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  console.log("\nÚltimas 5 entregas de alerta WhatsApp:", deliveries);

  // 7. mobile_push_outbox
  const outbox = await prisma.$queryRaw`SELECT * FROM mobile_push_outbox WHERE id = 'cmvu02yec000208jszz4e9igq'`;
  console.log("\nOutbox para cmvu02yec000208jszz4e9igq:", outbox);

  const lastOutbox = await prisma.$queryRaw`SELECT * FROM mobile_push_outbox ORDER BY created_at DESC LIMIT 5`;
  console.log("\nÚltimos 5 no outbox:", lastOutbox);
}

main().catch(console.error);
