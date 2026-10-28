export interface SnapshotStore<T> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
  publish(value: T): void;
}
export function createSnapshotStore<T>(initial: T): SnapshotStore<T> {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publish(next) {
      if (Object.is(snapshot, next)) return;
      snapshot = next;
      listeners.forEach((listener) => listener());
    },
  };
}
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const first = Object.keys(a),
    second = Object.keys(b);
  return (
    first.length === second.length &&
    first.every(
      (key) =>
        Object.hasOwn(b, key) &&
        Object.is(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
        ),
    )
  );
}
export function createSelectionCache<S>() {
  let current: { value: S } | undefined;
  return {
    read: () => current,
    remember(value: S) {
      current = { value };
    },
  };
}
export function selectedSnapshot<T, S>(
  store: Pick<SnapshotStore<T>, 'getSnapshot'>,
  select: (value: T) => S,
  equal = shallowEqual<S>,
  cache?: ReturnType<typeof createSelectionCache<S>>,
) {
  let source: T,
    selection: S,
    initialized = false;
  return () => {
    const next = store.getSnapshot();
    if (!initialized || next !== source) {
      const result = select(next);
      const previous = initialized ? { value: selection } : cache?.read();
      selection =
        previous && equal(previous.value, result) ? previous.value : result;
      cache?.remember(selection);
      source = next;
      initialized = true;
    }
    return selection;
  };
}
// Preserve model references for equal server rows without mutating either input.
export function shareRow<T>(previous: T | undefined, next: T): T {
  return previous && JSON.stringify(previous) === JSON.stringify(next)
    ? previous
    : next;
}

// Action identities stay stable; implementations see the latest committed
// state. This keeps data selectors independent of a provider's render cycle.
export function createActionStore<T extends object>(initial: T) {
  let latest = initial;
  const actions = Object.fromEntries(
    Object.entries(initial)
      .filter(([, entry]) => typeof entry === 'function')
      .map(([key]) => [
        key,
        (...args: unknown[]) =>
          (latest[key as keyof T] as (...args: unknown[]) => unknown)(...args),
      ]),
  );
  const store = createSnapshotStore<T>({ ...initial, ...actions });
  return {
    store,
    update(next: T) {
      latest = next;
      store.publish({ ...next, ...actions });
    },
  };
}
