import { shareRow } from '../../lib/snapshot-store.ts';
import type { ReactionKind, ReactionSummary } from './reaction-data';

export interface ReactionsTransport {
  load: (ids: string[]) => Promise<ReactionSummary[]>;
  save: (id: string, kind: ReactionKind | null) => Promise<ReactionSummary>;
}
export interface ReactionsSnapshot {
  items: ReadonlyMap<string, ReactionSummary>;
  busy: ReadonlySet<string>;
  loading: ReadonlySet<string>;
  errors: ReadonlyMap<string, string>;
}
export function createReactionsStore(transport: ReactionsTransport) {
  let snapshot: ReactionsSnapshot = {
    items: new Map(),
    busy: new Set(),
    loading: new Set(),
    errors: new Map(),
  };
  const listeners = new Set<() => void>(),
    watched = new Map<string, number>();
  let alive = true,
    lifecycle = 0,
    writes = 0,
    scheduled = false,
    repeat = false;
  let fetching: Promise<void> | null = null;
  const publish = (next: ReactionsSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    void Promise.resolve().then(() => {
      scheduled = false;
      if (alive) void refresh();
    });
  };
  const refresh = (): Promise<void> => {
    if (!alive || !watched.size) return Promise.resolve();
    if (fetching) {
      repeat = true;
      return fetching;
    }
    if (snapshot.busy.size) {
      repeat = true;
      return Promise.resolve();
    }
    const ids = [...watched.keys()],
      version = writes,
      current = lifecycle;
    const request = Promise.resolve().then(async () => {
      try {
        const loaded = await transport.load(ids);
        if (!alive || current !== lifecycle) return;
        if (version !== writes || snapshot.busy.size) {
          repeat = true;
          return;
        }
        if (ids.some((id) => !loaded.some((item) => item.trip_id === id)))
          throw new Error('Incomplete reaction summary');
        const items = new Map(snapshot.items),
          errors = new Map(snapshot.errors);
        for (const item of loaded) {
          items.set(item.trip_id, shareRow(items.get(item.trip_id), item));
          errors.delete(item.trip_id);
        }
        publish({ ...snapshot, items, errors });
      } catch {
        if (alive && current === lifecycle && version === writes) {
          const errors = new Map(snapshot.errors);
          ids.forEach((id) =>
            errors.set(id, 'Nie udało się wczytać reakcji. Spróbuj ponownie.'),
          );
          publish({ ...snapshot, errors });
        }
      } finally {
        if (current === lifecycle && alive) {
          const loading = new Set(snapshot.loading);
          ids.forEach((id) => loading.delete(id));
          publish({ ...snapshot, loading });
        }
        if (fetching === request) fetching = null;
        if (alive && current === lifecycle && repeat && !snapshot.busy.size) {
          repeat = false;
          schedule();
        }
      }
    });
    fetching = request;
    return request;
  };
  const setReaction = async (
    id: string,
    kind: ReactionKind | null,
  ): Promise<boolean> => {
    if (!alive || snapshot.busy.has(id) || !snapshot.items.get(id)?.can_react)
      return false;
    const current = lifecycle;
    writes++;
    const errors = new Map(snapshot.errors);
    errors.delete(id);
    publish({ ...snapshot, errors, busy: new Set([...snapshot.busy, id]) });
    try {
      const saved = await transport.save(id, kind);
      if (!alive || current !== lifecycle) return false;
      if (saved.trip_id !== id || saved.mine !== kind)
        throw new Error('Unconfirmed reaction');
      publish({ ...snapshot, items: new Map(snapshot.items).set(id, saved) });
      return true;
    } catch {
      if (alive && current === lifecycle)
        publish({
          ...snapshot,
          errors: new Map(snapshot.errors).set(
            id,
            'Nie udało się zapisać reakcji. Sprawdź połączenie lub dostępność ogłoszenia i spróbuj ponownie.',
          ),
        });
      return false;
    } finally {
      if (alive && current === lifecycle) {
        const busy = new Set(snapshot.busy);
        busy.delete(id);
        publish({ ...snapshot, busy });
        if (repeat && !busy.size) {
          repeat = false;
          schedule();
        }
      }
    }
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    watch: (id: string) => {
      watched.set(id, (watched.get(id) ?? 0) + 1);
      if (!snapshot.items.has(id))
        publish({ ...snapshot, loading: new Set([...snapshot.loading, id]) });
      schedule();
      return () => {
        const count = (watched.get(id) ?? 1) - 1;
        if (count) watched.set(id, count);
        else watched.delete(id);
      };
    },
    refresh,
    setReaction,
    activate: () => {
      alive = true;
      schedule();
    },
    dispose: () => {
      alive = false;
      lifecycle++;
      fetching = null;
      repeat = false;
    },
  };
}
export type ReactionsStore = ReturnType<typeof createReactionsStore>;
