import { createHash } from 'node:crypto';
import { filterProposals } from '../../src/features/discovery/filter-trips.ts';
import { tripCriteriaFromPayload } from '../../src/features/saved-filters/saved-filter-data.ts';
import { proposalFromRow } from '../../src/features/trips/trip-mapper.ts';
import { findTripLocation } from '../../src/features/trips/trip-locations.ts';
import { getLocationMapArea } from '../../src/features/trips/trip-map-data.ts';
const y = (lat) =>
  (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;
const cell = (p, step) =>
  'p:' +
  Math.floor((p.longitude + 180) / 360 / step) +
  ':' +
  Math.floor(y(p.latitude) / step);
export function mockMapResponse(
  endpoint,
  body,
  store,
  viewer,
  crewForGroup,
  favorites = new Set(),
) {
  const filters = tripCriteriaFromPayload({
      ...body.filters,
      trip_modes: ['planned'],
    }),
    bounds = body.viewport,
    zoom = body.map_zoom;
  const proposals = [...store.trips.values()]
    .filter(
      (t) =>
        t.mode === 'planned' &&
        t.group_id !== viewer &&
        t.status === 'published' &&
        t.visibility === 'public' &&
        t.end_date > '2026-10-24' &&
        !store.blocks.has(t.group_id) &&
        !store.hiddenTripIds?.has(t.id),
    )
    .map((t) => proposalFromRow({ trip: t, crew: crewForGroup(t.group_id) }));
  const rows = filterProposals(proposals, filters, undefined, favorites).map(
    (p) => ({
      ...p,
      raw: store.trips.get(p.trip.id),
      area: getLocationMapArea(findTripLocation(p.trip.destination.locationId)),
    }),
  );
  const visible = rows.filter(
    (p) =>
      p.area &&
      p.area.latitude >= bounds.south &&
      p.area.latitude <= bounds.north &&
      p.area.longitude >= bounds.west &&
      p.area.longitude <= bounds.east,
  );
  const step = Math.max(
    64 / (256 * 2 ** zoom),
    (bounds.east - bounds.west) / 360 / 16,
    (y(bounds.south) - y(bounds.north)) / 16,
  );
  if (endpoint === 'search_trip_map') {
    const clusters = new Map();
    for (const p of visible) {
      const key = cell(p.area, step),
        items = clusters.get(key) ?? [];
      items.push(p);
      clusters.set(key, items);
    }
    const points = [...clusters].map(([key, items]) => ({
      key,
      count: items.length,
      latitude: items.reduce((n, p) => n + p.area.latitude, 0) / items.length,
      longitude: items.reduce((n, p) => n + p.area.longitude, 0) / items.length,
      south: Math.min(...items.map((p) => p.area.latitude)),
      north: Math.max(...items.map((p) => p.area.latitude)),
      west: Math.min(...items.map((p) => p.area.longitude)),
      east: Math.max(...items.map((p) => p.area.longitude)),
      label:
        items.length === 1
          ? items[0].raw.location_name
          : 'Wyjazdy: ' + items.length,
    }));
    return {
      points,
      areas: [],
      planned_count: visible.length,
      flexible_count: 0,
      total_count: rows.length,
      unmapped_count: rows.filter((p) => !p.area).length,
      viewport: bounds,
      zoom,
    };
  }
  const all = visible
    .filter((p) =>
      body.cluster_key.startsWith('trip:')
        ? p.trip.id === body.cluster_key.slice(5)
        : cell(p.area, step) === body.cluster_key,
    )
    .sort(
      (a, b) =>
        b.raw.published_at.localeCompare(a.raw.published_at) ||
        a.trip.id.localeCompare(b.trip.id),
    );
  const query = createHash('md5')
    .update(
      JSON.stringify([viewer, body.filters, bounds, zoom, body.cluster_key]),
    )
    .digest('hex');
  const after = body.after_cursor,
    offset = after ? all.findIndex((p) => p.trip.id === after.id) + 1 : 0,
    page = all.slice(offset, offset + body.page_size),
    last = page.at(-1);
  return {
    items: page.map((p) => ({
      trip: p.raw,
      crew: crewForGroup(p.trip.groupId),
      map_area: {
        latitude: p.area.latitude,
        longitude: p.area.longitude,
        radius_m: 0,
        bounds: null,
      },
    })),
    total_count: all.length,
    has_more: offset + page.length < all.length,
    cursor: last
      ? {
          id: last.trip.id,
          published_at: last.raw.published_at,
          query_key: query,
          version: 1,
        }
      : null,
  };
}
export async function mockMapTiles(context) {
  await context.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#eef1e7"/><path d="M0 180Q100 100 256 140" stroke="#bfdbe8" stroke-width="25" fill="none"/><path d="M0 0L256 256M-30 80L220 280" stroke="white" stroke-width="6" fill="none"/></svg>',
    }),
  );
}
