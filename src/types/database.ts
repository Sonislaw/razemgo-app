import type {
  GroupRow,
  PreferencesRow,
  profileToPayload,
} from '../features/profile/profile-mapper';

// Keep in sync with supabase/migrations. Replace using Supabase type generation after linking.
export interface Database {
  public: {
    Tables: {
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
      save_my_profile: {
        Args: { profile_data: ReturnType<typeof profileToPayload> };
        Returns: { group: GroupRow; preferences: PreferencesRow };
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
