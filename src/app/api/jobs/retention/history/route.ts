import { validateCronRequest } from "@/infrastructure/security/cron-auth";
import { purgeOperationalHistory } from "@/application/jobs/retention-purge";
import { runScheduledJob } from "@/application/jobs/scheduled-job";

export const maxDuration = 120;

async function handleHistoryCron(request: Request) {
  const auth = validateCronRequest(request);
  if (!auth.authorized) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url, "http://localhost");
  const organizationId = url.searchParams.get("organizationId") || undefined;

  const run = await runScheduledJob("retention", 360_000, async () => ({ ...await purgeOperationalHistory(organizationId), job: "RETENTION_HISTORY_PURGE" }));
  if (run.skipped) return Response.json({ success: true, ...run });
  const result = run.result;

  return Response.json(
    {
      success: result.failures.length === 0,
      timestamp: new Date().toISOString(),
      ...result,
    },
    { status: result.failures.length > 0 ? 500 : 200 }
  );
}

export async function GET(request: Request) {
  return handleHistoryCron(request);
}

export async function POST(request: Request) {
  return handleHistoryCron(request);
}
