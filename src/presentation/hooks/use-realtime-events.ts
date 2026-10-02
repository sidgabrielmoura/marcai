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
const DOMAIN_EVENT_TYPES = [
  "TASK_STARTED",
  "TASK_COMPLETED",
  "TASK_PAUSED",
  "TASK_RESUMED",
  "TASK_CANCELLED",
  "TASK_ASSIGNED",
  "TASK_TRANSFERRED",
  "EXECUTION_AVAILABLE",
  "EXECUTION_COMPLETED",
  "EXECUTION_CANCELLED",
  "NOTIFICATION_CREATED",
  "TASK_OCCURRENCE_CREATED",
  "MEMBER_AVAILABILITY_CHANGED",
];

export function useRealtimeEvents(onEvent?: RealtimeEventHandler) {
  const router = useRouter();
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    let source: EventSource | null = null;
    let retryTimeout: NodeJS.Timeout | null = null;

    function handleEventData(rawData: string, fallbackType?: string) {
      try {
        const parsed = JSON.parse(rawData);
        const type = parsed.type || fallbackType || "UNKNOWN";
        const payload = parsed.payload !== undefined ? parsed.payload : parsed;
        if (handlerRef.current) {
          handlerRef.current(type, payload);
        }
        router.refresh();
      } catch {
        // ignore malformed or keepalive text
      }
    }

    function connect() {
      try {
        source = new EventSource("/api/events");

        source.onmessage = (e) => {
          handleEventData(e.data);
        };

        for (const type of DOMAIN_EVENT_TYPES) {
          source.addEventListener(type, ((e: MessageEvent) => {
            handleEventData(e.data, type);
          }) as EventListener);
        }

        source.onerror = () => {
          if (source) {
            source.close();
            source = null;
          }
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
