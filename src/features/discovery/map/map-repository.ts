import { backendRequest } from '@/lib/backend-request';
import { getSupabase } from '@/lib/supabase';
import { proposalFromRow } from '@/features/trips/trip-mapper';
import type { DiscoveryFilters } from '@/types/travel';
import { discoveryFiltersPayload } from '../discovery-data';
import {
  mapObject,
  parseMapCursor,
  parseTripMapPage,
  MAP_PAGE_SIZE,
  type MapQuery,
  type MapCursor,
  type MapItemsPage,
} from './map-data';
import { plannedMapFilters } from '../trip-discovery-state';

async function token(userId: string) {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();
  if (!session || session.user.id !== userId)
    throw Object.assign(Error(), { name: 'AbortError' });
  return session.access_token;
}
export async function fetchTripMap(
  userId: string,
  filters: DiscoveryFilters,
  query: MapQuery,
  signal?: AbortSignal,
) {
  const auth = await token(userId);
  const { data, error } = await backendRequest(
    (abort) =>
      getSupabase()
        .rpc('search_trip_map', {
          filters: discoveryFiltersPayload(plannedMapFilters(filters)),
          viewport: query.bounds,
          map_zoom: query.zoom,
        })
        .setHeader('Authorization', 'Bearer ' + auth)
        .abortSignal(abort),
    'discovery.map',
    { signal, read: true, retries: 1 },
  );
  if (error) throw error;
  return parseTripMapPage(data);
}
export async function fetchMapItems(
  userId: string,
  filters: DiscoveryFilters,
  query: MapQuery,
  key: string,
  cursor?: MapCursor,
  signal?: AbortSignal,
): Promise<MapItemsPage> {
  const auth = await token(userId);
  const { data, error } = await backendRequest(
    (abort) =>
      getSupabase()
        .rpc('get_trip_map_items', {
          filters: discoveryFiltersPayload(plannedMapFilters(filters)),
          viewport: query.bounds,
          map_zoom: query.zoom,
          cluster_key: key,
          after_cursor: cursor ?? null,
          page_size: MAP_PAGE_SIZE,
        })
        .setHeader('Authorization', 'Bearer ' + auth)
        .abortSignal(abort),
    'discovery.map',
    { signal, read: true, retries: 1 },
  );
  if (error) throw error;
  const value = mapObject(data);
  if (
    !Array.isArray(value.items) ||
    value.items.length > MAP_PAGE_SIZE ||
    !Number.isSafeInteger(value.total_count) ||
    (value.total_count as number) < 0 ||
    typeof value.has_more !== 'boolean'
  )
    throw Error('Invalid map items');
  const next = parseMapCursor(value.cursor);
  if (value.has_more && !next) throw Error('Missing map cursor');
  return {
    items: value.items.map((row) => {
      const item = proposalFromRow(row);
      if (item.trip.mode !== 'planned')
        throw Error('Unexpected trip mode on the map');
      return { ...item, trip: item.trip };
    }),
    totalCount: value.total_count as number,
    hasMore: value.has_more,
    cursor: next,
  };
}
