import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseMapBounds,
  parseMapCamera,
  parseMapMessage,
  parseTripMapPage,
  parseMapCursor,
  initialMapCamera,
  MAP_CHANNEL,
  sameMapQuery,
} from '../src/features/discovery/map/map-data.ts';
import { createTripMapStore } from '../src/features/discovery/map/map-store.ts';
import { INITIAL_FILTERS } from '../src/features/discovery/filter-trips.ts';
import {
  tripDiscoveryReducer,
  plannedMapFilters,
} from '../src/features/discovery/trip-discovery-state.ts';
const bounds = { south: 48, north: 56, west: 13, east: 25 },
  query = { bounds, zoom: 5 };
const row = {
  areas: [],
  points: [
    {
      key: 'p:4:5',
      count: 12,
      latitude: 54,
      longitude: 18,
      south: 54,
      north: 54,
      west: 18,
      east: 18,
      label: 'Chłapowo',
    },
  ],
  planned_count: 12,
  flexible_count: 0,
  total_count: 13,
  unmapped_count: 1,
  viewport: bounds,
  zoom: 5,
};
test('opening the map locks the type through resets, saved criteria and deferred filter actions; closing unlocks the list', () => {
  const filters = {
    ...INITIAL_FILTERS,
    tripModes: ['flexible'],
    location: 'Pomorskie',
    favoritesOnly: true,
    childAgeBands: ['4–6'],
  };
  const original = structuredClone(filters);
  let state = tripDiscoveryReducer(
    { filters, mapOpen: false },
    { type: 'open-map' },
  );
  assert.equal(state.mapOpen, true);
  assert.deepEqual(state.filters, { ...filters, tripModes: ['planned'] });
  state = tripDiscoveryReducer(state, {
    type: 'filters',
    value: INITIAL_FILTERS,
  });
  assert.deepEqual(state.filters.tripModes, ['planned']);
  state = tripDiscoveryReducer(state, { type: 'filters', value: filters });
  assert.equal(state.filters.location, 'Pomorskie');
  assert.deepEqual(state.filters.tripModes, ['planned']);
  state = tripDiscoveryReducer(state, {
    type: 'filters',
    value: (current) => ({
      ...current,
      tripModes: ['flexible'],
      location: 'Mazury',
    }),
  });
  assert.deepEqual(state.filters.tripModes, ['planned']);
  assert.equal(state.filters.location, 'Mazury');
  state = tripDiscoveryReducer(state, { type: 'close-map' });
  assert.equal(state.mapOpen, false);
  assert.deepEqual(state.filters.tripModes, ['planned']);
  state = tripDiscoveryReducer(state, { type: 'filters', value: filters });
  assert.deepEqual(state.filters.tripModes, ['flexible']);
  assert.deepEqual(filters, original);
  const planned = plannedMapFilters(INITIAL_FILTERS);
  assert.equal(
    tripDiscoveryReducer(
      { filters: planned, mapOpen: false },
      { type: 'open-map' },
    ).filters,
    planned,
  );
});

test('map responses preserve all counts and reject invalid coordinates or misleading point totals', () => {
  const page = parseTripMapPage(row);
  assert.equal(page.points[0].count, 12);
  assert.equal(page.totalCount, 13);
  for (const value of [
    null,
    { ...bounds, east: 181 },
    { ...bounds, north: 47 },
    { ...bounds, south: '48' },
  ])
    assert.throws(() => parseMapBounds(value));
  assert.throws(() => parseMapCamera({ latitude: 90, longitude: 19, zoom: 5 }));
  for (const value of [
    { ...row, planned_count: 11 },
    { ...row, flexible_count: 1 },
    { ...row, areas: [{}] },
    { ...row, points: [{ ...row.points[0], key: 'a:4:5' }] },
    { ...row, total_count: 1 },
    { ...row, points: [...row.points, ...row.points] },
    { ...row, points: [{ ...row.points[0], latitude: NaN }] },
    { ...row, zoom: 19 },
  ])
    assert.throws(() => parseTripMapPage(value));
  assert.throws(() =>
    parseMapCursor({
      version: 1,
      id: '../../settings',
      query_key: 'x',
      published_at: 'bad',
    }),
  );
});
test('the bridge only accepts bounded camera messages, known selections and attribution destinations', () => {
  assert.equal(
    parseMapMessage({ channel: MAP_CHANNEL, type: 'select', key: 'a:4:5' }),
    null,
  );
  assert.deepEqual(
    parseMapMessage({
      channel: MAP_CHANNEL,
      type: 'viewport',
      camera: { latitude: 52, longitude: 19, zoom: 5 },
      bounds,
      reason: 'pan',
    }),
    {
      type: 'viewport',
      camera: { latitude: 52, longitude: 19, zoom: 5 },
      query,
      reason: 'pan',
    },
  );
  assert.equal(
    parseMapMessage({
      channel: MAP_CHANNEL,
      type: 'select',
      key: 'trip:../../settings',
    }),
    null,
  );
  assert.equal(
    parseMapMessage({
      channel: MAP_CHANNEL,
      type: 'attribution',
      url: 'https://evil.example',
    }),
    null,
  );
  assert.equal(parseMapMessage({ channel: 'other', type: 'ready' }), null);
  assert.equal(
    parseMapMessage({
      channel: MAP_CHANNEL,
      type: 'viewport',
      bounds,
      camera: { latitude: 52, longitude: 19, zoom: 5 },
      reason: 'automatic-search',
    }),
    null,
  );
});
test('camera memory survives a list toggle, and an explicit place change recenters without persisting map bounds as filters', () => {
  const memory = {
    locationKey: '',
    camera: { latitude: 51, longitude: 16, zoom: 9 },
  };
  assert.deepEqual(initialMapCamera(INITIAL_FILTERS, memory), memory.camera);
  const selected = initialMapCamera(
    { ...INITIAL_FILTERS, locationId: 'pl-locality:4259' },
    memory,
  );
  assert.ok(selected.latitude > 54);
  assert.equal(selected.zoom, 10);
  assert.equal(
    sameMapQuery(query, {
      ...query,
      bounds: { ...bounds, north: 56.00000001 },
    }),
    true,
  );
  assert.equal(sameMapQuery(query, { ...query, zoom: 6 }), false);
  assert.equal(INITIAL_FILTERS.viewport, undefined);
});
test('a late viewport response cannot replace newer search results; retries and disposed accounts stay isolated', async () => {
  let release,
    fail = false,
    calls = 0;
  const a = parseTripMapPage(row),
    other = { bounds: { south: 49, north: 50, west: 20, east: 21 }, zoom: 6 };
  const b = {
    ...a,
    query: other,
    points: [],
    plannedCount: 0,
    flexibleCount: 0,
  };
  const store = createTripMapStore(async (q) => {
    calls++;
    if (calls === 1)
      return new Promise((resolve) => {
        release = resolve;
      });
    if (fail) throw Error('Offline');
    return b;
  });
  const old = store.load(query);
  await Promise.resolve();
  await store.load(other);
  release(a);
  await old;
  assert.equal(store.getSnapshot().data.query, other);
  fail = true;
  await store.load(query);
  assert.equal(store.getSnapshot().status, 'error');
  assert.equal(store.getSnapshot().data, null);
  fail = false;
  await store.retry();
  assert.equal(store.getSnapshot().status, 'ready');
  let delayed;
  const pending = createTripMapStore(
    () =>
      new Promise((resolve) => {
        delayed = resolve;
      }),
  );
  const request = pending.load(query);
  await Promise.resolve();
  pending.stop();
  delayed(a);
  await request;
  assert.equal(pending.getSnapshot().data, null);
  assert.equal(pending.getSnapshot().loading, false);
});
