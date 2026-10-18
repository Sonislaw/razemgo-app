import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEMO_MAILBOX } from '../src/data/mocks/messaging.ts';
import {
  canSendToConversation,
  createMessagingState,
  getTripContact,
  isConversationAccepted,
  MAX_INVITATION_LENGTH,
  MAX_MESSAGE_LENGTH,
  messagingReducer as reduce,
  notificationCount,
  unreadCount,
} from '../src/features/messaging/messaging-state.ts';

const initial = () => createMessagingState(DEMO_MAILBOX);
const populated = () => createMessagingState(DEMO_MAILBOX, 'conversations');
const accept = (state) =>
  reduce(state, { type: 'accept', invitationId: 'in-coast' });

test('initial inbox separates pending invitations from conversations and counts notifications', () => {
  const state = initial();
  assert.equal(state.conversations.length, 0);
  assert.equal(notificationCount(state), 2);
  assert.equal(getTripContact(state, 'demo-1', 'demo-coast').kind, 'received');
  assert.equal(getTripContact(state, 'demo-3', 'demo-mountains').kind, 'sent');
  assert.equal(canSendToConversation(state, 'conversation-in-coast'), false);
  assert.equal(
    reduce(state, {
      type: 'send',
      conversationId: 'conversation-in-coast',
      text: 'Hej',
    }),
    state,
  );
});

test('accepting creates one authorized conversation and repeated acceptance is a no-op', () => {
  const state = accept(initial());
  assert.equal(state.view, 'conversations');
  assert.equal(state.conversations.length, 1);
  assert.equal(isConversationAccepted(state, state.conversations[0]), true);
  assert.equal(canSendToConversation(state, state.conversations[0].id), true);
  assert.equal(state.messages[0].text, DEMO_MAILBOX.invitations[0].text);
  assert.equal(unreadCount(state, state.conversations[0].id), 1);
  assert.equal(notificationCount(state), 2);
  assert.equal(accept(state), state);
  assert.equal(
    getTripContact(state, 'demo-1', 'demo-coast').kind,
    'conversation',
  );
});

test('declining needs no reason, withdrawing only affects sent invitations, neither permits chat', () => {
  let state = reduce(initial(), { type: 'decline', invitationId: 'in-coast' });
  assert.equal(state.invitations[0].status, 'declined');
  assert.equal(state.conversations.length, 0);
  assert.equal(accept(state), state);
  assert.equal(notificationCount(state), 1);
  assert.equal(
    reduce(state, { type: 'withdraw', invitationId: 'in-lake' }),
    state,
  );
  state = reduce(state, { type: 'withdraw', invitationId: 'out-mountains' });
  assert.equal(
    state.invitations.find((item) => item.id === 'out-mountains').status,
    'withdrawn',
  );
  assert.equal(
    reduce(state, {
      type: 'accept',
      invitationId: 'out-mountains',
      demoOutgoing: true,
    }),
    state,
  );
});

test('sent invitations cannot be accepted by the sender outside an explicit demo action', () => {
  const state = initial();
  assert.equal(
    reduce(state, { type: 'accept', invitationId: 'out-mountains' }),
    state,
  );
  const accepted = reduce(state, {
    type: 'accept',
    invitationId: 'out-mountains',
    demoOutgoing: true,
  });
  assert.equal(accepted.conversations.length, 1);
  assert.equal(accepted.messages[0].sender, 'self');
  assert.equal(unreadCount(accepted, accepted.conversations[0].id), 0);
});

test('new invitation validates text, prevents duplicate contact, and opens sent view', () => {
  const state = initial();
  const action = {
    type: 'invite',
    groupId: 'demo-5',
    tripId: 'demo-friends',
    text: '  Cześć!  ',
  };
  assert.equal(reduce(state, { ...action, text: ' ' }), state);
  assert.equal(
    reduce(state, { ...action, text: 'x'.repeat(MAX_INVITATION_LENGTH + 1) }),
    state,
  );
  const invited = reduce(state, action);
  assert.equal(invited.invitations[0].text, 'Cześć!');
  assert.equal(invited.direction, 'sent');
  assert.equal(invited.view, 'invitations');
  assert.equal(reduce(invited, action), invited);
  assert.equal(
    reduce(accept(state), {
      ...action,
      groupId: 'demo-1',
      tripId: 'demo-coast',
    }).invitations.length,
    4,
  );
});

test('read counts only incoming unread messages; other conversations stay unread', () => {
  const state = populated();
  assert.equal(notificationCount(state), 3);
  const read = reduce(state, {
    type: 'read',
    conversationId: 'conversation-in-coast',
  });
  assert.equal(unreadCount(read, 'conversation-in-coast'), 0);
  assert.equal(notificationCount(read), 1);
  assert.equal(
    reduce(read, { type: 'read', conversationId: 'conversation-in-coast' }),
    read,
  );
});

test('failed send keeps text and retry reuses message id without duplicating it', () => {
  let state = reduce(accept(initial()), { type: 'send-error', value: true });
  state = reduce(state, {
    type: 'send',
    conversationId: 'conversation-in-coast',
    text: '  Do zobaczenia!  ',
  });
  const failed = state.messages.at(-1);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.text, 'Do zobaczenia!');
  assert.equal(reduce(state, { type: 'retry', messageId: failed.id }), state);
  state = reduce(state, { type: 'send-error', value: false });
  const retried = reduce(state, { type: 'retry', messageId: failed.id });
  assert.equal(retried.messages.length, state.messages.length);
  assert.equal(retried.messages.at(-1).id, failed.id);
  assert.equal(retried.messages.at(-1).status, 'sent');
  assert.equal(
    reduce(retried, { type: 'retry', messageId: failed.id }),
    retried,
  );
});

test('blank, oversized, unaccepted and mismatched conversations cannot receive sends', () => {
  const state = accept(initial());
  for (const text of [' ', 'x'.repeat(MAX_MESSAGE_LENGTH + 1)])
    assert.equal(
      reduce(state, {
        type: 'send',
        conversationId: 'conversation-in-coast',
        text,
      }),
      state,
    );
  const forged = {
    ...state,
    conversations: [{ ...state.conversations[0], groupId: 'demo-2' }],
  };
  assert.equal(
    canSendToConversation(forged, forged.conversations[0].id),
    false,
  );
  assert.equal(
    reduce(forged, {
      type: 'send',
      conversationId: forged.conversations[0].id,
      text: 'Hej',
    }),
    forged,
  );
});

test('blocking suppresses contact and unread counts and is reversible', () => {
  const state = populated();
  const blocked = reduce(state, { type: 'block', groupId: 'demo-1' });
  assert.equal(notificationCount(blocked), 1);
  assert.equal(getTripContact(blocked, 'demo-1', 'demo-coast').kind, 'blocked');
  assert.equal(
    reduce(blocked, {
      type: 'send',
      conversationId: 'conversation-in-coast',
      text: 'Hej',
    }),
    blocked,
  );
  assert.equal(
    reduce(blocked, {
      type: 'receive-demo',
      conversationId: 'conversation-in-coast',
    }),
    blocked,
  );
  const unblocked = reduce(blocked, { type: 'unblock', groupId: 'demo-1' });
  assert.equal(canSendToConversation(unblocked, 'conversation-in-coast'), true);
  assert.equal(notificationCount(unblocked), 1);
  const blockedInvitation = reduce(initial(), {
    type: 'block',
    groupId: 'demo-1',
  });
  assert.equal(notificationCount(blockedInvitation), 1);
  assert.equal(accept(blockedInvitation), blockedInvitation);
});

test('reports are local structured records tied to accepted conversations', () => {
  const state = accept(initial());
  const reported = reduce(state, {
    type: 'report',
    conversationId: 'conversation-in-coast',
    reason: 'Spam',
  });
  assert.equal(reported.reports.length, 1);
  assert.equal(reported.reports[0].groupId, 'demo-1');
  assert.equal(
    reduce(initial(), {
      type: 'report',
      conversationId: 'unknown',
      reason: 'Spam',
    }).reports.length,
    0,
  );
});

test('loading and error states disable mutation and expose explicit retry', () => {
  for (const scenario of ['loading', 'error']) {
    const state = createMessagingState(DEMO_MAILBOX, scenario);
    assert.equal(notificationCount(state), 0);
    assert.equal(accept(state), state);
    assert.equal(
      reduce(state, {
        type: 'invite',
        groupId: 'demo-5',
        tripId: 'demo-friends',
        text: 'Hej',
      }),
      state,
    );
    assert.equal(notificationCount(reduce(state, { type: 'ready' })), 2);
  }
});

test('scenarios clone fixtures; restart clears local changes and child metadata never enters messages', () => {
  const before = JSON.stringify(DEMO_MAILBOX);
  const state = accept(initial());
  state.invitations[0].text = 'Zmieniony tekst';
  state.messages[0].text = 'Zmiana';
  assert.equal(JSON.stringify(DEMO_MAILBOX), before);
  const blank = createMessagingState(DEMO_MAILBOX, 'empty');
  assert.equal(notificationCount(blank), 0);
  assert.equal(blank.invitations.length, 0);
  assert.equal(initial().conversations.length, 0);
  for (const message of [...state.messages, ...populated().messages]) {
    assert.equal('childAgeBands' in message, false);
    assert.equal('homeLocation' in message, false);
  }
});
