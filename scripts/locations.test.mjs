import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compactLocalities } from './locality-data.mjs';
import {
  POLISH_LOCALITIES,
  LOCALITY_SOURCE,
} from '../src/data/locations/polish-localities.ts';
import {
  findTripLocation,
  locationContext,
  MAX_LOCATION_SUGGESTIONS,
  searchTripLocations,
} from '../src/features/trips/trip-locations.ts';
import {
  createOwnTripsState,
  ownTripsReducer,
  toTripForm,
} from '../src/features/trips/own-trips-state.ts';
import { MY_GROUP, MY_TRIPS } from '../src/data/mocks/travel.ts';

test('the pinned snapshot contains all 43989 unique source ids and sixteen provinces', () => {
  assert.equal(LOCALITY_SOURCE.count, 43989);
  assert.equal(LOCALITY_SOURCE.asOf, '2021-05-11');
  assert.equal(POLISH_LOCALITIES.places.length, LOCALITY_SOURCE.count);
  assert.equal(
    new Set(POLISH_LOCALITIES.places.map((row) => row[0])).size,
    LOCALITY_SOURCE.count,
  );
  assert.equal(POLISH_LOCALITIES.provinces.length, 16);
  for (const row of POLISH_LOCALITIES.places) {
    assert.equal(row.length, 9);
    assert.ok(POLISH_LOCALITIES.provinces[row[3]]);
    assert.ok(POLISH_LOCALITIES.districts[row[4]]);
    assert.ok(POLISH_LOCALITIES.communes[row[5]]);
    assert.ok(row[2] === 0 || row[2] === 1);
  }
});

test('identical names are distinct places with county and commune context', () => {
  const places = searchTripLocations('chlapowo');
  assert.equal(places.length, 2);
  assert.equal(new Set(places.map((item) => item.id)).size, 2);
  assert.match(locationContext(places[0]), /Władysławowo.*pucki.*pomorskie/u);
  assert.match(locationContext(places[1]), /Dominowo.*średzki.*wielkopolskie/u);
  assert.equal(searchTripLocations('chlapowo pucki')[0].id, 'pl-locality:4259');
  assert.equal(
    searchTripLocations('chlapowo dominowo')[0].id,
    'pl-locality:4258',
  );
  assert.deepEqual(
    searchTripLocations('nowa wies wschowski').map((item) => item.commune),
    ['Wschowa'],
  );
});

test('exact names precede loose context matches and queries stay bounded', () => {
  assert.equal(searchTripLocations('GDANSK')[0].id, 'pl-locality:8457');
  assert.equal(searchTripLocations('łódź')[0].name, 'Łódź');
  assert.equal(searchTripLocations('lodz')[0].name, 'Łódź');
  assert.equal(searchTripLocations('Pomorskie')[0].id, 'pl-region:pomorskie');
  assert.equal(searchTripLocations('Pomorze')[0].name, 'Pomorze');
  for (const query of ['ka', 'nowa wies', 'pomorskie']) {
    const items = searchTripLocations(query);
    assert.equal(items.length, MAX_LOCATION_SUGGESTIONS);
    assert.equal(new Set(items.map((item) => item.id)).size, items.length);
  }
  assert.deepEqual(searchTripLocations('x'), []);
  assert.deepEqual(searchTripLocations('NieistniejącaMiejscowośćXYZ'), []);
});

test('legacy ids resolve to real source locations and explicit demo regions stay marked', () => {
  assert.equal(
    findTripLocation('demo-location-chlapowo').id,
    'pl-locality:4259',
  );
  assert.equal(
    findTripLocation('demo-location-gdansk').source,
    'polish-localities',
  );
  assert.equal(findTripLocation('demo-location-polska').id, 'country:PL');
  assert.equal(findTripLocation('demo-location-kaszuby').source, 'demo');
  assert.equal(searchTripLocations('Słowenia')[0].source, 'demo');
  assert.equal(findTripLocation('pl-locality:999999999'), undefined);
  assert.equal(findTripLocation('constructor'), undefined);
  assert.equal(findTripLocation('__proto__'), undefined);
});

test('publication and editing retain a selected village id even for names repeated within a province', () => {
  const places = searchTripLocations('nowa wies boleslawiecki').filter(
    (item) => item.name === 'Nowa Wieś',
  );
  assert.equal(places.length, 2);
  assert.notEqual(places[0].commune, places[1].commune);
  let state = createOwnTripsState(
    MY_TRIPS.map((trip) => ({
      ...trip,
      status: 'published',
      visibility: 'public',
      travelModes: MY_GROUP.travelModes,
      matching: { groupKinds: ['family'], childAgeBands: [] },
    })),
  );
  const form = toTripForm(state.trips[0]);
  for (const location of places) {
    state = ownTripsReducer(state, {
      type: 'save',
      form: { ...form, locationId: location.id },
      id: state.trips[0].id,
      groupId: state.trips[0].groupId,
      draft: false,
      today: '2026-10-19',
    });
    assert.equal(toTripForm(state.trips[0]).locationId, location.id);
    assert.equal(
      findTripLocation(toTripForm(state.trips[0]).locationId).commune,
      location.commune,
    );
  }
});

test('dictionary encoding preserves source identifiers, Polish names, coordinates and normalized names', () => {
  const row = {
    Id: '0001',
    Name: 'Łąka',
    Type: 'village',
    Province: 'śląskie',
    District: 'pszczyński',
    Commune: 'Pszczyna-gmina miejsko-wiejska',
    Latitude: 49.95,
    Longitude: 18.79,
  };
  const result = compactLocalities([row]);
  assert.deepEqual(result.places[0], [
    '0001',
    'Łąka',
    0,
    0,
    0,
    0,
    49.95,
    18.79,
    'laka',
  ]);
  assert.deepEqual(result.provinces, ['śląskie']);
  assert.throws(() => compactLocalities([row, row]), /Powtórzony/u);
  assert.throws(
    () => compactLocalities([{ ...row, Type: 'region' }]),
    /Nieprawidłowa/u,
  );
  assert.throws(
    () => compactLocalities([{ ...row, Latitude: NaN }]),
    /Nieprawidłowa/u,
  );
});
