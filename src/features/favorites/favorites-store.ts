export type FavoriteKind = 'group' | 'trip';
export interface FavoriteIds { group_ids: string[]; trip_ids: string[] }
export interface FavoritesSnapshot {
  groupIds: ReadonlySet<string>;
  tripIds: ReadonlySet<string>;
  busy: ReadonlySet<string>;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  revision: number;
}
export interface FavoritesTransport {
  load: () => Promise<FavoriteIds>;
  save: (kind: FavoriteKind, id: string, selected: boolean) => Promise<boolean>;
}
export const favoriteKey = (kind: FavoriteKind, id: string) => kind + ':' + id;
const same = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every(id => b.has(id));
export function createFavoritesStore(transport: FavoritesTransport) {
  let snapshot: FavoritesSnapshot = { groupIds: new Set(), tripIds: new Set(), busy: new Set(), status: 'loading', error: null, revision: 0 };
  const listeners = new Set<() => void>();
  let alive = true, lifecycle = 0, writes = 0, repeat = false;
  let fetching: Promise<void> | null = null;
  const publish = (next: FavoritesSnapshot) => { snapshot = next; for (const listener of listeners) listener(); };
  const apply = (groupIds: ReadonlySet<string>, tripIds: ReadonlySet<string>) => {
    const changed = !same(snapshot.groupIds, groupIds) || !same(snapshot.tripIds, tripIds);
    publish({ ...snapshot, groupIds: changed ? groupIds : snapshot.groupIds, tripIds: changed ? tripIds : snapshot.tripIds,
      status: 'ready', error: null, revision: snapshot.revision + Number(changed) });
  };
  const refresh = (): Promise<void> => {
    if (!alive) return Promise.resolve();
    if (fetching) return fetching;
    if (snapshot.busy.size) { repeat = true; return Promise.resolve(); }
    const version = writes, current = lifecycle;
    const request = Promise.resolve().then(async () => {
      try {
        const result = await transport.load();
        if (!alive || current !== lifecycle) return;
        if (writes !== version || snapshot.busy.size) { repeat = true; return; }
        apply(new Set(result.group_ids), new Set(result.trip_ids));
      } catch {
        if (alive && current === lifecycle && writes === version) publish({ ...snapshot,
          status: snapshot.status === 'ready' ? 'ready' : 'error', error: 'Nie udało się pobrać ulubionych. Spróbuj ponownie.' });
      } finally {
        if (fetching === request) fetching = null;
        if (alive && current === lifecycle && repeat && !snapshot.busy.size) { repeat = false; void refresh(); }
      }
    });
    fetching = request;
    return request;
  };
  const setFavorite = async (kind: FavoriteKind, id: string, selected: boolean): Promise<boolean> => {
    const key = favoriteKey(kind, id);
    if (!alive || snapshot.status !== 'ready' || snapshot.busy.has(key)) return false;
    const current = lifecycle;
    writes++;
    publish({ ...snapshot, busy: new Set([...snapshot.busy, key]) });
    try {
      if (await transport.save(kind, id, selected) !== selected) throw new Error('Unconfirmed favorite');
      if (!alive || current !== lifecycle) return false;
      const groups = new Set(snapshot.groupIds), trips = new Set(snapshot.tripIds);
      const target = kind === 'group' ? groups : trips;
      if (selected) target.add(id); else target.delete(id);
      apply(groups, trips);
      return true;
    } catch { return false; }
    finally {
      if (alive && current === lifecycle) {
        const busy = new Set(snapshot.busy); busy.delete(key); publish({ ...snapshot, busy });
        if (repeat && !busy.size) { repeat = false; void refresh(); }
      }
    }
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh, setFavorite,
    activate: () => { alive = true; },
    dispose: () => { alive = false; lifecycle++; fetching = null; repeat = false; },
  };
}
export type FavoritesStore = ReturnType<typeof createFavoritesStore>;
