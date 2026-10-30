import { createHmac, timingSafeEqual } from "node:crypto";
import { WhatsAppError } from "@/domain/whatsapp/contracts";

export function webhookKey(session: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new WhatsAppError("NOT_CONFIGURED", "A segurança dos webhooks ainda não foi configurada.", 503);
  return createHmac("sha256", secret).update("tarefai:waha:webhook:v1:" + session).digest("hex");
}
export function verifyWebhook(session: string, body: Uint8Array, headers: Headers) {
  const signature = headers.get("x-webhook-hmac") || "";
  if (headers.get("x-webhook-hmac-algorithm") !== "sha512" || !/^[a-fA-F0-9]{128}$/.test(signature)) return false;
  const expected = createHmac("sha512", webhookKey(session)).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
export function backendOrigin() {
  const configured = process.env.BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  try {
    const url = new URL(configured || "");
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || (process.env.NODE_ENV === "production" && url.protocol !== "https:")) throw new Error();
    return url.origin;
  } catch { throw new WhatsAppError("BACKEND_URL_REQUIRED", "Configure o endereço público deste backend para receber os webhooks.", 503); }
}
