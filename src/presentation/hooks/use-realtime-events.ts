"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Ably from "ably";

export interface RealtimeEventHandler {
  (eventType: string, data: any): void;
}

const DOMAIN_EVENT_TYPES = [
  "SYNC_REQUIRED",
  "TASK_STARTED",
  "TASK_COMPLETED",
  "TASK_SUBMITTED",
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
  const [refreshing, startTransition] = useTransition();
  const refreshingRef = useRef(refreshing);
  refreshingRef.current = refreshing;
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let isDisposed = false;
    let ablyClient: Ably.Realtime | null = null;
    let sseSource: EventSource | null = null;
    let sseRetryTimeout: ReturnType<typeof setTimeout> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let dirty = false;
    let cursor: string | null = null;
    let scopeVersion: string | null = null;
    let sseFailures = 0;
    let unauthorized = false;
    const seen = new Set<string>();

    function flushRefresh() {
      refreshTimer = null;
      if (isDisposed || document.hidden || !dirty) return;
      if (refreshingRef.current) { refreshTimer = setTimeout(flushRefresh, 250); return; }
      dirty = false;
      startTransition(() => router.refresh());
    }

    function queueRefresh() {
      dirty = true;
      if (!document.hidden && !refreshTimer) refreshTimer = setTimeout(flushRefresh, 350);
    }

    function checkpoint(payload: any) {
      if (typeof payload?.cursor === "string") cursor = payload.cursor;
      if (typeof payload?.scopeVersion === "string") scopeVersion = payload.scopeVersion;
    }

    function closeSSE() {
      sseSource?.close();
      sseSource = null;
      if (sseRetryTimeout) clearTimeout(sseRetryTimeout);
      sseRetryTimeout = null;
    }

    function handleEvent(eventType: string, payload: any) {
      if (isDisposed || document.hidden) return;
      checkpoint(payload);
      if (handlerRef.current) {
        handlerRef.current(eventType, payload);
      }
      queueRefresh();
    }

    // 1. Tenta inicializar conexão em tempo real via Ably
    function initAbly() {
      if (isDisposed || document.hidden || unauthorized || ablyClient) return;
      try {
        const client = new Ably.Realtime({
          authCallback: (_, callback) => {
            void fetch("/api/ably/token", { cache: "no-store" }).then(async response => {
              if (!response.ok) {
                if (response.status === 401 || response.status === 403) { unauthorized = true; closeSSE(); queueRefresh(); }
                throw new Error("Não foi possível autorizar o tempo real.");
              }
              const token: Ably.TokenRequest = await response.json();
              capability = JSON.parse(token.capability || "{}");
              callback(null, token);
            }).catch(() => callback("Não foi possível autorizar o tempo real.", null));
          },
          autoConnect: true,
        });
        ablyClient = client;
        const subscribed = new Set<string>();
        let capability: Record<string, string[]> = {};

        client.connection.on("connected", () => {
          if (isDisposed || document.hidden || ablyClient !== client) return;
          closeSSE();
          sseFailures = 0;

          const clientId = client.auth.clientId;
          if (clientId) {
            const organizationChannels = Object.keys(capability).filter(name => name.startsWith("org:") && name.endsWith(":notifications"));
            const organizationIds = new Set(organizationChannels.map(name => name.slice(4, -14)));
            for (const name of [`user:${clientId}:notifications`, ...organizationChannels]) {
              if (subscribed.has(name)) continue;
              subscribed.add(name);
              void client.channels.get(name).subscribe(message => {
                const payload = message.data;
                if (payload?.organizationId && !organizationIds.has(payload.organizationId)) return;
                const key = payload?.notificationId || message.id;
                if (key && seen.has(key)) return;
                if (key) { seen.add(key); if (seen.size > 500) seen.delete(seen.values().next().value!); }
                handleEvent(message.name === "notification:new" ? "NOTIFICATION_CREATED" : message.name || "SYNC_REQUIRED", payload);
              }).catch(() => {
                subscribed.delete(name);
                if (ablyClient === client && !isDisposed) connectSSE();
              });
            }
          }
        });

        const fallback = () => {
          if (ablyClient !== client || isDisposed || document.hidden) return;
          if (client.connection.errorReason?.statusCode === 401 || client.connection.errorReason?.statusCode === 403) {
            unauthorized = true; closeSSE(); queueRefresh(); return;
          }
          connectSSE();
        };
        client.connection.on("failed", fallback);
        client.connection.on("suspended", fallback);
      } catch {
        if (!isDisposed && !sseSource) {
          connectSSE();
        }
      }
    }

    // 2. Conexão SSE de fallback
    function connectSSE() {
      if (isDisposed || document.hidden || unauthorized || sseSource || sseFailures >= 6) return;
      try {
        const params = new URLSearchParams();
        if (cursor) params.set("cursor", cursor);
        if (scopeVersion) params.set("scopeVersion", scopeVersion);
        sseSource = new EventSource(`/api/events?${params}`);
        sseSource.onopen = () => { sseFailures = 0; };
        sseSource.addEventListener("checkpoint", ((e: MessageEvent) => {
          try { checkpoint(JSON.parse(e.data)); } catch { /* Invalid checkpoint. */ }
        }) as EventListener);
        sseSource.addEventListener("revoked", () => {
          unauthorized = true;
          closeSSE();
          queueRefresh();
        });

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
          if (!isDisposed && !document.hidden && !unauthorized) {
            sseFailures++;
            sseRetryTimeout = setTimeout(() => { sseRetryTimeout = null; connectSSE(); }, Math.min(30_000, 2_000 * 2 ** Math.min(sseFailures, 4)));
          }
        };
      } catch {
        // Fallback silencioso
      }
    }

    function visibilityChanged() {
      if (document.hidden) {
        closeSSE();
        const client = ablyClient;
        ablyClient = null;
        client?.close();
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = null;
      } else {
        sseFailures = 0;
        queueRefresh();
        initAbly();
      }
    }

    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("online", visibilityChanged);
    initAbly();

    return () => {
      isDisposed = true;
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("online", visibilityChanged);
      if (refreshTimer) clearTimeout(refreshTimer);
      if (ablyClient) {
        try {
          ablyClient.close();
        } catch {
          // ignore
        }
        ablyClient = null;
      }
      closeSSE();
    };
  }, [router, enabled, startTransition]);
}
