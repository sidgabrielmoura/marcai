"use client";
import { useEffect, useRef, useState } from 'react';
import { subscribeResourceChanges } from '@/presentation/realtime/resource-events';
/** One request per mounted resource; no timer or focus-driven polling. Initial
 * server data is already fresh. All loaders recheck authorization on the server. */
export function useLiveResource<T extends {
    contextKey: string;
}>(initial: T, load: (kinds: string[]) => Promise<T | null>, families: string[]) {
    const [data, setData] = useState(initial);
    const loader = useRef(load);
    loader.current = load;
    const kinds = useRef(families);
    kinds.current = families;
    useEffect(() => { setData(initial); }, [initial]);
    useEffect(() => {
        let active = true, dirty = false, flight = false;
        const pending = new Set<string>();
        async function reconcile() {
            if (!active || document.hidden || flight || !dirty)
                return;
            dirty = false;
            flight = true;
            const changes = [...pending];
            pending.clear();
            let succeeded = false;
            try {
                const value = await loader.current(changes);
                if (!active)
                    return;
                if (!value || value.contextKey !== initial.contextKey) {
                    window.location.reload();
                    return;
                }
                setData(value);
                succeeded = true;
            }
            catch {
                dirty = true;
                changes.forEach(k => pending.add(k));
            } // Retry on the next event, visibility change or manual refresh.
            finally {
                flight = false;
            }
            if (succeeded && dirty && active && !document.hidden)
                void reconcile();
        }
        const unsubscribe = subscribeResourceChanges(change => {
            if (!change.kinds.includes('ALL') && !change.kinds.some(k => kinds.current.includes(k)))
                return;
            change.kinds.forEach(k => pending.add(k));
            dirty = true;
            void reconcile();
            return true;
        });
        const visible = () => { if (!document.hidden && dirty)
            void reconcile(); };
        document.addEventListener('visibilitychange', visible);
        return () => { active = false; unsubscribe(); document.removeEventListener('visibilitychange', visible); };
    }, [initial]);
    return data;
}
