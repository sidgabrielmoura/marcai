import { z } from "zod";
import { remoteStatusSchema, WhatsAppError } from "@/domain/whatsapp/contracts";

const remoteSessionSchema = z.object({
  name: z.string().optional(), status: remoteStatusSchema,
  config: z.record(z.string(), z.unknown()).nullable().optional(),
  me: z.object({ id: z.string(), pushName: z.string().optional() }).nullable().optional(),
});
export type WahaSession = z.infer<typeof remoteSessionSchema>;
export type WahaSessionConfig = {
  metadata: Record<string, string>;
  proxy: null; debug: false;
  noweb: { store: { enabled: true; fullSync: false } };
  webhooks: Array<{ url: string; events: string[]; hmac: { key: string }; retries: { policy: "constant"; delaySeconds: number; attempts: number } }>;
};

export function wahaEnvironment() {
  const endpoint = (process.env.WAHA_BASE_URL || process.env.WAHA_API_URL || process.env.WAHA_ENDPOINT || "").trim();
  const key = (process.env.WAHA_KEY || process.env.WAHA_API_KEY || "").trim();
  if (!endpoint || !key) throw new WhatsAppError("NOT_CONFIGURED", "Servidor WhatsApp ainda não configurado.", 503);
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new WhatsAppError("NOT_CONFIGURED", "Configuração do servidor WhatsApp inválida.", 503); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new WhatsAppError("NOT_CONFIGURED", "Configuração do servidor WhatsApp inválida.", 503);
  return { endpoint: endpoint.replace(/\/+$/, ""), key };
}

async function request(path: string, method = "GET", body?: unknown, image = false, allowMissing = false) {
  const { endpoint, key } = wahaEnvironment();
  try {
    const response = await fetch(endpoint + path, {
      method, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
      headers: { "X-Api-Key": key, "Content-Type": "application/json", Accept: image ? "image/png" : "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 404 && (method === "GET" || method === "DELETE" || allowMissing)) { await response.body?.cancel(); return null; }
    if (!response.ok) {
      await response.body?.cancel();
      console.warn("[whatsapp] Provider rejected request", { method, status: response.status });
      throw new WhatsAppError(response.status === 422 ? "SESSION_CONFLICT" : "PROVIDER_REJECTED", "O servidor WhatsApp recusou a operação. Tente atualizar a conexão.", 502);
    }
    if (response.status === 204) return {};
    const reader = response.body?.getReader();
    if (!reader) return {};
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const next = await reader.read(); if (next.done) break;
        length += next.value.byteLength;
        if (length > 1024 * 1024) { await reader.cancel(); throw new Error("response-size"); }
        chunks.push(next.value);
      }
    } finally { reader.releaseLock(); }
    const bytes = Buffer.concat(chunks);
    if (image) {
      if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error("invalid-image");
      return `data:image/png;base64,${bytes.toString("base64")}`;
    }
    return bytes.length ? JSON.parse(bytes.toString("utf8")) as unknown : {};
  } catch (error) {
    if (error instanceof WhatsAppError) throw error;
    console.warn("[whatsapp] Provider transport failed", { code: "TRANSPORT_OR_RESPONSE" });
    throw new WhatsAppError("PROVIDER_UNAVAILABLE", "Não foi possível acessar o servidor WhatsApp. Tente novamente.", 502);
  }
}
const sessionPath = (name: string) => "/api/sessions/" + encodeURIComponent(name);
export const wahaClient = {
  async getSession(name: string): Promise<WahaSession | null> {
    const data = await request(sessionPath(name));
    if (!data) return null;
    const parsed = remoteSessionSchema.safeParse(data);
    if (!parsed.success) throw new WhatsAppError("INVALID_RESPONSE", "O servidor WhatsApp retornou um status inválido.", 502);
    return parsed.data;
  },
  async create(name: string, config: WahaSessionConfig) { await request("/api/sessions", "POST", { name, start: true, config }); },
  async configure(name: string, config: WahaSessionConfig) { const result = await request(sessionPath(name), "PUT", { name, config }); if (!result) throw new WhatsAppError("SESSION_MISSING", "A sessão não está mais disponível. Conecte novamente.", 409); },
  async operate(name: string, operation: "start" | "restart" | "stop" | "logout") { return request(sessionPath(name) + "/" + operation, "POST", undefined, false, operation === "logout" || operation === "stop"); },
  async remove(name: string) { await request(sessionPath(name), "DELETE"); },
  async qr(name: string) { const result = await request("/api/" + encodeURIComponent(name) + "/auth/qr?format=image", "GET", undefined, true); return typeof result === "string" ? result : null; },
  async sendText(name: string, phone: string, text: string) {
    const checked = await request("/api/contacts/check-exists?" + new URLSearchParams({ phone, session: name }));
    const contact = z.object({ chatId: z.string().regex(/^\d+@(?:c\.us|lid)$/), numberExists: z.boolean().optional() }).safeParse(checked);
    if (!contact.success || contact.data.numberExists === false) throw new WhatsAppError("RECIPIENT_UNAVAILABLE", "O destinatário não foi encontrado no WhatsApp.", 400);
    const sent = await request("/api/sendText", "POST", { session: name, chatId: contact.data.chatId, text });
    if (!sent) throw new WhatsAppError("SEND_FAILED", "O servidor WhatsApp não confirmou o envio.", 502);
    const result = z.object({ id: z.string().optional(), messageId: z.string().optional() }).safeParse(sent);
    return { messageId: result.success ? result.data.id || result.data.messageId : undefined };
  },
};
