import type {
  GroupRow,
  PreferencesRow,
  profileToPayload,
} from '../features/profile/profile-mapper';
import type { TripRow, PublicTripRow, tripToPayload } from '../features/trips/trip-mapper';
import type { MailboxRow, MessageRow } from '../features/messaging/messaging-mapper';

// Keep in sync with supabase/migrations. Replace using Supabase type generation after linking.
export interface Database {
  public: {
    Tables: {
      trip_plans: {
        Row: TripRow;
        Insert: Partial<TripRow> & { group_id: string; mode: string; landscape: string };
        Update: Partial<TripRow>;
        Relationships: [];
      };
      travel_groups: {
        Row: GroupRow & { created_at: string; updated_at: string };
        Insert: Omit<GroupRow, 'id'> & { id?: string };
        Update: Partial<GroupRow>;
        Relationships: [];
      };
      group_preferences: {
        Row: PreferencesRow;
        Insert: PreferencesRow;
        Update: Partial<PreferencesRow>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      get_my_mailbox: { Args: Record<never, never>; Returns: MailboxRow };
      send_contact_invitation: { Args: { target_trip_id: string; message_text: string; request_key: string; source_trip_id?: string | null }; Returns: string };
      respond_contact_invitation: { Args: { invitation_id: string; response: string }; Returns: string | null };
      send_chat_message: { Args: { conversation_id: string; message_text: string; request_key: string }; Returns: MessageRow };
      get_conversation_messages: { Args: { conversation_id: string; before_sequence?: number | null; page_size?: number }; Returns: MessageRow[] };
      mark_conversation_read: { Args: { conversation_id: string; through_message_id: string }; Returns: number };
      set_group_block: { Args: { target_group_id: string; blocked: boolean }; Returns: undefined };
      report_conversation: { Args: { conversation_id: string; report_reason: string; request_key: string }; Returns: string };
      save_my_trip: {
        Args: { trip_data: ReturnType<typeof tripToPayload>; trip_id?: string | null; as_draft?: boolean; request_key?: string | null };
        Returns: TripRow;
      };
      change_my_trip_status: { Args: { trip_id: string; new_status: string }; Returns: TripRow };
      duplicate_my_trip: { Args: { trip_id: string }; Returns: TripRow };
      delete_my_trip: { Args: { trip_id: string }; Returns: string };
      list_public_trips: { Args: { requested_trip_id?: string | null }; Returns: PublicTripRow[] };
      save_my_profile: {
        Args: { profile_data: ReturnType<typeof profileToPayload> };
        Returns: { group: GroupRow; preferences: PreferencesRow };
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
