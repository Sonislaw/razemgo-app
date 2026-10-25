import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterPublicGroups, sortPublicGroups, INITIAL_GROUP_FILTERS, publicGroupFromRow, groupFiltersPayload, normalizeGroupSearch } from '../src/features/groups/group-data.ts';
import { groupCompatibility } from '../src/features/groups/group-compatibility.ts';
import { mailboxFromRow } from '../src/features/messaging/messaging-mapper.ts';
import { getGroupContact, isConversationAccepted, canSendToConversation } from '../src/features/messaging/messaging-state.ts';

const row = { crew: { id: 'crew', name: 'Łąkowe ścieżki', avatar_id: 'camp-bear', kind: 'family', adult_count: 2, child_count: 1,
  child_age_bands: ['4–6'], travel_mode: 'Kamper', interests: ['Rowery'], animal_kinds: ['dog'] }, about: 'W drogę!', active_trip_count: 0 };
test('group filters start unfiltered, support Polish names and match categories independently', () => {
  const family = publicGroupFromRow(row);
  const couple = publicGroupFromRow({ ...row, crew: { ...row.crew, id: 'couple', name: 'Dwoje w drodze', kind: 'couple', child_age_bands: [] }, active_trip_count: 1 });
  const all = [family, couple];
  assert.deepEqual(filterPublicGroups(all, INITIAL_GROUP_FILTERS), [couple, family]);
  assert.equal(normalizeGroupSearch('ŁĄĆĘŃÓŚŹŻ'), 'lacenoszz');
  assert.deepEqual(filterPublicGroups(all, { ...INITIAL_GROUP_FILTERS, name: 'lakowe sciezki', animalKinds: ['dog'], travelModes: ['Kamper'] }), [family]);
  assert.deepEqual(filterPublicGroups(all, { ...INITIAL_GROUP_FILTERS, hasTrips: true }), [couple]);
  assert.deepEqual(filterPublicGroups(all, { ...INITIAL_GROUP_FILTERS, groupKinds: ['family'], hasTrips: true }), []);
  assert.deepEqual(filterPublicGroups(all, { ...INITIAL_GROUP_FILTERS, interests: ['Kajaki'] }), []);
  assert.deepEqual(groupFiltersPayload(INITIAL_GROUP_FILTERS).group_kinds, []);
  assert.equal(groupFiltersPayload(INITIAL_GROUP_FILTERS).online_only, false);
  assert.deepEqual(filterPublicGroups(all, { ...INITIAL_GROUP_FILTERS, onlineOnly: true }), []);
  assert.deepEqual(filterPublicGroups(all, { ...INITIAL_GROUP_FILTERS, onlineOnly: true }, new Set(['couple'])), [couple]);
  assert.deepEqual(filterPublicGroups(all, { ...INITIAL_GROUP_FILTERS, onlineOnly: true, groupKinds: ['family'] }, new Set(['couple'])), []);
});

function matchingProfile() {
  return { group: publicGroupFromRow(row).group, matching: { groupKinds: ['family'], childAgeBands: ['4–6'], description: '' } };
}
test('profile compatibility checks both directions, weights preferences and ignores animals', () => {
  const a = matchingProfile(), b = matchingProfile();
  assert.equal(groupCompatibility(a, b).score, 100);
  b.matching.groupKinds = ['couple'];
  assert.equal(groupCompatibility(a, b).score, 83);
  assert.deepEqual(groupCompatibility(a, b), groupCompatibility(b, a));
  b.matching.groupKinds = ['family']; b.matching.childAgeBands = ['10–12'];
  assert.equal(groupCompatibility(a, b).score, 85);
  const before = groupCompatibility(a, b);
  b.group.animals.animals = [{ kind: 'cat' }];
  assert.deepEqual(groupCompatibility(a, b), before);
});
test('insufficient data never produces a percentage, and missing child ages are not a mismatch', () => {
  const a = matchingProfile(), b = matchingProfile();
  a.matching = { groupKinds: [], childAgeBands: [], description: '' };
  b.matching = { groupKinds: [], childAgeBands: [], description: '' };
  const sparse = groupCompatibility(a, b);
  assert.equal(sparse.score, null); assert.equal(sparse.evaluatedWeight, 35); assert.equal(sparse.limitedData, true);
  a.matching.groupKinds = ['family']; a.matching.childAgeBands = ['4–6'];
  b.group.childAgeBands = [];
  const unknownAges = groupCompatibility(a, b);
  assert.equal(unknownAges.evaluatedWeight, 70); assert.equal(unknownAges.limitedData, true);
  assert.equal(unknownAges.reasons.includes('Pasujący wiek dzieci'), false);
  b.group.childCount = 0;
  assert.ok(groupCompatibility(a, b).score < unknownAges.score);
});
test('group mapping and sorting preserve zero, put unscored last, and break ties alphabetically', () => {
  const scored = (id, name, score) => publicGroupFromRow({ ...row, crew: { ...row.crew, id, name },
    compatibility: { score, reasons: [], evaluated_weight: score === null ? 10 : 100, limited_data: score === null } });
  const source = [scored('none', 'AAA', null), scored('zero', 'Zero', 0), scored('best', 'Zeta', 90), scored('tie', 'Alpha', 90)];
  assert.deepEqual(sortPublicGroups(source, 'compatibility').map(g => g.group.id), ['tie', 'best', 'zero', 'none']);
  assert.deepEqual(sortPublicGroups(source, 'alphabetical').map(g => g.group.id), ['none', 'tie', 'zero', 'best']);
  assert.deepEqual(source.map(g => g.group.id), ['none', 'zero', 'best', 'tie']);
});
test('profile invitations map without inventing a trip and support accepted conversations', () => {
  const invitation = { id: 'inv', sender_group_id: 'me', recipient_group_id: 'crew', context_kind: 'profile', trip_id: null,
    trip_reference: null, trip_snapshot: null, source_trip_id: null, source_trip_snapshot: null, text: 'Cześć!', status: 'accepted', created_at: '2026-10-25T10:00:00Z' };
  const data = mailboxFromRow({ invitations: [invitation], contacts: [row.crew], blocked_group_ids: [], reports: [],
    conversations: [{ id: 'chat', invitation_id: 'inv', sender_group_id: 'me', recipient_group_id: 'crew', blocked: false, unread_count: 0, self_read_sequence: 0, other_read_sequence: 0, last_message: null }] }, 'me');
  assert.equal(data.invitations[0].tripId, null); assert.equal(data.conversations[0].context, 'profile'); assert.deepEqual(data.trips, {});
  const state = { ...data, loadStatus: 'ready' };
  assert.equal(isConversationAccepted(state, data.conversations[0]), true);
  assert.equal(canSendToConversation(state, 'chat'), true);
  assert.equal(getGroupContact(state, 'crew').kind, 'conversation');
  assert.equal(getGroupContact({ ...state, blockedGroupIds: ['crew'] }, 'crew').kind, 'blocked');
  assert.equal(getGroupContact({ ...state, conversations: [{ ...data.conversations[0], blocked: true }] }, 'crew').kind, 'blocked');
  assert.equal(getGroupContact({ ...state, conversations: [], invitations: [{ ...data.invitations[0], status: 'pending', direction: 'received' }] }, 'crew').kind, 'received');
});
