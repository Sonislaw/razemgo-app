import {sharedApiCache, type CacheClient} from './shared-api-cache.ts';

function fixture() {
  const cache = new Map<string, unknown>(), leases = new Map<string, {id: string; cooldown: boolean}>();
  const admin = {rpc(name: string, args: Record<string, unknown>) {
    const key = String(args.cache_key), id = String(args.refresh_id), held = leases.get(key);
    if (name === 'claim_api_cache_refresh') {
      if (held) return Promise.resolve({data: {state: held.cooldown ? 'cooldown' : 'busy'}, error: null});
      leases.set(key, {id, cooldown: false}); return Promise.resolve({data: {state: 'acquired'}, error: null});
    }
    if (name === 'commit_api_cache_refresh') {
      if (held?.id !== id) return Promise.resolve({data: false, error: null});
      cache.set(key, args.payload); leases.delete(key); return Promise.resolve({data: true, error: null});
    }
    if (name === 'release_api_cache_refresh') {
      if (held?.id === id) {if (args.failed) held.cooldown = true; else leases.delete(key);}
      return Promise.resolve({data: null, error: null});
    }
    throw Error('Unexpected cache RPC');
  }} as unknown as CacheClient;
  return {admin, cache, leases};
}
const assert = (value: unknown) => {if (!value) throw Error('Shared refresh assertion failed');};
Deno.test('20 independent workers share one provider request and one committed response', async () => {
  const {admin, cache} = fixture(); let calls = 0;
  const workers = Array.from({length: 20}, () => sharedApiCache(admin, 'weather:forecast:point', async () => cache.get('weather:forecast:point') ?? null,
    async () => {calls++; await new Promise(resolve => setTimeout(resolve, 25)); return {days: [1]};}));
  const results = await Promise.all(workers);
  assert(calls === 1 && results.length === 20 && results.every(value => JSON.stringify(value) === '{"days":[1]}'));
});
Deno.test('a failed leader does not trigger 19 provider retries in its followers', async () => {
  const {admin, cache} = fixture(); let calls = 0;
  const results = await Promise.allSettled(Array.from({length: 20}, () => sharedApiCache(admin, 'places:geometry:point', async () => cache.get('places:geometry:point') ?? null,
    async () => {calls++; await new Promise(resolve => setTimeout(resolve, 25)); throw Error('Provider down');})));
  assert(calls === 1 && results.every(value => value.status === 'rejected'));
});
Deno.test('a crashed leader has bounded waiting and followers never return stale data', async () => {
  const {admin, leases} = fixture(); leases.set('weather:alerts:point', {id: 'other', cooldown: false});
  let clock = 0, calls = 0;
  const result = await Promise.allSettled([sharedApiCache(admin, 'weather:alerts:point', async () => null, async () => {calls++; return {};},
    {now: () => clock, wait: async ms => {clock += ms;}, waitLimit: 200})]);
  assert(result[0].status === 'rejected' && calls === 0);
});
Deno.test('a late worker whose commit was fenced out returns the new owner response instead of its old data', async () => {
  const {admin, cache} = fixture(), key = 'weather:forecast:late';
  const original = admin.rpc.bind(admin);
  const fenced = {rpc(name: string, args: Record<string, unknown>) {
    if (name === 'commit_api_cache_refresh') {
      cache.set(key, {version: 'new-owner'});
      return Promise.resolve({data: false, error: null});
    }
    return original(name, args);
  }} as unknown as CacheClient;
  const result = await sharedApiCache(fenced, key, async () => cache.get(key) ?? null, async () => ({version: 'old-owner'}), {wait: async () => {}});
  assert(JSON.stringify(result) === '{"version":"new-owner"}');
});
