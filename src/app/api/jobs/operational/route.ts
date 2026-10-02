import { timingSafeEqual } from "node:crypto";
import { operationalTick } from "@/application/processes/operational-tick";

export const maxDuration = 60;

async function handleOperationalCron(request: Request) {
  const configured = process.env.CRON_SECRET;
  if (!configured || configured.length < 16) {
    return Response.json(
      { error: "Agendador não configurado. Defina a variável CRON_SECRET no ambiente com no mínimo 16 caracteres." },
      { status: 503 }
    );
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

  const expected = Buffer.from(configured);
  const received = Buffer.from(receivedToken);

  if (expected.length === 0 || expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return Response.json({ error: "Acesso não autorizado ao job operacional." }, { status: 401 });
  }

  const result = await operationalTick();
  return Response.json(
    {
      success: result.failures.length === 0,
      timestamp: new Date().toISOString(),
      ...result,
    },
    { status: result.failures.length ? 503 : 200 }
  );
}

export async function GET(request: Request) {
  return handleOperationalCron(request);
}

export async function POST(request: Request) {
  return handleOperationalCron(request);
}

