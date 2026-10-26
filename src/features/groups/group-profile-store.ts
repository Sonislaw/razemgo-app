import type { GroupTripCursor, PublicGroupPage } from './group-data';
import { GROUP_TRIP_PAGE_SIZE, groupDirectoryError } from './group-data.ts';

interface GroupProfileState {
  data: PublicGroupPage | null;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  loadingMore: boolean;
}

export function createGroupProfileStore(fetchPage: (cursor?: GroupTripCursor) => Promise<PublicGroupPage | null>) {
  const initial: GroupProfileState = { data: null, status: 'loading', error: null, loadingMore: false };
  let state = initial;
  let generation = 0;
  let failed: 'load' | 'more' = 'load';
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<GroupProfileState>) => {
    state = { ...state, ...patch }; for (const notify of listeners) notify();
  };
  const merge = (first: PublicGroupPage, next: PublicGroupPage) => ({ ...next,
    trips: [...new Map([...first.trips, ...next.trips].map(item => [item.trip.id, item])).values()] });
  const validateProgress = (previous: GroupTripCursor, next: PublicGroupPage | null) => {
    if (next?.hasMore && (!next.cursor || JSON.stringify(previous) === JSON.stringify(next.cursor))) throw new Error('Invalid cursor progression');
  };
  const load = async (restart = false) => {
    const version = ++generation;
    const wanted = restart ? GROUP_TRIP_PAGE_SIZE : Math.max(GROUP_TRIP_PAGE_SIZE, state.data?.trips.length ?? 0);
    failed = 'load';
    publish({ ...(restart ? initial : {}), status: 'loading', error: null, loadingMore: false });
    try {
      let page = await fetchPage();
      while (version === generation && page?.hasMore && page.cursor && page.trips.length < wanted) {
        const next = await fetchPage(page.cursor);
        validateProgress(page.cursor, next);
        if (!next) { page = null; break; }
        page = merge(page, next);
      }
      if (version === generation) publish({ data: page, status: 'ready', error: null });
    } catch (error) { if (version === generation) publish({ status: 'error', error: groupDirectoryError(error) }); }
  };
  const more = async () => {
    if (!state.data?.hasMore || !state.data.cursor || state.status === 'loading') return;
    const version = generation, previous = state.data;
    publish({ status: 'loading', error: null, loadingMore: true });
    try {
      const next = await fetchPage(previous.cursor!);
      validateProgress(previous.cursor!, next);
      if (version === generation) publish({ data: next ? merge(previous, next) : null, status: 'ready', error: null, loadingMore: false });
    } catch {
      if (version === generation) { failed = 'more'; publish({ status: 'error', error: 'Nie udało się pobrać ogłoszeń. Sprawdź połączenie i spróbuj ponownie.', loadingMore: false }); }
    }
  };
  return {
    subscribe: (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; },
    getSnapshot: () => state,
    restart: () => load(true), refresh: () => load(), more,
    retry: () => failed === 'more' ? more() : load(),
    stop: () => { generation++; },
  };
}
