import type { MessagingState } from '../../types/messaging';
import type { OwnedTrip } from '../../types/owned-trip';
import type { TripProposal } from '../../types/travel';
import { filterProposals } from '../discovery/filter-trips.ts';
import { unreadCount } from '../messaging/messaging-state.ts';
import {
  discoveryFiltersForTrip,
  isSearchingTrip,
  isValidDate,
} from '../trips/own-trips-state.ts';

export interface NotificationSummary {
  keys: string[];
  count: number;
  unread: boolean;
}

export function markNotificationsRead(
  readKeys: string[],
  keys: string[],
): string[] {
  const unread = keys.filter((key) => !readKeys.includes(key));
  return unread.length ? [...new Set([...readKeys, ...unread])] : readKeys;
}

export function selectHomeNotifications(
  proposals: TripProposal[],
  ownTrips: OwnedTrip[],
  mailbox: MessagingState,
  readKeys: string[],
  today: string,
) {
  const activeTrips = ownTrips
    .filter(
      (trip) =>
        isSearchingTrip(trip, today) &&
        isValidDate(trip.startDate) &&
        isValidDate(trip.endDate) &&
        trip.endDate > trip.startDate &&
        trip.endDate > today,
    )
    .sort(
      (a, b) =>
        (Date.parse(b.publishedAt ?? '') || 0) -
          (Date.parse(a.publishedAt ?? '') || 0) || a.id.localeCompare(b.id),
    );
  const matches = activeTrips.map((trip) => ({
    trip,
    proposals: filterProposals(
      proposals.filter(
        (proposal) =>
          proposal.trip.groupId !== trip.groupId &&
          !mailbox.blockedGroupIds.includes(proposal.trip.groupId) &&
          isValidDate(proposal.trip.startDate) &&
          isValidDate(proposal.trip.endDate) &&
          proposal.trip.endDate > proposal.trip.startDate &&
          proposal.trip.endDate > today,
      ),
      discoveryFiltersForTrip(trip),
    ),
  }));
  // Prefer the most recently published plan with actual suggestions.
  const source = matches.find((match) => match.proposals.length) ?? matches[0];
  const proposalKeys =
    source?.proposals.map(
      ({ trip }) => `proposal:${source.trip.id}:${trip.id}`,
    ) ?? [];
  const invitationKeys =
    mailbox.loadStatus === 'ready'
      ? mailbox.invitations
          .filter(
            (invitation) =>
              invitation.direction === 'received' &&
              invitation.status === 'pending' &&
              !mailbox.blockedGroupIds.includes(invitation.groupId),
          )
          .map((invitation) => `invitation:${invitation.id}`)
      : [];
  const summary = (keys: string[]): NotificationSummary => ({
    keys,
    count: keys.length,
    unread: keys.some((key) => !readKeys.includes(key)),
  });
  const suggestions = { ...summary(proposalKeys), trip: source?.trip };
  const invitations = summary(invitationKeys);
  const unreadConversationIds = new Set(
    mailbox.loadStatus === 'ready'
      ? mailbox.conversations
          .filter((conversation) => unreadCount(mailbox, conversation.id) > 0)
          .map((conversation) => conversation.id)
      : [],
  );
  const unreadMessages = mailbox.messages
    .filter(
      (message) =>
        unreadConversationIds.has(message.conversationId) &&
        message.sender === 'other' &&
        !message.read &&
        message.status === 'sent',
    )
    .sort(
      (a, b) =>
        (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) ||
        a.id.localeCompare(b.id),
    );
  const messages = {
    keys: unreadMessages.map((message) => `message:${message.id}`),
    count: mailbox.loadStatus === 'ready' ? mailbox.conversations.reduce((total,c) => total + unreadCount(mailbox,c.id),0) : 0,
    // Chat read state is authoritative, independently of notification clicks.
    unread: unreadConversationIds.size > 0,
    conversation: mailbox.conversations.find(
      (conversation) => conversation.id === unreadMessages[0]?.conversationId,
    ) ?? mailbox.conversations.find(conversation => unreadConversationIds.has(conversation.id)),
    conversationCount: unreadConversationIds.size,
  };
  return {
    suggestions,
    invitations,
    messages,
    unreadCount:
      Number(suggestions.unread) +
      Number(invitations.unread) +
      Number(messages.unread),
  };
}

export function notificationQuantity(
  count: number,
  kind: 'proposals' | 'invitations' | 'messages',
): string {
  // Hermes may not provide Intl.PluralRules. Counts are non-negative integers.
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  const plural =
    count === 1
      ? 'one'
      : lastDigit >= 2 &&
          lastDigit <= 4 &&
          (lastTwoDigits < 12 || lastTwoDigits > 14)
        ? 'few'
        : 'many';
  const words =
    kind === 'proposals'
      ? {
          one: 'propozycja',
          few: 'propozycje',
          many: 'propozycji',
        }
      : kind === 'invitations'
        ? {
            one: 'zaproszenie',
            few: 'zaproszenia',
            many: 'zaproszeń',
          }
        : {
            one: 'wiadomość',
            few: 'wiadomości',
            many: 'wiadomości',
          };
  return `${count} ${words[plural]}`;
}
