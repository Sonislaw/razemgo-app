// Share requests and optionally retain completed responses for this app session.
// The caller clears account-scoped state on logout; nothing is written to disk.
export function createActivePlaceRequests<T>(fetcher: (id: string, signal: AbortSignal) => Promise<T>, {retainedLimit = 0}: {retainedLimit?: number} = {}) {
  if (!Number.isInteger(retainedLimit) || retainedLimit < 0) throw Error('Invalid place cache limit');
  type Entry = {controller: AbortController; users: number; listeners: Set<(value: T) => void>; promise: Promise<T>; value?: T};
  const entries = new Map<string, Entry>();
  const cancelled = () => Object.assign(Error('Request cancelled'), {name: 'AbortError'});
  function discard(id: string, entry: Entry) {
    entries.delete(id); entry.controller.abort(); entry.listeners.clear();
  }
  function trim() {
    const unused = [...entries].filter(([, entry]) => !entry.users && entry.value !== undefined);
    // Map order records accesses, so the oldest unused responses leave first.
    for (let index = 0; index < unused.length - retainedLimit; index++) discard(...unused[index]);
  }
  function acquire(id: string) {
    let entry = entries.get(id);
    if (!entry) {
      const controller = new AbortController();
      entry = {controller, users: 0, listeners: new Set(), promise: undefined!};
      const pending = entry;
      entries.set(id, pending);
      pending.promise = Promise.resolve().then(() => {
        if (controller.signal.aborted) throw cancelled();
        return fetcher(id, controller.signal);
      }).then(value => {
        if (controller.signal.aborted) throw cancelled();
        pending.value = value;
        for (const listener of pending.listeners) listener(value);
        return value;
      });
      // A subscribed view can disappear or ignore a failed display-name lookup.
      void pending.promise.catch(() => undefined);
    }
    entry.users++;
    entries.delete(id); entries.set(id, entry);
    const active = entry;
    let released = false;
    return {entry: active, release() {
      if (released) return; released = true; active.users--;
      // Synchronous unmount/remount (including Strict Mode) shares one request.
      queueMicrotask(() => {
        if (!active.users && entries.get(id) === active) {
          // Do not keep abandoned requests or failed responses in session cache.
          if (active.value === undefined || !retainedLimit) discard(id, active);
          else trim();
        }
      });
    }};
  }
  return {
    has: (id: string) => entries.has(id),
    retain(id: string, value: T) {
      if (!retainedLimit) return;
      const existing = entries.get(id);
      // A selection completes its own Google session. Do not cancel another
      // consumer's already-running lookup if they happen to overlap.
      if (existing && existing.value === undefined) return;
      const entry: Entry = existing ?? {controller: new AbortController(), users: 0, listeners: new Set(), promise: Promise.resolve(value)};
      entry.value = value; entry.promise = Promise.resolve(value);
      entries.delete(id); entries.set(id, entry);
      for (const listener of entry.listeners) listener(value);
      trim();
    },
    subscribe(id: string, listener: (value: T) => void) {
      const lease = acquire(id);
      lease.entry.listeners.add(listener);
      if (lease.entry.value !== undefined) listener(lease.entry.value);
      return () => {lease.entry.listeners.delete(listener); lease.release();};
    },
    async read(id: string, signal?: AbortSignal): Promise<T> {
      if (signal?.aborted) throw cancelled();
      const lease = acquire(id);
      return new Promise<T>((resolve, reject) => {
        const abort = () => {lease.release(); reject(cancelled());};
        signal?.addEventListener('abort', abort, {once: true});
        void lease.entry.promise.then(resolve, reject).finally(() => {
          signal?.removeEventListener('abort', abort); lease.release();
        });
      });
    },
    clear() {
      for (const entry of entries.values()) {entry.controller.abort(); entry.listeners.clear();}
      entries.clear();
    },
  };
}
