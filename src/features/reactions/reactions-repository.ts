import { backendRequest } from '@/lib/backend-request';
import { getSupabase } from '@/lib/supabase';
import { parseReactionSummary, type ReactionKind, type ReactionSummary, type ReactorsPage, type TripReactor } from './reaction-data';

async function accountToken(userId: string) {
  const { data: { session } } = await getSupabase().auth.getSession();
  if (!session || session.user.id !== userId) throw Object.assign(new Error(), { name: 'AbortError' });
  return session.access_token;
}
export async function fetchReactionSummaries(userId: string, ids: string[]): Promise<ReactionSummary[]> {
  const token = await accountToken(userId), items: ReactionSummary[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await backendRequest(signal => getSupabase().rpc('get_trip_reactions', { trip_ids: ids.slice(offset, offset + 100) })
      .setHeader('Authorization', 'Bearer ' + token).abortSignal(signal), 'reactions.load');
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Missing reactions');
    items.push(...data.map(parseReactionSummary));
  }
  return items;
}
export async function saveReaction(userId: string, id: string, kind: ReactionKind | null) {
  const token = await accountToken(userId);
  const { data, error } = await backendRequest(signal => getSupabase().rpc('set_my_trip_reaction', { target_trip_id: id, reaction_kind: kind })
    .setHeader('Authorization', 'Bearer ' + token).abortSignal(signal), 'reactions.save');
  if (error) throw error;
  return parseReactionSummary(data);
}
export async function fetchTripReactors(userId: string, id: string, cursor?: TripReactor): Promise<ReactorsPage> {
  const token = await accountToken(userId);
  const { data, error } = await backendRequest(signal => getSupabase().rpc('get_my_trip_reactors', {
    target_trip_id: id, after_at: cursor?.updated_at ?? null, after_id: cursor?.id ?? null,
  }).setHeader('Authorization', 'Bearer ' + token).abortSignal(signal), 'reactions.people');
  if (error) throw error;
  if (!data || !Array.isArray(data.items) || typeof data.has_more !== 'boolean') throw new Error('Missing reactors');
  return data;
}
