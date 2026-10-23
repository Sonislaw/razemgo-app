import { getSupabase } from '@/lib/supabase';
import type { TravelerProfile } from '@/types/profile';
import {
  profileFromRows,
  profileToPayload,
  type GroupRow,
  type PreferencesRow,
} from './profile-mapper';

export async function fetchProfile(
  userId: string,
): Promise<TravelerProfile | null> {
  const client = getSupabase();
  const { data, error } = await client
    .from('travel_groups')
    .select('*')
    .eq('owner_user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const preferences = await client
    .from('group_preferences')
    .select('*')
    .eq('group_id', data.id)
    .single();
  if (preferences.error) throw preferences.error;
  return profileFromRows(data as GroupRow, preferences.data as PreferencesRow);
}
export async function persistProfile(
  profile: TravelerProfile,
): Promise<TravelerProfile> {
  const { data, error } = await getSupabase().rpc('save_my_profile', {
    profile_data: profileToPayload(profile),
  });
  if (error) throw error;
  if (!data?.group || !data?.preferences)
    throw new Error('Niepełna odpowiedź serwera.');
  return profileFromRows(data.group, data.preferences);
}
