import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEMO_PROPOSALS,
  MY_GROUP,
  MY_TRIPS,
  DEMO_DATE_RANGES,
} from '../src/data/mocks/travel.ts';
import {
  cloneProfile,
  normalizeProfile,
  validateProfile,
} from '../src/features/profile/profile-data.ts';
import {
  createOwnTripsState,
  newTripForm,
  ownTripsReducer,
  toTripForm,
  validateTripForm,
  discoveryFiltersForTrip,
} from '../src/features/trips/own-trips-state.ts';
import {
  INITIAL_FILTERS,
  filterProposals,
  selectHomeRecommendations,
} from '../src/features/discovery/filter-trips.ts';
import {
  animalCountSummary,
  emptyAnimals,
  tripAnimalSummary,
} from '../src/features/animals/animal-data.ts';

const profile = () =>
  cloneProfile({
    group: MY_GROUP,
    matching: { groupKinds: [], childAgeBands: [], description: '' },
  });
const owned = () => ({
  ...MY_TRIPS[0],
  status: 'published',
  visibility: 'public',
  dateFlexibilityDays: 0,
  travelModes: ['Kamper'],
  matching: { groupKinds: [], childAgeBands: [] },
});

test('own animals and welcoming other animals remain independent optional information', () => {
  const value = profile();
  value.group.animals = { animals: [], welcomesAnimals: true };
  const normalized = normalizeProfile(value);
  assert.deepEqual(validateProfile(normalized), []);
  assert.equal(normalized.group.animals.welcomesAnimals, true);
  assert.deepEqual(normalized.group.animals.animals, []);
});

test('new trips inherit a separate editable animal list without any confirmation state', () => {
  const value = profile();
  const draft = newTripForm(value);
  assert.equal(draft.animals.animals[0].kind, 'dog');
  assert.equal(Object.hasOwn(draft.animals, 'attendance'), false);
  draft.animals.animals[0].count = 2;
  assert.equal(value.group.animals.animals[0].count, 1);
  draft.animals = emptyAnimals();
  assert.equal(value.group.animals.animals.length, 1);
  const form = { ...toTripForm(owned()), animals: emptyAnimals() };
  assert.deepEqual(validateTripForm(form), []);
});

test('animal filters are optional, combine species with OR, and do not change the source data', () => {
  const snapshot = JSON.stringify(DEMO_PROPOSALS);
  assert.equal(filterProposals(DEMO_PROPOSALS, INITIAL_FILTERS).length, 6);
  assert.deepEqual(
    filterProposals(DEMO_PROPOSALS, {
      ...INITIAL_FILTERS,
      animalKinds: ['dog'],
    }).map((item) => item.trip.id),
    ['demo-coast', 'demo-bieszczady'],
  );
  assert.deepEqual(
    filterProposals(DEMO_PROPOSALS, {
      ...INITIAL_FILTERS,
      animalKinds: ['cat', 'dog'],
    }).map((item) => item.trip.id),
    ['demo-coast', 'demo-mountains', 'demo-bieszczady'],
  );
  assert.equal(
    filterProposals(DEMO_PROPOSALS, {
      ...INITIAL_FILTERS,
      animalKinds: ['other'],
    }).length,
    0,
  );
  assert.equal(JSON.stringify(DEMO_PROPOSALS), snapshot);
});

test('animal selection combines with dates, location and child ages using AND', () => {
  const filters = {
    ...INITIAL_FILTERS,
    animalKinds: ['dog'],
    childAgeBands: ['7–9'],
    location: 'Pomorze',
  };
  assert.deepEqual(
    filterProposals(DEMO_PROPOSALS, filters, DEMO_DATE_RANGES[0]).map(
      (item) => item.trip.id,
    ),
    ['demo-coast'],
  );
  assert.equal(
    filterProposals(
      DEMO_PROPOSALS,
      { ...filters, childAgeBands: ['0–3'] },
      DEMO_DATE_RANGES[0],
    ).length,
    0,
  );
  assert.equal(
    filterProposals(DEMO_PROPOSALS, { ...INITIAL_FILTERS, animalKinds: [] })
      .length,
    6,
  );
});

test('animals and contact preferences do not exclude or reorder recommendations, even with old conflicting metadata', () => {
  const value = profile();
  const expected = selectHomeRecommendations(
    DEMO_PROPOSALS,
    value,
    [owned()],
    '2026-10-19',
  ).map((item) => item.proposal.trip.id);
  const candidates = DEMO_PROPOSALS.map((item) => ({
    group: {
      ...item.group,
      animals: emptyAnimals(),
      animalPreferences: {
        restrictions: [{ kind: 'all', strength: 'required' }],
      },
    },
    trip: {
      ...item.trip,
      animals: emptyAnimals(),
      animalPreferences: {
        restrictions: [{ kind: 'dog', strength: 'required' }],
      },
    },
  }));
  const ownProfile = profile();
  ownProfile.group.animals = emptyAnimals();
  ownProfile.group.animalPreferences = {
    restrictions: [{ kind: 'all', strength: 'required' }],
  };
  assert.deepEqual(
    selectHomeRecommendations(
      candidates,
      ownProfile,
      [owned()],
      '2026-10-19',
    ).map((item) => item.proposal.trip.id),
    expected,
  );
  assert.equal(filterProposals(candidates, INITIAL_FILTERS).length, 6);
  assert.equal(discoveryFiltersForTrip(owned()).animalKinds, undefined);
});

test('trip edit and duplicate preserve animal counts independently of the original and profile', () => {
  const initial = createOwnTripsState([owned()]);
  const copy = ownTripsReducer(initial, {
    type: 'duplicate',
    id: initial.trips[0].id,
  });
  const form = toTripForm(copy.trips[1]);
  form.animals.animals[0].count = 2;
  form.animals.welcomesAnimals = false;
  const saved = ownTripsReducer(copy, {
    type: 'save',
    id: copy.trips[1].id,
    form,
    groupId: MY_GROUP.id,
    draft: true,
    today: '2026-10-19',
  });
  assert.equal(saved.trips[1].animals.animals[0].count, 2);
  assert.equal(saved.trips[0].animals.animals[0].count, 1);
  assert.equal(saved.trips[0].animals.welcomesAnimals, true);
  assert.equal(MY_GROUP.animals.animals[0].count, 1);
});

test('animal labels and count validation are ordinary form data', () => {
  assert.equal(
    tripAnimalSummary(emptyAnimals()),
    'Bez zwierząt na tym wyjeździe',
  );
  assert.equal(tripAnimalSummary(MY_TRIPS[0].animals), 'Z psem');
  assert.equal(animalCountSummary([{ kind: 'dog', count: 2 }]), '2 psy');
  const form = toTripForm(owned());
  form.animals.animals[0].count = 0;
  assert.ok(validateTripForm(form).some((error) => error.includes('zwierząt')));
  form.animals = emptyAnimals();
  assert.deepEqual(validateTripForm(form), []);
});
