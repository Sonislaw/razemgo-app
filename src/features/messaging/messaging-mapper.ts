import {
  parseMailboxRow,
  parseMessageRow,
} from '../../data/contracts/validate.ts';
import { shareRow } from '../../lib/snapshot-store.ts';
import type {
  ChatMessage,
  ContactInvitation,
  Conversation,
  LocalReport,
  MessagingContact,
} from '../../types/messaging';
import type { TripPlan } from '../../types/travel';

import type { TripSnapshot } from '../../data/contracts/messaging';
export type {
  ContactRow,
  ConversationRow,
  InvitationRow,
  MailboxRow,
  MessageRow,
  TripSnapshot,
} from '../../data/contracts/messaging';

export type MailboxData = {
  contacts: Record<string, MessagingContact>;
  trips: Record<string, TripPlan>;
  invitations: ContactInvitation[];
  conversations: Conversation[];
  messages: ChatMessage[];
  blockedGroupIds: string[];
  reports: LocalReport[];
};
function snapshotToTrip(row: TripSnapshot): TripPlan {
  const base = {
    participants: row.adult_count != null && row.child_count != null ? {
      adultCount: row.adult_count,
      childCount: row.child_count,
      childAgeBands: [...(row.child_age_bands ?? [])],
    } : null,
    id: row.id,
    groupId: row.group_id,
    startDate: row.start_date,
    endDate: row.end_date,
    description: row.description,
    landscape: row.landscape,
    interests: [],
    animals: { animals: [] },
    ...(row.campground_name ? { campgroundName: row.campground_name } : {}),
  };
  const place = { name: row.location_name, region: row.location_region };
  return row.mode === 'planned'
    ? { ...base, mode: 'planned', destination: place }
    : { ...base, mode: 'flexible', travelArea: place };
}
export function messageFromRow(
  input: unknown,
  groupId: string,
  conversation?: Conversation,
): ChatMessage {
  const row = parseMessageRow(input);
  const self = row.sender_group_id === groupId;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    sender: self ? 'self' : 'other',
    text: row.text,
    createdAt: row.created_at,
    status: 'sent',
    sequence: Number(row.sequence),
    ...(self && row.request_key ? { requestKey: row.request_key } : {}),
    read:
      Number(row.sequence) <=
      (self
        ? (conversation?.otherReadSequence ?? 0)
        : (conversation?.selfReadSequence ?? 0)),
  };
}
export function mailboxFromRow(input: unknown, groupId: string): MailboxData {
  const row = parseMailboxRow(input);
  const invitations: ContactInvitation[] = row.invitations.map((i) => ({
    id: i.id,
    groupId:
      i.sender_group_id === groupId ? i.recipient_group_id : i.sender_group_id,
    tripId: i.trip_reference,
    context: i.context_kind ?? 'trip',
    ownTripId:
      i.recipient_group_id === groupId
        ? (i.trip_reference ?? undefined)
        : i.source_trip_snapshot?.id,
    direction: i.sender_group_id === groupId ? 'sent' : 'received',
    status: i.status,
    text: i.text,
    createdAt: i.created_at,
  }));
  const conversations: Conversation[] = row.conversations.map((c) => ({
    id: c.id,
    invitationId: c.invitation_id,
    groupId:
      c.sender_group_id === groupId ? c.recipient_group_id : c.sender_group_id,
    tripId: invitations.find((i) => i.id === c.invitation_id)?.tripId ?? null,
    context:
      invitations.find((i) => i.id === c.invitation_id)?.context ?? 'trip',
    blocked: c.blocked,
    unreadCount: Number(c.unread_count),
    updatedAt: c.updated_at,
    selfReadSequence: Number(c.self_read_sequence),
    otherReadSequence: Number(c.other_read_sequence),
  }));
  return {
    invitations,
    conversations,
    contacts: Object.fromEntries(
      row.contacts.map((c) => [
        c.id,
        {
          id: c.id,
          ...(c.crew_number ? { crewNumber: c.crew_number } : {}),
          name: c.name,
          avatarId: c.avatar_id,
          adultCount: c.adult_count,
        },
      ]),
    ),
    trips: Object.fromEntries(
      row.invitations.flatMap((i) =>
        [i.trip_snapshot, i.source_trip_snapshot]
          .filter((t): t is TripSnapshot => !!t)
          .map((t) => [t.id, snapshotToTrip(t)]),
      ),
    ),
    messages: row.conversations.flatMap((c) =>
      c.last_message
        ? [
            messageFromRow(
              c.last_message,
              groupId,
              conversations.find((x) => x.id === c.id),
            ),
          ]
        : [],
    ),
    blockedGroupIds: row.blocked_group_ids,
    reports: row.reports
      .filter((r) => r.group_id && r.conversation_id)
      .map((r) => ({
        id: r.id,
        groupId: r.group_id!,
        conversationId: r.conversation_id!,
        reason: r.reason,
      })),
  };
}
export function mergeMessages(
  previous: ChatMessage[],
  incoming: ChatMessage[],
  conversations: Conversation[],
): ChatMessage[] {
  const byId = new Map(previous.map((m) => [m.id, m]));
  const outbox = new Map(
    previous
      .filter((m) => m.sequence === undefined && m.requestKey)
      .map((m) => [m.requestKey!, m.id]),
  );
  for (const message of incoming) {
    if (message.requestKey && outbox.has(message.requestKey))
      byId.delete(outbox.get(message.requestKey)!);
    byId.set(message.id, shareRow(byId.get(message.id), message));
  }
  // Only retain history belonging to the current account's still-accessible conversations.
  const byConversation = new Map(conversations.map((c) => [c.id, c]));
  return [...byId.values()]
    .filter((m) => byConversation.has(m.conversationId))
    .map((m) => {
      if (m.sequence === undefined) return m;
      const c = byConversation.get(m.conversationId)!;
      const read =
        m.sequence <=
        (m.sender === 'self'
          ? (c.otherReadSequence ?? 0)
          : (c.selfReadSequence ?? 0));
      return read === m.read ? m : { ...m, read };
    })
    .sort(
      (a, b) =>
        (a.sequence ?? Number.MAX_SAFE_INTEGER) -
          (b.sequence ?? Number.MAX_SAFE_INTEGER) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
}
