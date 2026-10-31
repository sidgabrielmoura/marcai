import { getAuthenticatedContext, getSuperadminContext, type AuthenticatedContext } from "@/application/security/auth-context";
import { realtimeAuthorization } from "@/infrastructure/realtime/sync";
import { NextResponse } from "next/server";
import { withReadRequest } from "@/infrastructure/database/request-memo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withReadRequest(() => authorize(req));
}

async function authorize(req: Request) {
  try {
    let context: AuthenticatedContext | null = null;
    try {
      context = await getAuthenticatedContext(false);
    } catch {
      context = null;
    }

    if (!context) {
      const platform = await getSuperadminContext(false);
      if (platform) context = {
        userId: platform.userId, userName: platform.userName, userEmail: platform.email,
        sessionId: platform.sessionId, role: "SUPERADMIN", organizationId: "", organizationName: "",
        organizationSlug: "", memberId: "",
      };
    }
    if (!context?.userId || (!context.organizationId && context.role !== "SUPERADMIN")) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    if (!context.sessionId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const tokenRequest = await realtimeAuthorization(context, new URL(req.url).searchParams.get("protocol"), context.sessionId);
    if (!tokenRequest) {
      return NextResponse.json(
        { error: "Serviço de tempo real não configurado." },
        { status: 503 }
      );
    }

    return NextResponse.json(tokenRequest, {
      headers: {
        "Cache-Control": "private, no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[API Ably Token] Falha ao emitir token de autenticação:", error);
    return NextResponse.json(
      { error: "Erro interno ao emitir token de tempo real" },
      { status: 500 }
    );
  }
}
