import { whatsAppRealtimeToken } from "@/application/whatsapp/authorization";
import { publicWhatsAppError } from "@/domain/whatsapp/contracts";
import { whatsappIngress } from "@/infrastructure/whatsapp/ingress";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { whatsappIngress(request, "token"); return Response.json({ data: await whatsAppRealtimeToken((await context.params).id) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) {
    const failure = publicWhatsAppError(error);
    return Response.json({ error: failure.error }, { status: failure.status, headers: { "Cache-Control": "no-store", ...(failure.status === 429 ? { "Retry-After": "60" } : {}) } });
  }
}
