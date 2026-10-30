import { createHash } from "node:crypto";
import { getAblyRest } from "@/infrastructure/realtime/ably";
import { whatsappChannel } from "@/domain/whatsapp/contracts";
import { whatsappRepository } from "./repository";
import { z } from "zod";

const hintSchema = z.object({ status: z.string(), revision: z.number().int() });
export async function publishWhatsAppPending(instanceId: string) {
  const client = getAblyRest();
  if (!client) return;
  for (const event of await whatsappRepository.pending(instanceId)) {
    const parsed = hintSchema.safeParse(event.data);
    if (!parsed.success) continue;
    const channel = whatsappChannel(event.instance.organizationId, event.instance.locationId, instanceId);
    const base = createHash("sha256").update(event.id).digest("hex").slice(0, 32);
    const data = { instanceId, ...parsed.data };
    try {
      await client.channels.get(channel).publish([
        { id: base + ":0", name: "session.status", data },
        ...(data.status === "SCAN_QR_CODE" ? [{ id: base + ":1", name: "qr.available", data }] : []),
      ]);
      await whatsappRepository.published(event.id);
    } catch { console.warn("[whatsapp] Realtime delivery pending", { code: "ABLY_PUBLISH_FAILED" }); break; }
  }
}
