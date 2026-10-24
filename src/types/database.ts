import type {
  GroupRow,
  PreferencesRow,
  profileToPayload,
} from '../features/profile/profile-mapper';
import type { TripRow, PublicTripRow, tripToPayload } from '../features/trips/trip-mapper';

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
