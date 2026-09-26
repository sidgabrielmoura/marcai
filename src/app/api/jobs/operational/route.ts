import { timingSafeEqual } from "node:crypto";
import { operationalTick } from "@/application/processes/operational-tick";
export const maxDuration = 60;
export async function POST(request: Request) {
  const configured = process.env.CRON_SECRET;
  if (!configured || configured.length < 32) return Response.json({ error: "Agendador não configurado." }, { status: 503 });
  const expected = Buffer.from("Bearer " + configured), received = Buffer.from(request.headers.get("authorization") ?? "");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return new Response(null, { status: 401 });
  const result = await operationalTick();
  return Response.json(result, { status: result.failures.length ? 503 : 200 });
}
