import { createHash } from "node:crypto";
import { WhatsAppError } from "@/domain/whatsapp/contracts";

// Cheap pre-authentication protection. Authenticated limits also use PostgreSQL
// and remain effective across workers. Forwarded IPs are trusted only on Vercel.
const windows = new Map<string, { until: number; count: number }>();
export function whatsappIngress(request: Request, kind: "webhook" | "token" | "operation") {
  const ip = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() : undefined;
  const key = createHash("sha256").update(kind + ":" + (ip || "unattributed")).digest("hex");
  const now = Date.now();
  for (const [id, entry] of windows) if (entry.until < now) windows.delete(id);
  let entry = windows.get(key);
  if (!entry) {
    if (windows.size >= 2048) throw new WhatsAppError("RATE_LIMIT", "Muitas tentativas. Aguarde um minuto.", 429);
    entry = { until: now + 60000, count: 0 }; windows.set(key, entry);
  }
  entry.count++;
  if (entry.count > (ip ? kind === "webhook" ? 600 : 120 : 3000)) throw new WhatsAppError("RATE_LIMIT", "Muitas tentativas. Aguarde um minuto.", 429);
}
