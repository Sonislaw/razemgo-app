import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEMO_PROPOSALS,
  DEMO_DATE_RANGES,
  MY_TRIPS,
  MY_GROUP,
} from '../src/data/mocks/travel.ts';
import {
  INITIAL_FILTERS,
  filterProposals,
  sharedNights,
  formatTripDates,
  getMatchFacts,
  formatSharedNights,
  toggleDiscoveryTripMode,
  updateDiscoveryDate,
  clearDiscoveryDates,
  getDiscoveryDateRangeError,
  resolveDiscoveryRange,
} from '../src/features/discovery/filter-trips.ts';
import { DEMO_COMPATIBILITY_SCORES } from '../src/data/mocks/compatibility.ts';
import { sortDiscoveryProposals } from '../src/features/discovery/sort-proposals.ts';

test('custom dates filter by overlapping stays and combine with other filters', () => {
  const filters = updateDiscoveryDate(
    updateDiscoveryDate(INITIAL_FILTERS, 'startDate', '2027-05-21'),
    'endDate',
    '2027-05-24',
  );
  assert.deepEqual(resolveDiscoveryRange(filters), {
    startDate: '2027-05-21',
    endDate: '2027-05-24',
  });
  assert.deepEqual(
    filterProposals(DEMO_PROPOSALS, filters).map(({ trip }) => trip.id),
    ['demo-coast', 'demo-mountains', 'demo-forest'],
  );
  assert.deepEqual(
    filterProposals(DEMO_PROPOSALS, {
      ...filters,
      location: 'Pomorze',
      childAgeBands: ['7–9'],
    }).map(({ trip }) => trip.id),
    ['demo-coast'],
  );
  const later = {
    ...filters,
    customDateRange: { startDate: '2027-05-25', endDate: '2027-05-26' },
  };
  assert.deepEqual(filterProposals(DEMO_PROPOSALS, later), []);
});

test('date validation rejects incomplete, impossible, equal and reversed ranges', () => {
  assert.equal(getDiscoveryDateRangeError(undefined), undefined);
  for (const customDateRange of [
    { startDate: '2027-05-21', endDate: '' },
    { startDate: '', endDate: '2027-05-24' },
    { startDate: '2027-02-29', endDate: '2027-03-02' },
    { startDate: '2027-05-21', endDate: '2027-05-21' },
    { startDate: '2027-05-24', endDate: '2027-05-21' },
  ]) {
    assert.ok(getDiscoveryDateRangeError(customDateRange));
    const filters = {
      ...INITIAL_FILTERS,
      dateRangeId: 'custom',
      customDateRange,
    };
    assert.equal(resolveDiscoveryRange(filters), undefined);
    assert.deepEqual(filterProposals(DEMO_PROPOSALS, filters), []);
  }
  assert.equal(
    getDiscoveryDateRangeError({
      startDate: '2028-02-29',
      endDate: '2028-03-01',
    }),
    undefined,
  );
});

test('changing dates from an own trip uses an exact custom range without mutating original filters', () => {
  const original = {
    ...INITIAL_FILTERS,
    dateRangeId: 'own-trip',
    sourceTripId: 'my-trip',
    dateFlexibilityDays: 3,
    customDateRange: { startDate: '2027-05-21', endDate: '2027-05-24' },
  };
  const snapshot = JSON.stringify(original);
  const changed = updateDiscoveryDate(original, 'startDate', '2027-05-22');
  assert.equal(changed.dateRangeId, 'custom');
  assert.equal(changed.dateFlexibilityDays, 0);
  assert.equal(changed.sourceTripId, original.sourceTripId);
  assert.deepEqual(changed.customDateRange, {
    startDate: '2027-05-22',
    endDate: '2027-05-24',
  });
  assert.equal(JSON.stringify(original), snapshot);
});

test('clearing dates preserves other filters and removes the date restriction', () => {
  const filtered = updateDiscoveryDate(
    updateDiscoveryDate(
      { ...INITIAL_FILTERS, location: 'Pomorze', childAgeBands: ['4–6'] },
      'startDate',
      '2027-06-01',
    ),
    'endDate',
    '2027-06-03',
  );
  assert.deepEqual(filterProposals(DEMO_PROPOSALS, filtered), []);
  const cleared = clearDiscoveryDates(filtered);
  assert.equal(cleared.dateRangeId, 'all');
  assert.equal(cleared.customDateRange, undefined);
  assert.equal(resolveDiscoveryRange(cleared), undefined);
  assert.equal(cleared.location, 'Pomorze');
  assert.deepEqual(cleared.childAgeBands, ['4–6']);
  assert.deepEqual(
    filterProposals(DEMO_PROPOSALS, cleared).map(({ trip }) => trip.id),
    ['demo-coast', 'demo-forest'],
  );
});

test('compatibility sorting uses the scores displayed on cards, highest first', () => {
  const source = Object.freeze([...DEMO_PROPOSALS]);
  const snapshot = JSON.stringify(source);
  const results = sortDiscoveryProposals(
    source,
    'compatibility',
    DEMO_COMPATIBILITY_SCORES,
  );
  assert.deepEqual(
    results.map(({ trip }) => trip.id),
    [
      'demo-coast',
      'demo-forest',
      'demo-lake',
      'demo-bieszczady',
      'demo-friends',
      'demo-mountains',
    ],
  );
  assert.equal(JSON.stringify(source), snapshot);
});

test('default sorting restores source order after sorting by compatibility', () => {
  sortDiscoveryProposals(
    DEMO_PROPOSALS,
    'compatibility',
    DEMO_COMPATIBILITY_SCORES,
  );
  assert.deepEqual(
    sortDiscoveryProposals(
      DEMO_PROPOSALS,
      'default',
      DEMO_COMPATIBILITY_SCORES,
    ).map(({ trip }) => trip.id),
    [
      'demo-coast',
      'demo-lake',
      'demo-mountains',
      'demo-forest',
      'demo-friends',
      'demo-bieszczady',
    ],
  );
});

test('compatibility sorting keeps ties stable and puts missing scores after zero', () => {
  const scores = { 'demo-coast': 0, 'demo-mountains': 83, 'demo-forest': 83 };
  assert.deepEqual(
    sortDiscoveryProposals(DEMO_PROPOSALS, 'compatibility', scores).map(
      ({ trip }) => trip.id,
    ),
    [
      'demo-mountains',
      'demo-forest',
      'demo-coast',
      'demo-lake',
      'demo-friends',
      'demo-bieszczady',
    ],
  );
});

test('sorting only reorders filtered results and handles empty results', () => {
  const filtered = filterProposals(DEMO_PROPOSALS, {
    ...INITIAL_FILTERS,
    tripModes: ['flexible'],
  });
  assert.deepEqual(
    sortDiscoveryProposals(
      filtered,
      'compatibility',
      DEMO_COMPATIBILITY_SCORES,
    ).map(({ trip }) => trip.id),
    ['demo-forest', 'demo-mountains'],
  );
  assert.deepEqual(
    filtered.map(({ trip }) => trip.id),
    ['demo-mountains', 'demo-forest'],
  );
  assert.deepEqual(
    sortDiscoveryProposals([], 'compatibility', DEMO_COMPATIBILITY_SCORES),
    [],
  );
});

test('both trip types are selected initially and retain stable source order', () => {
  assert.deepEqual(
    filterProposals(DEMO_PROPOSALS, INITIAL_FILTERS).map(({ trip }) => trip.id),
    [
      'demo-coast',
      'demo-lake',
      'demo-mountains',
      'demo-forest',
      'demo-friends',
      'demo-bieszczady',
    ],
  );
});

test('each trip type filters the actual advertised mode', () => {
  assert.deepEqual(
    filterProposals(DEMO_PROPOSALS, {
      ...INITIAL_FILTERS,
      tripModes: ['planned'],
    }).map(({ trip }) => trip.id),
    ['demo-coast', 'demo-lake', 'demo-friends', 'demo-bieszczady'],
  );
  assert.deepEqual(
    filterProposals(DEMO_PROPOSALS, {
      ...INITIAL_FILTERS,
      tripModes: ['flexible'],
    }).map(({ trip }) => trip.id),
    ['demo-mountains', 'demo-forest'],
  );
});

test('trip types combine with dates, location and ages without mutating filters or proposals', () => {
  const snapshot = JSON.stringify(DEMO_PROPOSALS);
  const filters = {
    ...INITIAL_FILTERS,
    location: 'Pomorze',
    childAgeBands: ['4–6', '7–9'],
  };
  const range = DEMO_DATE_RANGES[0];
  assert.deepEqual(
    filterProposals(DEMO_PROPOSALS, filters, range).map(({ trip }) => trip.id),
    ['demo-coast', 'demo-forest'],
  );
  assert.deepEqual(
    filterProposals(
      DEMO_PROPOSALS,
      { ...filters, tripModes: ['planned'] },
      range,
    ).map(({ trip }) => trip.id),
    ['demo-coast'],
  );
  assert.deepEqual(
    filterProposals(
      DEMO_PROPOSALS,
      { ...filters, tripModes: ['flexible'] },
      range,
    ).map(({ trip }) => trip.id),
    ['demo-forest'],
  );
  assert.equal(JSON.stringify(DEMO_PROPOSALS), snapshot);
});

test('type selection supports one or both choices and retains the last selected type', () => {
  const initial = [...INITIAL_FILTERS.tripModes];
  const single = toggleDiscoveryTripMode(initial, 'flexible');
  assert.deepEqual(single, ['planned']);
  assert.deepEqual(toggleDiscoveryTripMode(single, 'planned'), ['planned']);
  const both = toggleDiscoveryTripMode(single, 'flexible');
  assert.deepEqual(both, ['planned', 'flexible']);
  assert.deepEqual(toggleDiscoveryTripMode(both, 'planned'), ['flexible']);
  assert.deepEqual(initial, ['planned', 'flexible']);
  assert.deepEqual(INITIAL_FILTERS.tripModes, initial);
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

test('selecting both types includes all plans regardless of checkbox selection order', () => {
  for (const tripModes of [
    ['planned', 'flexible'],
    ['flexible', 'planned'],
  ]) {
    const results = filterProposals(DEMO_PROPOSALS, {
      ...INITIAL_FILTERS,
      tripModes,
    });
    assert.deepEqual(results, DEMO_PROPOSALS);
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

test('match facts use the selected range before existing own plans', () => {
  const proposal = DEMO_PROPOSALS[0];
  const facts = getMatchFacts(
    proposal,
    MY_GROUP,
    MY_TRIPS,
    DEMO_DATE_RANGES[1],
    ['7–9'],
  );
  assert.equal(facts.nights, 0);
  assert.equal(facts.dateSource, 'selected');
  assert.deepEqual(facts.matchingAgeBands, ['7–9']);
  assert.deepEqual(facts.commonInterests, ['Rowery', 'Spokojny wypoczynek']);
});

test('match facts compare with one best own plan without summing duplicate stays', () => {
  const facts = getMatchFacts(DEMO_PROPOSALS[0], MY_GROUP, [
    ...MY_TRIPS,
    MY_TRIPS[0],
  ]);
  assert.equal(facts.nights, 2);
  assert.equal(facts.dateSource, 'own-plans');
  assert.equal(facts.referenceRange.id, 'demo-my-coast');
  assert.equal(getMatchFacts(DEMO_PROPOSALS[0], MY_GROUP, []).nights, null);
});

test('groups without children do not get invented age matches', () => {
  const facts = getMatchFacts(DEMO_PROPOSALS[2], MY_GROUP, MY_TRIPS);
  assert.deepEqual(facts.ageBands, []);
  assert.deepEqual(facts.matchingAgeBands, []);
});

test('shared-night captions distinguish zero, one and Polish plural endings', () => {
  assert.equal(formatSharedNights(0), 'Brak wspólnych nocy');
  assert.equal(formatSharedNights(1), '1 wspólna noc');
  assert.equal(formatSharedNights(2), '2 wspólne noce');
  assert.equal(formatSharedNights(5), '5 wspólnych nocy');
  assert.equal(formatSharedNights(12), '12 wspólnych nocy');
  assert.equal(formatSharedNights(22), '22 wspólne noce');
});
