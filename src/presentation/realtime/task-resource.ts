import { getTaskDetailAction, type TaskDetailResult } from '@/presentation/actions/task-actions';
import { rememberAppliedResourceChange, currentResourceContext, dispatchResourceChange, subscribeResourceChanges } from './resource-events';
type Result = Awaited<ReturnType<typeof getTaskDetailAction>>;
const cache = new Map<string, {
    at: number;
    result: Result;
}>();
const flights = new Map<string, {
    version: number;
    work: Promise<Result>;
}>();
let version = 0;
const receivers = new Set<(task: TaskDetailResult) => void>();
const name = (id: string) => currentResourceContext() + ':' + id;
// A task hint invalidates closed drawers too; opening them must not reuse an old DTO.
subscribeResourceChanges(change => { if (change.kinds.some(k => ['ALL', 'TASK_CHANGED', 'EXECUTION_CHANGED'].includes(k))) {
    version++;
    cache.clear();
} });
export async function loadTaskResource(id: string, force = false): Promise<Result> {
    const context = currentResourceContext(), key = name(id), saved = cache.get(key);
    if (!force && context && saved && Date.now() - saved.at < 60000)
        return saved.result;
    const pending = flights.get(key);
    if (pending) {
        if (pending.version === version)
            return pending.work;
        await pending.work.catch(() => { });
        return loadTaskResource(id, force);
    }
    const readingVersion = version;
    const work = getTaskDetailAction(id).then(result => {
        if (readingVersion !== version)
            return cache.get(key)?.result ?? result;
        if (context && context === currentResourceContext() && result.task) {
            cache.set(key, { at: Date.now(), result });
            if (cache.size > 30)
                cache.delete(cache.keys().next().value!);
        }
        return result;
    }).finally(() => { if (flights.get(key)?.work === work)
        flights.delete(key); });
    flights.set(key, { version: readingVersion, work });
    return work;
}
export function subscribeTaskResource(id: string, receive: (task: TaskDetailResult) => void) {
    let active = true;
    const local = (task: TaskDetailResult) => { if (active && task.id === id)
        receive(task); };
    receivers.add(local);
    const unsubscribe = subscribeResourceChanges(change => {
        if (!change.kinds.some(k => ['ALL', 'TASK_CHANGED', 'EXECUTION_CHANGED'].includes(k)))
            return;
        if (change.appliedTaskId !== id && !document.hidden)
            void loadTaskResource(id, true).then(result => {
                if (!active)
                    return;
                if (result.task)
                    receive(result.task);
                else
                    window.location.reload();
            }).catch(() => { });
        return true;
    });
    return () => { active = false; receivers.delete(local); unsubscribe(); };
}
/** Own mutation receipt suppresses its later Ably echo; the DTO updates any open
 * detail immediately while lists/aggregates reconcile their own resources. */
export function applyTaskResource(result: {
    task?: TaskDetailResult;
    changeId?: string;
}) {
    if (result.changeId)
        rememberAppliedResourceChange(result.changeId);
    const task = result.task;
    if (task)
        for (const receive of receivers)
            receive(task);
    const handled = dispatchResourceChange({ kinds: ['TASK_CHANGED', 'EXECUTION_CHANGED'], changeId: result.changeId, appliedTaskId: task?.id });
    if (task)
        cache.set(name(task.id), { at: Date.now(), result: { success: true, task } });
    return handled;
}
