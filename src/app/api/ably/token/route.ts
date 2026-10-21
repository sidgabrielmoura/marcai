import { getAuthenticatedContext } from "@/application/security/auth-context";
import { getAblyRest } from "@/infrastructure/realtime/ably";
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

    const client = getAblyRest();
    if (!client) {
      return NextResponse.json(
        { error: "Serviço de tempo real não configurado." },
        { status: 503 }
      );
    }

    // Regra de Menor Privilégio e Isolamento de Tenants:
    // O usuário só pode se inscrever (subscribe) em seu canal individual e no canal de sua organização ativa
    const userChannel = `user:${context.userId}:notifications`;
    const orgChannel = `org:${context.organizationId}:notifications`;

    const capability: Record<string, string[]> = {
      [userChannel]: ["subscribe"],
      [orgChannel]: ["subscribe"],
    };

    const tokenRequest = await client.auth.createTokenRequest({
      clientId: context.userId,
      capability: JSON.stringify(capability),
      ttl: 60 * 60 * 1000, // 1 hora de validade
    });

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
