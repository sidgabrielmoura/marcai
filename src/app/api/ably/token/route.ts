import { getAuthenticatedContext } from "@/application/security/auth-context";
import { realtimeAuthorization } from "@/infrastructure/realtime/sync";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    let context = null;
    try {
      context = await getAuthenticatedContext(false);
    } catch {
      context = null;
    }

    if (!context?.userId || !context.organizationId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const tokenRequest = await realtimeAuthorization(context, new URL(req.url).searchParams.get("protocol"));
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
