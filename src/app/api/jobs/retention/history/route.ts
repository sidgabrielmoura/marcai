import { validateCronRequest } from "@/infrastructure/security/cron-auth";
import { purgeOperationalHistory } from "@/application/jobs/retention-purge";

export const maxDuration = 120;

async function handleHistoryCron(request: Request) {
  const auth = validateCronRequest(request);
  if (!auth.authorized) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId") || undefined;

  const result = await purgeOperationalHistory(organizationId);

  return Response.json(
    {
      success: result.failures.length === 0,
      job: "RETENTION_HISTORY_PURGE",
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
