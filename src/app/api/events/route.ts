import { NextRequest } from "next/server";
import { getSession } from "@/infrastructure/security/session";
import { eventBus, DomainEvent } from "@/infrastructure/events/event-bus";

export const dynamic = "force-dynamic";

/**
 * Endpoint de Server-Sent Events (SSE) para entrega de eventos em tempo real aos clientes (Item 36).
 * Valida a sessão e o tenant ativo para isolamento total.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.activeOrgId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const orgId = session.activeOrgId;
  const encoder = new TextEncoder();

  let unsubscribe: (() => void) | null = null;
  let keepAliveTimer: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Envia evento inicial de conexão estabelecida
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`)
      );

      // Assina eventos do eventBus no canal da organização
      unsubscribe = eventBus.subscribe(orgId, (event: DomainEvent) => {
        try {
          const message = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(message));
        } catch {
          // Stream fechada pelo cliente
        }
      });

      // Keep-alive a cada 15 segundos para evitar timeouts de proxies
      keepAliveTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          if (keepAliveTimer) clearInterval(keepAliveTimer);
        }
      }, 15000);
    },
    cancel() {
      if (unsubscribe) unsubscribe();
      if (keepAliveTimer) clearInterval(keepAliveTimer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
