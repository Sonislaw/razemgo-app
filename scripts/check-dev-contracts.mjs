import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
const env = parseEnv(await readFile('.env.local', 'utf8'));
const url = env.EXPO_PUBLIC_SUPABASE_URL,
  key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (new URL(url).hostname !== 'kswuakzcnoqgovnwejhb.supabase.co')
  throw Error('Read-only Dev check refused another project');
const names = [
  'get_my_sync_state',
  'get_my_mailbox_page',
  'get_my_mailbox_states',
  'list_my_trip_page',
  'get_my_trip_contact_counts',
  'refresh_public_trip_results',
  'refresh_public_group_results',
  'list_my_filter_sets',
  'save_my_filter_set',
  'delete_my_filter_set',
  'set_my_filter_set_notifications',
  'process_filter_notifications',
  'search_trip_map',
  'get_trip_map_items',
];
for (const name of names) {
  const args =
    name === 'set_my_filter_set_notifications'
      ? { target_id: '00000000-0000-4000-8000-000000000001', enabled: true }
      : name === 'process_filter_notifications' ? { batch_size: 1 }
      : name === 'save_my_filter_set'
      ? { target_id: '00000000-0000-4000-8000-000000000001', filter_kind: 'trips', set_name: 'Anonymous probe', filter_payload: {} }
      : name === 'delete_my_filter_set'
        ? { target_id: '00000000-0000-4000-8000-000000000001' }
      : name === 'get_my_trip_contact_counts'
      ? { target_trip_id: '00000000-0000-4000-8000-000000000001' }
      : name === 'get_my_mailbox_states'
        ? { conversation_ids: [], invitation_ids: [] }
        : name === 'refresh_public_trip_results'
          ? { trip_ids: [] }
          : name === 'refresh_public_group_results'
            ? { group_ids: [] }
            : {};
  const response = await fetch(url + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (![401, 403].includes(response.status) || result.code !== '42501')
    throw Error(
      'Expected anonymous denial for ' + name + '; status ' + response.status,
    );
}
for (const name of ['delete-account', 'dispatch-push', 'monitor-push']) {
  const response = await fetch(url + '/functions/v1/' + name, {
    method: 'POST',
    headers: { apikey: key },
    signal: AbortSignal.timeout(15000),
  });
  if (response.status !== 401)
    throw Error('Expected anonymous Edge denial for ' + name);
}
console.log(
  `Dev only: ${names.length} deployed RPC contracts and 3 Edge endpoints reject anonymous access. No user data read or changed.`,
);
