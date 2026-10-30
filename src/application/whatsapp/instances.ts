import { createHash, randomBytes } from "node:crypto";
import { getAuthenticatedContext } from "@/application/security/auth-context";
import { createInstanceSchema, instanceIdSchema, operationSchema, recipientsSchema, recipientLimit, WhatsAppError, type ConnectionDTO } from "@/domain/whatsapp/contracts";
import { wahaClient, type WahaSessionConfig } from "@/infrastructure/whatsapp/waha-client";
import { whatsappRepository as repository } from "@/infrastructure/whatsapp/repository";
import { backendOrigin, webhookKey } from "@/infrastructure/whatsapp/webhook-security";
import { prisma } from "@/infrastructure/database/prisma";

export async function whatsAppOwner() {
  const c = await getAuthenticatedContext(false);
  if (!c) throw new WhatsAppError("UNAUTHORIZED", "Entre novamente para continuar.", 401);
  if (c.role !== "OWNER") throw new WhatsAppError("FORBIDDEN", "Somente o proprietário pode gerenciar o WhatsApp.", 403);
  return c;
}
export async function whatsAppSettings() {
  const c = await whatsAppOwner();
  return { ...await repository.settings(c.organizationId), recipientLimit };
}
export async function createWhatsAppInstance(input: unknown) {
  const c = await whatsAppOwner();
  const data = createInstanceSchema.parse(input);
  await repository.rate("create:" + c.organizationId + ":" + c.userId, 6);
  await repository.create(c, data, "INSTANCE-" + randomBytes(12).toString("hex").toUpperCase());
  return { ...await repository.settings(c.organizationId), recipientLimit };
}
export async function saveWhatsAppRecipients(input: unknown) {
  const c = await whatsAppOwner();
  const rows = recipientsSchema.parse(input);
  await repository.rate("recipients:" + c.organizationId + ":" + c.userId, 10);
  await repository.recipients(c, rows);
  return { ...await repository.settings(c.organizationId), recipientLimit };
}
export function sessionConfig(instance: { id: string; session: string; organizationId: string; locationId: string }): WahaSessionConfig {
  return {
    metadata: { company: instance.organizationId, location: instance.locationId, instance: instance.id, project: "tarefai", purpose: "alerts" },
    proxy: null, debug: false, noweb: { store: { enabled: true, fullSync: false } },
    webhooks: [{
      url: backendOrigin() + "/api/whatsapp/webhooks/" + encodeURIComponent(instance.session),
      events: ["session.status", "message", "message.any", "message.ack"],
      hmac: { key: webhookKey(instance.session) },
      retries: { policy: "constant", delaySeconds: 1, attempts: 3 },
    }],
  };
}
export async function authorizedWhatsAppInstance(rawId: unknown) {
  const c = await whatsAppOwner();
  const id = instanceIdSchema.parse(rawId);
  const instance = await repository.instance(c.organizationId, id);
  if (!instance) throw new WhatsAppError("INSTANCE_UNAVAILABLE", "Instância indisponível.", 404);
  return { c, instance };
}
type Instance = NonNullable<Awaited<ReturnType<typeof repository.instance>>>;
function connectionDTO(instance: Instance, qr: string | null = null): ConnectionDTO {
  const image = instance.status === "SCAN_QR_CODE" ? qr : null;
  return { status: instance.status, revision: instance.revision, qr: image, qrExpiresAt: image ? Date.now() + 18000 : null };
}
async function currentQr(c: Awaited<ReturnType<typeof whatsAppOwner>>, instance: Instance, token: string): Promise<ConnectionDTO> {
  let qr: string | null = null;
  let qrFailure: unknown;
  try { qr = await wahaClient.qr(instance.session); } catch (error) { qrFailure = error; }
  let current = await repository.instance(c.organizationId, instance.id);
  if (!current) throw new WhatsAppError("INSTANCE_UNAVAILABLE", "Instância indisponível.", 404);
  if (current.status !== "SCAN_QR_CODE") return connectionDTO(current);
  if (!qr) {
    // Scanning the QR invalidates the image endpoint. Reconcile once on this
    // exceptional path instead of reporting a successful pairing as an outage.
    const observedAt = new Date();
    let remote;
    try { remote = await wahaClient.getSession(instance.session); }
    catch (error) {
      const newest = await repository.instance(c.organizationId, instance.id);
      if (newest && newest.status !== "SCAN_QR_CODE") return connectionDTO(newest);
      throw qrFailure || error;
    }
    if (remote && remote.status !== "SCAN_QR_CODE") {
      current = await repository.observe(c, instance.id, token, current.revision, remote.status, remote.me, "refresh", observedAt);
      return connectionDTO(current);
    }
    const newest = await repository.instance(c.organizationId, instance.id);
    if (newest && newest.status !== "SCAN_QR_CODE") return connectionDTO(newest);
    if (qrFailure) throw qrFailure;
  }
  return connectionDTO(current, qr);
}
export async function readWhatsAppQr(rawId: unknown): Promise<ConnectionDTO> {
  const { c, instance } = await authorizedWhatsAppInstance(rawId);
  await repository.rate("qr:" + c.organizationId + ":" + c.userId + ":" + instance.id, 8);
  if (instance.status !== "SCAN_QR_CODE") return connectionDTO(instance);
  const token = await repository.claim(instance.id, c.organizationId);
  try {
    return await currentQr(c, instance, token);
  } finally { await repository.release(instance.id, token); }
}
export async function manageWhatsAppInstance(rawId: unknown, rawOperation: unknown): Promise<ConnectionDTO> {
  const { c, instance } = await authorizedWhatsAppInstance(rawId);
  const operation = operationSchema.parse(rawOperation);
  await repository.rate("operation:" + c.organizationId + ":" + c.userId + ":" + instance.id, 12);
  const token = await repository.claim(instance.id, c.organizationId);
  try {
    // Reload after the lease; every observation is committed against its revision.
    const current = await repository.instance(c.organizationId, instance.id);
    if (!current) throw new WhatsAppError("INSTANCE_UNAVAILABLE", "Instância indisponível.", 404);
    const observedAt = new Date();
    let remote = await wahaClient.getSession(current.session);
    if (operation === "delete") {
      if (remote) await wahaClient.operate(current.session, "logout");
      await wahaClient.remove(current.session);
      await repository.remove(c, current.id, token);
      return { status: "STOPPED", qr: null, qrExpiresAt: null, revision: current.revision + 1, deleted: true };
    }
    if (["disconnect", "stop"].includes(operation)) {
      if (remote) {
        if (operation === "disconnect") await wahaClient.operate(current.session, "logout");
        await wahaClient.operate(current.session, "stop");
      }
      remote = { status: "STOPPED", me: null };
    } else {
      const config = sessionConfig(current);
      const fingerprint = createHash("sha256").update(JSON.stringify(config)).digest("hex");
      if (remote) {
        const hooks = remote.config?.webhooks;
        const urlMatches = Array.isArray(hooks) && hooks.some(hook => typeof hook === "object" && hook !== null && "url" in hook && hook.url === config.webhooks[0].url);
        if (current.configHash !== fingerprint || !urlMatches) {
          await wahaClient.configure(current.session, config);
          await repository.configSaved(current.id, token, fingerprint);
        }
      } else if (operation !== "refresh") {
        try { await wahaClient.create(current.session, config); }
        catch (error) {
          // A timed-out creation or another worker may already have created it.
          if (!(error instanceof WhatsAppError) || error.code !== "SESSION_CONFLICT") throw error;
          if (!await wahaClient.getSession(current.session)) throw error;
          await wahaClient.configure(current.session, config);
        }
        await repository.configSaved(current.id, token, fingerprint);
        remote = await wahaClient.getSession(current.session) || { status: "STARTING" };
      }
      if (remote && operation !== "refresh") {
        if (operation === "restart" || remote.status === "FAILED") await wahaClient.operate(current.session, "restart");
        else if (remote.status === "STOPPED") await wahaClient.operate(current.session, "start");
        remote = await wahaClient.getSession(current.session) || remote;
      }
    }
    const observed = await repository.observe(c, current.id, token, current.revision, remote?.status || "PENDING", remote?.me, operation, observedAt);
    if (observed.status === "SCAN_QR_CODE") return await currentQr(c, observed, token);
    const latest = await repository.instance(c.organizationId, current.id);
    const final = latest || observed;
    return connectionDTO(final);
  } finally { await repository.release(instance.id, token); }
}

export async function sendWhatsAppTestMessage() {
  const c = await whatsAppOwner();
  await repository.rate("test_message:" + c.organizationId + ":" + c.userId, 5);

  const [instances, recipients, org] = await Promise.all([
    prisma.whatsAppInstance.findMany({
      where: { organizationId: c.organizationId },
      include: { location: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.whatsAppRecipient.findMany({
      where: { organizationId: c.organizationId },
      orderBy: { phone: "asc" },
    }),
    prisma.organization.findUnique({
      where: { id: c.organizationId },
      select: { name: true },
    }),
  ]);

  if (!instances.length) {
    throw new WhatsAppError("NO_INSTANCE", "Nenhuma instância do WhatsApp cadastrada. Crie uma instância primeiro.", 400);
  }

  if (!recipients.length) {
    throw new WhatsAppError("NO_RECIPIENTS", "Nenhum destinatário cadastrado. Adicione e salve ao menos um número.", 400);
  }

  // Encontra uma instância conectada (WORKING)
  let workingInstance = instances.find(i => i.status === "WORKING");

  // Se não estiver marcada como WORKING no banco local, checa remotamente no WAHA
  if (!workingInstance) {
    for (const inst of instances) {
      try {
        const remote = await wahaClient.getSession(inst.session);
        if (remote?.status === "WORKING") {
          await prisma.whatsAppInstance.update({
            where: { id: inst.id },
            data: { status: "WORKING" },
          });
          workingInstance = { ...inst, status: "WORKING" };
          break;
        }
      } catch {}
    }
  }

  if (!workingInstance) {
    throw new WhatsAppError(
      "INSTANCE_NOT_CONNECTED",
      "A instância do WhatsApp precisa estar conectada (status Conectada) para enviar mensagens.",
      400
    );
  }

  const timeStr = new Date().toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });

  const messageText = [
    `*Tarefaí* • _Mensagem de Teste_`,
    ``,
    `Olá! Esta é uma mensagem de teste enviada a partir de *${org?.name || "sua organização"}*.`,
    `A sua conexão com o WhatsApp está ativa e funcionando perfeitamente às ${timeStr}.`,
    ``,
    `_Você receberá alertas operacionais neste número._`,
  ].join("\n");

  const incidentKey = `test-${Date.now()}-${randomBytes(4).toString("hex")}`;
  const occurrence = await prisma.whatsAppAlertOccurrence.create({
    data: {
      organizationId: c.organizationId,
      locationId: workingInstance.locationId,
      incidentKey,
      eventType: "TEST_ALERT",
      priority: "NORMAL",
      title: "Mensagem de Teste",
      message: messageText,
      status: "RESOLVED",
      isResolved: true,
      resolvedAt: new Date(),
    },
  });

  let sentCount = 0;
  const errors: string[] = [];

  for (const recipient of recipients) {
    try {
      const result = await wahaClient.sendText(workingInstance.session, recipient.phone, messageText);
      const resAny = result as any;
      const messageId = (resAny?.id || resAny?.messageId || resAny?.key?.id || null) as string | null;
      const messageIdHash = messageId
        ? createHash("sha256").update(messageId).digest("hex")
        : null;

      await prisma.whatsAppAlertDelivery.create({
        data: {
          occurrenceId: occurrence.id,
          organizationId: c.organizationId,
          locationId: workingInstance.locationId,
          instanceId: workingInstance.id,
          session: workingInstance.session,
          recipientPhone: recipient.phone,
          recipientName: recipient.name || null,
          round: 0,
          status: "SENT",
          providerMessageId: messageId,
          providerMessageIdHash: messageIdHash,
          providerAck: 1,
          sentAt: new Date(),
          attempts: 1,
        },
      });

      sentCount++;
    } catch (err: any) {
      errors.push(`${recipient.phone}: ${err?.message || "Erro de envio"}`);
      await prisma.whatsAppAlertDelivery.create({
        data: {
          occurrenceId: occurrence.id,
          organizationId: c.organizationId,
          locationId: workingInstance.locationId,
          instanceId: workingInstance.id,
          session: workingInstance.session,
          recipientPhone: recipient.phone,
          recipientName: recipient.name || null,
          round: 0,
          status: "FAILED",
          lastError: String(err?.message || "Erro de envio"),
          attempts: 1,
        },
      });
    }
  }

  if (sentCount === 0 && recipients.length > 0) {
    throw new WhatsAppError(
      "DISPATCH_FAILED",
      errors[0] || "Não foi possível enviar a mensagem de teste para os destinatários.",
      400
    );
  }

  return {
    sentCount,
    totalCount: recipients.length,
    errors: errors.length > 0 ? errors : undefined,
  };
}

