import type { ProfileAvatarId } from '../../types/avatar';
import type { ContactInvitation, LocalReport } from '../../types/messaging';
import type { ChildAgeBand, TripPlan } from '../../types/travel';

export type ContactRow = {
  id: string;
  crew_number?: number;
  name: string;
  avatar_id: ProfileAvatarId;
  adult_count: number;
};
export type TripSnapshot = {
  adult_count?: number | null;
  child_count?: number | null;
  child_age_bands?: ChildAgeBand[];
  id: string;
  group_id: string;
  mode: 'planned' | 'flexible';
  description: string;
  start_date: string;
  end_date: string;
  location_name: string;
  location_region: string;
  campground_name: string;
  landscape: TripPlan['landscape'];
};
export type InvitationRow = {
  id: string;
  sender_group_id: string;
  recipient_group_id: string;
  trip_id: string | null;
  source_trip_id: string | null;
  trip_reference: string | null;
  trip_snapshot: TripSnapshot | null;
  context_kind?: 'trip' | 'profile';
  source_trip_snapshot: TripSnapshot | null;
  text: string;
  status: ContactInvitation['status'];
  created_at: string;
};
export type MessageRow = {
  id: string;
  sequence: number;
  conversation_id: string;
  sender_group_id: string;
  text: string;
  created_at: string;
  request_key?: string;
};
export type ConversationRow = {
  id: string;
  invitation_id: string;
  sender_group_id: string;
  recipient_group_id: string;
  updated_at: string;
  blocked: boolean;
  unread_count: number;
  self_read_sequence: number;
  other_read_sequence: number;
  last_message: MessageRow | null;
};
export type MailboxRow = {
  contacts: ContactRow[];
  invitations: InvitationRow[];
  conversations: ConversationRow[];
  blocked_group_ids: string[];
  reports: {
    id: string;
    group_id: string | null;
    conversation_id: string | null;
    reason: LocalReport['reason'];
  }[];
};
