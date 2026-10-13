import { timingSafeEqual, createHmac } from "node:crypto";

export interface CronAuthResult {
  authorized: boolean;
  error?: string;
  status?: number;
}

/**
 * Validação rigorosa e timing-safe para rotas de Cron Jobs / Webhooks agendados.
 * Suporta:
 * 1. Cabeçalho Authorization: Bearer <CRON_SECRET>
 * 2. Cabeçalho x-cron-secret: <CRON_SECRET>
 * 3. Parâmetro de busca na URL: ?secret=<CRON_SECRET> ou ?key=<CRON_SECRET>
 */
export function validateCronRequest(request: Request): CronAuthResult {
  const configured = process.env.CRON_SECRET;
  if (!configured || configured.length < 16) {
    return {
      authorized: false,
      error: "Agendador não configurado. Defina a variável CRON_SECRET no ambiente com no mínimo 16 caracteres.",
      status: 503,
    };
  }

  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret") ?? url.searchParams.get("key") ?? "";
  const authHeader = request.headers.get("authorization") ?? "";
  const customHeader = request.headers.get("x-cron-secret") ?? "";

  const receivedToken = (
    authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : (customHeader || querySecret)
  ).trim();

  if (!receivedToken) {
    return {
      authorized: false,
      error: "Credencial de autenticação ausente. Forneça o token via cabeçalho Authorization (Bearer), x-cron-secret ou parâmetro secret na URL.",
      status: 401,
    };
  }

  // Comparação em tempo constante (HMAC SHA-256) para evitar side-channels de tempo e vazamento de comprimento
  const expectedHash = createHmac("sha256", configured).update(configured).digest();
  const receivedHash = createHmac("sha256", configured).update(receivedToken).digest();

  if (!timingSafeEqual(expectedHash, receivedHash) || receivedToken !== configured) {
    return {
      authorized: false,
      error: "Acesso não autorizado ao job operacional.",
      status: 401,
    };
  }

  return { authorized: true };
}
