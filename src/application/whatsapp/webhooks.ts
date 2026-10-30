import { z } from "zod";
import { createHash } from "node:crypto";
import { ackPayloadSchema, sessionNameSchema, statusPayloadSchema, webhookSchema, WhatsAppError } from "@/domain/whatsapp/contracts";
import { verifyWebhook } from "@/infrastructure/whatsapp/webhook-security";
import { whatsappRepository } from "@/infrastructure/whatsapp/repository";

export async function receiveWhatsAppWebhook(request: Request, rawSession: string) {
  const session = sessionNameSchema.parse(rawSession);
  if (Number(request.headers.get("content-length")) > 262144) throw new WhatsAppError("BODY_TOO_LARGE", "Requisição inválida.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new WhatsAppError("INVALID_BODY", "Requisição inválida.");
  const parts: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      length += next.value.byteLength;
      if (length > 262144) { await reader.cancel(); throw new WhatsAppError("BODY_TOO_LARGE", "Requisição inválida.", 413); }
      parts.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const body = Buffer.concat(parts);
  if (!verifyWebhook(session, body, request.headers)) throw new WhatsAppError("INVALID_SIGNATURE", "Não autorizado.", 401);
  await whatsappRepository.rate("webhook:" + session, 180);
  let json: unknown;
  try { json = JSON.parse(body.toString("utf8")); } catch { throw new WhatsAppError("INVALID_BODY", "Requisição inválida."); }
  const event = webhookSchema.parse(json);
  if (event.session !== session) throw new WhatsAppError("SESSION_MISMATCH", "Requisição inválida.");
  // Signed timestamps prevent captured requests from being replayed indefinitely.
  if (Math.abs(Date.now() - event.timestamp) > 5 * 60 * 1000) throw new WhatsAppError("EXPIRED_EVENT", "Evento expirado.");
  if (event.event === "session.status") {
    const payload = statusPayloadSchema.parse(event.payload);
    if (payload.name !== session) throw new WhatsAppError("SESSION_MISMATCH", "Requisição inválida.");
    return whatsappRepository.recordWebhook({ ...event, status: payload.status, data: { status: payload.status } });
  }
  const message = event.event === "message.ack" ? ackPayloadSchema.parse(event.payload) : z.object({ id: z.string().min(1).max(200), fromMe: z.boolean() }).parse(event.payload);
  const messageIdHash = createHash("sha256").update(message.id).digest("hex");
  return whatsappRepository.recordWebhook({ ...event, data: event.event === "message.ack" ? { messageIdHash, ack: "ack" in message ? message.ack : 0 } : { messageIdHash, fromMe: "fromMe" in message ? message.fromMe : false } });
}
