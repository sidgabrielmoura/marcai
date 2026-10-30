import { after } from "next/server";
import { authorizedWhatsAppInstance, manageWhatsAppInstance } from "@/application/whatsapp/instances";
import { operationSchema, publicWhatsAppError, WhatsAppError } from "@/domain/whatsapp/contracts";
import { publishWhatsAppPending } from "@/infrastructure/whatsapp/realtime";
import { backendOrigin } from "@/infrastructure/whatsapp/webhook-security";
import { whatsappIngress } from "@/infrastructure/whatsapp/ingress";
import { whatsappRepository } from "@/infrastructure/whatsapp/repository";

export const runtime = "nodejs";
export const maxDuration = 60;
async function operate(id: string, operation: string) {
  try {
    const data = await manageWhatsAppInstance(id, operation);
    if (!data.deleted) after(() => publishWhatsAppPending(id));
    return Response.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
function failure(error: unknown) {
  const result = publicWhatsAppError(error);
  return Response.json({ error: result.error }, { status: result.status, headers: { "Cache-Control": "no-store", ...(result.status === 429 ? { "Retry-After": "60" } : {}) } });
}
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== backendOrigin()) throw new WhatsAppError("INVALID_ORIGIN", "Requisição não autorizada.", 403);
}
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    whatsappIngress(request, "operation");
    const { c, instance } = await authorizedWhatsAppInstance((await context.params).id);
    await whatsappRepository.rate("snapshot:" + c.organizationId + ":" + c.userId, 60);
    return Response.json({ data: { id: instance.id, status: instance.status, revision: instance.revision, connectedPhone: instance.connectedPhone, connectedName: instance.connectedName } }, { headers: { "Cache-Control": "private, no-store" } });
  }
  catch (error) { return failure(error); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    whatsappIngress(request, "operation");
    sameOrigin(request);
    if (Number(request.headers.get("content-length")) > 1024) throw new WhatsAppError("INVALID_BODY", "Requisição inválida.");
    const body = await request.text();
    if (body.length > 1024) throw new WhatsAppError("INVALID_BODY", "Requisição inválida.");
    let input: unknown; try { input = JSON.parse(body); } catch { throw new WhatsAppError("INVALID_BODY", "Requisição inválida."); }
    const operation = operationSchema.parse(typeof input === "object" && input !== null && "operation" in input ? input.operation : null);
    return operate((await context.params).id, operation);
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try { whatsappIngress(request, "operation"); sameOrigin(request); return operate((await context.params).id, "delete"); }
  catch (error) { return failure(error); }
}
