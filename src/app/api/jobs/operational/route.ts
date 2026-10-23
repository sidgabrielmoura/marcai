import { validateCronRequest } from "@/infrastructure/security/cron-auth";
import { operationalTick } from "@/application/processes/operational-tick";
import { runScheduledJob } from "@/application/jobs/scheduled-job";

export const maxDuration = 60;

async function handleOperationalCron(request: Request) {
  const auth = validateCronRequest(request);
  if (!auth.authorized) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  if (process.env.OPERATIONAL_JOBS_ENABLED === "0") return Response.json({ success: true, skipped: true, reason: "DISABLED" });
  const interval = Number(process.env.OPERATIONAL_JOB_MIN_INTERVAL_MS ?? "60000");
  const run = await runScheduledJob("operational", 90_000, () => operationalTick(), { minIntervalMs: interval });
  if (run.skipped) return Response.json({ success: true, ...run });
  const result = run.result;
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

