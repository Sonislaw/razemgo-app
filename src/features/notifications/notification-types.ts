import type { ProfileAvatarId } from '@/types/avatar';

export type NotificationKind = 'message' | 'invitation_received' | 'invitation_accepted' | 'proposal';
export interface NotificationEntry {
  id: string;
  kind: NotificationKind;
  created_at: string;
  read_at: string | null;
  actor_group_id: string;
  actor_name: string;
  actor_avatar_id: ProfileAvatarId;
  trip_label: string;
  own_trip_id: string | null;
  proposed_trip_id: string | null;
  invitation_id: string | null;
  conversation_id: string | null;
  available: boolean;
}
export interface NotificationPreferences {
  push_messages: boolean;
  push_invitations: boolean;
  updated_at: string | null;
}
export interface NotificationsPage {
  items: NotificationEntry[];
  unread_count: number;
  has_more: boolean;
  preferences: NotificationPreferences;
  fetched_at: string;
}
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  push_messages: true, push_invitations: true, updated_at: null,
};
export function notificationTitle(kind: NotificationKind) {
  return {
    message: 'Nowa wiadomość',
    invitation_received: 'Zaproszenie do kontaktu',
    invitation_accepted: 'Zaproszenie zaakceptowane',
    proposal: 'Nowa propozycja wyjazdu',
  }[kind];
}
