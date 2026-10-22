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
import { createOwnTripsState, newTripForm, ownTripsReducer, selectNextTrip, toTripForm } from '../src/features/trips/own-trips-state.ts';
import { selectHomeRecommendations } from '../src/features/discovery/filter-trips.ts';
import { selectLatestListing } from '../src/features/home/latest-listing.ts';

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

test('latest listing follows publication time rather than travel dates or input order', () => {
  const before = JSON.stringify(DEMO_PROPOSALS);
  for (const proposals of [DEMO_PROPOSALS, [...DEMO_PROPOSALS].reverse()]) {
    const latest = selectLatestListing(proposals, trips, MY_GROUP.id, '2026-10-22');
    assert.equal(latest.trip.id, 'demo-bieszczady');
    assert.equal(latest.own, false);
  }
  assert.equal(JSON.stringify(DEMO_PROPOSALS), before);
});

test('only active public listings appear, including newly published own trips, and blocked groups are skipped', () => {
  const own = { ...trips[0], id: 'new-own', publishedAt: '2026-10-22T10:30:00.000Z' };
  assert.deepEqual(selectLatestListing(DEMO_PROPOSALS, [own], MY_GROUP.id, today), { trip: own, own: true });
  for (const values of [
    { status: 'draft' }, { status: 'paused' }, { status: 'cancelled' },
    { status: 'completed' }, { visibility: 'private' },
    { startDate: '2025-01-01', endDate: '2025-01-05' },
  ]) {
    assert.equal(selectLatestListing(DEMO_PROPOSALS, [{ ...own, ...values }], MY_GROUP.id, today).trip.id, 'demo-bieszczady');
  }
  assert.equal(selectLatestListing(DEMO_PROPOSALS, [], MY_GROUP.id, today, ['demo-6']).trip.id, 'demo-friends');
  assert.equal(selectLatestListing([], [], MY_GROUP.id, today), undefined);
  assert.equal(selectLatestListing(DEMO_PROPOSALS, trips, MY_GROUP.id, '2028-01-01'), undefined);
});

test('new publication is timestamped once; editing and resuming do not make an older listing look new', () => {
  const publishedAt = '2026-10-22T10:30:00.000Z';
  let state = createOwnTripsState(trips);
  const form = { ...newTripForm(profile), ...toTripForm(trips[0]), description: 'Nowe ogłoszenie z prawdziwym czasem publikacji.' };
  const save = (id, draft, values = form, timestamp = publishedAt) => {
    state = ownTripsReducer(state, { type: 'save', id, draft, form: values, groupId: MY_GROUP.id, today: '2026-10-22', publishedAt: timestamp });
    return state.trips.find(trip => trip.id === state.lastSavedId);
  };
  const draft = save(undefined, true);
  assert.equal(draft.publishedAt, undefined);
  const published = save(draft.id, false);
  assert.equal(published.publishedAt, publishedAt);
  assert.equal(save(published.id, false, form, '2026-10-22T12:00:00.000Z').publishedAt, publishedAt);
  assert.equal(selectLatestListing(DEMO_PROPOSALS, state.trips, MY_GROUP.id, today).trip.id, published.id);
  state = ownTripsReducer(state, { type: 'status', id: published.id, status: 'paused', today });
  state = ownTripsReducer(state, { type: 'status', id: published.id, status: 'published', today, publishedAt: '2026-10-22T14:00:00.000Z' });
  assert.equal(state.trips.find(trip => trip.id === published.id).publishedAt, publishedAt);
  state = ownTripsReducer(state, { type: 'duplicate', id: published.id });
  assert.equal(state.trips.at(-1).publishedAt, undefined);
  state = ownTripsReducer(state, { type: 'delete', id: published.id });
  assert.equal(selectLatestListing(DEMO_PROPOSALS, state.trips, MY_GROUP.id, today).trip.id, 'demo-bieszczady');
});

test('first publication of a private plan gets its public timestamp and cold state initialization preserves it', () => {
  const values = { ...toTripForm(trips[0]), visibility: 'private' };
  let state = ownTripsReducer(createOwnTripsState([]), { type: 'save', form: values, draft: false, groupId: MY_GROUP.id, today });
  const id = state.lastSavedId;
  assert.equal(state.trips[0].publishedAt, undefined);
  state = ownTripsReducer(state, { type: 'status', id, status: 'published', today, publishedAt: '2026-10-22T15:00:00.000Z' });
  assert.equal(state.trips[0].publishedAt, '2026-10-22T15:00:00.000Z');
  assert.equal(createOwnTripsState(state.trips).trips[0].publishedAt, state.trips[0].publishedAt);
});

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
