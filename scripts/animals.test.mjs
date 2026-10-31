import { selectHomeRecommendations } from './support/legacy-matching/filter-trips.ts';
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
import { INITIAL_FILTERS, filterProposals } from '../src/features/discovery/filter-trips.ts';
import {
  animalSummary,
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
  travelModes: ['Kamper'],
  matching: { groupKinds: [], childAgeBands: [] },
});

test('animal profiles keep optional species and discard removed counts and welcoming preferences', () => {
  const value = profile();
  value.group.animals = {
    animals: [{ kind: 'dog', count: 2 }],
    welcomesAnimals: true,
  };
  const normalized = normalizeProfile(value);
  assert.deepEqual(validateProfile(normalized), []);
  assert.equal(
    Object.hasOwn(normalized.group.animals, 'welcomesAnimals'),
    false,
  );
  assert.equal(value.group.animals.welcomesAnimals, true);
  assert.deepEqual(normalized.group.animals.animals, [{ kind: 'dog' }]);
  assert.equal(value.group.animals.animals[0].count, 2);
});

test('new trips inherit a separate editable animal list without any confirmation state', () => {
  const value = profile();
  value.group.animals.welcomesAnimals = true;
  const draft = newTripForm(value);
  assert.equal(draft.animals.animals[0].kind, 'dog');
  assert.equal(Object.hasOwn(draft.animals, 'attendance'), false);
  assert.equal(Object.hasOwn(draft.animals, 'welcomesAnimals'), false);
  assert.equal(Object.hasOwn(draft.animals.animals[0], 'count'), false);
  draft.animals.animals[0].kind = 'cat';
  assert.equal(value.group.animals.animals[0].kind, 'dog');
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

test('trip edit and duplicate preserve species independently and discard legacy counts', () => {
  const legacy = {
    ...owned(),
    animals: { animals: [{ kind: 'dog', count: 2 }] },
  };
  const initial = createOwnTripsState([legacy]);
  const copy = ownTripsReducer(initial, {
    type: 'duplicate',
    id: initial.trips[0].id,
  });
  const form = toTripForm(copy.trips[1]);
  assert.equal(Object.hasOwn(form.animals.animals[0], 'count'), false);
  form.animals.animals[0].kind = 'cat';
  const saved = ownTripsReducer(copy, {
    type: 'save',
    id: copy.trips[1].id,
    form,
    groupId: MY_GROUP.id,
    draft: true,
    today: '2026-10-19',
  });
  assert.deepEqual(saved.trips[1].animals.animals, [{ kind: 'cat' }]);
  assert.deepEqual(saved.trips[0].animals.animals, [{ kind: 'dog' }]);
  assert.equal(Object.hasOwn(saved.trips[0].animals, 'welcomesAnimals'), false);
  assert.equal(Object.hasOwn(saved.trips[1].animals, 'welcomesAnimals'), false);
  assert.deepEqual(MY_GROUP.animals.animals, [{ kind: 'dog' }]);
  assert.equal(legacy.animals.animals[0].count, 2);
});

test('animal labels only signal species and validation accepts optional selections', () => {
  assert.equal(
    tripAnimalSummary(emptyAnimals()),
    'Bez zwierząt na tym wyjeździe',
  );
  assert.equal(tripAnimalSummary(MY_TRIPS[0].animals), 'Z psem');
  assert.equal(animalSummary([{ kind: 'dog' }, { kind: 'cat' }]), 'Pies · Kot');
  assert.equal(
    tripAnimalSummary({ animals: [{ kind: 'dog', count: 2 }] }),
    'Z psem',
  );
  const form = toTripForm(owned());
  form.animals.animals[0].kind = 'unknown';
  assert.ok(validateTripForm(form).some((error) => error.includes('zwierząt')));
  form.animals = emptyAnimals();
  assert.deepEqual(validateTripForm(form), []);
});
