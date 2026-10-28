import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
test('dates, mapping and importing search do not parse the locality dictionary; first search loads it once', async () => {
  const require = createRequire(import.meta.url),
    path = require.resolve('../src/data/locations/polish-localities.json');
  await import('../src/lib/calendar-date.ts');
  await import('../src/features/trips/trip-mapper.ts');
  const { findTripLocation, searchTripLocations } = await import(
    '../src/features/trips/trip-locations.ts'
  );
  assert.equal(require.cache[path], undefined);
  assert.equal(findTripLocation(undefined), undefined);
  assert.equal(require.cache[path], undefined);
  assert.ok(searchTripLocations('Chłapowo').length);
  const first = require.cache[path];
  assert.ok(first);
  searchTripLocations('Gdańsk');
  assert.equal(require.cache[path], first);
});
