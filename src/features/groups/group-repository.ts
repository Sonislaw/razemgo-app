import { proposalFromRow } from '@/features/trips/trip-mapper';
import { backendRequest } from '@/lib/backend-request';
import { getSupabase } from '@/lib/supabase';
import {
  GROUP_SEARCH_PAGE_SIZE,
  GROUP_TRIP_PAGE_SIZE,
  groupFiltersPayload,
  publicGroupFromRow,
  type GroupFilters,
  type GroupPage,
  type GroupTripCursor,
  type GroupVisibility,
  type PublicGroupPage,
  type PublicGroupRow,
  type RankedGroupCursor,
} from './group-data';

export async function fetchPublicGroups(
  filters: GroupFilters,
  cursor?: RankedGroupCursor,
  pageSize = GROUP_SEARCH_PAGE_SIZE,
  parentSignal?: AbortSignal,
): Promise<GroupPage> {
  const { data, error } = await backendRequest(
    (signal) =>
      getSupabase()
        .rpc('list_public_groups_v3', {
          filters: groupFiltersPayload(filters),
          after_cursor: cursor ?? null,
          page_size: pageSize,
        })
        .abortSignal(signal),
    'groups.search',
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
    throw new Error('Missing group directory');
  return {
    items: (data.items as PublicGroupRow[]).map(publicGroupFromRow),
    totalCount: data.total_count,
    hasMore: data.has_more,
    cursor: data.cursor,
  };
}
export async function fetchPublicGroupCount(
  filters: GroupFilters,
  parentSignal?: AbortSignal,
): Promise<number> {
  const { data, error } = await backendRequest(
    (signal) =>
      getSupabase()
        .rpc('count_public_groups', {
          filters: groupFiltersPayload(filters),
        })
        .abortSignal(signal),
    'groups.search',
    { signal: parentSignal, read: true, retries: 1 },
  );
  if (error) throw error;
  if (!Number.isSafeInteger(data) || data === null || data < 0)
    throw new Error('Missing group count');
  return data;
}
export async function fetchPublicGroup(
  userId: string,
  id: string,
  cursor?: GroupTripCursor,
  parentSignal?: AbortSignal,
): Promise<PublicGroupPage | null> {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();
  if (!session || session.user.id !== userId)
    throw Object.assign(new Error(), { name: 'AbortError' });
  const { data, error } = await backendRequest(
    (signal) =>
      getSupabase()
        .rpc('get_public_group_v3', {
          target_group_id: id,
          after_cursor: cursor ?? null,
          page_size: GROUP_TRIP_PAGE_SIZE,
        })
        .setHeader('Authorization', 'Bearer ' + session.access_token)
        .abortSignal(signal),
    'groups.detail',
    { signal: parentSignal, read: true, retries: 1 },
  );
  if (error) throw error;
  if (!data) return null;
  if (
    !Array.isArray(data.trips) ||
    data.trips.length > GROUP_TRIP_PAGE_SIZE ||
    typeof data.has_more !== 'boolean' ||
    !Number.isSafeInteger(data.active_trip_count) ||
    data.active_trip_count < 0 ||
    (data.has_more && (!data.cursor || !data.trips.length))
  )
    throw new Error('Invalid crew trip page');
  return {
    ...publicGroupFromRow(data),
    trips: data.trips.map(proposalFromRow),
    hasMore: data.has_more,
    cursor: data.cursor,
  };
}
export async function refreshGroupResults(
  ids: string[],
  filters: GroupFilters,
  parentSignal?: AbortSignal,
) {
  const items = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await backendRequest(
      (signal) =>
        getSupabase()
          .rpc('refresh_public_group_results_v3', {
            group_ids: ids.slice(offset, offset + 100),
            filters: groupFiltersPayload(filters),
          })
          .abortSignal(signal),
      'groups.search',
      { signal: parentSignal, read: true, retries: 1 },
    );
    if (error) throw error;
    if (!Array.isArray(data) || data.length > 100)
      throw new Error('Invalid cached groups');
    items.push(...data.map(publicGroupFromRow));
  }
  return items;
}
export async function fetchGroupVisibility(): Promise<GroupVisibility> {
  const { data, error } = await backendRequest(
    (signal) =>
      getSupabase().rpc('get_my_group_visibility').abortSignal(signal),
    'groups.visibility',
  );
  if (error) throw error;
  if (!data) throw new Error('Missing visibility');
  return data;
}
export async function saveGroupVisibility(
  value: GroupVisibility,
): Promise<GroupVisibility> {
  const { data, error } = await backendRequest(
    (signal) =>
      getSupabase()
        .rpc('save_my_group_visibility', {
          is_discoverable: value.discoverable,
          about_text: value.about.trim(),
        })
        .abortSignal(signal),
    'groups.save_visibility',
  );
  if (error) throw error;
  if (!data) throw new Error('Missing visibility');
  return data;
}
