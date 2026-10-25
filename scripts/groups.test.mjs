import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterPublicGroups, INITIAL_GROUP_FILTERS, publicGroupFromRow, groupFiltersPayload, normalizeGroupSearch } from '../src/features/groups/group-data.ts';
import { mailboxFromRow } from '../src/features/messaging/messaging-mapper.ts';
import { getGroupContact, isConversationAccepted, canSendToConversation } from '../src/features/messaging/messaging-state.ts';

const row = { crew: { id: 'crew', name: 'Łąkowe ścieżki', avatar_id: 'camp-bear', kind: 'family', adult_count: 2, child_count: 1,
  child_age_bands: ['4–6'], travel_mode: 'Kamper', interests: ['Rowery'], animal_kinds: ['dog'] }, about: 'W drogę!', active_trip_count: 0 };
test('group filters default to families, support Polish names and match categories independently', () => {
  const family = publicGroupFromRow(row);
  const couple = publicGroupFromRow({ ...row, crew: { ...row.crew, id: 'couple', name: 'Dwoje w drodze', kind: 'couple', child_age_bands: [] }, active_trip_count: 1 });
  const all = [family, couple];
  assert.deepEqual(filterPublicGroups(all, INITIAL_GROUP_FILTERS), [family]);
  assert.equal(normalizeGroupSearch('ŁĄĆĘŃÓŚŹŻ'), 'lacenoszz');
  assert.deepEqual(filterPublicGroups(all, { ...INITIAL_GROUP_FILTERS, name: 'lakowe sciezki', animalKinds: ['dog'], travelModes: ['Kamper'] }), [family]);
  assert.deepEqual(filterPublicGroups(all, { ...INITIAL_GROUP_FILTERS, hasTrips: true }), []);
  assert.deepEqual(filterPublicGroups(all, { ...INITIAL_GROUP_FILTERS, groupKinds: [], hasTrips: true }), [couple]);
  assert.deepEqual(filterPublicGroups(all, { ...INITIAL_GROUP_FILTERS, interests: ['Kajaki'] }), []);
  assert.deepEqual(groupFiltersPayload(INITIAL_GROUP_FILTERS).group_kinds, ['family']);
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
