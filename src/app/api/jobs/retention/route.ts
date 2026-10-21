import { validateCronRequest } from "@/infrastructure/security/cron-auth";
import { purgeTrashedTasks, purgeOperationalHistory } from "@/application/jobs/retention-purge";

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

  const [trashResult, historyResult] = await Promise.all([
    purgeTrashedTasks(organizationId),
    purgeOperationalHistory(organizationId),
  ]);

  const allFailures = [...trashResult.failures, ...historyResult.failures];

  return Response.json(
    {
      success: allFailures.length === 0,
      job: "RETENTION_FULL_PURGE",
      timestamp: new Date().toISOString(),
      trash: trashResult,
      history: historyResult,
    },
    { status: allFailures.length > 0 ? 500 : 200 }
  );
}

export const GET = handleRetentionCron;
export const POST = handleRetentionCron;
