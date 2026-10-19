import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEMO_PROPOSALS,
  MY_GROUP,
  MY_TRIPS,
} from '../src/data/mocks/travel.ts';
import {
  cloneProfile,
  createEmptyProfile,
  validateProfile,
} from '../src/features/profile/profile-data.ts';
import { selectNextTrip } from '../src/features/trips/own-trips-state.ts';
import { selectHomeRecommendations } from '../src/features/discovery/filter-trips.ts';

const today = '2026-10-18';
const profile = {
  group: MY_GROUP,
  matching: {
    groupKinds: ['family'],
    childAgeBands: ['4–6', '7–9'],
    description: '',
  },
};
const trips = MY_TRIPS.map((trip) => ({
  ...trip,
  status: 'published',
  visibility: 'public',
  travelModes: [...MY_GROUP.travelModes],
  matching: { groupKinds: ['family'], childAgeBands: ['4–6', '7–9'] },
}));

test('nearest scheduled trip is selected by date without mutating order or including drafts, cancellations or ended plans', () => {
  const candidates = [...trips].reverse();
  const before = JSON.stringify(candidates);
  assert.equal(selectNextTrip(candidates, today).id, 'demo-my-coast');
  assert.equal(JSON.stringify(candidates), before);
  assert.equal(
    selectNextTrip(
      [
        { ...trips[0], status: 'draft' },
        { ...trips[1], status: 'cancelled' },
      ],
      today,
    ),
    undefined,
  );
  assert.equal(selectNextTrip(trips, '2027-06-07'), undefined);
  assert.equal(
    selectNextTrip([{ ...trips[0], startDate: '', endDate: '' }], today),
    undefined,
  );
});

test('a trip in progress takes precedence; paused/private travel is still an actual journey', () => {
  const nearest = selectNextTrip(
    [{ ...trips[0], status: 'paused', visibility: 'private' }, trips[1]],
    '2027-05-22',
  );
  assert.equal(nearest.id, 'demo-my-coast');
  assert.equal(
    selectNextTrip([{ ...trips[0], status: 'completed' }], today),
    undefined,
  );
});

test('trip recommendations combine date, region, group and optional ages and explain real shared nights', () => {
  const result = selectHomeRecommendations(
    DEMO_PROPOSALS,
    profile,
    trips,
    today,
  );
  assert.deepEqual(
    result.map((item) => item.proposal.trip.id),
    ['demo-coast', 'demo-forest'],
  );
  assert.ok(
    result.every(
      (item) =>
        item.source === 'trip' &&
        item.ownTripId === 'demo-my-coast' &&
        item.nights === 2,
    ),
  );
  assert.ok(result[0].commonInterests.includes('Rowery'));
  assert.ok(!result.some((item) => item.proposal.trip.id === 'demo-lake'));
});

test('recommendations use exact trip dates and ignore legacy tolerance in both planning modes', () => {
  const late = {
    ...DEMO_PROPOSALS[0],
    trip: {
      ...DEMO_PROPOSALS[0].trip,
      startDate: '2027-05-24',
      endDate: '2027-05-30',
    },
  };
  const { destination, ...base } = trips[0];
  const flexible = {
    ...base,
    mode: 'flexible',
    travelArea: destination,
    dateFlexibilityDays: 3,
  };
  const result = selectHomeRecommendations(
    [late],
    profile,
    [flexible, flexible],
    today,
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].nights, 0);
  assert.equal(result[0].dateShifted, false);
  assert.notEqual(result[0].source, 'trip');
  const fixed = selectHomeRecommendations(
    [late],
    profile,
    [{ ...trips[0], dateFlexibilityDays: 3 }],
    today,
  );
  assert.equal(fixed[0].nights, 0);
  assert.equal(fixed[0].dateShifted, false);
  assert.notEqual(fixed[0].source, 'trip');
});

test('without a searchable plan, profile interests drive suggestions and never invent date agreement', () => {
  const result = selectHomeRecommendations(
    DEMO_PROPOSALS,
    profile,
    [{ ...trips[0], status: 'paused' }],
    today,
  );
  assert.ok(result.length > 0 && result.length <= 3);
  assert.ok(
    result.every(
      (item) =>
        item.source === 'interests' &&
        item.nights === 0 &&
        item.ownTripId === undefined,
    ),
  );
  assert.ok(result.every((item) => item.commonInterests.length > 0));
  const changed = cloneProfile(profile);
  changed.group.interests = ['Kajaki'];
  assert.deepEqual(
    selectHomeRecommendations(DEMO_PROPOSALS, changed, [], today).map(
      (item) => item.proposal.trip.id,
    ),
    ['demo-lake'],
  );
});

test('unmatched or new profiles get honest inspirations instead of fabricated compatibility reasons', () => {
  const fresh = createEmptyProfile();
  assert.ok(validateProfile(fresh).length);
  const result = selectHomeRecommendations(DEMO_PROPOSALS, fresh, [], today);
  assert.equal(result.length, 3);
  assert.ok(
    result.every(
      (item) =>
        item.source === 'inspiration' &&
        !item.nights &&
        !item.commonInterests.length,
    ),
  );
  const other = createEmptyProfile();
  fresh.group.interests.push('Rowery');
  assert.deepEqual(other.group.interests, []);
});

test('blocked groups, self, expired plans and duplicate crews do not enter the three previews', () => {
  const proposals = [
    DEMO_PROPOSALS[0],
    {
      ...DEMO_PROPOSALS[0],
      trip: { ...DEMO_PROPOSALS[0].trip, id: 'duplicate', interests: [] },
    },
    ...DEMO_PROPOSALS.slice(1),
    {
      trip: { ...DEMO_PROPOSALS[0].trip, groupId: MY_GROUP.id },
      group: MY_GROUP,
    },
  ];
  const snapshot = JSON.stringify(proposals);
  const result = selectHomeRecommendations(proposals, profile, trips, today, [
    'demo-4',
  ]);
  assert.deepEqual(
    result.map((item) => item.proposal.trip.id),
    ['demo-coast'],
  );
  assert.ok(
    result[0].commonInterests.includes('Rowery'),
    'best preview wins for a duplicate crew',
  );
  assert.equal(JSON.stringify(proposals), snapshot);
  assert.deepEqual(
    selectHomeRecommendations(DEMO_PROPOSALS, profile, trips, '2028-01-01'),
    [],
  );
});

test('generic results are deterministic and bounded', () => {
  const changed = cloneProfile(profile);
  changed.group.interests = [];
  changed.matching.groupKinds = [];
  changed.matching.childAgeBands = [];
  changed.group.childAgeBands = [];
  const first = selectHomeRecommendations(DEMO_PROPOSALS, changed, [], today);
  assert.equal(first.length, 3);
  assert.ok(first.every((item) => item.source === 'inspiration'));
  assert.deepEqual(
    first,
    selectHomeRecommendations(
      [...DEMO_PROPOSALS].reverse(),
      changed,
      [],
      today,
    ),
  );
});
