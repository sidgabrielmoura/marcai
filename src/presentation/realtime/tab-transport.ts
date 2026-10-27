import { CHANGE_KINDS, type ResourceChange } from './resource-events';
/** Shares only invalidation hints. Credentials, DTOs and notification contents
 * never cross the BroadcastChannel. Context is a server-generated identity hash. */
export function shareTabTransport(contextKey: string, start: () => () => void, receive: (hint: ResourceChange) => void) {
    if (typeof BroadcastChannel === 'undefined' || typeof navigator === 'undefined' || !navigator.locks) {
        const stop = start();
        return { publish: (_hint: ResourceChange) => { }, close: stop };
    }
    const channel = new BroadcastChannel(`tarefai:realtime:v2:${contextKey}`);
    const abort = new AbortController();
    let closed = false, leader = false;
    let release: (() => void) | undefined;
    channel.onmessage = event => {
        const value = event.data;
        if (closed || leader || !value || !Array.isArray(value.kinds) || !value.kinds.length ||
            !value.kinds.every((k: unknown) => CHANGE_KINDS.includes(k as typeof CHANGE_KINDS[number])))
            return;
        receive({ kinds: value.kinds, changeId: typeof value.changeId === 'string' ? value.changeId.slice(0, 160) : undefined });
    };
    void navigator.locks.request(`tarefai:realtime:v2:${contextKey}`, { signal: abort.signal }, async () => {
        if (closed)
            return;
        leader = true;
        const stop = start();
        try {
            await new Promise<void>(resolve => { release = resolve; if (closed)
                resolve(); });
        }
        finally {
            stop();
            leader = false;
        }
    }).catch(() => {
        // Unsupported/rejected lock APIs keep the per-tab transport functional.
        if (!closed) {
            const stop = start();
            release = stop;
        }
    });
    return {
        publish(hint: ResourceChange) {
            if (!leader || closed)
                return;
            channel.postMessage({ kinds: hint.kinds.filter(k => CHANGE_KINDS.includes(k as typeof CHANGE_KINDS[number])), changeId: hint.changeId?.slice(0, 160) });
        },
        close() { closed = true; abort.abort(); release?.(); channel.close(); },
    };
}
