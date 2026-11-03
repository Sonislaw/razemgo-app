import { backendRequest } from '@/lib/backend-request';
import { getSupabase } from '@/lib/supabase';
import { parseSavedFilterSet, type FilterSetWrite } from './saved-filter-data';

async function accountToken(userId: string) {
  const { data: { session } } = await getSupabase().auth.getSession();
  if (!session || session.user.id !== userId) throw Object.assign(new Error(), { name: 'AbortError' });
  return session.access_token;
}
export async function fetchFilterSets(userId: string) {
  const token = await accountToken(userId);
  const { data, error } = await backendRequest(signal => getSupabase().rpc('list_my_filter_sets')
    .setHeader('Authorization', 'Bearer ' + token).abortSignal(signal), 'saved_filters.load', { read: true, retries: 1 });
  if (error) throw error;
  if (!Array.isArray(data) || data.length > 20) throw Error('Invalid filter sets');
  const items = data.map(parseSavedFilterSet);
  if (new Set(items.map(item => item.id)).size !== items.length) throw Error('Duplicate filter sets');
  return items;
}
export async function persistFilterSet(userId: string, request: FilterSetWrite) {
  const token = await accountToken(userId);
  const { data, error } = await backendRequest(signal => getSupabase().rpc('save_my_filter_set', {
    target_id: request.id, filter_kind: request.kind, set_name: request.name, filter_payload: request.filters,
  }).setHeader('Authorization', 'Bearer ' + token).abortSignal(signal), 'saved_filters.save');
  if (error) throw error;
  return parseSavedFilterSet(data);
}
export async function removeFilterSet(userId: string, id: string) {
  const token = await accountToken(userId);
  const { data, error } = await backendRequest(signal => getSupabase().rpc('delete_my_filter_set', { target_id: id })
    .setHeader('Authorization', 'Bearer ' + token).abortSignal(signal), 'saved_filters.delete');
  if (error) throw error;
  if (data !== true) throw Error('Missing deletion confirmation');
  return data;
}
export async function setFilterSetNotifications(userId: string, id: string, enabled: boolean) {
  const token = await accountToken(userId);
  const { data, error } = await backendRequest(signal => getSupabase().rpc('set_my_filter_set_notifications', {
    target_id: id, enabled,
  }).setHeader('Authorization', 'Bearer ' + token).abortSignal(signal), 'saved_filters.notifications');
  if (error) throw error;
  return parseSavedFilterSet(data);
}
