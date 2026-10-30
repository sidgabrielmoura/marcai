import { authorizedWhatsAppInstance } from "./instances";
import { getAblyRest } from "@/infrastructure/realtime/ably";
import { whatsappChannel, WhatsAppError } from "@/domain/whatsapp/contracts";
import { whatsappRepository } from "@/infrastructure/whatsapp/repository";

export async function whatsAppRealtimeToken(id: string) {
  const { c, instance } = await authorizedWhatsAppInstance(id);
  await whatsappRepository.rate("token:" + c.organizationId + ":" + c.userId, 30);
  const client = getAblyRest();
  if (!client) throw new WhatsAppError("REALTIME_UNAVAILABLE", "Tempo real indisponível. Use a atualização manual.", 503);
  const channel = whatsappChannel(c.organizationId, instance.locationId, instance.id);
  const tokenRequest = await client.auth.createTokenRequest({ clientId: c.userId, capability: JSON.stringify({ [channel]: ["subscribe"] }), ttl: 120000 });
  return { channel, tokenRequest };
}
