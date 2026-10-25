import type { ProfileAvatarId } from '../../types/avatar';
import type { ChatMessage, ContactInvitation, Conversation, LocalReport, MessagingContact } from '../../types/messaging';
import type { TripPlan } from '../../types/travel';

export type ContactRow = { id: string; crew_number?: number; name: string; avatar_id: ProfileAvatarId; adult_count: number };
export type TripSnapshot = {
  id: string; group_id: string; mode: 'planned' | 'flexible'; description: string;
  start_date: string; end_date: string; location_name: string; location_region: string;
  campground_name: string; landscape: TripPlan['landscape'];
};
export type InvitationRow = {
  id: string; sender_group_id: string; recipient_group_id: string; trip_id: string | null;
  source_trip_id: string | null; trip_reference: string | null; trip_snapshot: TripSnapshot | null; context_kind?: 'trip' | 'profile';
  source_trip_snapshot: TripSnapshot | null; text: string; status: ContactInvitation['status']; created_at: string;
};
export type MessageRow = {
  id: string; sequence: number; conversation_id: string; sender_group_id: string; text: string; created_at: string;
  request_key?: string;
};
export type ConversationRow = {
  id: string; invitation_id: string; sender_group_id: string; recipient_group_id: string;
  updated_at: string; blocked: boolean; unread_count: number;
  self_read_sequence: number; other_read_sequence: number; last_message: MessageRow | null;
};
export type MailboxRow = {
  contacts: ContactRow[]; invitations: InvitationRow[]; conversations: ConversationRow[];
  blocked_group_ids: string[];
  reports: { id: string; group_id: string | null; conversation_id: string | null; reason: LocalReport['reason'] }[];
};
export type MailboxData = {
  contacts: Record<string, MessagingContact>; trips: Record<string, TripPlan>;
  invitations: ContactInvitation[]; conversations: Conversation[]; messages: ChatMessage[];
  blockedGroupIds: string[]; reports: LocalReport[];
};
function snapshotToTrip(row: TripSnapshot): TripPlan {
  const base = { id: row.id, groupId: row.group_id, startDate: row.start_date, endDate: row.end_date,
    description: row.description, landscape: row.landscape, interests: [], animals: { animals: [] },
    ...(row.campground_name ? { campgroundName: row.campground_name } : {}) };
  const place = { name: row.location_name, region: row.location_region };
  return row.mode === 'planned' ? { ...base, mode: 'planned', destination: place } : { ...base, mode: 'flexible', travelArea: place };
}
export function messageFromRow(row: MessageRow, groupId: string, conversation?: Conversation): ChatMessage {
  const self = row.sender_group_id === groupId;
  return { id: row.id, conversationId: row.conversation_id, sender: self ? 'self' : 'other',
    text: row.text, createdAt: row.created_at, status: 'sent', sequence: Number(row.sequence),
    ...(self && row.request_key ? { requestKey: row.request_key } : {}),
    read: Number(row.sequence) <= (self ? conversation?.otherReadSequence ?? 0 : conversation?.selfReadSequence ?? 0) };
}
export function mailboxFromRow(row: MailboxRow, groupId: string): MailboxData {
  const invitations: ContactInvitation[] = row.invitations.map(i => ({
    id: i.id, groupId: i.sender_group_id === groupId ? i.recipient_group_id : i.sender_group_id,
    tripId: i.trip_reference, context: i.context_kind ?? 'trip', ownTripId: i.recipient_group_id === groupId ? i.trip_reference ?? undefined : i.source_trip_snapshot?.id,
    direction: i.sender_group_id === groupId ? 'sent' : 'received', status: i.status, text: i.text, createdAt: i.created_at,
  }));
  const conversations: Conversation[] = row.conversations.map(c => ({
    id: c.id, invitationId: c.invitation_id,
    groupId: c.sender_group_id === groupId ? c.recipient_group_id : c.sender_group_id,
    tripId: invitations.find(i => i.id === c.invitation_id)?.tripId ?? null,
    context: invitations.find(i => i.id === c.invitation_id)?.context ?? 'trip',
    blocked: c.blocked, unreadCount: Number(c.unread_count), updatedAt: c.updated_at,
    selfReadSequence: Number(c.self_read_sequence), otherReadSequence: Number(c.other_read_sequence),
  }));
  return { invitations, conversations,
    contacts: Object.fromEntries(row.contacts.map(c => [c.id, { id: c.id, ...(c.crew_number ? { crewNumber: c.crew_number } : {}), name: c.name, avatarId: c.avatar_id, adultCount: c.adult_count }])),
    trips: Object.fromEntries(row.invitations.flatMap(i => [i.trip_snapshot, i.source_trip_snapshot].filter((t): t is TripSnapshot => !!t).map(t => [t.id, snapshotToTrip(t)]))),
    messages: row.conversations.flatMap(c => c.last_message ? [messageFromRow(c.last_message, groupId, conversations.find(x => x.id === c.id))] : []),
    blockedGroupIds: row.blocked_group_ids,
    reports: row.reports.filter(r => r.group_id && r.conversation_id).map(r => ({ id: r.id, groupId: r.group_id!, conversationId: r.conversation_id!, reason: r.reason })),
  };
}
export function mergeMessages(previous: ChatMessage[], incoming: ChatMessage[], conversations: Conversation[]): ChatMessage[] {
  const byId = new Map(previous.map(m => [m.id, m]));
  for (const message of incoming) {
    if (message.requestKey) for (const [id, old] of byId) {
      if (old.requestKey === message.requestKey && old.sequence === undefined) byId.delete(id);
    }
    byId.set(message.id, message);
  }
  // Only retain history belonging to the current account's still-accessible conversations.
  return [...byId.values()].filter(m => conversations.some(c => c.id === m.conversationId)).map(m => {
    if (m.sequence === undefined) return m;
    const c = conversations.find(c => c.id === m.conversationId)!;
    return { ...m, read: m.sequence <= (m.sender === 'self' ? c.otherReadSequence ?? 0 : c.selfReadSequence ?? 0) };
  }).sort((a,b) => (a.sequence ?? Number.MAX_SAFE_INTEGER) - (b.sequence ?? Number.MAX_SAFE_INTEGER) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
