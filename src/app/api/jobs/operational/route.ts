import { validateCronRequest } from "@/infrastructure/security/cron-auth";
import { operationalTick } from "@/application/processes/operational-tick";
import { runScheduledJob } from "@/application/jobs/scheduled-job";
import { runSelectiveOperational } from "@/application/processes/operational-agenda";

export const maxDuration = 60;

async function handleOperationalCron(request: Request) {
  const auth = validateCronRequest(request);
  if (!auth.authorized) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  if (process.env.OPERATIONAL_JOBS_ENABLED === "0") return Response.json({ success: true, skipped: true, reason: "DISABLED" });
  const interval = Number(process.env.OPERATIONAL_JOB_MIN_INTERVAL_MS ?? "60000");
  const run = process.env.OPERATIONAL_SELECTIVE_ENABLED === "0"
    ? await runScheduledJob("operational", 90_000, () => operationalTick(), { minIntervalMs: interval })
    : await runSelectiveOperational(new Date(), interval);
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

