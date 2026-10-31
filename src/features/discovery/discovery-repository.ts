import {
  proposalFromRow,
  type PublicTripRow,
} from '@/features/trips/trip-mapper';
import { backendRequest } from '@/lib/backend-request';
import { getSupabase } from '@/lib/supabase';
import type { DiscoveryFilters } from '@/types/travel';
import {
  discoveryFiltersPayload,
  TRIP_SEARCH_PAGE_SIZE,
  type DiscoveryTripProposal,
  type TripSearchCursor,
  type TripSearchPage,
} from './discovery-data';

async function accountToken(userId: string) {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();
  if (!session || session.user.id !== userId)
    throw Object.assign(new Error(), { name: 'AbortError' });
  return session.access_token;
}
export type DiscoveryTripRow = PublicTripRow;
export interface TripSearchPageRow {
  items: DiscoveryTripRow[];
  total_count: number;
  has_more: boolean;
  cursor: TripSearchCursor | null;
}
const fromRow = (row: DiscoveryTripRow): DiscoveryTripProposal => {
  return proposalFromRow(row);
};
export async function fetchTripPage(
  userId: string,
  filters: DiscoveryFilters,
  cursor?: TripSearchCursor,
  pageSize = TRIP_SEARCH_PAGE_SIZE,
  parentSignal?: AbortSignal,
): Promise<TripSearchPage> {
  const token = await accountToken(userId);
  const { data, error } = await backendRequest(
    (signal) =>
      getSupabase()
        .rpc('search_public_trips_v3', {
          filters: discoveryFiltersPayload(filters),
          after_cursor: cursor ?? null,
          page_size: pageSize,
        })
        .setHeader('Authorization', 'Bearer ' + token)
        .abortSignal(signal),
    'discovery.load',
    { signal: parentSignal, read: true, retries: 1 },
  );
  if (error) throw error;
  if (
    !data ||
    !Array.isArray(data.items) ||
    !Number.isSafeInteger(data.total_count) ||
    data.total_count < 0 ||
    typeof data.has_more !== 'boolean' ||
    (data.has_more && !data.cursor)
  )
    throw new Error('Invalid trip page');
  return {
    items: data.items.map(fromRow),
    totalCount: data.total_count,
    hasMore: data.has_more,
    cursor: data.cursor,
  };
}
export async function fetchTripCount(
  userId: string,
  filters: DiscoveryFilters,
  parentSignal?: AbortSignal,
) {
  const token = await accountToken(userId);
  const { data, error } = await backendRequest(
    (signal) =>
      getSupabase()
        .rpc('count_public_trips', {
          filters: discoveryFiltersPayload(filters),
        })
        .setHeader('Authorization', 'Bearer ' + token)
        .abortSignal(signal),
    'discovery.load',
    { signal: parentSignal, read: true, retries: 1 },
  );
  if (error) throw error;
  if (data === null || !Number.isSafeInteger(data) || data < 0)
    throw new Error('Invalid trip count');
  return data;
}
export async function fetchDiscoveryTrip(
  userId: string,
  id: string,
  parentSignal?: AbortSignal,
) {
  if (!/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) return null;
  const token = await accountToken(userId);
  const { data, error } = await backendRequest(
    (signal) =>
      getSupabase()
        .rpc('get_discovery_trip_v3', {
          target_trip_id: id,
        })
        .setHeader('Authorization', 'Bearer ' + token)
        .abortSignal(signal),
    'discovery.load',
    { signal: parentSignal, read: true, retries: 1 },
  );
  if (error) throw error;
  return data ? fromRow(data) : null;
}
export async function refreshTripResults(
  userId: string,
  ids: string[],
  filters: DiscoveryFilters,
  parentSignal?: AbortSignal,
) {
  const token = await accountToken(userId),
    items: DiscoveryTripProposal[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await backendRequest(
      (signal) =>
        getSupabase()
          .rpc('refresh_public_trip_results_v3', {
            trip_ids: ids.slice(offset, offset + 100),
            filters: discoveryFiltersPayload(filters),
          })
          .setHeader('Authorization', 'Bearer ' + token)
          .abortSignal(signal),
      'discovery.load',
      { signal: parentSignal, read: true, retries: 1 },
    );
    if (error) throw error;
    if (!Array.isArray(data) || data.length > 100)
      throw new Error('Invalid cached trip results');
    items.push(...data.map(fromRow));
  }
  return items;
}
