import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEMO_TRIPS, MY_GROUP, MY_TRIPS } from '../src/data/mocks/travel.ts';
import {
  areaViewport,
  getTripMapTarget,
  googleMapsEmbedUrl,
  googleMapsSearchUrl,
} from '../src/features/trips/trip-map-data.ts';
import {
  changeTripLocation,
  changeTripMode,
  createOwnTripsState,
  newTripForm,
  ownTripsReducer,
  toTripForm,
  tripFromForm,
  validateTripForm,
} from '../src/features/trips/own-trips-state.ts';

const coast = DEMO_TRIPS.find((trip) => trip.id === 'demo-coast');
const profile = {
  group: MY_GROUP,
  matching: { groupKinds: ['family'], childAgeBands: ['4–6', '7–9'] },
};

test('a campground/address search includes the locality, administrative context and country', () => {
  const target = getTripMapTarget({
    ...coast,
    campgroundName: '  Pod Sosnami & Wodą  ',
    campgroundAddress: '  ul. Przykładowa 12  ',
  });
  assert.equal(target.kind, 'place');
  assert.equal(target.area, undefined);
  assert.equal(target.label, 'Pod Sosnami & Wodą · ul. Przykładowa 12');
  assert.match(
    target.query,
    /Chłapowo.*Władysławowo.*pucki.*pomorskie.*Polska/u,
  );
  for (const address of [
    googleMapsEmbedUrl(target, 350),
    googleMapsSearchUrl(target),
  ]) {
    const url = new URL(address);
    assert.equal(
      url.searchParams.get(url.searchParams.has('q') ? 'q' : 'query'),
      target.query,
    );
    assert.equal(url.searchParams.has('ll'), false);
  }
});

test('a street address works without a campground name; whitespace never creates a point', () => {
  assert.equal(
    getTripMapTarget({
      ...coast,
      campgroundName: '',
      campgroundAddress: 'ul. Polna 7',
    }).kind,
    'place',
  );
  const target = getTripMapTarget({
    ...coast,
    campgroundName: ' ',
    campgroundAddress: '  ',
  });
  assert.equal(target.kind, 'area');
  assert.equal(target.area.radiusMeters, 3000);
  assert.ok(target.area.latitude > 54 && target.area.latitude < 55);
  const embed = new URL(googleMapsEmbedUrl(target, 280));
  assert.equal(
    embed.searchParams.has('q'),
    false,
    'no Google pin at the locality centre',
  );
  assert.equal(
    embed.searchParams.get('ll'),
    target.area.latitude + ',' + target.area.longitude,
  );
  const external = new URL(googleMapsSearchUrl(target));
  assert.equal(external.searchParams.get('map_action'), 'map');
  assert.equal(external.searchParams.has('query'), false);
});

test('all existing listings get a map and natural regions get an area rather than a same-name village', () => {
  for (const trip of [...DEMO_TRIPS, ...MY_TRIPS]) {
    const target = getTripMapTarget(trip);
    assert.ok(target?.query);
    if (target.kind === 'area') {
      assert.ok(target.area?.radiusMeters >= 3000, trip.id);
      assert.equal(
        new URL(googleMapsEmbedUrl(target, 350)).searchParams.has('q'),
        false,
      );
    }
  }
  const kaszuby = getTripMapTarget(
    MY_TRIPS.find((trip) => trip.mode === 'flexible'),
  );
  assert.ok(kaszuby.area.latitude > 54 && kaszuby.area.latitude < 55);
  assert.ok(kaszuby.area.radiusMeters > 40000);
});

test('flexible trips ignore any legacy campground name/address', () => {
  const trip = DEMO_TRIPS.find((trip) => trip.mode === 'flexible');
  const target = getTripMapTarget({
    ...trip,
    campgroundName: 'Hidden campground',
    campgroundAddress: 'Hidden address',
  });
  assert.equal(target.kind, 'area');
  assert.doesNotMatch(target.query, /Hidden/);
});

test('regions and countries use broad areas derived from location data, including Slovenia', () => {
  for (const [locationId, name] of [
    ['pl-region:pomorskie', 'Pomorskie'],
    ['country:PL', 'Polska'],
    ['demo-location-slowenia', 'Słowenia'],
  ]) {
    const target = getTripMapTarget({
      ...MY_TRIPS[1],
      travelArea: { name, region: '', locationId },
    });
    assert.equal(target.kind, 'area');
    assert.ok(Number.isFinite(target.area.latitude));
    assert.ok(target.area.radiusMeters > 50000);
    assert.ok(target.area.radiusMeters < 800000);
    assert.ok(target.area.latitude > 45 && target.area.latitude < 56);
    assert.ok(target.area.longitude > 13 && target.area.longitude < 25);
  }
});

test('area circles fit mobile/tablet map previews and correspond to the displayed Google zoom', () => {
  for (const radiusMeters of [3000, 55000, 150000, 600000]) {
    for (const width of [240, 300, 390, 700]) {
      const area = { latitude: 54.8, longitude: 18.3, radiusMeters };
      const { zoom, diameter } = areaViewport(area, width);
      assert.ok(diameter > 0 && diameter <= Math.min(width, 260) * 0.7);
      const target = { kind: 'area', label: 'Okolica', query: 'Okolica', area };
      assert.equal(
        Number(
          new URL(googleMapsEmbedUrl(target, width)).searchParams.get('z'),
        ),
        zoom,
      );
    }
  }
});

test('an empty draft does not pretend to have a location', () => {
  assert.equal(
    getTripMapTarget({ ...coast, destination: { name: ' ', region: '' } }),
    undefined,
  );
});

test('campground addresses survive saving, editing and duplication, and are trimmed', () => {
  const form = {
    ...newTripForm(profile),
    locationId: 'pl-locality:4259',
    startDate: '2027-05-21',
    endDate: '2027-05-24',
    description: 'Spokojny weekend na kempingu nad morzem.',
    travelModes: ['Przyczepa'],
    campgroundAddress: '  ul. Polna 7  ',
  };
  let state = createOwnTripsState([]);
  state = ownTripsReducer(state, {
    type: 'save',
    form,
    groupId: MY_GROUP.id,
    draft: false,
    today: '2026-10-23',
  });
  assert.equal(state.trips.length, 1);
  assert.equal(state.trips[0].campgroundAddress, 'ul. Polna 7');
  assert.equal(toTripForm(state.trips[0]).campgroundAddress, 'ul. Polna 7');
  state = ownTripsReducer(state, { type: 'duplicate', id: state.trips[0].id });
  assert.equal(state.trips[1].campgroundAddress, 'ul. Polna 7');
  const edited = {
    ...toTripForm(state.trips[0]),
    campgroundAddress: 'ul. Nowa 12',
  };
  state = ownTripsReducer(state, {
    type: 'save',
    form: edited,
    id: state.trips[0].id,
    groupId: MY_GROUP.id,
    draft: false,
    today: '2026-10-23',
  });
  assert.equal(state.trips[0].campgroundAddress, 'ul. Nowa 12');
  assert.ok(
    validateTripForm(
      { ...form, campgroundAddress: 'a'.repeat(201) },
      2,
    ).includes('Skróć adres kempingu do 200 znaków.'),
  );
});

test('changing locality/mode clears a stale address; flexible drafts cannot retain it', () => {
  const form = {
    ...newTripForm(profile),
    locationId: 'pl-locality:4259',
    campgroundAddress: 'ul. Polna 7',
  };
  assert.equal(
    changeTripLocation(form, form.locationId).campgroundAddress,
    form.campgroundAddress,
  );
  assert.equal(
    changeTripLocation(form, 'pl-locality:8457').campgroundAddress,
    '',
  );
  assert.equal(changeTripMode(form, 'flexible').campgroundAddress, '');
  const trip = tripFromForm(
    { ...form, mode: 'flexible' },
    'test',
    MY_GROUP.id,
    'draft',
  );
  assert.equal(trip.campgroundAddress, undefined);
  assert.equal(
    toTripForm({ ...trip, campgroundAddress: 'stale' }).campgroundAddress,
    '',
  );
});
