import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MY_GROUP,
  MY_TRIPS,
  DEMO_PROPOSALS,
} from '../src/data/mocks/travel.ts';
import {
  changeTripLocation,
  changeTripMode,
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
  getTripLocation,
  resolveDiscoveryRange,
  sharedNights,
} from '../src/features/discovery/filter-trips.ts';
import { getTripHeadline } from '../src/features/trips/trip-headline.ts';
import {
  searchTripLocations,
  TRIP_LOCATION_REQUIRED_ERROR,
  PLANNED_TRIP_LOCATION_REQUIRED_ERROR,
} from '../src/features/trips/trip-locations.ts';
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

test('location search narrows by name and context without case or Polish accents', () => {
  assert.equal(searchTripLocations('').length, 5);
  assert.deepEqual(
    searchTripLocations('  CHŁAPOWO PUCKI ').map((item) => item.name),
    ['Chłapowo'],
  );
  assert.deepEqual(
    searchTripLocations('chlapowo').map((item) => item.region),
    ['pomorskie', 'wielkopolskie'],
  );
  assert.deepEqual(searchTripLocations('gdansk')[0].name, 'Gdańsk');
  assert.deepEqual(
    searchTripLocations('gdansk pomorskie polska')[0].name,
    'Gdańsk',
  );
  assert.deepEqual(
    searchTripLocations('slowenia').map((item) => item.kind),
    ['country'],
  );
  assert.deepEqual(
    searchTripLocations('Slovenia').map((item) => item.name),
    ['Słowenia'],
  );
  assert.deepEqual(searchTripLocations('Atlantyda'), []);
});

test('a selected location is mandatory for publishing in both modes; a typed name cannot bypass validation', () => {
  assert.equal(newTripForm(profile).locationId, '');
  for (const mode of ['planned', 'flexible']) {
    for (const locationId of ['', 'Chłapowo', 'unknown-location']) {
      const values = { ...form(), mode, locationId };
      assert.ok(
        validateTripForm(values, 2).includes(
          mode === 'planned'
            ? PLANNED_TRIP_LOCATION_REQUIRED_ERROR
            : TRIP_LOCATION_REQUIRED_ERROR,
        ),
      );
      const state = initial();
      assert.equal(save(state, false, undefined, values), state);
    }
  }
});

test('legacy demo places resolve to selections and city, region and country selections survive edits and copies', () => {
  assert.equal(form().locationId, 'pl-locality:4259');
  assert.equal(
    toTripForm(initial().trips[1]).locationId,
    'demo-location-kaszuby',
  );
  assert.equal(Object.hasOwn(form(), 'placeName'), false);
  assert.equal(Object.hasOwn(form(), 'region'), false);
  for (const mode of ['planned', 'flexible']) {
    for (const location of searchTripLocations('', mode)) {
      const values = { ...form(), mode, locationId: location.id };
      assert.deepEqual(validateTripForm(values), []);
      let state = save(initial(), false, undefined, values);
      const trip = state.trips.at(-1);
      const place =
        trip.mode === 'planned' ? trip.destination : trip.travelArea;
      assert.equal(place.name, location.name);
      assert.equal(place.region, location.region);
      assert.equal(place.locationId, location.id);
      assert.equal(toTripForm(trip).locationId, location.id);
      assert.ok(!getTripLocation(trip).endsWith(', '));
      assert.equal(
        discoveryFiltersForTrip(trip).location,
        location.region || location.name,
      );
      state = save(state, false, trip.id, {
        ...toTripForm(trip),
        description: 'Zmieniamy opis wspólnego wyjazdu.',
      });
      state = reduce(state, { type: 'duplicate', id: trip.id });
      assert.equal(toTripForm(state.trips.at(-1)).locationId, location.id);
      assert.equal(state.trips.at(-1).status, 'draft');
    }
  }
});

test('campground is optional; its name is trimmed, saved, editable and copied for concrete plans', () => {
  assert.equal(newTripForm(profile).campgroundName, '');
  assert.equal(form().campgroundName, '');
  for (const locationId of ['pl-locality:4259', 'pl-locality:8457']) {
    const values = {
      ...form(),
      locationId,
      campgroundName: '  Pod Sosnami  ',
    };
    assert.deepEqual(validateTripForm(values), []);
    let state = save(initial(), false, undefined, values);
    const trip = state.trips.at(-1);
    assert.equal(trip.campgroundName, 'Pod Sosnami');
    assert.equal(toTripForm(trip).campgroundName, 'Pod Sosnami');
    state = save(state, false, trip.id, {
      ...toTripForm(trip),
      campgroundName: 'Nad Morzem',
    });
    const copy = reduce(state, { type: 'duplicate', id: trip.id }).trips.at(-1);
    assert.equal(copy.campgroundName, 'Nad Morzem');
    assert.equal(
      createOwnTripsState([copy]).trips[0].campgroundName,
      'Nad Morzem',
    );
    const cleared = save(state, false, trip.id, {
      ...toTripForm(state.trips.at(-1)),
      campgroundName: '   ',
    }).trips.at(-1);
    assert.equal(cleared.campgroundName, undefined);
    assert.equal(toTripForm(cleared).campgroundName, '');
  }
});

test('campground follows the selected locality; changing or clearing it removes a stale name', () => {
  const values = { ...form(), campgroundName: 'Pod Sosnami' };
  const before = JSON.stringify(values);
  assert.equal(
    changeTripLocation(values, values.locationId).campgroundName,
    'Pod Sosnami',
  );
  assert.equal(changeTripMode(values, 'flexible').campgroundName, '');
  assert.equal(
    changeTripMode(values, 'flexible').locationId,
    values.locationId,
  );
  assert.equal(
    changeTripMode(changeTripMode(values, 'flexible'), 'planned')
      .campgroundName,
    '',
  );
  for (const locationId of [
    '',
    'pl-locality:8457',
    'pl-region:pomorskie',
    'country:PL',
  ]) {
    const changed = changeTripLocation(values, locationId);
    assert.equal(changed.campgroundName, '');
    assert.equal(changed.locationId, locationId);
    assert.equal(changed.description, values.description);
  }
  assert.equal(JSON.stringify(values), before);
});

test('flexible plans cannot retain a hidden campground name for any location, including drafts and legacy data', () => {
  for (const locationId of [
    '',
    'Chłapowo',
    'pl-region:pomorskie',
    'country:PL',
    'pl-locality:4259',
    'pl-locality:8457',
  ]) {
    const values = {
      ...form(),
      mode: 'flexible',
      locationId,
      campgroundName: 'Stara nazwa',
    };
    const trip = tripFromForm(values, 'preview', MY_GROUP.id, 'draft');
    assert.equal(trip.campgroundName, undefined);
    assert.equal(
      save(initial(), true, undefined, values).trips.at(-1).campgroundName,
      undefined,
    );
    assert.equal(
      toTripForm({ ...trip, campgroundName: 'Stara nazwa' }).campgroundName,
      '',
    );
    assert.equal(
      createOwnTripsState([{ ...trip, campgroundName: 'Stara nazwa' }]).trips[0]
        .campgroundName,
      undefined,
    );
  }
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

test('publishing and editing use the description without a name and ignore legacy title input', () => {
  const values = { ...form(), title: 'Stara nazwa' };
  assert.deepEqual(validateTripForm(values), []);
  const state = save(initial(), false, undefined, values);
  const trip = state.trips.at(-1);
  assert.equal(Object.hasOwn(trip, 'title'), false);
  assert.equal(Object.hasOwn(toTripForm(trip), 'title'), false);
  assert.equal(Object.hasOwn(newTripForm(profile), 'title'), false);
  assert.equal(getTripHeadline(trip), getTripHeadline(MY_TRIPS[0]));
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

test('both modes require a real minimum description before step 3, publication, editing or resuming', () => {
  for (const mode of ['planned', 'flexible']) {
    for (const description of [
      '',
      '  \n\t ',
      'ab',
      '  ab  ',
      'a                      b',
      'Wyjazd pod namiotam',
      '🚐'.repeat(10),
    ]) {
      const values = { ...form(), mode, description };
      assert.deepEqual(validateTripForm(values, 1), []);
      assert.match(validateTripForm(values, 2).join(' '), /Opis wyjazdu.*20/);
      assert.match(validateTripForm(values).join(' '), /Opis wyjazdu.*20/);
      const state = initial();
      assert.equal(save(state, false, undefined, values), state);
      assert.equal(save(state, false, state.trips[0].id, values), state);
      const paused = createOwnTripsState([
        tripFromForm(values, state.trips[0].id, MY_GROUP.id, 'paused'),
      ]);
      assert.equal(
        reduce(paused, {
          type: 'status',
          id: paused.trips[0].id,
          status: 'published',
          today,
        }),
        paused,
      );
    }
  }
});

test('description boundaries ignore extra whitespace and retain the supplied text', () => {
  for (const description of [
    'Wyjazd pod namiotami',
    '  Wyjazd  \n pod\t namiotami  ',
    'ą'.repeat(1000),
  ]) {
    const values = { ...form(), description };
    assert.deepEqual(validateTripForm(values, 2), []);
    assert.deepEqual(validateTripForm(values), []);
    const state = save(initial(), false, undefined, values);
    assert.equal(state.trips.length, 3);
    assert.equal(state.trips.at(-1).description, description.trim());
  }
  const values = { ...form(), description: 'ą'.repeat(1001) };
  assert.match(validateTripForm(values).join(' '), /1000/);
  const state = initial();
  assert.equal(save(state, false, undefined, values), state);
});

test('a short description can be saved as a draft and must be completed before publishing it', () => {
  const values = { ...form(), description: 'ab' };
  const state = save(initial(), true, undefined, values);
  const draft = state.trips.at(-1);
  assert.equal(draft.status, 'draft');
  assert.equal(draft.description, 'ab');
  assert.equal(toTripForm(draft).description, 'ab');
  assert.equal(save(state, false, draft.id, toTripForm(draft)), state);
  const published = save(state, false, draft.id, {
    ...toTripForm(draft),
    description: 'Spokojny weekend nad morzem z rowerami.',
  });
  assert.equal(published.trips.length, state.trips.length);
  assert.equal(published.trips.at(-1).id, draft.id);
  assert.equal(published.trips.at(-1).status, 'published');
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
    description: 'Zmieniony opis naszego wyjazdu',
  });
  assert.equal(updated.trips.length, 3);
  assert.equal(
    getTripHeadline(updated.trips.at(-1)),
    'Zmieniony opis naszego wyjazdu',
  );
  assert.equal(updated.revision, state.revision + 1);
});

test('planning mode and lifecycle are independent; changing mode removes stale destination fields', () => {
  const state = initial();
  const switched = save(state, false, state.trips[0].id, {
    ...form(),
    mode: 'flexible',
    locationId: 'demo-location-kaszuby',
  });
  const trip = switched.trips[0];
  assert.equal(trip.mode, 'flexible');
  assert.equal(trip.status, 'published');
  assert.equal('destination' in trip, false);
  assert.equal(trip.travelArea.name, 'Kaszuby');
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
  assert.equal(filters.location, 'pomorskie');
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
