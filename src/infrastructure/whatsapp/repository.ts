import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/infrastructure/database/prisma";
import type { AuthenticatedContext } from "@/application/security/auth-context";
import { WhatsAppError, knownIdentity, type RemoteStatus } from "@/domain/whatsapp/contracts";
import type { Prisma } from "@prisma/client";

const instanceDTO = { id: true, name: true, status: true, locationId: true, revision: true, connectedPhone: true, connectedName: true, location: { select: { name: true } } } as const;
export const whatsappRepository = {
  async settings(organizationId: string) {
    const [instances, recipients, locations] = await Promise.all([
      prisma.whatsAppInstance.findMany({ where: { organizationId }, select: instanceDTO, orderBy: { createdAt: "asc" } }),
      prisma.whatsAppRecipient.findMany({ where: { organizationId }, select: { phone: true, name: true }, orderBy: { phone: "asc" } }),
      prisma.location.findMany({ where: { organizationId, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return { instances, recipients, locations };
  },
  async instance(organizationId: string, id: string) {
    return prisma.whatsAppInstance.findFirst({ where: { id, organizationId, location: { organizationId, status: "ACTIVE" } } });
  },
  async create(c: AuthenticatedContext, input: { name: string; locationId: string }, session: string) {
    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${c.organizationId} FOR UPDATE`;
      if (!await tx.location.findFirst({ where: { id: input.locationId, organizationId: c.organizationId, status: "ACTIVE" }, select: { id: true } })) throw new WhatsAppError("UNIT_UNAVAILABLE", "Unidade indisponível.", 404);
      if (await tx.whatsAppInstance.findFirst({ where: { organizationId: c.organizationId, locationId: input.locationId }, select: { id: true } })) throw new WhatsAppError("UNIT_HAS_INSTANCE", "Esta unidade já possui uma instância.", 409);
      const instance = await tx.whatsAppInstance.create({ data: { ...input, organizationId: c.organizationId, session } });
      await tx.activityLog.create({ data: { organizationId: c.organizationId, actorId: c.memberId, entityType: "WHATSAPP_INSTANCE", entityId: instance.id, action: "WHATSAPP_INSTANCE_CREATED" } });
      return instance;
    });
  },
  async recipients(c: AuthenticatedContext, rows: Array<{ name: string; phone: string }>) {
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${c.organizationId} FOR UPDATE`;
      await tx.whatsAppRecipient.deleteMany({ where: { organizationId: c.organizationId } });
      if (rows.length) await tx.whatsAppRecipient.createMany({ data: rows.map(row => ({ ...row, organizationId: c.organizationId })) });
      const currentPhones = rows.map(r => r.phone);
      if (currentPhones.length) {
        await tx.whatsAppAlertDelivery.updateMany({
          where: {
            organizationId: c.organizationId,
            recipientPhone: { notIn: currentPhones },
            status: { in: ["PENDING", "SCHEDULED"] },
          },
          data: { status: "CANCELLED", suppressionReason: "RECIPIENT_REMOVED", leaseToken: null, leaseUntil: null },
        });
      } else {
        await tx.whatsAppAlertDelivery.updateMany({
          where: {
            organizationId: c.organizationId,
            status: { in: ["PENDING", "SCHEDULED"] },
          },
          data: { status: "CANCELLED", suppressionReason: "RECIPIENT_REMOVED", leaseToken: null, leaseUntil: null },
        });
      }
      await tx.activityLog.create({ data: { organizationId: c.organizationId, actorId: c.memberId, entityType: "ORGANIZATION", entityId: c.organizationId, action: "WHATSAPP_RECIPIENTS_UPDATED" } });
    });
  },
  async rate(identity: string, limit: number, seconds = 60) {
    const key = createHash("sha256").update("whatsapp:" + identity).digest("hex");
    const [row] = await prisma.$queryRaw<Array<{ attempts: number }>>`INSERT INTO mobile_rate_limits(key,attempts) VALUES(${key},1)
      ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN mobile_rate_limits.window_at<now()-${seconds}*interval '1 second' THEN 1 ELSE mobile_rate_limits.attempts+1 END,
      window_at=CASE WHEN mobile_rate_limits.window_at<now()-${seconds}*interval '1 second' THEN now() ELSE mobile_rate_limits.window_at END RETURNING attempts`;
    if (!row || row.attempts > limit) throw new WhatsAppError("RATE_LIMIT", "Muitas tentativas. Aguarde um minuto e tente novamente.", 429);
  },
  async claim(id: string, organizationId: string) {
    const token = randomUUID();
    const result = await prisma.whatsAppInstance.updateMany({ where: { id, organizationId, OR: [{ operationUntil: null }, { operationUntil: { lt: new Date() } }] }, data: { operationToken: token, operationUntil: new Date(Date.now() + 90000) } });
    if (!result.count) throw new WhatsAppError("OPERATION_IN_PROGRESS", "Uma operação desta instância está em andamento. Aguarde e tente novamente.", 409);
    return token;
  },
  async release(id: string, token: string) {
    await prisma.whatsAppInstance.updateMany({ where: { id, operationToken: token }, data: { operationToken: null, operationUntil: null } });
  },
  async configSaved(id: string, token: string, configHash: string) {
    await prisma.whatsAppInstance.updateMany({ where: { id, operationToken: token }, data: { configHash } });
  },
  async observe(c: AuthenticatedContext, id: string, token: string, revision: number, status: string, me: { id: string; pushName?: string } | null | undefined, operation: string, observedAt: Date) {
    return prisma.$transaction(async tx => {
      const before = await tx.whatsAppInstance.findFirstOrThrow({ where: { id, organizationId: c.organizationId } });
      const identity = knownIdentity(me);
      const changed = before.status !== status || (identity.connectedPhone && identity.connectedPhone !== before.connectedPhone) || (identity.connectedName && identity.connectedName !== before.connectedName);
      const updated = changed ? await tx.whatsAppInstance.updateMany({ where: { id, organizationId: c.organizationId, operationToken: token, revision }, data: { status, ...identity, statusEventAt: before.statusEventAt && before.statusEventAt > observedAt ? before.statusEventAt : observedAt, revision: { increment: 1 } } }) : { count: 0 };
      const instance = await tx.whatsAppInstance.findFirstOrThrow({ where: { id, organizationId: c.organizationId } });
      if (updated.count) await tx.whatsAppWebhookEvent.create({ data: { id: "local-" + randomUUID(), instanceId: id, event: "session.status", occurredAt: new Date(), data: { status: instance.status, revision: instance.revision } } });
      if (operation !== "refresh") await tx.activityLog.create({ data: { organizationId: c.organizationId, actorId: c.memberId, entityType: "WHATSAPP_INSTANCE", entityId: id, action: "WHATSAPP_" + operation.toUpperCase() } });
      return instance;
    });
  },
  async remove(c: AuthenticatedContext, id: string, token: string) {
    await prisma.$transaction(async tx => {
      const removed = await tx.whatsAppInstance.deleteMany({ where: { id, organizationId: c.organizationId, operationToken: token } });
      if (removed.count) await tx.activityLog.create({ data: { organizationId: c.organizationId, actorId: c.memberId, entityType: "WHATSAPP_INSTANCE", entityId: id, action: "WHATSAPP_DELETED" } });
    });
  },
  async recordWebhook(input: { id: string; session: string; event: string; timestamp: number; data: Prisma.InputJsonObject; status?: RemoteStatus; me?: { id: string; pushName?: string } | null }) {
    return prisma.$transaction(async tx => {
      const instance = await tx.whatsAppInstance.findFirst({ where: { session: input.session, organization: { status: "ACTIVE" }, location: { status: "ACTIVE" } } });
      if (!instance) return null;
      await tx.$queryRaw`SELECT id FROM whatsapp_instances WHERE id=${instance.id} FOR UPDATE`;
      const current = await tx.whatsAppInstance.findUniqueOrThrow({ where: { id: instance.id } });
      const inserted = await tx.whatsAppWebhookEvent.createMany({ data: [{ id: input.id, instanceId: current.id, event: input.event, occurredAt: new Date(input.timestamp), data: input.data }], skipDuplicates: true });
      if (!inserted.count) return { id: instance.id, duplicate: true };
      if (input.status && (!current.statusEventAt || current.statusEventAt.getTime() <= input.timestamp)) {
        const updated = await tx.whatsAppInstance.update({ where: { id: current.id }, data: { status: input.status, statusEventAt: new Date(input.timestamp), revision: { increment: 1 }, ...knownIdentity(input.me) } });
        await tx.whatsAppWebhookEvent.update({ where: { id: input.id }, data: { data: { status: updated.status, revision: updated.revision } } });
      } else {
        // Receipt only for message/ack events; no message bodies or contact data persisted.
        await tx.whatsAppWebhookEvent.update({ where: { id: input.id }, data: { publishedAt: new Date() } });
        if (input.event === "message.ack" && typeof input.data.messageIdHash === "string" && typeof input.data.ack === "number") {
          const ack = input.data.ack;
          const ackStatus = ack === 2 ? "DELIVERED" : ack === 3 ? "READ" : undefined;
          await tx.whatsAppAlertDelivery.updateMany({
            where: {
              organizationId: current.organizationId,
              providerMessageIdHash: input.data.messageIdHash,
            },
            data: {
              providerAck: ack,
              ...(ackStatus ? { status: ackStatus } : {}),
              ...(ack === 2 ? { deliveredAt: new Date(input.timestamp) } : {}),
              ...(ack === 3 ? { readAt: new Date(input.timestamp) } : {}),
              ...(ack === -1 ? { lastError: "Falha reportada pelo WhatsApp (ACK -1)" } : {}),
            },
          });
        }
      }
      return { id: instance.id, duplicate: false };
    });
  },
  pending(instanceId: string) {
    return prisma.whatsAppWebhookEvent.findMany({ where: { instanceId, publishedAt: null }, select: { id: true, data: true, instance: { select: { id: true, organizationId: true, locationId: true } } }, orderBy: { createdAt: "asc" }, take: 30 });
  },
  async published(id: string) { await prisma.whatsAppWebhookEvent.updateMany({ where: { id, publishedAt: null }, data: { publishedAt: new Date() } }); },
};
