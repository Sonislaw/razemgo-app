import { getSupabase } from '@/lib/supabase';
import { backendRequest } from '@/lib/backend-request';
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
  const { data, error } = await backendRequest(signal => client
    .from('travel_groups')
    .select('*')
    .eq('owner_user_id', userId)
    .abortSignal(signal).maybeSingle(), 'profile.load');
  if (error) throw error;
  if (!data) return null;
  const preferences = await backendRequest(signal => client
    .from('group_preferences')
    .select('*')
    .eq('group_id', data.id)
    .abortSignal(signal).single(), 'profile.preferences');
  if (preferences.error) throw preferences.error;
  return profileFromRows(data as GroupRow, preferences.data as PreferencesRow);
}
export async function persistProfile(
  profile: TravelerProfile,
): Promise<TravelerProfile> {
  const { data, error } = await backendRequest(signal => getSupabase().rpc('save_my_profile', {
    profile_data: profileToPayload(profile),
  }).abortSignal(signal), 'profile.save');
  if (error) throw error;
  if (!data?.group || !data?.preferences)
    throw new Error('Niepełna odpowiedź serwera.');
  return profileFromRows(data.group, data.preferences);
}
