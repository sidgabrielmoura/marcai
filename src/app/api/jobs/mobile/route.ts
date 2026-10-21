import { validateCronRequest } from "@/infrastructure/security/cron-auth";

export const runtime = "nodejs";

async function run(req: Request) {
  const auth = validateCronRequest(req);
  if (!auth.authorized) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  return Response.json({
    status: "DEPRECATED",
    message: "O disparo de notificações foi migrado para tempo real via Ably. Esta rota de cron foi desativada e não é mais necessária.",
    timestamp: new Date().toISOString(),
  });
}

export const GET = run;
export const POST = run;
