// Test transport for independent handlers sharing the same database RPCs.
export function cacheFixture(serverKey: string) {
  const components = new Map<string, unknown>(), geometry = new Map<string, unknown>(), searches = new Map<string, unknown>();
  const leases = new Map<string, {id: string; failed: boolean}>();
  return {components, geometry, searches, leases, handle(url: string, init?: RequestInit): Response | null {
    const name = url.split('/rpc/')[1];
    if (!['get_weather_component', 'get_google_place_geometry', 'get_geoapify_search_cache', 'claim_geoapify_provider_request', 'claim_api_cache_refresh',
      'release_api_cache_refresh', 'commit_api_cache_refresh'].includes(name)) return null;
    if (new Headers(init?.headers).get('apikey') !== serverKey) throw Error('Cache must use service credentials');
    const data = JSON.parse(String(init?.body)), key = data.cache_key;
    if (name === 'get_geoapify_search_cache') return Response.json(searches.get(key) ?? null);
    if (name === 'claim_geoapify_provider_request') return Response.json(true);
    if (name === 'get_weather_component') return Response.json(components.get(data.component + ':' + key) ?? null);
    if (name === 'get_google_place_geometry') return Response.json(geometry.get(data.place_id) ?? null);
    if (name === 'claim_api_cache_refresh') {
      const held = leases.get(key);
      if (held) return Response.json({state: held.failed ? 'cooldown' : 'busy'});
      leases.set(key, {id: data.refresh_id, failed: false}); return Response.json({state: 'acquired'});
    }
    if (leases.get(key)?.id !== data.refresh_id) return Response.json(name === 'commit_api_cache_refresh' ? false : null);
    if (name === 'release_api_cache_refresh') {
      if (data.failed) leases.set(key, {id: data.refresh_id, failed: true}); else leases.delete(key);
      return Response.json(null);
    }
    if (key.startsWith('geoapify:autocomplete:')) searches.set(key, data.payload);
    else if (key.startsWith('places:geometry:')) geometry.set(key.slice(16), data.payload);
    else components.set(key.slice(8), data.payload);
    leases.delete(key); return Response.json(true);
  }};
}
