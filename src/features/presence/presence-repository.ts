import { getSupabase } from '@/lib/supabase';
import { reportFailure } from '@/lib/monitoring-core';
import type { MonitoringOperation } from '../../../shared/monitoring-policy';

async function request<T>(userId: string, label: MonitoringOperation, operation: (token: string, signal: AbortSignal) => PromiseLike<{ data: T; error: unknown }>, leaving = false): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(Object.assign(new Error(), { name: 'TimeoutError' }));
    }, leaving ? 3000 : 7000);
  });
  try {
    return await Promise.race([timeout, (async () => {
      const { data: { session } } = await getSupabase().auth.getSession();
      if (controller.signal.aborted || !session || session.user.id !== userId) throw Object.assign(new Error(), { name: 'AbortError' });
      // Pin the request to this account even if authentication changes in flight.
      const result = await operation(session.access_token, controller.signal);
      if (result.error) throw result.error;
      return result.data;
    })()]);
  } catch (error) {
    if (!leaving) reportFailure(error, label, controller.signal.aborted);
    throw error;
  } finally { clearTimeout(timer); }
}
export function setPresence(userId: string, connectionId: string, online: boolean) {
  return request(userId, 'presence.heartbeat', (token, signal) => getSupabase().rpc('set_my_presence', {
    connection_id: connectionId, is_online: online,
  }).setHeader('Authorization', 'Bearer ' + token).abortSignal(signal), !online).then(() => undefined);
}
export async function getOnlineGroups(userId: string, groupIds: string[]): Promise<string[]> {
  const result = await request(userId, 'presence.lookup', (token, signal) => getSupabase().rpc('get_online_groups', {
    group_ids: groupIds,
  }).setHeader('Authorization', 'Bearer ' + token).abortSignal(signal));
  if (!Array.isArray(result) || result.some(id => typeof id !== 'string')) throw new Error('Invalid presence response');
  return result;
}
