import type {
  GroupRow,
  PreferencesRow,
  profileToPayload,
} from '../features/profile/profile-mapper';
import type { TripRow, PublicTripRow, tripToPayload } from '../features/trips/trip-mapper';
import type { MailboxRow, MessageRow } from '../features/messaging/messaging-mapper';
import type { NotificationsPage, NotificationPreferences } from '../features/notifications/notification-types';
import type { AccountAccess,ReportsPage,ReportDetail } from '../features/moderation/moderation-types';
import type { GroupCursor, RankedGroupCursor, GroupSort, GroupVisibility, PublicGroupRow, groupFiltersPayload } from '../features/groups/group-data';
import type { ReactionKind, ReactionSummary, ReactorsPage } from '../features/reactions/reaction-data';

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
        Insert: Omit<GroupRow, 'id' | 'crew_number'> & { id?: string };
        Update: Partial<Omit<GroupRow, 'crew_number'>>;
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
      get_trip_reactions: { Args: { trip_ids: string[] }; Returns: ReactionSummary[] };
      set_my_trip_reaction: { Args: { target_trip_id: string; reaction_kind: ReactionKind | null }; Returns: ReactionSummary };
      get_my_trip_reactors: { Args: { target_trip_id: string; after_at?: string | null; after_id?: string | null }; Returns: ReactorsPage };
      get_my_favorites: { Args: Record<never, never>; Returns: { group_ids: string[]; trip_ids: string[] } };
      set_my_group_favorite: { Args: { target_group_id: string; is_favorite: boolean }; Returns: boolean };
      set_my_trip_favorite: { Args: { target_trip_id: string; is_favorite: boolean }; Returns: boolean };
      set_my_presence: { Args: { connection_id: string; is_online: boolean }; Returns: undefined };
      get_online_groups: { Args: { group_ids: string[] }; Returns: string[] };
      get_my_group_visibility: { Args: Record<never, never>; Returns: GroupVisibility };
      save_my_group_visibility: { Args: { is_discoverable: boolean; about_text: string }; Returns: GroupVisibility };
      list_public_groups: { Args: { filters?: ReturnType<typeof groupFiltersPayload>; after_name?: string | null; after_id?: string | null };
        Returns: { items: PublicGroupRow[]; has_more: boolean; cursor: GroupCursor | null } };
      list_ranked_public_groups: { Args: { filters?: ReturnType<typeof groupFiltersPayload>; sort_mode?: GroupSort; after_cursor?: RankedGroupCursor | null };
        Returns: { items: PublicGroupRow[]; has_more: boolean; cursor: RankedGroupCursor | null } };
      count_public_groups: { Args: { filters?: ReturnType<typeof groupFiltersPayload> }; Returns: number };
      get_public_group: { Args: { target_group_id: string }; Returns: (PublicGroupRow & { trips: PublicTripRow[] }) | null };
      send_profile_invitation: { Args: { target_group_id: string; message_text: string; request_key: string }; Returns: string };
      report_profile: { Args: { target_group_id: string; report_reason: string; request_key: string }; Returns: string };
      get_my_account_access: {Args:Record<never,never>;Returns:AccountAccess};
      report_trip: {Args:{target_trip_id:string;report_reason:string;request_key:string};Returns:string};
      admin_list_reports: {Args:{status_filter?:string;search_text?:string;before_at?:string|null;before_id?:string|null};Returns:ReportsPage};
      admin_report_detail: {Args:{report_id:string};Returns:ReportDetail};
      admin_apply_action: {Args:{report_id:string;moderation_action:string;action_note:string;request_key:string;expected_updated_at:string};Returns:ReportDetail};
      get_my_notifications: { Args: { before_at?: string | null; before_id?: string | null; page_size?: number; only_unread?: boolean }; Returns: NotificationsPage };
      mark_my_notifications_read: { Args: { notification_ids?: string[] | null; read_through?: string | null }; Returns: number };
      save_my_notification_preference: { Args: { preference_key: string; enabled: boolean }; Returns: NotificationPreferences };
      register_my_push_device: { Args: { installation_id: string; installation_key: string; push_token: string; device_platform: string; expo_project_id: string }; Returns: string };
      unregister_my_push_device: { Args: { installation_id: string; installation_key: string }; Returns: undefined };
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
      search_public_trips: { Args: { filters?: ReturnType<typeof import('../features/discovery/discovery-data').discoveryFiltersPayload>; sort_mode?: string; after_cursor?: import('../features/discovery/discovery-data').TripSearchCursor | null; page_size?: number }; Returns: import('../features/discovery/discovery-repository').TripSearchPageRow };
      count_public_trips: { Args: { filters?: ReturnType<typeof import('../features/discovery/discovery-data').discoveryFiltersPayload> }; Returns: number };
      get_discovery_trip: { Args: { target_trip_id: string; filters?: ReturnType<typeof import('../features/discovery/discovery-data').discoveryFiltersPayload> }; Returns: import('../features/discovery/discovery-repository').RankedTripRow | null };
      save_my_profile: {
        Args: { profile_data: ReturnType<typeof profileToPayload> };
        Returns: { group: GroupRow; preferences: PreferencesRow };
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
