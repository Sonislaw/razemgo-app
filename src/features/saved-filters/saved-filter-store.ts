import {
  FILTER_SET_LIMIT, filterSetError, filterSetNameError, normalizeFilterSetName,
  type FilterSetWrite, type SavedFilterSet,
} from './saved-filter-data.ts';

export interface SavedFilterTransport {
  load: () => Promise<SavedFilterSet[]>;
  save: (request: FilterSetWrite) => Promise<SavedFilterSet>;
  remove: (id: string) => Promise<boolean>;
  setNotifications?: (id: string, enabled: boolean) => Promise<SavedFilterSet>;
}
export interface SavedFilterSnapshot {
  items: readonly SavedFilterSet[];
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  busy: boolean;
}
type SaveResult = { item: SavedFilterSet | null; error: string | null };
const sorted = (items: readonly SavedFilterSet[]) => [...items].sort((a, b) => a.name.localeCompare(b.name, 'pl') || a.id.localeCompare(b.id));
export function createSavedFilterStore(transport: SavedFilterTransport) {
  let snapshot: SavedFilterSnapshot = { items: [], status: 'loading', error: null, busy: false };
  const listeners = new Set<() => void>();
  let alive = true, generation = 0, writes = 0, repeat = false;
  let fetching: Promise<void> | null = null;
  const publish = (patch: Partial<SavedFilterSnapshot>) => {
    snapshot = { ...snapshot, ...patch }; for (const listener of listeners) listener();
  };
  const refresh = (): Promise<void> => {
    if (!alive) return Promise.resolve();
    if (fetching) return fetching;
    if (snapshot.busy) { repeat = true; return Promise.resolve(); }
    const current = generation, version = writes;
    const task = Promise.resolve().then(async () => {
      try {
        const items = await transport.load();
        if (!alive || current !== generation) return;
        if (version !== writes || snapshot.busy) { repeat = true; return; }
        publish({ items: sorted(items), status: 'ready', error: null });
      } catch {
        if (alive && current === generation && version === writes) publish({
          status: snapshot.status === 'ready' ? 'ready' : 'error',
          error: 'Nie udało się pobrać zapisanych filtrów. Spróbuj ponownie.',
        });
      } finally {
        if (fetching === task) fetching = null;
        if (alive && current === generation && repeat && !snapshot.busy) { repeat = false; void refresh(); }
      }
    });
    fetching = task; return task;
  };
  const available = () => alive && snapshot.status === 'ready' && !snapshot.busy;
  const finish = (current: number) => {
    if (!alive || current !== generation) return;
    publish({ busy: false });
    if (repeat) { repeat = false; void refresh(); }
  };
  const save = async (request: FilterSetWrite): Promise<SaveResult> => {
    if (!available()) return { item: null, error: 'Poczekaj na wczytanie zestawów lub spróbuj ponownie.' };
    const name = normalizeFilterSetName(request.name);
    const error = filterSetNameError(name);
    if (error) return { item: null, error };
    const siblings = snapshot.items.filter(item => item.kind === request.kind);
    if (siblings.some(item => item.id !== request.id && item.name.toLocaleLowerCase('pl-PL') === name.toLocaleLowerCase('pl-PL')))
      return { item: null, error: 'Masz już zestaw o tej nazwie w tej zakładce.' };
    if (!siblings.some(item => item.id === request.id) && siblings.length >= FILTER_SET_LIMIT)
      return { item: null, error: 'Możesz zapisać najwyżej 10 zestawów w tej zakładce.' };
    const current = generation; writes++; publish({ busy: true });
    try {
      const item = await transport.save({ ...request, name });
      if (!alive || current !== generation) return { item: null, error: null };
      publish({ items: sorted([...snapshot.items.filter(value => value.id !== item.id), item]), status: 'ready', error: null });
      return { item, error: null };
    } catch (cause) {
      if (!alive || current !== generation) return { item: null, error: null };
      return { item: null, error: filterSetError(cause) };
    } finally { finish(current); }
  };
  const remove = async (id: string): Promise<{ ok: boolean; error: string | null }> => {
    if (!available()) return { ok: false, error: 'Poczekaj na wczytanie zestawów lub spróbuj ponownie.' };
    const current = generation; writes++; publish({ busy: true });
    try {
      if (await transport.remove(id) !== true) throw Error('Missing deletion confirmation');
      if (!alive || current !== generation) return { ok: false, error: null };
      publish({ items: snapshot.items.filter(item => item.id !== id), error: null });
      return { ok: true, error: null };
    } catch (cause) {
      return { ok: false, error: filterSetError(cause, 'Nie udało się usunąć zestawu. Spróbuj ponownie.') };
    } finally { finish(current); }
  };
  const setNotifications = async (id: string, enabled: boolean): Promise<SaveResult> => {
    if (!available() || !transport.setNotifications) return { item: null, error: 'Poczekaj na wczytanie zestawów lub spróbuj ponownie.' };
    const current = generation; writes++; publish({ busy: true });
    try {
      const item = await transport.setNotifications(id, enabled);
      if (!alive || current !== generation) return { item: null, error: null };
      if (item.id !== id || item.kind !== 'trips' || item.notificationsEnabled !== enabled) throw Error('Missing settings confirmation');
      publish({ items: sorted([...snapshot.items.filter(value => value.id !== id), item]), error: null });
      return { item, error: null };
    } catch (cause) {
      return { item: null, error: alive && current === generation ? filterSetError(cause, 'Nie udało się zmienić powiadomień. Spróbuj ponownie.') : null };
    } finally { finish(current); }
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh, save, remove, setNotifications,
    activate: () => { alive = true; },
    dispose: () => { alive = false; generation++; fetching = null; repeat = false; },
  };
}
export type SavedFilterStore = ReturnType<typeof createSavedFilterStore>;
