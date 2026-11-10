import type {SupabaseClient} from 'npm:@supabase/supabase-js@2.118.0';

export type CacheClient = Pick<SupabaseClient, 'rpc'>;
export async function sharedApiCache<T>(admin: CacheClient, key: string, read: () => Promise<T | null>, load: () => Promise<T>,
  {wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)), now = Date.now, waitLimit = 45000} = {}): Promise<T> {
  const refreshId = crypto.randomUUID(), deadline = now() + waitLimit;
  let delay = 100;
  while (now() < deadline) {
    const cached = await read();
    if (cached !== null) return cached;
    const claimed = await admin.rpc('claim_api_cache_refresh', {cache_key: key, refresh_id: refreshId});
    if (claimed.error) throw Error('Cache coordination unavailable');
    if (claimed.data?.state === 'cooldown') throw Error('Provider refresh temporarily unavailable');
    if (claimed.data?.state === 'acquired') {
      let failed = false;
      try {
        // Another owner may have committed between our first read and claim.
        const updated = await read();
        if (updated !== null) return updated;
        const value = await load();
        const saved = await admin.rpc('commit_api_cache_refresh', {cache_key: key, refresh_id: refreshId, payload: value});
        if (saved.error) throw Error('Cache write unavailable');
        if (saved.data === true) return value;
        // An expired owner must not serve or write its old response.
      } catch (error) {failed = true; throw error;}
      finally {
        // Release is fenced by request ID. A crashed worker also expires in SQL.
        await admin.rpc('release_api_cache_refresh', {cache_key: key, refresh_id: refreshId, failed});
      }
    } else if (claimed.data?.state !== 'busy') throw Error('Invalid cache coordination');
    await wait(delay); delay = Math.min(800, Math.ceil(delay * 1.6));
  }
  throw Error('Cache refresh timed out');
}
