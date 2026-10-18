import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEMO_PROPOSALS,
  DEMO_DATE_RANGES,
  MY_TRIPS,
} from '../src/data/mocks/travel.ts';
import {
  INITIAL_FILTERS,
  filterProposals,
  sharedNights,
  formatTripDates,
} from '../src/features/discovery/filter-trips.ts';

test('default filters show all six demo proposals in stable order', () => {
  assert.deepEqual(
    filterProposals(DEMO_PROPOSALS, INITIAL_FILTERS),
    DEMO_PROPOSALS,
  );
});

test('same checkout/check-in date is not a shared night', () => {
  const first = { startDate: '2027-05-21', endDate: '2027-05-24' };
  const second = { startDate: '2027-05-24', endDate: '2027-05-27' };
  assert.equal(sharedNights(first, second), 0);
  assert.equal(
    sharedNights(first, { startDate: '2027-05-22', endDate: '2027-05-25' }),
    2,
  );
  const proposal = DEMO_PROPOSALS[0];
  assert.equal(
    filterProposals([proposal], INITIAL_FILTERS, {
      startDate: proposal.trip.endDate,
      endDate: '2027-05-30',
    }).length,
    0,
  );
});

test('nights use calendar days across daylight saving changes', () => {
  const range = { startDate: '2027-03-27', endDate: '2027-03-29' };
  assert.equal(sharedNights(range, range), 2);
});

test('date, destination and child filters combine with AND', () => {
  const results = filterProposals(
    DEMO_PROPOSALS,
    { ...INITIAL_FILTERS, location: 'Pomorze', childAgeBands: ['7–9'] },
    DEMO_DATE_RANGES[0],
  );
  assert.deepEqual(
    results.map(({ trip }) => trip.id),
    ['demo-coast'],
  );
  assert.notEqual(results[0].group.homeLocation, 'Okolice Gdańska');
});

test('multiple age bands use OR and exclude groups without matching ages', () => {
  const results = filterProposals(DEMO_PROPOSALS, {
    ...INITIAL_FILTERS,
    childAgeBands: ['0–3', '13–17'],
  });
  assert.deepEqual(
    results.map(({ trip }) => trip.id),
    ['demo-forest', 'demo-bieszczady'],
  );
});

test('search handles Polish diacritics, uppercase and outer whitespace', () => {
  const results = filterProposals(DEMO_PROPOSALS, {
    ...INITIAL_FILTERS,
    location: '  CHLAPOWO  ',
  });
  assert.deepEqual(
    results.map(({ trip }) => trip.id),
    ['demo-coast'],
  );
  assert.equal(
    filterProposals(DEMO_PROPOSALS, { ...INITIAL_FILTERS, location: 'leba' })[0]
      .trip.id,
    'demo-friends',
  );
});

test('both discovery modes include fixed plans and flexible areas', () => {
  for (const mode of ['planned', 'flexible']) {
    const results = filterProposals(DEMO_PROPOSALS, {
      ...INITIAL_FILTERS,
      mode,
    });
    assert.ok(results.some(({ trip }) => trip.mode === 'planned'));
    assert.ok(results.some(({ trip }) => trip.mode === 'flexible'));
  }
});

test('search uses the destination or travel area, never the home location', () => {
  assert.equal(
    filterProposals(DEMO_PROPOSALS, { ...INITIAL_FILTERS, location: 'Krakowa' })
      .length,
    0,
  );
  assert.equal(
    filterProposals(DEMO_PROPOSALS, {
      ...INITIAL_FILTERS,
      location: 'Sudety',
    })[0].trip.mode,
    'flexible',
  );
});

test('empty results and reset do not mutate the source data', () => {
  const snapshot = JSON.stringify(DEMO_PROPOSALS);
  assert.equal(
    filterProposals(DEMO_PROPOSALS, {
      ...INITIAL_FILTERS,
      location: 'Atlantyda',
    }).length,
    0,
  );
  assert.equal(filterProposals(DEMO_PROPOSALS, INITIAL_FILTERS).length, 6);
  assert.equal(JSON.stringify(DEMO_PROPOSALS), snapshot);
});

test('demo dates and their formatting are independent of device timezone', () => {
  assert.match(formatTripDates(MY_TRIPS[0]), /21.*24.*2027/);
  assert.ok(
    [...DEMO_PROPOSALS.map(({ trip }) => trip), ...MY_TRIPS].every(
      (trip) => sharedNights(trip, trip) > 0,
    ),
  );
});
