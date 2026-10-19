import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MY_GROUP,
  MY_TRIPS,
  DEMO_PROPOSALS,
} from '../src/data/mocks/travel.ts';
import {
  createOwnTripsState,
  discoveryFiltersForTrip,
  EMPTY_TRIP_FILTERS,
  getTripStatus,
  isArchivedTrip,
  isSearchingTrip,
  isValidDate,
  newTripForm,
  ownTripsReducer as reduce,
  selectOwnTrips,
  shiftDate,
  toTripForm,
  tripFromForm,
  validateTripForm,
} from '../src/features/trips/own-trips-state.ts';
import {
  filterProposals,
  formatTripDates,
  getDiscoveryReferenceRange,
  resolveDiscoveryRange,
  sharedNights,
} from '../src/features/discovery/filter-trips.ts';
import { getTripHeadline } from '../src/features/trips/trip-headline.ts';
const today = '2026-10-18';
const profile = {
  group: MY_GROUP,
  matching: {
    groupKinds: ['family'],
    childAgeBands: ['4–6', '7–9'],
    description: '',
  },
};
const fixture = MY_TRIPS.map((trip) => ({
  ...trip,
  status: 'published',
  visibility: 'public',
  travelModes: [...MY_GROUP.travelModes],
  matching: { groupKinds: ['family'], childAgeBands: ['4–6', '7–9'] },
}));
const initial = () => createOwnTripsState(fixture);
const form = () => toTripForm(initial().trips[0]);
const save = (state, draft, id, values = form()) =>
  reduce(state, {
    type: 'save',
    form: values,
    id,
    groupId: MY_GROUP.id,
    draft,
    today,
  });

test('trip headlines use the first eight description words and normalize whitespace', () => {
  const trip = {
    ...MY_TRIPS[0],
    description:
      '  Plaża,\nrowery  i dużo czasu na wspólną zabawę. Spokojny weekend nad morzem. ',
  };
  assert.equal(
    getTripHeadline(trip),
    'Plaża, rowery i dużo czasu na wspólną zabawę…',
  );
  assert.equal(
    getTripHeadline({ ...trip, description: '  Krótki opis.  ' }),
    'Krótki opis.',
  );
  assert.equal(
    getTripHeadline({ ...trip, description: 'Przygoda 🚐🌲' }),
    'Przygoda 🚐🌲',
  );
  assert.equal(
    getTripHeadline({ ...trip, title: 'Stara nazwa' }),
    getTripHeadline(trip),
  );
});

test('long headlines end at a word boundary and preserve Unicode characters', () => {
  const description = 'Rodzinnepodróżowanie '.repeat(9).trim();
  const headline = getTripHeadline({ ...MY_TRIPS[0], description });
  assert.ok(Array.from(headline).length <= 81);
  assert.match(headline, /Rodzinnepodróżowanie…$/u);
  const emojiHeadline = getTripHeadline({
    ...MY_TRIPS[0],
    description: '🚐'.repeat(100),
  });
  assert.equal(emojiHeadline, '🚐'.repeat(80) + '…');
});

test('empty descriptions get a destination or area label and unfinished drafts stay readable', () => {
  assert.equal(
    getTripHeadline({ ...MY_TRIPS[0], description: ' \n ' }),
    'Wyjazd · Chłapowo',
  );
  assert.equal(
    getTripHeadline({ ...MY_TRIPS[1], description: '' }),
    'Szukamy pomysłu · Kaszuby',
  );
  const blank = tripFromForm(
    newTripForm(profile),
    'blank',
    MY_GROUP.id,
    'draft',
  );
  assert.equal(getTripHeadline(blank), 'Wyjazd do zaplanowania');
});

test('publishing and editing need no name or description and ignore legacy title input', () => {
  const values = { ...form(), description: '', title: 'Stara nazwa' };
  assert.deepEqual(validateTripForm(values), []);
  const state = save(initial(), false, undefined, values);
  const trip = state.trips.at(-1);
  assert.equal(Object.hasOwn(trip, 'title'), false);
  assert.equal(Object.hasOwn(toTripForm(trip), 'title'), false);
  assert.equal(Object.hasOwn(newTripForm(profile), 'title'), false);
  assert.equal(getTripHeadline(trip), 'Wyjazd · Chłapowo');
  const updated = save(state, false, trip.id, {
    ...values,
    description: 'Wspólne ognisko nad morzem',
  });
  assert.equal(
    getTripHeadline(updated.trips.at(-1)),
    'Wspólne ognisko nad morzem',
  );
  assert.equal(updated.trips.at(-1).id, trip.id);
});

test('own-trip search also finds words beyond the short description excerpt', () => {
  const description =
    'Raz dwa trzy cztery pięć sześć siedem osiem dziewięć DziesiąteHasło';
  const state = save(initial(), false, undefined, { ...form(), description });
  const matches = selectOwnTrips(
    state.trips,
    { ...EMPTY_TRIP_FILTERS, query: 'dziesiatehaslo' },
    false,
    today,
  );
  assert.deepEqual(
    matches.map((trip) => trip.id),
    [state.lastSavedId],
  );
  assert.ok(!getTripHeadline(matches[0]).includes('DziesiąteHasło'));
});

test('dates reject rollover, require a night and stay stable across time changes', () => {
  assert.equal(isValidDate('2027-02-31'), false);
  assert.equal(isValidDate('2028-02-29'), true);
  assert.equal(isValidDate('2027-02-29'), false);
  assert.equal(isValidDate('2027-5-1'), false);
  assert.equal(isValidDate(''), false);
  assert.equal(shiftDate('2027-03-28', 1), '2027-03-29');
  const sameDay = { ...form(), endDate: '2027-05-21' };
  assert.ok(validateTripForm(sameDay, 1).length);
  assert.match(
    formatTripDates({ startDate: '2027-12-30', endDate: '2028-01-03' }),
    /2027.*2028/,
  );
});

test('drafts may be incomplete and never enter discovery or crash date rendering', () => {
  const blank = newTripForm(profile);
  assert.ok(validateTripForm(blank).length);
  const state = save(initial(), true, undefined, blank);
  const draft = state.trips.at(-1);
  assert.equal(draft.status, 'draft');
  assert.equal(getTripHeadline(draft), 'Wyjazd do zaplanowania');
  assert.equal(isSearchingTrip(draft, today), false);
  assert.equal(discoveryFiltersForTrip(draft).customDateRange, undefined);
  assert.equal(
    selectOwnTrips(state.trips, EMPTY_TRIP_FILTERS, false, today).at(-1).id,
    draft.id,
  );
  assert.equal(save(initial(), false, undefined, blank).trips.length, 2);
});

test('publishing adds a complete plan; editing retains its id without duplicates', () => {
  const state = save(initial(), false);
  assert.equal(state.trips.length, 3);
  assert.equal(state.trips.at(-1).status, 'published');
  assert.equal(state.lastSavedId, 'local-trip-1');
  const updated = save(state, false, 'local-trip-1', {
    ...form(),
    description: 'Zmieniony opis',
  });
  assert.equal(updated.trips.length, 3);
  assert.equal(getTripHeadline(updated.trips.at(-1)), 'Zmieniony opis');
  assert.equal(updated.revision, state.revision + 1);
});

test('planning mode and lifecycle are independent; changing mode removes stale destination fields', () => {
  const state = initial();
  const switched = save(state, false, state.trips[0].id, {
    ...form(),
    mode: 'flexible',
    placeName: 'Sudety',
    region: 'Dolny Śląsk',
  });
  const trip = switched.trips[0];
  assert.equal(trip.mode, 'flexible');
  assert.equal(trip.status, 'published');
  assert.equal('destination' in trip, false);
  assert.equal(trip.travelArea.name, 'Sudety');
  const paused = reduce(switched, {
    type: 'status',
    id: trip.id,
    status: 'paused',
    today,
  });
  assert.equal(paused.trips[0].mode, 'flexible');
  assert.equal(getTripStatus(paused.trips[0], today), 'paused');
});

test('private save pauses discovery; saving a paused plan preserves the pause; explicit resume makes it public', () => {
  let state = save(initial(), false, undefined, {
    ...form(),
    visibility: 'private',
  });
  const id = state.trips.at(-1).id;
  assert.equal(state.trips.at(-1).status, 'paused');
  assert.equal(isSearchingTrip(state.trips.at(-1), today), false);
  state = save(state, false, id, { ...form(), visibility: 'public' });
  assert.equal(state.trips.at(-1).status, 'paused');
  state = reduce(state, { type: 'status', id, status: 'published', today });
  assert.equal(isSearchingTrip(state.trips.at(-1), today), true);
  assert.equal(state.trips.at(-1).visibility, 'public');
});

test('past plans archive automatically, draft dates do not, and terminal statuses cannot resume', () => {
  const trip = initial().trips[0];
  assert.equal(getTripStatus(trip, '2027-05-24'), 'completed');
  assert.equal(
    isArchivedTrip({ ...trip, status: 'draft' }, '2028-01-01'),
    false,
  );
  for (const status of ['completed', 'cancelled']) {
    const state = reduce(initial(), {
      type: 'status',
      id: trip.id,
      status,
      today,
    });
    assert.equal(
      selectOwnTrips(state.trips, EMPTY_TRIP_FILTERS, true, today).length,
      1,
    );
    assert.equal(
      reduce(state, {
        type: 'status',
        id: trip.id,
        status: 'published',
        today,
      }),
      state,
    );
  }
  const state = initial();
  assert.equal(
    reduce(state, {
      type: 'status',
      id: trip.id,
      status: 'paused',
      today: '2028-01-01',
    }),
    state,
  );
});

test('publication rejects past dates; copying an old plan creates an editable draft', () => {
  const state = initial();
  const past = { ...form(), startDate: '2025-01-01', endDate: '2025-01-05' };
  assert.equal(save(state, false, undefined, past), state);
  const archived = reduce(state, {
    type: 'status',
    id: state.trips[0].id,
    status: 'completed',
    today,
  });
  const copy = reduce(archived, {
    type: 'duplicate',
    id: archived.trips[0].id,
  }).trips.at(-1);
  assert.equal(copy.status, 'draft');
  assert.equal(copy.visibility, 'private');
  assert.notEqual(copy.id, archived.trips[0].id);
  assert.equal(getTripHeadline(copy), getTripHeadline(archived.trips[0]));
});

test('duplicate and draft editing clone nested fields rather than mutating the original or fixtures', () => {
  const before = JSON.stringify(fixture);
  const state = reduce(initial(), { type: 'duplicate', id: fixture[0].id });
  const copy = state.trips.at(-1);
  copy.interests.push('Nowe');
  copy.matching.childAgeBands.length = 0;
  copy.destination.name = 'Inne miejsce';
  assert.equal(state.trips[0].destination.name, 'Chłapowo');
  assert.equal(state.trips[0].matching.childAgeBands.length, 2);
  assert.equal(JSON.stringify(fixture), before);
  const draft = toTripForm(state.trips[0]);
  draft.travelModes.length = 0;
  assert.ok(state.trips[0].travelModes.length);
});

test('search joins place and date filters, handles Polish letters, sorts upcoming ascending and archive descending', () => {
  const state = initial();
  const query = {
    ...EMPTY_TRIP_FILTERS,
    query: '  CHLAPOWO ',
    startDate: '2027-05-22',
    endDate: '2027-05-26',
  };
  assert.deepEqual(
    selectOwnTrips(state.trips, query, false, today).map((item) => item.id),
    ['demo-my-coast'],
  );
  assert.equal(
    selectOwnTrips(
      state.trips,
      { ...query, startDate: '2027-05-24' },
      false,
      today,
    ).length,
    0,
  );
  assert.equal(
    selectOwnTrips(
      state.trips,
      { ...query, endDate: '2027-05-21' },
      false,
      today,
    ).length,
    0,
  );
  assert.deepEqual(
    selectOwnTrips(
      [...state.trips].reverse(),
      EMPTY_TRIP_FILTERS,
      false,
      today,
    ).map((trip) => trip.id),
    ['demo-my-coast', 'demo-my-idea'],
  );
  assert.deepEqual(
    selectOwnTrips(state.trips, EMPTY_TRIP_FILTERS, true, '2028-01-01').map(
      (trip) => trip.id,
    ),
    ['demo-my-idea', 'demo-my-coast'],
  );
});

test('finding company passes exact trip dates and preferences; tolerance is set only in search filters', () => {
  const trip = initial().trips[0];
  const filters = discoveryFiltersForTrip(trip);
  assert.equal(filters.sourceTripId, trip.id);
  assert.equal(filters.location, 'Pomorze');
  assert.deepEqual(resolveDiscoveryRange(filters), {
    startDate: trip.startDate,
    endDate: trip.endDate,
  });
  assert.deepEqual(
    filterProposals(DEMO_PROPOSALS, filters).map((item) => item.trip.id),
    ['demo-coast', 'demo-forest'],
  );
  const flexibleTrip = tripFromForm(
    { ...toTripForm(trip), mode: 'flexible', dateFlexibilityDays: 3 },
    trip.id,
    trip.groupId,
    'published',
  );
  const flexible = discoveryFiltersForTrip(flexibleTrip);
  assert.deepEqual(flexible.customDateRange, {
    startDate: '2027-05-21',
    endDate: '2027-05-24',
  });
  assert.equal(flexible.dateFlexibilityDays, 0);
  const flexibleSearch = { ...flexible, dateFlexibilityDays: 3 };
  const longStay = { startDate: '2027-05-18', endDate: '2027-05-27' };
  const reference = getDiscoveryReferenceRange(
    flexibleSearch,
    flexible.customDateRange,
    longStay,
  );
  assert.equal(
    sharedNights(reference, longStay),
    3,
    'flexibility shifts a stay; it cannot invent extra shared nights',
  );
  const later = { startDate: '2027-05-24', endDate: '2027-05-27' };
  assert.equal(sharedNights(trip, later), 0);
  assert.deepEqual(
    getDiscoveryReferenceRange(flexibleSearch, flexible.customDateRange, later),
    later,
  );
  const pairs = {
    ...filters,
    groupKinds: ['couple'],
    childAgeBands: [],
    location: 'Dolny Śląsk',
  };
  assert.deepEqual(
    filterProposals(DEMO_PROPOSALS, pairs).map((item) => item.trip.id),
    ['demo-mountains'],
  );
});

test('both planning modes drop legacy tolerance on load, edit, save, duplicate and discovery', () => {
  for (const original of initial().trips) {
    const legacy = { ...original, dateFlexibilityDays: 7 };
    const before = JSON.stringify(legacy);
    assert.equal(
      Object.hasOwn(toTripForm(legacy), 'dateFlexibilityDays'),
      false,
    );
    assert.equal(discoveryFiltersForTrip(legacy).dateFlexibilityDays, 0);
    const values = { ...toTripForm(legacy), dateFlexibilityDays: 3 };
    for (const draft of [true, false]) {
      const saved = save(initial(), draft, undefined, values).trips.at(-1);
      assert.equal(Object.hasOwn(saved, 'dateFlexibilityDays'), false);
      assert.equal(saved.startDate, values.startDate);
      assert.equal(saved.endDate, values.endDate);
    }
    const state = createOwnTripsState([legacy]);
    assert.equal(Object.hasOwn(state.trips[0], 'dateFlexibilityDays'), false);
    assert.equal(
      Object.hasOwn(
        reduce(state, { type: 'duplicate', id: legacy.id }).trips.at(-1),
        'dateFlexibilityDays',
      ),
      false,
    );
    assert.equal(JSON.stringify(legacy), before);
  }
});

test('trip type changes retain dates and never restore tolerance from older form data', () => {
  for (const days of [0, 1, 2, 3, 7]) {
    const values = { ...form(), mode: 'flexible', dateFlexibilityDays: days };
    const trip = tripFromForm(values, 'flexible', MY_GROUP.id, 'published');
    assert.equal(Object.hasOwn(trip, 'dateFlexibilityDays'), false);
    assert.equal(Object.hasOwn(toTripForm(trip), 'dateFlexibilityDays'), false);
    assert.equal(discoveryFiltersForTrip(trip).dateFlexibilityDays, 0);
    assert.equal(
      tripFromForm(
        { ...toTripForm(trip), mode: 'planned' },
        trip.id,
        trip.groupId,
        trip.status,
      ).startDate,
      trip.startDate,
    );
  }
});

test('deletion keeps other trips, stale editors cannot resurrect removed plans, restart restores examples', () => {
  const state = reduce(initial(), { type: 'delete', id: 'demo-my-coast' });
  assert.equal(state.trips.length, 1);
  assert.equal(save(state, false, 'demo-my-coast'), state);
  assert.equal(reduce(state, { type: 'duplicate', id: 'unknown' }), state);
  assert.equal(initial().trips.length, 2);
  assert.equal(tripFromForm(form(), 'unique', 'demo-us', 'draft').id, 'unique');
});
