import { sameMapQuery, type MapQuery, type TripMapPage } from './map-data.ts';
export interface MapSnapshot {
  data: TripMapPage | null;
  query: MapQuery | undefined;
  status: 'loading' | 'ready' | 'error';
  loading: boolean;
  error: string | null;
}
export function createTripMapStore(
  read: (query: MapQuery, signal: AbortSignal) => Promise<TripMapPage>,
) {
  let snapshot: MapSnapshot = {
    data: null,
    query: undefined,
    status: 'loading',
    loading: false,
    error: null,
  };
  let alive = true,
    version = 0,
    controller: AbortController | undefined,
    pending: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<MapSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };
  const load = (query: MapQuery, background = false): Promise<void> => {
    if (!alive) return Promise.resolve();
    if (pending && sameMapQuery(query, snapshot.query)) return pending;
    controller?.abort();
    const signal = (controller = new AbortController()).signal,
      revision = ++version;
    publish({
      query,
      loading: true,
      error: null,
      ...(!background ? { data: null, status: 'loading' as const } : {}),
    });
    const task = Promise.resolve().then(async () => {
      try {
        const data = await read(query, signal);
        if (alive && revision === version)
          publish({ data, status: 'ready', loading: false, error: null });
      } catch {
        if (alive && revision === version && !signal.aborted)
          publish({
            status: snapshot.data ? 'ready' : 'error',
            loading: false,
            error:
              'Nie udało się pobrać wyjazdów na mapie. Sprawdź połączenie i spróbuj ponownie.',
          });
      } finally {
        if (pending === task) pending = undefined;
      }
    });
    pending = task;
    return task;
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load,
    retry: () => (snapshot.query ? load(snapshot.query) : Promise.resolve()),
    activate: () => {
      alive = true;
    },
    stop: () => {
      alive = false;
      version++;
      controller?.abort();
      pending = undefined;
      publish({ loading: false });
    },
  };
}
