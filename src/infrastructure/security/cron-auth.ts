import { timingSafeEqual, createHmac } from "node:crypto";

export interface CronAuthResult {
  authorized: boolean;
  error?: string;
  status?: number;
}

function verifyToken(token: string, secret: string): boolean {
  if (!token) return false;
  const clean = token.startsWith("Bearer ") ? token.slice(7).trim() : token.trim();
  if (!clean) return false;
  const expectedHash = createHmac("sha256", secret).update(secret).digest();
  const receivedHash = createHmac("sha256", secret).update(clean).digest();
  return timingSafeEqual(expectedHash, receivedHash);
}

/**
 * Validação rigorosa e timing-safe para rotas de Cron Jobs / Webhooks agendados.
 * Suporta:
 * 1. Cabeçalho Authorization: Bearer <CRON_SECRET> (ou token direto)
 * 2. Cabeçalho x-cron-secret: <CRON_SECRET>
 * 3. Parâmetro de busca na URL: ?secret=, ?cron_secret=, ?CRON_SECRET=, ?key= ou ?token=
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

  let url: URL;
  try {
    url = new URL(request.url, "http://localhost");
  } catch {
    return {
      authorized: false,
      error: "URL da requisição inválida.",
      status: 400,
    };
  }

  const querySecret = (
    url.searchParams.get("secret") ??
    url.searchParams.get("cron_secret") ??
    url.searchParams.get("CRON_SECRET") ??
    url.searchParams.get("key") ??
    url.searchParams.get("token") ??
    ""
  ).trim();

  const authHeader = (request.headers.get("authorization") ?? "").trim();
  const customHeader = (request.headers.get("x-cron-secret") ?? "").trim();

  if (!authHeader && !customHeader && !querySecret) {
    return {
      authorized: false,
      error: "Credencial de autenticação ausente. Forneça o token via cabeçalho Authorization (Bearer), x-cron-secret ou parâmetro secret na URL.",
      status: 401,
    };
  }

  // Verifica de forma timing-safe se qualquer uma das credenciais fornecidas é válida
  if (
    verifyToken(authHeader, configured) ||
    verifyToken(customHeader, configured) ||
    verifyToken(querySecret, configured)
  ) {
    return { authorized: true };
  }

  return {
    authorized: false,
    error: "Acesso não autorizado ao job operacional.",
    status: 401,
  };
}
