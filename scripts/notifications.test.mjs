import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEMO_PROPOSALS,
  MY_GROUP,
  MY_TRIPS,
} from '../src/data/mocks/travel.ts';
import { DEMO_MAILBOX } from '../src/data/mocks/messaging.ts';
import {
  createMessagingState,
  messagingReducer,
} from '../src/features/messaging/messaging-state.ts';
import {
  markNotificationsRead,
  notificationQuantity,
  selectHomeNotifications,
} from '../src/features/notifications/notification-state.ts';

const today = '2026-10-22';
const trips = MY_TRIPS.map((trip) => ({
  ...trip,
  status: 'published',
  visibility: 'public',
  travelModes: [...MY_GROUP.travelModes],
  matching: { groupKinds: ['family'], childAgeBands: ['4–6', '7–9'] },
}));
const select = (
  readKeys = [],
  own = trips,
  mailbox = createMessagingState(DEMO_MAILBOX),
  proposals = DEMO_PROPOSALS,
) => selectHomeNotifications(proposals, own, mailbox, readKeys, today);

test('summaries use actual proposals for a published plan and received pending invitations', () => {
  const before = JSON.stringify({ trips, DEMO_PROPOSALS, DEMO_MAILBOX });
  const result = select();
  assert.equal(result.suggestions.trip.id, 'demo-my-coast');
  assert.equal(result.suggestions.count, 2);
  assert.equal(result.invitations.count, 2);
  assert.equal(result.unreadCount, 2);
  assert.deepEqual(select([], [...trips].reverse()), result);
  assert.equal(JSON.stringify({ trips, DEMO_PROPOSALS, DEMO_MAILBOX }), before);
});

test('reading a summary only marks its keys and remains read after the panel is reopened', () => {
  const result = select();
  const original = [];
  let readKeys = markNotificationsRead(original, result.suggestions.keys);
  assert.deepEqual(original, []);
  assert.equal(select(readKeys).suggestions.unread, false);
  assert.equal(select(readKeys).invitations.unread, true);
  assert.equal(select(readKeys).unreadCount, 1);
  assert.strictEqual(
    markNotificationsRead(readKeys, result.suggestions.keys),
    readKeys,
  );
  readKeys = markNotificationsRead(readKeys, result.invitations.keys);
  assert.equal(select(readKeys).unreadCount, 0);
  assert.equal(select(readKeys).suggestions.count, 2);
  assert.equal(select(readKeys).invitations.count, 2);
});

test('new suggestions and invitations independently become unread; removal or reordering do not', () => {
  const initial = select();
  const read = markNotificationsRead(
    [],
    [...initial.suggestions.keys, ...initial.invitations.keys],
  );
  const proposal = {
    ...DEMO_PROPOSALS[0],
    trip: { ...DEMO_PROPOSALS[0].trip, id: 'another-matching-trip' },
  };
  const changed = select(read, trips, createMessagingState(DEMO_MAILBOX), [
    ...DEMO_PROPOSALS,
    proposal,
  ]);
  assert.equal(changed.suggestions.unread, true);
  assert.equal(changed.invitations.unread, false);
  assert.equal(
    select(read, trips, createMessagingState(DEMO_MAILBOX), [DEMO_PROPOSALS[0]])
      .suggestions.unread,
    false,
  );
  const mailbox = createMessagingState(DEMO_MAILBOX);
  mailbox.invitations.push({ ...mailbox.invitations[0], id: 'new-invitation' });
  assert.equal(select(read, trips, mailbox).invitations.unread, true);
  assert.equal(select(read, trips, mailbox).suggestions.unread, false);
});

test('private, unpublished, paused, invalid or ended own plans never generate proposals', () => {
  for (const values of [
    { status: 'draft' },
    { status: 'paused' },
    { status: 'completed' },
    { status: 'cancelled' },
    { visibility: 'private' },
    { startDate: '', endDate: '' },
    { startDate: '2026-01-01', endDate: '2026-01-04' },
  ]) {
    const result = select([], [{ ...trips[0], ...values }]);
    assert.equal(result.suggestions.count, 0);
    assert.equal(result.suggestions.trip, undefined);
    assert.equal(result.suggestions.unread, false);
  }
  const noMatches = select(
    [],
    [{ ...trips[0], startDate: '2028-01-01', endDate: '2028-01-05' }],
  );
  assert.equal(noMatches.suggestions.trip.id, trips[0].id);
  assert.equal(noMatches.suggestions.unread, false);
});

test('blocked people, self and expired proposals are omitted; invitation load failures are not new invitations', () => {
  const mailbox = createMessagingState(DEMO_MAILBOX);
  mailbox.blockedGroupIds = ['demo-1'];
  assert.equal(select([], trips, mailbox).suggestions.count, 1);
  assert.equal(select([], trips, mailbox).invitations.count, 1);
  const invalid = [
    {
      ...DEMO_PROPOSALS[0],
      trip: { ...DEMO_PROPOSALS[0].trip, groupId: MY_GROUP.id },
    },
    {
      ...DEMO_PROPOSALS[0],
      trip: { ...DEMO_PROPOSALS[0].trip, endDate: '2025-01-01' },
    },
  ];
  assert.equal(select([], trips, mailbox, invalid).suggestions.count, 0);
  for (const scenario of ['loading', 'error', 'empty', 'conversations']) {
    assert.equal(
      select([], trips, createMessagingState(DEMO_MAILBOX, scenario))
        .invitations.unread,
      false,
    );
  }
});

test('a newly published matching announcement gets separate suggestion read state', () => {
  const read = select().suggestions.keys;
  const newer = {
    ...trips[0],
    id: 'new-plan',
    publishedAt: '2026-10-22T10:00:00.000Z',
  };
  const result = select(read, [...trips, newer]);
  assert.equal(result.suggestions.trip.id, 'new-plan');
  assert.equal(result.suggestions.unread, true);
  assert.equal(
    select(markNotificationsRead(read, result.suggestions.keys), [
      ...trips,
      newer,
    ]).suggestions.unread,
    false,
  );
});

test('Polish notification counts use the correct singular and plural forms', () => {
  assert.equal(notificationQuantity(1, 'proposals'), '1 propozycja');
  assert.equal(notificationQuantity(2, 'proposals'), '2 propozycje');
  assert.equal(notificationQuantity(12, 'proposals'), '12 propozycji');
  assert.equal(notificationQuantity(1, 'invitations'), '1 zaproszenie');
  assert.equal(notificationQuantity(22, 'invitations'), '22 zaproszenia');
  assert.equal(notificationQuantity(5, 'invitations'), '5 zaproszeń');
  assert.equal(notificationQuantity(1, 'messages'), '1 wiadomość');
  assert.equal(notificationQuantity(2, 'messages'), '2 wiadomości');
  assert.equal(notificationQuantity(12, 'messages'), '12 wiadomości');
});

test('notification counts work when Intl.PluralRules is unavailable in the mobile runtime', () => {
  const original = Intl.PluralRules;
  try {
    Intl.PluralRules = undefined;
    assert.equal(notificationQuantity(1, 'proposals'), '1 propozycja');
    assert.equal(notificationQuantity(2, 'proposals'), '2 propozycje');
    assert.equal(notificationQuantity(0, 'proposals'), '0 propozycji');
    assert.equal(notificationQuantity(12, 'proposals'), '12 propozycji');
    assert.equal(notificationQuantity(21, 'invitations'), '21 zaproszeń');
    assert.equal(notificationQuantity(22, 'invitations'), '22 zaproszenia');
    assert.equal(notificationQuantity(101, 'invitations'), '101 zaproszeń');
    assert.equal(notificationQuantity(112, 'invitations'), '112 zaproszeń');
    assert.equal(notificationQuantity(123, 'invitations'), '123 zaproszenia');
    assert.equal(notificationQuantity(1, 'messages'), '1 wiadomość');
    assert.equal(notificationQuantity(22, 'messages'), '22 wiadomości');
  } finally {
    Intl.PluralRules = original;
  }
});

test('unread messages point to the conversation with the newest incoming message without mutating the mailbox', () => {
  const mailbox = createMessagingState(DEMO_MAILBOX, 'conversations');
  const before = JSON.stringify(mailbox);
  const result = select([], trips, mailbox);
  assert.equal(result.messages.count, 3);
  assert.equal(result.messages.conversationCount, 2);
  assert.equal(result.messages.conversation.id, 'conversation-in-coast');
  assert.equal(result.messages.unread, true);
  assert.equal(result.unreadCount, 2);
  assert.equal(JSON.stringify(mailbox), before);
  assert.equal(
    select([], trips, { ...mailbox, messages: [...mailbox.messages].reverse() })
      .messages.conversation.id,
    'conversation-in-coast',
  );
});

test('message notifications follow actual chat read state and reappear for a new incoming message', () => {
  let mailbox = createMessagingState(DEMO_MAILBOX, 'conversations');
  const initial = select([], trips, mailbox);
  const readKeys = markNotificationsRead([], initial.messages.keys);
  assert.equal(
    select(readKeys, trips, mailbox).messages.unread,
    true,
    'Opening a notification cannot acknowledge unread chats',
  );
  mailbox = messagingReducer(mailbox, {
    type: 'read',
    conversationId: 'conversation-in-coast',
  });
  const remaining = select(readKeys, trips, mailbox);
  assert.equal(remaining.messages.count, 1);
  assert.equal(
    remaining.messages.conversation.id,
    'conversation-out-mountains',
  );
  mailbox = messagingReducer(mailbox, {
    type: 'read',
    conversationId: remaining.messages.conversation.id,
  });
  assert.equal(select(readKeys, trips, mailbox).messages.unread, false);
  assert.equal(
    select(readKeys, trips, mailbox).messages.conversation,
    undefined,
  );
  mailbox = messagingReducer(mailbox, {
    type: 'receive-demo',
    conversationId: 'conversation-in-lake',
  });
  assert.equal(select(readKeys, trips, mailbox).messages.unread, true);
  assert.equal(select(readKeys, trips, mailbox).messages.count, 1);
  assert.equal(
    select(readKeys, trips, mailbox).messages.conversation.id,
    'conversation-in-lake',
  );
});

test('message notifications ignore blocked or unauthorized chats, outgoing, failed and already read messages', () => {
  const mailbox = createMessagingState(DEMO_MAILBOX, 'conversations');
  const ignored = mailbox.messages.map((message) => ({
    ...message,
    read: true,
  }));
  for (const values of [
    { sender: 'self' },
    { status: 'failed' },
    { conversationId: 'nonexistent' },
  ]) {
    const state = {
      ...mailbox,
      messages: [...ignored, { ...mailbox.messages[2], ...values }],
    };
    assert.equal(select([], trips, state).messages.count, 0);
  }
  const blocked = messagingReducer(mailbox, {
    type: 'block',
    groupId: 'demo-1',
  });
  assert.equal(select([], trips, blocked).messages.count, 1);
  assert.equal(
    select([], trips, { ...mailbox, invitations: [] }).messages.count,
    0,
  );
  for (const loadStatus of ['loading', 'error']) {
    assert.equal(
      select([], trips, { ...mailbox, loadStatus }).messages.count,
      0,
    );
  }
  assert.equal(select().messages.unread, false);
});
