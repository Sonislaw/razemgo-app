import { getMatchFacts, formatSharedNights } from './support/legacy-matching/filter-trips.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEMO_PROPOSALS,
  DEMO_DATE_RANGES,
  MY_TRIPS,
  MY_GROUP,
} from '../src/data/mocks/travel.ts';
import { INITIAL_FILTERS, filterProposals, sharedNights, formatTripDates, toggleDiscoveryTripMode, updateDiscoveryDateRange, clearDiscoveryDates, getDiscoveryDateRangeError, resolveDiscoveryRange, getDiscoveryReferenceRange, selectDiscoveryLocation, updateDiscoveryLocationQuery } from '../src/features/discovery/filter-trips.ts';
import { DEMO_COMPATIBILITY_SCORES } from './support/legacy-matching/scores.ts';
import { sortDiscoveryProposals } from './support/legacy-matching/sort-proposals.ts';
import {
  calendarMonthCells,
  selectCalendarDate,
  shiftCalendarMonth,
  rangeDurationLabel,
} from '../src/features/trips/date-range-calendar.ts';

test('calendar range selection spans months and restarts on an earlier, equal or third date', () => {
  const first = selectCalendarDate(
    { startDate: '', endDate: '' },
    '2027-12-30',
  );
  assert.deepEqual(first, { startDate: '2027-12-30', endDate: '' });
  const complete = selectCalendarDate(first, '2028-01-03');
  assert.deepEqual(complete, {
    startDate: '2027-12-30',
    endDate: '2028-01-03',
  });
  assert.equal(rangeDurationLabel(complete), '4 noce');
  assert.deepEqual(selectCalendarDate(first, '2027-12-28'), {
    startDate: '2027-12-28',
    endDate: '',
  });
  assert.deepEqual(selectCalendarDate(first, '2027-12-30'), first);
  assert.deepEqual(selectCalendarDate(complete, '2028-02-01'), {
    startDate: '2028-02-01',
    endDate: '',
  });
  assert.deepEqual(first, { startDate: '2027-12-30', endDate: '' });
  assert.equal(selectCalendarDate(first, '2027-02-29'), first);
});

test('calendar uses Monday columns, leap days and year transitions independently of timezone', () => {
  assert.deepEqual(calendarMonthCells('2027-02').slice(0, 7), [
    '2027-02-01',
    '2027-02-02',
    '2027-02-03',
    '2027-02-04',
    '2027-02-05',
    '2027-02-06',
    '2027-02-07',
  ]);
  assert.equal(calendarMonthCells('2027-02').filter(Boolean).length, 28);
  assert.equal(calendarMonthCells('2028-02').filter(Boolean).length, 29);
  assert.equal(calendarMonthCells('2026-10')[3], '2026-10-01');
  assert.equal(shiftCalendarMonth('2027-12', 1), '2028-01');
  assert.equal(shiftCalendarMonth('2028-01', -1), '2027-12');
  assert.equal(
    rangeDurationLabel({ startDate: '2027-03-27', endDate: '2027-03-29' }),
    '2 noce',
  );
});

test('custom-date tolerance really broadens discovery while exact mode retains the selected dates', () => {
  const range = { startDate: '2027-05-25', endDate: '2027-05-28' };
  const exact = updateDiscoveryDateRange(INITIAL_FILTERS, range);
  assert.deepEqual(filterProposals(DEMO_PROPOSALS, exact), []);
  assert.deepEqual(
    filterProposals(
      DEMO_PROPOSALS,
      updateDiscoveryDateRange(exact, range, 1),
    ).map(({ trip }) => trip.id),
    ['demo-coast'],
  );
  assert.deepEqual(
    filterProposals(
      DEMO_PROPOSALS,
      updateDiscoveryDateRange(exact, range, 2),
    ).map(({ trip }) => trip.id),
    ['demo-coast', 'demo-mountains'],
  );
  assert.deepEqual(
    filterProposals(
      DEMO_PROPOSALS,
      updateDiscoveryDateRange(exact, range, 3),
    ).map(({ trip }) => trip.id),
    ['demo-coast', 'demo-mountains', 'demo-forest'],
  );
  const before = updateDiscoveryDateRange(
    INITIAL_FILTERS,
    { startDate: '2027-05-20', endDate: '2027-05-21' },
    1,
  );
  assert.deepEqual(
    filterProposals(DEMO_PROPOSALS, before).map(({ trip }) => trip.id),
    ['demo-mountains', 'demo-forest'],
  );
  assert.deepEqual(exact.customDateRange, range);
  assert.equal(exact.dateFlexibilityDays, 0);
});

test('tolerance shifts a whole stay and reset removes it without mutating the supplied range', () => {
  const range = Object.freeze({
    startDate: '2027-05-21',
    endDate: '2027-05-24',
  });
  const filters = updateDiscoveryDateRange(INITIAL_FILTERS, range, 3);
  const longStay = { startDate: '2027-05-18', endDate: '2027-05-27' };
  const reference = getDiscoveryReferenceRange(filters, range, longStay);
  assert.equal(sharedNights(reference, longStay), 3);
  assert.equal(
    Date.parse(reference.endDate) - Date.parse(reference.startDate),
    3 * 86400000,
  );
  assert.notEqual(filters.customDateRange, range);
  assert.equal(clearDiscoveryDates(filters).dateFlexibilityDays, 0);
  assert.equal(
    updateDiscoveryDateRange(filters, range, 20).dateFlexibilityDays,
    7,
  );
  assert.equal(
    updateDiscoveryDateRange(filters, range, -1).dateFlexibilityDays,
    0,
  );
  assert.equal(
    updateDiscoveryDateRange(filters, range, NaN).dateFlexibilityDays,
    0,
  );
});

test('custom dates filter by overlapping stays and combine with other filters', () => {
  const filters = updateDiscoveryDateRange(INITIAL_FILTERS, {
    startDate: '2027-05-21',
    endDate: '2027-05-24',
  });
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
  const changed = updateDiscoveryDateRange(original, {
    ...original.customDateRange,
    startDate: '2027-05-22',
  });
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
  const filtered = updateDiscoveryDateRange(
    { ...INITIAL_FILTERS, location: 'Pomorze', childAgeBands: ['4–6'] },
    { startDate: '2027-06-01', endDate: '2027-06-03' },
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

test('compatibility sorting uses the supplied internal ranking keys, highest first', () => {
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

test('landscape selection supports one or several choices and preserves source order', () => {
  for (const [landscapeKinds, expected] of [
    [['forest'], ['demo-forest']],
    [['lake', 'coast'], ['demo-coast', 'demo-lake', 'demo-friends']],
  ]) {
    assert.deepEqual(
      filterProposals(DEMO_PROPOSALS, {
        ...INITIAL_FILTERS,
        landscapeKinds,
      }).map(({ trip }) => trip.id),
      expected,
    );
  }
});

test('landscapes combine with dates, location, ages and announcement type', () => {
  const filters = updateDiscoveryDateRange(
    {
      ...INITIAL_FILTERS,
      landscapeKinds: ['forest', 'mountain'],
      tripModes: ['flexible'],
      location: 'Pomorze',
      childAgeBands: ['4–6'],
    },
    { startDate: '2027-05-21', endDate: '2027-05-24' },
  );
  const snapshot = JSON.stringify({ filters, proposals: DEMO_PROPOSALS });
  assert.deepEqual(
    filterProposals(DEMO_PROPOSALS, filters).map(({ trip }) => trip.id),
    ['demo-forest'],
  );
  assert.deepEqual(
    filterProposals(DEMO_PROPOSALS, { ...filters, landscapeKinds: ['coast'] }),
    [],
  );
  assert.equal(
    JSON.stringify({ filters, proposals: DEMO_PROPOSALS }),
    snapshot,
  );
});

test('empty or omitted landscape selections leave discovery unrestricted', () => {
  const filtered = { ...INITIAL_FILTERS, landscapeKinds: ['forest'] };
  assert.equal(filterProposals(DEMO_PROPOSALS, filtered).length, 1);
  assert.deepEqual(
    filterProposals(DEMO_PROPOSALS, { ...filtered, landscapeKinds: [] }),
    DEMO_PROPOSALS,
  );
  assert.deepEqual(
    filterProposals(DEMO_PROPOSALS, {
      ...INITIAL_FILTERS,
      landscapeKinds: undefined,
    }),
    DEMO_PROPOSALS,
  );
  assert.deepEqual(
    filterProposals(DEMO_PROPOSALS, INITIAL_FILTERS),
    DEMO_PROPOSALS,
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

test('selected localities keep their identity and region/country selections include their plans', () => {
  for (const [id, expected] of [
    ['pl-locality:4259', ['demo-coast']],
    ['pl-locality:4258', []],
    ['pl-locality:21411', ['demo-lake']],
    ['pl-locality:21409', []],
    ['pl-region:pomorskie', ['demo-coast', 'demo-forest', 'demo-friends']],
    ['pl-region:dolnośląskie', ['demo-mountains']],
    ['pl-region:warmińsko-mazurskie', ['demo-lake']],
    ['country:PL', DEMO_PROPOSALS.map(({ trip }) => trip.id)],
    ['demo-location-slowenia', []],
  ]) {
    const filters = selectDiscoveryLocation(INITIAL_FILTERS, id);
    assert.equal(filters.locationId, id);
    assert.ok(filters.location.length);
    assert.deepEqual(
      filterProposals(DEMO_PROPOSALS, filters).map(({ trip }) => trip.id),
      expected,
    );
  }
});

test('changing or clearing the search query removes the old selection and keeps other filters', () => {
  const selected = selectDiscoveryLocation(
    { ...INITIAL_FILTERS, childAgeBands: ['7–9'] },
    'pl-locality:4259',
  );
  const snapshot = JSON.stringify(selected);
  const changed = updateDiscoveryLocationQuery(selected, 'leba');
  assert.equal(changed.location, 'leba');
  assert.equal(changed.locationId, undefined);
  assert.deepEqual(changed.childAgeBands, ['7–9']);
  assert.equal(JSON.stringify(selected), snapshot);
  const cleared = selectDiscoveryLocation(selected, '');
  assert.equal(cleared.location, '');
  assert.equal(cleared.locationId, undefined);
  assert.deepEqual(cleared.childAgeBands, ['7–9']);
  assert.equal(filterProposals(DEMO_PROPOSALS, INITIAL_FILTERS).length, 6);
});

test('selected locations combine with dates, age and announcement type filters', () => {
  const filters = updateDiscoveryDateRange(
    selectDiscoveryLocation(
      { ...INITIAL_FILTERS, childAgeBands: ['7–9'] },
      'pl-region:pomorskie',
    ),
    { startDate: '2027-05-21', endDate: '2027-05-24' },
  );
  assert.deepEqual(
    filterProposals(DEMO_PROPOSALS, filters).map(({ trip }) => trip.id),
    ['demo-coast'],
  );
  assert.deepEqual(
    filterProposals(DEMO_PROPOSALS, { ...filters, tripModes: ['flexible'] }),
    [],
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

test('search uses the destination or travel area', () => {
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
