export const CHANGE_KINDS = ["ALL", "TASK_CHANGED", "EXECUTION_CHANGED", "NOTIFICATIONS_CHANGED"] as const;
export type ChangeKind = typeof CHANGE_KINDS[number];
export type ResourceChange = {
    kinds: string[];
    changeId?: string;
    appliedTaskId?: string;
};
type Listener = (change: ResourceChange) => boolean | void;
const listeners = new Set<Listener>();
const seen = new Set<string>();
const appliedListeners = new Set<(id: string) => void>();
let context = '';
export function subscribeResourceChanges(listener: Listener) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
export function setResourceContext(next: string) {
    if (context && context !== next)
        seen.clear();
    context = next;
}
export function currentResourceContext() { return context; }
export function subscribeAppliedChanges(listener: (id: string) => void) { appliedListeners.add(listener); return () => { appliedListeners.delete(listener); }; }
export function rememberAppliedResourceChange(id: string) { acceptResourceChange(id); for (const listener of appliedListeners)
    listener(id); }
export function acceptResourceChange(id?: string) {
    if (!id)
        return true;
    if (seen.has(id))
        return false;
    seen.add(id);
    if (seen.size > 500)
        seen.delete(seen.values().next().value!);
    return true;
}
/** Returns true when the mounted main view owns reconciliation. */
export function dispatchResourceChange(change: ResourceChange) {
    let handled = false;
    for (const listener of listeners)
        handled = listener(change) === true || handled;
    return handled;
}
export function routeNeedsChange(path: string, kinds: string[]) {
    if (path.startsWith('/superadmin'))
        return false;
    if (kinds.includes('ALL'))
        return true;
    if (kinds.includes('NOTIFICATIONS_CHANGED') && path === '/notifications')
        return true;
    return kinds.some(k => k === 'TASK_CHANGED' || k === 'EXECUTION_CHANGED') &&
        /^\/(tasks|history|executions|overview|management\/(tasks|approvals|executions|processes|archived))(\/|$)/.test(path);
}
