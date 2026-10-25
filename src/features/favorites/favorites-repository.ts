import { backendRequest } from '@/lib/backend-request';
import { getSupabase } from '@/lib/supabase';
import type { FavoriteIds, FavoriteKind } from './favorites-store';

async function accountToken(userId: string) {
  const { data: { session } } = await getSupabase().auth.getSession();
  if (!session || session.user.id !== userId) throw Object.assign(new Error(), { name: 'AbortError' });
  return session.access_token;
}
export async function fetchFavorites(userId: string): Promise<FavoriteIds> {
  const token = await accountToken(userId);
  const { data, error } = await backendRequest(signal => getSupabase().rpc('get_my_favorites').setHeader('Authorization', 'Bearer ' + token).abortSignal(signal), 'favorites.load');
  if (error) throw error;
  if (!data || !Array.isArray(data.group_ids) || !Array.isArray(data.trip_ids)
    || [...data.group_ids, ...data.trip_ids].some(id => typeof id !== 'string')) throw new Error('Invalid favorites');
  return data;
}
export async function saveFavorite(userId: string, kind: FavoriteKind, id: string, selected: boolean) {
  const token = await accountToken(userId);
  const { data, error } = await backendRequest(signal => (kind === 'group'
    ? getSupabase().rpc('set_my_group_favorite', { target_group_id: id, is_favorite: selected })
    : getSupabase().rpc('set_my_trip_favorite', { target_trip_id: id, is_favorite: selected })).setHeader('Authorization', 'Bearer ' + token).abortSignal(signal), 'favorites.save');
  if (error) throw error;
  if (typeof data !== 'boolean') throw new Error('Missing favorite confirmation');
  return data;
}
