import { backendRequest } from '@/lib/backend-request';
import { getSupabase } from '@/lib/supabase';
import { parseTravelerPassport } from './passport-data';

export async function fetchTravelerPassport(userId: string, groupId: string, own: boolean, signal?: AbortSignal) {
  const { data: { session } } = await getSupabase().auth.getSession();
  if (!session || session.user.id !== userId) throw Object.assign(new Error(), { name: 'AbortError' });
  const { data, error } = await backendRequest(abort => {
    const client = getSupabase();
    const request = own ? client.rpc('get_my_traveler_passport') :
      client.rpc('get_public_traveler_passport', { target_group_id: groupId });
    return request.setHeader('Authorization', 'Bearer ' + session.access_token).abortSignal(abort);
  }, 'passport.load', { signal });
  if (error) throw error;
  if (!data && !own) return null;
  const passport = parseTravelerPassport(data);
  if (passport.group_id !== groupId || passport.own !== own) throw Error('Passport identity changed');
  return passport;
}
