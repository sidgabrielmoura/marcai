"use client";

import { useEffect, useRef, useState } from "react";
import { Realtime, type TokenRequest } from "ably";

export interface WhatsAppStatusHint { instanceId: string; status: string; revision: number }
type Callbacks = {
  onReady: (resumed: boolean) => Promise<void>;
  onStatus: (hint: WhatsAppStatusHint) => void;
  onUnavailable: () => void;
  onAvailable: () => void;
};
const statuses = new Set(["PENDING", "STARTING", "STOPPED", "SCAN_QR_CODE", "WORKING", "FAILED"]);

/** Private, modal-scoped connection. Never shares QR images or credentials between tabs. */
export function useWhatsAppRealtime(instanceId: string | null, callbacks: Callbacks) {
  const current = useRef(callbacks);
  const previous = useRef<string | null>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => { current.current = callbacks; });
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== "hidden");
    update(); document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (!instanceId) { previous.current = null; return; }
    if (!visible) return;
    const resumed = previous.current === instanceId;
    previous.current = instanceId;
    const abort = new AbortController();
    let closed = false, client: Realtime | undefined;
    let initialized = false;
    let initialWork: Promise<void> | undefined;
    let recovering: Promise<void> | undefined;
    const handshakeTimeout = setTimeout(() => { if (!closed && !initialized) { current.current.onUnavailable(); void ready(); } }, 5000);
    async function ready() { if (!closed && !initialized) { initialized = true; clearTimeout(handshakeTimeout); initialWork = current.current.onReady(resumed); await initialWork; } }
    function reconcile() {
      if (closed) return Promise.resolve();
      if (!recovering) recovering = (async () => { await initialWork; if (!closed) await current.current.onReady(true); })().finally(() => { recovering = undefined; });
      return recovering;
    }
    async function token() {
      const response = await fetch("/api/whatsapp/instances/" + encodeURIComponent(instanceId!) + "/token", { credentials: "same-origin", cache: "no-store", signal: abort.signal });
      if (!response.ok) throw new Error("authorization-unavailable");
      const result = await response.json() as { data?: { channel?: string; tokenRequest?: TokenRequest } };
      if (!result.data?.channel || !result.data.tokenRequest) throw new Error("invalid-authorization");
      return result.data;
    }
    void (async () => {
      try {
        const initial = await token();
        if (closed) return;
        let first = true;
        client = new Realtime({
          autoConnect: false, echoMessages: false, logLevel: 0,
          authCallback: (_params, callback) => {
            if (first) { first = false; callback(null, initial.tokenRequest!); return; }
            void token().then(value => {
              if (closed || value.channel !== initial.channel) { callback("Contexto de acesso alterado", null); client?.close(); return; }
              callback(null, value.tokenRequest!);
            }).catch(() => { callback("Não autorizado", null); client?.close(); if (!closed) current.current.onUnavailable(); });
          },
        });
        client.connection.on("failed", () => { if (!closed) { current.current.onUnavailable(); void ready(); } });
        const channel = client.channels.get(initial.channel!);
        channel.on("attached", change => { if (!closed && initialized && !change.resumed) void reconcile(); });
        const subscribed = channel.subscribe("session.status", message => {
          const hint = message.data as Partial<WhatsAppStatusHint> | null;
          if (!closed && hint?.instanceId === instanceId && typeof hint.status === "string" && statuses.has(hint.status) && typeof hint.revision === "number" && Number.isSafeInteger(hint.revision)) current.current.onStatus(hint as WhatsAppStatusHint);
        });
        // Initial handshake is completed before connecting WAHA, avoiding lost status events.
        client.connect();
        await subscribed;
        await channel.attach();
        if (!closed) {
          current.current.onAvailable();
          if (initialized) await reconcile(); else await ready();
        }
      } catch {
        if (!closed) { current.current.onUnavailable(); await ready(); }
      }
    })();
    return () => { closed = true; clearTimeout(handshakeTimeout); abort.abort(); client?.close(); };
  }, [instanceId, visible]);
  return visible;
}
