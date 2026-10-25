import { backendRequest } from '@/lib/backend-request';
import { getSupabase } from '@/lib/supabase';
import { proposalFromRow } from '@/features/trips/trip-mapper';
import { groupFiltersPayload, publicGroupFromRow, type GroupCursor, type GroupFilters, type GroupPage,
  type GroupVisibility, type PublicGroupDetail, type PublicGroupRow } from './group-data';

export async function fetchPublicGroups(filters: GroupFilters, cursor?: GroupCursor): Promise<GroupPage> {
  const { data, error } = await backendRequest(signal => getSupabase().rpc('list_public_groups', {
    filters: groupFiltersPayload(filters), after_name: cursor?.name ?? null, after_id: cursor?.id ?? null,
  }).abortSignal(signal), 'groups.search');
  if (error) throw error;
  if (!data || !Array.isArray(data.items)) throw new Error('Missing group directory');
  return { items: (data.items as PublicGroupRow[]).map(publicGroupFromRow), hasMore: data.has_more, cursor: data.cursor };
}
export async function fetchPublicGroup(id: string): Promise<PublicGroupDetail | null> {
  const { data, error } = await backendRequest(signal => getSupabase().rpc('get_public_group', { target_group_id: id }).abortSignal(signal), 'groups.detail');
  if (error) throw error;
  return data ? { ...publicGroupFromRow(data), trips: (data.trips ?? []).map(proposalFromRow) } : null;
}
export async function fetchGroupVisibility(): Promise<GroupVisibility> {
  const { data, error } = await backendRequest(signal => getSupabase().rpc('get_my_group_visibility').abortSignal(signal), 'groups.visibility');
  if (error) throw error;
  if (!data) throw new Error('Missing visibility');
  return data;
}
export async function saveGroupVisibility(value: GroupVisibility): Promise<GroupVisibility> {
  const { data, error } = await backendRequest(signal => getSupabase().rpc('save_my_group_visibility', {
    is_discoverable: value.discoverable, about_text: value.about.trim(),
  }).abortSignal(signal), 'groups.save_visibility');
  if (error) throw error;
  if (!data) throw new Error('Missing visibility');
  return data;
}
