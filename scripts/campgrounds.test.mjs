import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { compactCampgrounds } from './campground-data.mjs';
import { searchCampgrounds, campgroundDistanceKm, MAX_CAMPGROUND_SUGGESTIONS } from '../src/features/trips/campgrounds.ts';
import { newTripForm, selectTripCampground, validateTripForm } from '../src/features/trips/own-trips-state.ts';
import { tripToPayload } from '../src/features/trips/trip-mapper.ts';
import { MY_GROUP } from '../src/data/mocks/travel.ts';

const DEMO_PROFILE = { group: MY_GROUP };

const snapshot = JSON.parse(readFileSync(new URL('../src/data/campgrounds/polish-campgrounds.json', import.meta.url)));
const metadata = JSON.parse(readFileSync(new URL('../src/data/campgrounds/polish-campgrounds-source.json', import.meta.url)));
const source = elements => ({ osm3s: { timestamp_osm_base: '2026-11-07T12:00:00Z' }, elements });
const element = (id, tags, patch = {}) => ({ type: 'node', id, lat: 52, lon: 19, tags: { name: 'Kemping', tourism: 'camp_site', ...tags }, ...patch });

test('the named Polish OSM snapshot has bounded fields, unique stable IDs and a traceable licence', () => {
  assert.equal(snapshot.length, metadata.count);
  assert.ok(snapshot.length > 500);
  assert.equal(snapshot.filter(row => row[2]).length, metadata.withAddress);
  assert.equal(new Set(snapshot.map(row => row[0])).size, snapshot.length);
  assert.equal(metadata.license, 'ODbL-1.0');
  assert.match(metadata.sourceSha256, /^[a-f0-9]{64}$/);
  for (const [id, name, address, locality, latitude, longitude] of snapshot) {
    assert.match(id, /^(node|way|relation):\d+$/);
    assert.ok(name.length > 0 && name.length <= 120);
    assert.ok(address.length <= 200 && locality.length <= 100);
    assert.ok(latitude >= -85 && latitude <= 85 && longitude >= -180 && longitude <= 180);
  }
});

test('import uses OSM address tags and never manufactures a street from a city alone', () => {
  const rows = compactCampgrounds(source([
    element(1, { 'addr:street': 'Leśna', 'addr:housenumber': '7', 'addr:postcode': '84-120', 'addr:city': 'Chłapowo' }),
    element(2, { 'addr:city': 'Warszawa', 'addr:postcode': '00-001' }),
    element(3, { 'addr:place': 'Orzechowo', 'addr:housenumber': '27' }, { type: 'way', lat: undefined, lon: undefined, center: { lat: 54, lon: 18 } }),
    element(4, { access: 'private' }), element(5, { disused: 'yes' }),
    element(6, { name: '' }), element(7, { tourism: 'hotel' }),
  ]));
  assert.equal(rows.length, 3);
  assert.equal(rows[0][2], 'Leśna 7, 84-120 Chłapowo');
  assert.equal(rows[1][2], '');
  assert.equal(rows[1][3], 'Warszawa');
  assert.equal(rows[2][2], 'Orzechowo 27');
  assert.throws(() => compactCampgrounds({ ...source([]), remark: 'timeout' }));
  assert.throws(() => compactCampgrounds(source([element(1, {}, { lat: 100 })])));
  assert.throws(() => compactCampgrounds(source([element(1, {}), element(1, {})])));
});

test('search accepts Polish spelling and partial names, stays bounded and sorts nearby equal matches first', () => {
  assert.deepEqual(searchCampgrounds('w'), []);
  assert.deepEqual(searchCampgrounds('NieistniejącyKempingXYZ123'), []);
  assert.deepEqual(searchCampgrounds('Łeba'), searchCampgrounds('leba'));
  assert.equal(searchCampgrounds('  CAMPING MORSKI ')[0].name, 'Camping Morski');
  assert.equal(searchCampgrounds('morski ustka')[0].address, 'Armii Krajowej 4, 76-270 Ustka');
  assert.ok(searchCampgrounds('camping').length <= MAX_CAMPGROUND_SUGGESTIONS);
  const near = { latitude: 53.961628, longitude: 23.310789 };
  const biwaks = searchCampgrounds('biwak', near);
  assert.equal(biwaks[0].latitude, near.latitude);
  assert.equal(campgroundDistanceKm(biwaks[0], near), 0);
});

test('a selected address is copied; a choice without an address clears the old one; free text stays valid', () => {
  const base = { ...newTripForm(DEMO_PROFILE), startDate: '2099-05-21', endDate: '2099-05-24',
    locationId: 'pl-locality:4259', description: 'Spokojny wypoczynek nad morzem i wspólne wieczory.', campgroundAddress: 'Stary adres 9' };
  const selected = selectTripCampground(base, searchCampgrounds('Camping Morski')[0]);
  assert.equal(selected.campgroundAddress, 'Armii Krajowej 4, 76-270 Ustka');
  assert.equal(base.campgroundAddress, 'Stary adres 9');
  const withoutAddress = selectTripCampground(selected, searchCampgrounds('wok')[0]);
  assert.equal(withoutAddress.campgroundAddress, '');
  const manual = { ...base, campgroundName: 'Mój własny kemping poza katalogiem', campgroundAddress: 'Własna 12' };
  assert.deepEqual(validateTripForm(manual), []);
  const payload = tripToPayload(manual);
  assert.equal(payload.campground_name, manual.campgroundName);
  assert.equal(payload.campground_address, manual.campgroundAddress);
  assert.deepEqual(validateTripForm({ ...manual, campgroundName: '', campgroundAddress: '' }), []);
});
