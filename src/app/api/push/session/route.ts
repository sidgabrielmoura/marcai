import { getSession } from "@/infrastructure/security/session";

export async function GET() {
  const session = await getSession();
  return Response.json({ sessionId: session?.sessionId || null }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
