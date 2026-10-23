import type { AuthenticatedContext } from "@/application/security/auth-context";
import { replay } from "./notifications";

export function waitForSync(signal: AbortSignal, milliseconds: number) {
  return new Promise<void>(resolve => {
    if (signal.aborted) return resolve();
    const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, milliseconds);
    signal.addEventListener("abort", done, { once: true });
  });
}

export function eventStream(options: {
  request: Request;
  initialContext: AuthenticatedContext;
  authenticate: () => Promise<AuthenticatedContext | null>;
  mobile?: boolean;
}) {
  const { request, initialContext, authenticate, mobile = false } = options;
  const url = new URL(request.url);
  let cursor = url.searchParams.get("cursor");
  let scopeVersion = url.searchParams.get("scopeVersion");
  const abort = new AbortController();
  const onAbort = () => abort.abort();
  request.signal.addEventListener("abort", onAbort, { once: true });
  if (request.signal.aborted) abort.abort();
  const encoder = new TextEncoder();
  let closed = false;
  return new Response(new ReadableStream({
    async start(out) {
      const started = Date.now();
      let first = true;
      let idleCycles = 0;
      const send = (name: string, payload: unknown) => out.enqueue(encoder.encode(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`));
      try {
        while (!abort.signal.aborted && Date.now() - started < 25_000) {
          // Fresh authorization on every poll. No cross-request cache or stale scope.
          const context = first ? initialContext : await authenticate();
          first = false;
          if (!context || context.userId !== initialContext.userId || context.memberId !== initialContext.memberId || context.organizationId !== initialContext.organizationId) {
            send("revoked", {});
            break;
          }
          const result = await replay(context, cursor);
          if (abort.signal.aborted) break;
          cursor = result.nextCursor;
          const changed = result.events.length > 0 || result.requiresSnapshot || scopeVersion !== result.scopeVersion;
          scopeVersion = result.scopeVersion;
          if (changed) {
            send(mobile ? "sync" : "SYNC_REQUIRED", mobile ? result : { type: "SYNC_REQUIRED", payload: { cursor, scopeVersion, requiresSnapshot: result.requiresSnapshot } });
            idleCycles = 0;
          } else {
            // Keep the legacy native reader compatible: older app versions
            // parsed every data frame as a replay response, including checkpoints.
            send("checkpoint", mobile ? result : { cursor, scopeVersion });
            idleCycles++;
          }
          const delay = idleCycles === 0 ? 2_000 : idleCycles === 1 ? 5_000 : 10_000;
          await waitForSync(abort.signal, Math.min(delay, Math.max(0, 25_000 - (Date.now() - started))));
        }
      } catch (error) {
        if (!abort.signal.aborted && !closed) {
          const status = (error as { status?: number })?.status;
          try { send(status === 401 || status === 403 ? "revoked" : "retry", {}); } catch { /* Client disconnected. */ }
        }
      } finally {
        request.signal.removeEventListener("abort", onAbort);
        if (!closed) { closed = true; try { out.close(); } catch { /* Already cancelled. */ } }
      }
    },
    cancel() { closed = true; abort.abort(); request.signal.removeEventListener("abort", onAbort); },
  }), { headers: { "Content-Type": "text/event-stream", "Cache-Control": "private, no-store, no-transform", "X-Accel-Buffering": "no" } });
}
