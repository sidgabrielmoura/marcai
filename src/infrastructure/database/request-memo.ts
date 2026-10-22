import { AsyncLocalStorage } from "node:async_hooks";

const reads = new AsyncLocalStorage<Map<string, Promise<unknown>>>();

// Opt in only around a read operation. Never wrap mutations or a stream's lifetime.
export function withReadRequest<T>(work: () => Promise<T>): Promise<T> {
  return reads.run(new Map(), work);
}

export function requestRead<T>(key: string, load: () => Promise<T>): Promise<T> {
  const store = reads.getStore();
  if (!store) return load();
  let promise = store.get(key) as Promise<T> | undefined;
  if (!promise) { promise = load(); store.set(key, promise); }
  return promise;
}
