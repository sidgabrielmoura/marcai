"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export interface RealtimeEventHandler {
  (eventType: string, data: any): void;
}

/**
 * Hook para escutar eventos em tempo real via SSE (Item 36).
 * Automaticamente atualiza as rotas quando tarefas/execuções forem alteradas por outros usuários.
 */
export function useRealtimeEvents(onEvent?: RealtimeEventHandler) {
  const router = useRouter();
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    let source: EventSource | null = null;
    let retryTimeout: NodeJS.Timeout | null = null;

    function connect() {
      try {
        source = new EventSource("/api/events");

        source.onmessage = (e) => {
          try {
            const parsed = JSON.parse(e.data);
            if (handlerRef.current) {
              handlerRef.current(parsed.type, parsed.payload);
            }
            // Atualiza dados no App Router sem perda de estado local
            router.refresh();
          } catch {
            // keepalive ou texto plano
          }
        };

        source.onerror = () => {
          if (source) {
            source.close();
            source = null;
          }
          // Reconexão exponencial simples
          retryTimeout = setTimeout(connect, 5000);
        };
      } catch {
        // Fallback silencioso
      }
    }

    connect();

    return () => {
      if (source) source.close();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [router]);
}
