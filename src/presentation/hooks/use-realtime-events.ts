"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import * as Ably from "ably";

export interface RealtimeEventHandler {
  (eventType: string, data: any): void;
}

const DOMAIN_EVENT_TYPES = [
  "SYNC_REQUIRED",
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

/**
 * Hook para escutar eventos em tempo real com Ably (e fallback via SSE).
 * Atualiza automaticamente as rotas e exibe notificações instantaneamente.
 */
export function useRealtimeEvents(onEvent?: RealtimeEventHandler, enabled = true) {
  const router = useRouter();
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let isDisposed = false;
    let ablyClient: Ably.Realtime | null = null;
    let sseSource: EventSource | null = null;
    let sseRetryTimeout: NodeJS.Timeout | null = null;

    function handleEvent(eventType: string, payload: any) {
      if (isDisposed) return;
      if (handlerRef.current) {
        handlerRef.current(eventType, payload);
      }
      router.refresh();
    }

    // 1. Tenta inicializar conexão em tempo real via Ably
    function initAbly() {
      try {
        ablyClient = new Ably.Realtime({
          authUrl: "/api/ably/token",
          authMethod: "GET",
          autoConnect: true,
        });

        ablyClient.connection.on("connected", () => {
          if (isDisposed || !ablyClient) return;

          const clientId = ablyClient.auth.clientId;
          if (clientId) {
            const userChannel = ablyClient.channels.get(`user:${clientId}:notifications`);
            userChannel.subscribe("notification:new", (message) => {
              handleEvent("NOTIFICATION_CREATED", message.data);
            });
          }
        });

        ablyClient.connection.on("failed", () => {
          if (!isDisposed && !sseSource) {
            connectSSE();
          }
        });
      } catch {
        if (!isDisposed && !sseSource) {
          connectSSE();
        }
      }
    }

    // 2. Conexão SSE de fallback
    function connectSSE() {
      if (isDisposed) return;
      try {
        sseSource = new EventSource("/api/events");

        sseSource.onmessage = (e) => {
          try {
            const parsed = JSON.parse(e.data);
            handleEvent(
              parsed.type || "UNKNOWN",
              parsed.payload !== undefined ? parsed.payload : parsed
            );
          } catch {
            // ignore malformed
          }
        };

        for (const type of DOMAIN_EVENT_TYPES) {
          sseSource.addEventListener(type, ((e: MessageEvent) => {
            try {
              const parsed = JSON.parse(e.data);
              handleEvent(
                type,
                parsed.payload !== undefined ? parsed.payload : parsed
              );
            } catch {
              // ignore
            }
          }) as EventListener);
        }

        sseSource.onerror = () => {
          if (sseSource) {
            sseSource.close();
            sseSource = null;
          }
          if (!isDisposed) {
            sseRetryTimeout = setTimeout(connectSSE, 5000);
          }
        };
      } catch {
        // Fallback silencioso
      }
    }

    initAbly();

    return () => {
      isDisposed = true;
      if (ablyClient) {
        try {
          ablyClient.close();
        } catch {
          // ignore
        }
        ablyClient = null;
      }
      if (sseSource) {
        sseSource.close();
        sseSource = null;
      }
      if (sseRetryTimeout) {
        clearTimeout(sseRetryTimeout);
      }
    };
  }, [router, enabled]);
}
