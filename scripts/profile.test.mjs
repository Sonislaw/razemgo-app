import { profileToPayload } from '../src/features/profile/profile-mapper.ts';
import { newTripForm } from '../src/features/trips/own-trips-state.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MY_GROUP } from '../src/data/mocks/travel.ts';
import {
  cloneProfile,
  createEmptyProfile,
  normalizeProfile,
  validateProfile,
  formatGroupSize,
} from '../src/features/profile/profile-data.ts';
import {
  DEFAULT_PROFILE_AVATAR_ID,
  PROFILE_AVATARS,
} from '../src/features/profile/profile-avatar-data.ts';

const example = {
  group: MY_GROUP,
  matching: {
    groupKinds: ['family'],
    childAgeBands: ['7–9'],
    description: 'Spokojne wyjazdy.',
  },
};

test('avatar selection survives profile save and later edits without changing the original profile', () => {
  for (const avatar of PROFILE_AVATARS) {
    const draft = cloneProfile(example);
    draft.group.avatarId = avatar.id;
    const saved = normalizeProfile(draft);
    assert.equal(saved.group.avatarId, avatar.id);
    assert.deepEqual(validateProfile(saved), []);
    const laterDraft = cloneProfile(saved);
    laterDraft.group.avatarId = avatar.id === 'trail-fox' ? 'camp-bear' : 'trail-fox';
    assert.equal(saved.group.avatarId, avatar.id);
  }
  assert.equal(example.group.avatarId, undefined);
});

test('new profiles and older or unknown avatar values have a usable default without mutating input', () => {
  assert.equal(createEmptyProfile().group.avatarId, DEFAULT_PROFILE_AVATAR_ID);
  for (const avatarId of [undefined, null, '', 'removed-avatar', '../other-image.png']) {
    const legacy = { ...example, group: { ...example.group, avatarId } };
    assert.equal(cloneProfile(legacy).group.avatarId, DEFAULT_PROFILE_AVATAR_ID);
    assert.equal(normalizeProfile(legacy).group.avatarId, DEFAULT_PROFILE_AVATAR_ID);
    assert.equal(legacy.group.avatarId, avatarId);
  }
});

test('editing a draft does not mutate the current profile or mock arrays', () => {
  const before = JSON.stringify(example);
  const draft = cloneProfile(example);
  draft.group.childAgeBands.push('10–12');
  draft.group.interests.length = 0;
  draft.group.travelModes.push('Kamper');
  assert.equal(JSON.stringify(example), before);
});

test('two children may share one age band or leave age unspecified', () => {
  const draft = cloneProfile(example);
  draft.group.childAgeBands = ['4–6'];
  assert.deepEqual(validateProfile(draft), []);
  draft.group.childAgeBands = [];
  assert.deepEqual(validateProfile(draft), []);
  assert.equal(formatGroupSize(2, 2), '2 dorosłych · 2 dzieci');
});

test('travel mode is required and exclusive; legacy profiles retain their first choice without mutating the source', () => {
  const legacy = {
    ...example,
    group: { ...example.group, travelModes: ['Przyczepa', 'Samochód'] },
  };
  assert.deepEqual(cloneProfile(legacy).group.travelModes, ['Przyczepa']);
  assert.deepEqual(normalizeProfile(legacy).group.travelModes, ['Przyczepa']);
  assert.deepEqual(legacy.group.travelModes, ['Przyczepa', 'Samochód']);
  assert.deepEqual(validateProfile(legacy), ['Wybierz jeden sposób podróżowania.']);
  const draft = cloneProfile(example);
  draft.group.travelModes = [];
  assert.deepEqual(validateProfile(draft), ['Wybierz jeden sposób podróżowania.']);
  draft.group.travelModes = ['Kamper'];
  assert.deepEqual(validateProfile(draft), []);
});

test('normalizing an adult-only profile clears old ages and discards retired preferences', () => {
  const draft = cloneProfile(example);
  draft.group.childCount = 0;
  draft.group.adultCount = 1;
  draft.group.name = '  Nasza ekipa  ';
  const result = normalizeProfile(draft);
  assert.deepEqual(result.group.childAgeBands, []);
  assert.equal(Object.hasOwn(result, 'matching'), false);
  assert.equal(result.group.kind, example.group.kind);
  assert.equal(result.group.name, 'Nasza ekipa');
  assert.equal(formatGroupSize(1, 0), '1 dorosły · bez dzieci');
  assert.equal(draft.group.name, '  Nasza ekipa  ');
});

test('validation rejects blank identity, impossible ages and missing travel modes', () => {
  const draft = cloneProfile(example);
  draft.group.name = ' ';
  draft.group.childCount = 1;
  draft.group.travelModes = [];
  assert.equal(validateProfile(draft).length, 3);
});

test('crew names accept 2 through 20 characters and reject longer values', () => {
  const draft = cloneProfile(example);
  for (const length of [2, 19, 20]) {
    draft.group.name = 'ą'.repeat(length);
    assert.deepEqual(validateProfile(draft), []);
  }
  for (const length of [0, 1, 21, 40]) {
    draft.group.name = 'ą'.repeat(length);
    assert.deepEqual(validateProfile(draft), [
      'Nazwa ekipy powinna mieć od 2 do 20 znaków.',
    ]);
  }
  draft.group.name = `  ${'ą'.repeat(20)}  `;
  assert.deepEqual(validateProfile(normalizeProfile(draft)), []);
});

test('a new profile saves without a home location and older residence data is discarded', () => {
  const draft = createEmptyProfile();
  draft.group.name = 'Nasza ekipa';
  draft.group.travelModes = ['Przyczepa'];
  const saved = normalizeProfile(draft);
  assert.deepEqual(validateProfile(saved), []);
  assert.equal(Object.hasOwn(saved.group, 'homeLocation'), false);
  const legacy = {
    ...example,
    group: { ...example.group, homeLocation: 'Okolice Gdańska' },
  };
  assert.equal(
    Object.hasOwn(cloneProfile(legacy).group, 'homeLocation'),
    false,
  );
  assert.equal(
    Object.hasOwn(normalizeProfile(legacy).group, 'homeLocation'),
    false,
  );
  assert.equal(legacy.group.homeLocation, 'Okolice Gdańska');
});

test('legacy profile preferences are discarded by normalization and never saved or inherited by a new trip', () => {
  const draft = normalizeProfile(example);
  assert.equal(Object.hasOwn(draft, 'matching'), false);
  assert.equal(Object.hasOwn(profileToPayload(example), 'matching'), false);
  const form = newTripForm(example);
  assert.equal(Object.hasOwn(form, 'groupKinds'), false);
  assert.equal(Object.hasOwn(form, 'childAgeBands'), false);
  assert.deepEqual(validateProfile({ ...example, matching: { description: 'x'.repeat(300) } }), []);
});
