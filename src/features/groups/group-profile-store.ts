import { createPagedResource } from '../../lib/paged-resource.ts';
import type { TripProposal } from '../../types/travel';
import type { GroupTripCursor, PublicGroupPage } from './group-data';
import { groupDirectoryError } from './group-data.ts';

export function createGroupProfileStore(
  fetchPage: (
    cursor?: GroupTripCursor,
    signal?: AbortSignal,
  ) => Promise<PublicGroupPage | null>,
  refreshItems?: (
    items: TripProposal[],
    signal: AbortSignal,
  ) => Promise<TripProposal[]>,
) {
  const resource = createPagedResource({
    load: async (cursor: GroupTripCursor | undefined, signal: AbortSignal) => {
      const page = await fetchPage(cursor, signal);
      return page
        ? { ...page, items: page.trips, totalCount: page.activeTripCount }
        : null;
    },
    key: (item: TripProposal) => item.trip.id,
    error: (error, phase) =>
      phase === 'more'
        ? 'Nie udało się pobrać ogłoszeń. Sprawdź połączenie i spróbuj ponownie.'
        : groupDirectoryError(error),
    refreshItems,
  });
  let source = resource.getSnapshot();
  let dataSource = source.page;
  let data = dataSource ? { ...dataSource, trips: dataSource.items } : null;
  const project = () => {
    if (dataSource !== source.page) {
      dataSource = source.page;
      data = dataSource ? { ...dataSource, trips: dataSource.items } : null;
    }
    return {
      data,
      status: source.status,
      error: source.error,
      loadingMore: source.loadingMore,
    };
  };
  let snapshot = project();
  const getSnapshot = () => {
    const next = resource.getSnapshot();
    if (source !== next) {
      source = next;
      snapshot = project();
    }
    return snapshot;
  };
  return { ...resource, getSnapshot };
}
