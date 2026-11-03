import type { ProfileAvatarId } from '@/types/avatar';
import type { ReactionKind } from '@/features/reactions/reaction-data';

export type NotificationKind = 'message' | 'invitation_received' | 'invitation_accepted' | 'proposal' | 'favorite_trip' | 'trip_reaction' | 'saved_filter';
export type NotificationPreferenceKey = 'messages' | 'invitations' | 'favorite_trips' | 'reactions' | 'proposals' | 'saved_filters';
export interface NotificationEntry {
  id: string;
  kind: NotificationKind;
  created_at: string;
  read_at: string | null;
  actor_group_id: string;
  actor_name: string;
  actor_crew_number?: number;
  actor_avatar_id: ProfileAvatarId;
  trip_label: string;
  own_trip_id: string | null;
  proposed_trip_id: string | null;
  invitation_id: string | null;
  conversation_id: string | null;
  available: boolean;
  reaction_kind?: ReactionKind | null;
  reaction_active?: boolean;
  filter_set_id?: string | null;
  filter_result_count?: number;
}
export interface NotificationPreferences {
  push_messages: boolean;
  push_invitations: boolean;
  push_favorite_trips: boolean;
  push_reactions: boolean;
  push_proposals: boolean;
  push_saved_filters: boolean;
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
  push_messages: true, push_invitations: true, push_favorite_trips: true, push_reactions: true, push_proposals: true, push_saved_filters: true, updated_at: null,
};
export function notificationTitle(kind: NotificationKind) {
  return {
    message: 'Nowa wiadomość',
    invitation_received: 'Zaproszenie do kontaktu',
    invitation_accepted: 'Zaproszenie zaakceptowane',
    proposal: 'Nowa propozycja wyjazdu',
    favorite_trip: 'Nowy wyjazd ulubionej ekipy',
    trip_reaction: 'Nowa reakcja na Twoje ogłoszenie',
    saved_filter: 'Nowe wyniki zapisanych filtrów',
  }[kind];
}
