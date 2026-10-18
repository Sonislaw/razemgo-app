import type {
  ChatMessage,
  Conversation,
  InvitationDirection,
  MailboxScenario,
  MailboxView,
  MessagingSeed,
  MessagingState,
  ReportReason,
} from '../../types/messaging';

export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_INVITATION_LENGTH = 500;
const DEMO_TIME = Date.parse('2027-05-18T12:45:00.000Z');
const demoTimestamp = (sequence: number) =>
  new Date(DEMO_TIME + sequence * 60_000).toISOString();

export function createMessagingState(
  seed: MessagingSeed,
  scenario: MailboxScenario = 'initial',
): MessagingState {
  const populated = scenario === 'conversations';
  return {
    invitations: (scenario === 'empty'
      ? []
      : populated
        ? seed.acceptedInvitations
        : seed.invitations
    ).map((item) => ({ ...item })),
    conversations: populated
      ? seed.conversations.map((item) => ({ ...item }))
      : [],
    messages: populated ? seed.messages.map((item) => ({ ...item })) : [],
    blockedGroupIds: [],
    reports: [],
    nextSequence: 100,
    view: 'conversations',
    direction: 'received',
    loadStatus:
      scenario === 'loading'
        ? 'loading'
        : scenario === 'error'
          ? 'error'
          : 'ready',
    simulateSendError: false,
  };
}

export function isConversationAccepted(
  state: MessagingState,
  conversation: Conversation,
): boolean {
  return state.invitations.some(
    (invitation) =>
      invitation.id === conversation.invitationId &&
      invitation.status === 'accepted' &&
      invitation.groupId === conversation.groupId &&
      invitation.tripId === conversation.tripId,
  );
}
export function canSendToConversation(
  state: MessagingState,
  conversationId: string,
): boolean {
  const conversation = state.conversations.find(
    (item) => item.id === conversationId,
  );
  return (
    state.loadStatus === 'ready' &&
    !!conversation &&
    !state.blockedGroupIds.includes(conversation.groupId) &&
    isConversationAccepted(state, conversation)
  );
}
export function unreadCount(
  state: MessagingState,
  conversationId: string,
): number {
  const conversation = state.conversations.find(
    (item) => item.id === conversationId,
  );
  if (
    !conversation ||
    state.blockedGroupIds.includes(conversation.groupId) ||
    !isConversationAccepted(state, conversation)
  )
    return 0;
  return state.messages.filter(
    (message) =>
      message.conversationId === conversationId &&
      message.sender === 'other' &&
      !message.read &&
      message.status === 'sent',
  ).length;
}
export function pendingReceivedCount(state: MessagingState): number {
  return state.invitations.filter(
    (item) =>
      item.direction === 'received' &&
      item.status === 'pending' &&
      !state.blockedGroupIds.includes(item.groupId),
  ).length;
}
export function notificationCount(state: MessagingState): number {
  if (state.loadStatus !== 'ready') return 0;
  return (
    pendingReceivedCount(state) +
    state.conversations.reduce(
      (sum, conversation) => sum + unreadCount(state, conversation.id),
      0,
    )
  );
}
export function getTripContact(
  state: MessagingState,
  groupId: string,
  tripId: string,
) {
  if (state.blockedGroupIds.includes(groupId))
    return { kind: 'blocked' } as const;
  const conversation = state.conversations.find(
    (item) =>
      item.groupId === groupId &&
      item.tripId === tripId &&
      isConversationAccepted(state, item),
  );
  if (conversation) return { kind: 'conversation', conversation } as const;
  const invitation = state.invitations.find(
    (item) =>
      item.groupId === groupId &&
      item.tripId === tripId &&
      item.status === 'pending',
  );
  if (invitation) return { kind: invitation.direction, invitation } as const;
  return { kind: 'available' } as const;
}

export type MessagingAction =
  | { type: 'view'; view: MailboxView; direction?: InvitationDirection }
  | { type: 'reset'; state: MessagingState }
  | { type: 'ready' }
  | { type: 'send-error'; value: boolean }
  | { type: 'accept'; invitationId: string; demoOutgoing?: boolean }
  | { type: 'decline' | 'withdraw'; invitationId: string }
  | { type: 'invite'; groupId: string; tripId: string; text: string }
  | { type: 'read'; conversationId: string }
  | { type: 'send'; conversationId: string; text: string }
  | { type: 'retry'; messageId: string }
  | { type: 'receive-demo'; conversationId: string }
  | { type: 'block' | 'unblock'; groupId: string }
  | { type: 'report'; conversationId: string; reason: ReportReason };

export function messagingReducer(
  state: MessagingState,
  action: MessagingAction,
): MessagingState {
  switch (action.type) {
    case 'reset':
      return action.state;
    case 'view':
      return {
        ...state,
        view: action.view,
        direction: action.direction ?? state.direction,
      };
    case 'ready':
      return { ...state, loadStatus: 'ready' };
    case 'send-error':
      return { ...state, simulateSendError: action.value };
    case 'accept': {
      const invitation = state.invitations.find(
        (item) => item.id === action.invitationId,
      );
      if (
        state.loadStatus !== 'ready' ||
        !invitation ||
        invitation.status !== 'pending' ||
        state.blockedGroupIds.includes(invitation.groupId) ||
        (invitation.direction !== 'received' && !action.demoOutgoing)
      )
        return state;
      const existing = state.conversations.find(
        (item) =>
          item.groupId === invitation.groupId &&
          item.tripId === invitation.tripId,
      );
      const conversationId = existing?.id ?? 'conversation-' + invitation.id;
      return {
        ...state,
        view: 'conversations',
        invitations: state.invitations.map((item) =>
          item.id === invitation.id ? { ...item, status: 'accepted' } : item,
        ),
        conversations: existing
          ? state.conversations
          : [
              ...state.conversations,
              {
                id: conversationId,
                invitationId: invitation.id,
                groupId: invitation.groupId,
                tripId: invitation.tripId,
              },
            ],
        messages: existing
          ? state.messages
          : [
              ...state.messages,
              {
                id: 'local-message-' + state.nextSequence,
                conversationId,
                sender: invitation.direction === 'received' ? 'other' : 'self',
                text: invitation.text,
                createdAt: invitation.createdAt,
                status: 'sent',
                read: invitation.direction === 'sent',
              },
            ],
        nextSequence: state.nextSequence + 1,
      };
    }
    case 'decline':
    case 'withdraw': {
      const invitation = state.invitations.find(
        (item) => item.id === action.invitationId,
      );
      const direction = action.type === 'decline' ? 'received' : 'sent';
      if (
        !invitation ||
        invitation.direction !== direction ||
        invitation.status !== 'pending' ||
        state.loadStatus !== 'ready'
      )
        return state;
      return {
        ...state,
        invitations: state.invitations.map((item) =>
          item.id === invitation.id
            ? {
                ...item,
                status: action.type === 'decline' ? 'declined' : 'withdrawn',
              }
            : item,
        ),
      };
    }
    case 'invite': {
      const text = action.text.trim();
      if (
        state.loadStatus !== 'ready' ||
        !text ||
        text.length > MAX_INVITATION_LENGTH ||
        getTripContact(state, action.groupId, action.tripId).kind !==
          'available'
      )
        return state;
      return {
        ...state,
        view: 'invitations',
        direction: 'sent',
        nextSequence: state.nextSequence + 1,
        invitations: [
          {
            id: 'local-inv-' + state.nextSequence,
            groupId: action.groupId,
            tripId: action.tripId,
            direction: 'sent',
            status: 'pending',
            text,
            createdAt: demoTimestamp(state.nextSequence),
          },
          ...state.invitations,
        ],
      };
    }
    case 'read': {
      if (!unreadCount(state, action.conversationId)) return state;
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.conversationId === action.conversationId &&
          message.sender === 'other'
            ? { ...message, read: true }
            : message,
        ),
      };
    }
    case 'send': {
      const text = action.text.trim();
      if (
        !text ||
        text.length > MAX_MESSAGE_LENGTH ||
        !canSendToConversation(state, action.conversationId)
      )
        return state;
      const message: ChatMessage = {
        id: 'local-message-' + state.nextSequence,
        conversationId: action.conversationId,
        sender: 'self',
        text,
        createdAt: demoTimestamp(state.nextSequence),
        status: state.simulateSendError ? 'failed' : 'sent',
        read: true,
      };
      return {
        ...state,
        nextSequence: state.nextSequence + 1,
        messages: [...state.messages, message],
      };
    }
    case 'retry': {
      const message = state.messages.find(
        (item) => item.id === action.messageId,
      );
      if (
        !message ||
        message.sender !== 'self' ||
        message.status !== 'failed' ||
        state.simulateSendError ||
        !canSendToConversation(state, message.conversationId)
      )
        return state;
      return {
        ...state,
        messages: state.messages.map((item) =>
          item.id === message.id ? { ...item, status: 'sent' } : item,
        ),
      };
    }
    case 'receive-demo': {
      if (!canSendToConversation(state, action.conversationId)) return state;
      return {
        ...state,
        nextSequence: state.nextSequence + 1,
        messages: [
          ...state.messages,
          {
            id: 'local-message-' + state.nextSequence,
            conversationId: action.conversationId,
            sender: 'other',
            text: 'Dzięki za wiadomość! Porozmawiajmy o wspólnym wyjeździe.',
            createdAt: demoTimestamp(state.nextSequence),
            status: 'sent',
            read: false,
          },
        ],
      };
    }
    case 'block': {
      if (state.blockedGroupIds.includes(action.groupId)) return state;
      const ids = state.conversations
        .filter((item) => item.groupId === action.groupId)
        .map((item) => item.id);
      return {
        ...state,
        blockedGroupIds: [...state.blockedGroupIds, action.groupId],
        messages: state.messages.map((item) =>
          ids.includes(item.conversationId) ? { ...item, read: true } : item,
        ),
      };
    }
    case 'unblock':
      return {
        ...state,
        blockedGroupIds: state.blockedGroupIds.filter(
          (id) => id !== action.groupId,
        ),
      };
    case 'report': {
      const conversation = state.conversations.find(
        (item) => item.id === action.conversationId,
      );
      if (!conversation || !isConversationAccepted(state, conversation))
        return state;
      return {
        ...state,
        nextSequence: state.nextSequence + 1,
        reports: [
          ...state.reports,
          {
            id: 'report-' + state.nextSequence,
            conversationId: conversation.id,
            groupId: conversation.groupId,
            reason: action.reason,
          },
        ],
      };
    }
  }
}

export function formatMessageTime(value: string): string {
  return new Intl.DateTimeFormat('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(value));
}
export function formatMessageDate(value: string): string {
  return new Intl.DateTimeFormat('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}
