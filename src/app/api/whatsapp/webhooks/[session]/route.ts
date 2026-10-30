import { after } from "next/server";
import { receiveWhatsAppWebhook } from "@/application/whatsapp/webhooks";
import { publishWhatsAppPending } from "@/infrastructure/whatsapp/realtime";
import { publicWhatsAppError } from "@/domain/whatsapp/contracts";
import { whatsappIngress } from "@/infrastructure/whatsapp/ingress";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request, context: { params: Promise<{ session: string }> }) {
  try {
    whatsappIngress(request, "webhook");
    const result = await receiveWhatsAppWebhook(request, (await context.params).session);
    if (result) after(() => publishWhatsAppPending(result.id));
    return new Response(null, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const failure = publicWhatsAppError(error);
    return Response.json({ error: failure.error }, { status: failure.status, headers: { "Cache-Control": "no-store", ...(failure.status === 429 ? { "Retry-After": "60" } : {}) } });
  }
}
