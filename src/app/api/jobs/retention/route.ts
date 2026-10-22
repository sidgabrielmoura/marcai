import { validateCronRequest } from "@/infrastructure/security/cron-auth";
import { purgeTrashedTasks, purgeOperationalHistory } from "@/application/jobs/retention-purge";
import { runScheduledJob } from "@/application/jobs/scheduled-job";

export const maxDuration = 300;

async function handleRetentionCron(request: Request) {
  const auth = validateCronRequest(request);
  if (!auth.authorized) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  let organizationId: string | undefined;
  try {
    const url = new URL(request.url, "http://localhost");
    organizationId = url.searchParams.get("organizationId") || undefined;
  } catch {
    // URL parsing fallback
  }

  // All retention entry points share this lease: both phases can touch the
  // same evidence and archived templates, so they also run sequentially here.
  const run = await runScheduledJob("retention", 360_000, async () => {
    const trash = await purgeTrashedTasks(organizationId);
    const history = await purgeOperationalHistory(organizationId);
    return { job: "RETENTION_FULL_PURGE", trash, history, failures: [...trash.failures, ...history.failures] };
  });
  if (run.skipped) return Response.json({ success: true, ...run });
  const result = run.result;

  return Response.json(
    {
      success: result.failures.length === 0,
      job: "RETENTION_FULL_PURGE",
      timestamp: new Date().toISOString(),
      trash: result.trash,
      history: result.history,
    },
    { status: result.failures.length > 0 ? 500 : 200 }
  );
}

export const GET = handleRetentionCron;
export const POST = handleRetentionCron;
