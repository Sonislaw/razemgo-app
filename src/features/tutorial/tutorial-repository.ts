import { backendRequest } from '@/lib/backend-request';
import { getSupabase } from '@/lib/supabase';
import { parseTutorialState, type TutorialDecision } from './tutorial-store';

async function accountToken(userId: string) {
  const { data: { session } } = await getSupabase().auth.getSession();
  if (!session || session.user.id !== userId) throw Object.assign(new Error(), { name: 'AbortError' });
  return session.access_token;
}
export async function fetchTutorialState(userId: string) {
  const token = await accountToken(userId);
  const { data, error } = await backendRequest(signal => getSupabase().rpc('get_my_tutorial_state')
    .setHeader('Authorization', 'Bearer ' + token).abortSignal(signal), 'tutorial.load', { read: true, retries: 1 });
  if (error) throw error;
  return parseTutorialState(data);
}
export async function saveTutorialState(userId: string, status: TutorialDecision) {
  const token = await accountToken(userId);
  const { data, error } = await backendRequest(signal => getSupabase().rpc('finish_my_tutorial', { tutorial_status: status })
    .setHeader('Authorization', 'Bearer ' + token).abortSignal(signal), 'tutorial.save');
  if (error) throw error;
  const decision = parseTutorialState(data);
  if (!decision) throw Error('Missing tutorial decision');
  return decision;
}
