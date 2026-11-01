import { getSupabase } from '@/lib/supabase';
import { backendRequest } from '@/lib/backend-request';
import { text } from '@/data/contracts/validate';
import type { TravelerProfile } from '@/types/profile';
import {
  profileFromRows,
  profileToPayload,
} from './profile-mapper';

export async function fetchProfile(
  userId: string,
): Promise<TravelerProfile | null> {
  const client = getSupabase();
  const { data, error } = await backendRequest(signal => client
    .from('travel_groups')
    .select('*, group_public_profiles(about)')
    .eq('owner_user_id', userId)
    .abortSignal(signal).maybeSingle(), 'profile.load');
  if (error) throw error;
  if (!data) return null;
  const about = data.group_public_profiles?.about ?? '';
  text(about, 600);
  return { ...profileFromRows(data), about };
}
export async function persistProfile(
  profile: TravelerProfile,
): Promise<TravelerProfile> {
  const { data, error } = await backendRequest(signal => getSupabase().rpc('save_my_profile', {
    profile_data: profileToPayload(profile),
  }).abortSignal(signal), 'profile.save');
  if (error) throw error;
  if (!data?.group)
    throw new Error('Niepełna odpowiedź serwera.');
  text(data.about, 600);
  return { ...profileFromRows(data.group), about: data.about };
}
