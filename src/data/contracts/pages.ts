import type { ConversationRow, InvitationRow, MailboxRow } from './messaging';
import type { TripRow } from './trip';

export type MailboxPageKind = 'conversations' | 'received' | 'sent';
export interface MailboxCursor {
  id: string;
  at: string;
}
export interface PagePosition<C> {
  has_more: boolean;
  cursor: C | null;
}
export type MailboxPositions = Record<
  MailboxPageKind,
  PagePosition<MailboxCursor>
>;
export type MailboxPage = MailboxRow & { pages: MailboxPositions };
export interface MailboxStates {
  conversations: Pick<
    ConversationRow,
    | 'id'
    | 'blocked'
    | 'unread_count'
    | 'self_read_sequence'
    | 'other_read_sequence'
    | 'updated_at'
  >[];
  invitations: Pick<InvitationRow, 'id' | 'status'>[];
}
export interface OwnTripCursor {
  id: string;
  sort_date: string;
  query_key: string;
}
export interface OwnTripPageRow {
  items: TripRow[];
  total_count: number;
  active_count: number;
  archived_count: number;
  has_more: boolean;
  cursor: OwnTripCursor | null;
  latest_trip: TripRow | null;
}
export interface AccountSummary {
  revision: number;
  unread_messages: number;
  pending_invitations: number;
  unread_notifications: number;
  active_trips: number;
  archived_trips: number;
}
