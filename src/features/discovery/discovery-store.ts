import type { TripSearchCursor, TripSearchPage, RankedTripProposal } from './discovery-data';
import { discoveryError, TRIP_SEARCH_PAGE_SIZE } from './discovery-data.ts';

export interface TripSearchState {
  items: RankedTripProposal[];
  totalCount: number | null;
  hasMore: boolean;
  cursor: TripSearchCursor | null;
  status: 'loading' | 'ready' | 'error';
  hasLoaded: boolean;
  loadingMore: boolean;
  error: string | null;
}
export function createTripSearchStore(fetchPage: (cursor?: TripSearchCursor) => Promise<TripSearchPage>, pageSize = TRIP_SEARCH_PAGE_SIZE) {
  const initialState: TripSearchState = { items: [], totalCount: null, hasMore: false, cursor: null, status: 'loading', hasLoaded: false, loadingMore: false, error: null };
  let state = initialState;
  let generation = 0;
  let failed: 'load' | 'more' = 'load';
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<TripSearchState>) => { state = { ...state, ...patch }; for (const notify of listeners) notify(); };
  const unique = (items: RankedTripProposal[]) => [...new Map(items.map(item => [item.trip.id, item])).values()];
  const refresh = async (fromStart = false) => {
    const version = ++generation;
    const wanted = fromStart ? pageSize : Math.max(pageSize, state.items.length);
    failed = 'load';
    publish({ ...(fromStart ? initialState : {}), status: 'loading', error: null, loadingMore: false });
    try {
      let page = await fetchPage();
      while (version === generation && page.hasMore && page.cursor && page.items.length < wanted) {
        const previous = page.cursor;
        const next = await fetchPage(previous);
        if (next.hasMore && (!next.cursor || JSON.stringify(next.cursor) === JSON.stringify(previous))) throw new Error('Invalid cursor progression');
        page = { ...next, items: unique([...page.items, ...next.items]) };
      }
      if (version === generation) publish({ ...page, status: 'ready', hasLoaded: true, error: null });
    } catch (e) { if (version === generation) { failed = 'load'; publish({ status: 'error', error: discoveryError(e) }); } }
  };
  const more = async () => {
    if (!state.hasMore || !state.cursor || state.status === 'loading') return;
    const version = generation;
    const cursor = state.cursor;
    publish({ status: 'loading', error: null, loadingMore: true });
    try {
      const page = await fetchPage(cursor);
      if (page.hasMore && (!page.cursor || JSON.stringify(page.cursor) === JSON.stringify(cursor))) throw new Error('Invalid cursor progression');
      if (version === generation) publish({ ...page, items: unique([...state.items, ...page.items]), status: 'ready', hasLoaded: true, loadingMore: false, error: null });
    } catch (e) { if (version === generation) { failed = 'more'; publish({ status: 'error', loadingMore: false, error: discoveryError(e) }); } }
  };
  return {
    subscribe: (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; },
    getSnapshot: () => state,
    refresh: () => refresh(), more,
    restart: () => refresh(true),
    retry: () => failed === 'more' ? more() : refresh(),
    stop: () => { generation++; },
  };
}
