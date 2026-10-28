import { createPagedResource } from '../../lib/paged-resource.ts';
import type {
  RankedTripProposal,
  TripSearchCursor,
  TripSearchPage,
} from './discovery-data';
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
export function createTripSearchStore(
  fetchPage: (
    cursor?: TripSearchCursor,
    signal?: AbortSignal,
  ) => Promise<TripSearchPage>,
  pageSize = TRIP_SEARCH_PAGE_SIZE,
  refreshItems?: (
    items: RankedTripProposal[],
    signal: AbortSignal,
  ) => Promise<RankedTripProposal[]>,
) {
  const resource = createPagedResource({
    load: (cursor: TripSearchCursor | undefined, signal) =>
      fetchPage(cursor, signal),
    key: (item: RankedTripProposal) => item.trip.id,
    error: discoveryError,
    refreshItems,
  });
  let source = resource.getSnapshot();
  const project = (): TripSearchState => ({
    items: source.page?.items ?? [],
    totalCount: source.page?.totalCount ?? null,
    hasMore: source.page?.hasMore ?? false,
    cursor: source.page?.cursor ?? null,
    status: source.status,
    hasLoaded: !!source.page,
    loadingMore: source.loadingMore,
    error: source.error,
  });
  let snapshot = project();
  const getSnapshot = () => {
    const next = resource.getSnapshot();
    if (source !== next) {
      source = next;
      snapshot = project();
    }
    return snapshot;
  };
  return { ...resource, getSnapshot, loadMore: resource.more };
}
