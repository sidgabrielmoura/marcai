import { validateCronRequest } from "@/infrastructure/security/cron-auth";
import { purgeTrashedTasks } from "@/application/jobs/retention-purge";

export const maxDuration = 120;

async function handleTrashCron(request: Request) {
  const auth = validateCronRequest(request);
  if (!auth.authorized) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url, "http://localhost");
  const organizationId = url.searchParams.get("organizationId") || undefined;

  const result = await purgeTrashedTasks(organizationId);

  return Response.json(
    {
      success: result.failures.length === 0,
      job: "RETENTION_TRASH_PURGE",
      timestamp: new Date().toISOString(),
      ...result,
    },
    { status: result.failures.length > 0 ? 500 : 200 }
  );
}

export async function GET(request: Request) {
  return handleTrashCron(request);
}

export async function POST(request: Request) {
  return handleTrashCron(request);
}
