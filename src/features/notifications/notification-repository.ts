import { backendRequest } from '@/lib/backend-request';
import { getSupabase } from '@/lib/supabase';
import { integer, object, oneOf, text } from '@/data/contracts/validate';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationEntry,
  type NotificationPreferenceKey,
} from './notification-types';

export async function fetchNotifications(
  unread: boolean,
  cursor?: NotificationEntry,
  parentSignal?: AbortSignal,
) {
  const { data, error } = await backendRequest(
    (signal) =>
      getSupabase()
        .rpc('get_my_notifications', {
          before_at: cursor?.created_at ?? null,
          before_id: cursor?.id ?? null,
          page_size: 30,
          only_unread: unread,
        })
        .abortSignal(signal),
    'notifications.load',
    { signal: parentSignal, read: true, retries: 1 },
  );
  if (error) throw error;
  if (!data || !Array.isArray(data.items))
    throw new Error('Missing notification inbox');
  integer(data.unread_count);
  text(data.fetched_at, 80);
  if (typeof data.has_more !== 'boolean')
    throw new Error('Invalid notification page');
  for (const entry of data.items) {
    object(entry);
    text(entry.id, 128);
    text(entry.created_at, 80);
    text(entry.actor_name, 40);
    text(entry.trip_label, 1000);
    oneOf(entry.kind, [
      'message',
      'invitation_received',
      'invitation_accepted',
      'proposal',
      'favorite_trip',
      'trip_reaction',
    ]);
    if (entry.read_at !== null) text(entry.read_at, 80);
    if (typeof entry.available !== 'boolean')
      throw new Error('Invalid notification availability');
  }
  return {
    ...data,
    preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, ...data.preferences },
  };
}
export async function fetchNotificationStates(
  ids: string[],
  parentSignal?: AbortSignal,
) {
  const states = new Map<string, string | null>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    const { data, error } = await backendRequest(
      (signal) =>
        getSupabase()
          .rpc('get_my_notification_states', { notification_ids: batch })
          .abortSignal(signal),
      'notifications.load',
      { signal: parentSignal, read: true, retries: 1 },
    );
    if (error) throw error;
    if (
      !Array.isArray(data) ||
      data.some(
        (row) =>
          !row ||
          typeof row.id !== 'string' ||
          !batch.includes(row.id) ||
          (row.read_at !== null && typeof row.read_at !== 'string'),
      )
    )
      throw new Error('Invalid notification states');
    for (const row of data) states.set(row.id, row.read_at);
  }
  return states;
}
export async function persistNotificationRead(
  ids: string[] | null,
  through?: string,
) {
  const { error } = await backendRequest(
    (signal) =>
      getSupabase()
        .rpc('mark_my_notifications_read', {
          notification_ids: ids,
          read_through: through ?? null,
        })
        .abortSignal(signal),
    'notifications.read',
  );
  if (error) throw error;
}
export async function persistNotificationPreference(
  key: NotificationPreferenceKey,
  enabled: boolean,
) {
  const { data, error } = await backendRequest(
    (signal) =>
      getSupabase()
        .rpc('save_my_notification_preference', {
          preference_key: key,
          enabled,
        })
        .abortSignal(signal),
    'notifications.preferences',
  );
  if (error) throw error;
  if (!data) throw new Error('Missing saved preferences');
  return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...data };
}
