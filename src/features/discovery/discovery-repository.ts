import { getSupabase } from '@/lib/supabase';
import { backendRequest } from '@/lib/backend-request';
import { proposalFromRow, type PublicTripRow } from '@/features/trips/trip-mapper';
import type { DiscoveryFilters } from '@/types/travel';
import type { DiscoverySort } from './sort-proposals';
import type { Compatibility } from './compatibility';
import { discoveryFiltersPayload, type RankedTripProposal, type TripSearchCursor, type TripSearchPage } from './discovery-data';

async function accountToken(userId: string) {
  const { data: { session } } = await getSupabase().auth.getSession();
  if (!session || session.user.id !== userId) throw Object.assign(new Error(), { name: 'AbortError' });
  return session.access_token;
}
export type RankedTripRow = PublicTripRow & { compatibility: Compatibility };
export interface TripSearchPageRow { items: RankedTripRow[]; total_count: number; has_more: boolean; cursor: TripSearchCursor | null }
const ranked = (row: RankedTripRow): RankedTripProposal => ({ ...proposalFromRow(row), compatibility: row.compatibility });
export async function fetchTripPage(userId: string, filters: DiscoveryFilters, sort: DiscoverySort, cursor?: TripSearchCursor, pageSize = 20): Promise<TripSearchPage> {
  const token = await accountToken(userId);
  const { data, error } = await backendRequest(signal => getSupabase().rpc('search_public_trips', {
    filters: discoveryFiltersPayload(filters), sort_mode: sort, after_cursor: cursor ?? null, page_size: pageSize,
  }).setHeader('Authorization', 'Bearer ' + token).abortSignal(signal), 'discovery.load');
  if (error) throw error;
  if (!data || !Array.isArray(data.items) || !Number.isSafeInteger(data.total_count) || data.total_count < 0
    || typeof data.has_more !== 'boolean' || (data.has_more && !data.cursor)) throw new Error('Invalid trip page');
  return { items: data.items.map(ranked), totalCount: data.total_count, hasMore: data.has_more, cursor: data.cursor };
}
export async function fetchTripCount(userId: string, filters: DiscoveryFilters) {
  const token = await accountToken(userId);
  const { data, error } = await backendRequest(signal => getSupabase().rpc('count_public_trips', {
    filters: discoveryFiltersPayload(filters),
  }).setHeader('Authorization', 'Bearer ' + token).abortSignal(signal), 'discovery.load');
  if (error) throw error;
  if (data === null || !Number.isSafeInteger(data) || data < 0) throw new Error('Invalid trip count');
  return data;
}
export async function fetchDiscoveryTrip(userId: string, id: string, filters: DiscoveryFilters) {
  if (!/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) return null;
  const token = await accountToken(userId);
  const { data, error } = await backendRequest(signal => getSupabase().rpc('get_discovery_trip', {
    target_trip_id: id, filters: discoveryFiltersPayload(filters),
  }).setHeader('Authorization', 'Bearer ' + token).abortSignal(signal), 'discovery.load');
  if (error) throw error;
  return data ? ranked(data) : null;
}
