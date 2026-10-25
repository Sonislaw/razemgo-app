import { backendRequest } from '@/lib/backend-request';
import { getSupabase } from '@/lib/supabase';
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationEntry, type NotificationPreferenceKey } from './notification-types';

export async function fetchNotifications(unread: boolean, cursor?: NotificationEntry) {
  const { data, error } = await backendRequest(signal => getSupabase().rpc('get_my_notifications', {
    before_at: cursor?.created_at ?? null, before_id: cursor?.id ?? null,
    page_size: 30, only_unread: unread,
  }).abortSignal(signal), 'notifications.load');
  if (error) throw error;
  if (!data || !Array.isArray(data.items)) throw new Error('Missing notification inbox');
  return { ...data, preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, ...data.preferences } };
}
export async function persistNotificationRead(ids: string[] | null, through?: string) {
  const { error } = await backendRequest(signal => getSupabase().rpc('mark_my_notifications_read', {
    notification_ids: ids, read_through: through ?? null,
  }).abortSignal(signal), 'notifications.read');
  if (error) throw error;
}
export async function persistNotificationPreference(key: NotificationPreferenceKey, enabled: boolean) {
  const { data, error } = await backendRequest(signal => getSupabase().rpc('save_my_notification_preference', {
    preference_key: key, enabled,
  }).abortSignal(signal), 'notifications.preferences');
  if (error) throw error;
  if (!data) throw new Error('Missing saved preferences');
  return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...data };
}
