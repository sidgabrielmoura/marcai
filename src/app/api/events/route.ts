import { getAuthenticatedContext } from "@/application/security/auth-context";
import { eventStream } from "@/application/mobile/event-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(false);
  if (!context) return new Response(null, { status: 401 });
  return eventStream({ request, initialContext: context, authenticate: () => getAuthenticatedContext(false) });
}
