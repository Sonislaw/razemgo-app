import { execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';

// Run only against a disposable stack started by Supabase CLI. CLI output is
// kept in memory and never printed: it includes local signing/admin keys.
export function localBackend() {
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  let raw;
  try {
    raw = execFileSync(
      executable,
      ['--yes', 'supabase@2.122.0', 'status', '--output', 'json'],
      {
        encoding: 'utf8',
        windowsHide: true,
        shell: process.platform === 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  } catch {
    throw Error(
      'Local Supabase is unavailable. Start Docker and run npx supabase@2.122.0 start. No remote backend was contacted.',
    );
  }
  const value = JSON.parse(raw),
    url = new URL(value.API_URL);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !value.JWT_SECRET
  )
    throw Error('Disposable loopback Supabase required');
  return value;
}
export function localToken(config, user, session, ttl = 3600) {
  const payload = {
    aud: 'authenticated',
    role: 'authenticated',
    sub: user,
    session_id: session,
    exp: Math.floor(Date.now() / 1000) + ttl,
  };
  const value = [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
  ].join('.');
  return (
    value +
    '.' +
    createHmac('sha256', config.JWT_SECRET).update(value).digest('base64url')
  );
}
export async function localRpc(config, token, name, args = {}) {
  return fetch(config.API_URL + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: {
      apikey: config.ANON_KEY,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(30000),
  });
}
if (process.argv[1]?.endsWith('local-backend-check.mjs')) {
  const config = localBackend();
  const users = [],
    tokens = [],
    groups = [];
  const adminHeaders = {
    apikey: config.SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + config.SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
  };
  try {
    for (let n = 0; n < 2; n++) {
      const email = 'local-' + randomUUID() + '@example.invalid',
        password = 'Local!' + randomUUID();
      const create = await fetch(config.API_URL + '/auth/v1/admin/users', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ email, password, email_confirm: true }),
      });
      if (!create.ok) throw Error('Local Auth fixture failed');
      const user = await create.json();
      users.push(user);
      const auth = await fetch(
        config.API_URL + '/auth/v1/token?grant_type=password',
        {
          method: 'POST',
          headers: {
            apikey: config.ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, password }),
        },
      );
      if (!auth.ok) throw Error('Local Auth signin failed');
      const { access_token } = await auth.json();
      tokens.push(access_token);
      const saved = await localRpc(config, access_token, 'save_my_profile', {
        profile_data: {
          name: 'Local fixture ' + n,
          owner_user_id: randomUUID(),
          avatar_id: 'camp-bear',
          kind: 'couple',
          adult_count: 2,
          child_count: 0,
          child_age_bands: [],
          travel_mode: 'Kamper',
          interests: [],
          animal_kinds: [],
          matching: { group_kinds: [], child_age_bands: [], description: '' },
        },
      });
      if (!saved.ok) throw Error('Local profile save failed');
      const profile = (await saved.json()).group;
      if (profile.owner_user_id !== user.id)
        throw Error('Local owner spoofing protection failed');
      groups.push(profile.id);
    }
    const rest = (token, path, options = {}) =>
      fetch(config.API_URL + '/rest/v1/' + path, {
        ...options,
        headers: {
          apikey: config.ANON_KEY,
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: AbortSignal.timeout(30000),
      });
    const denied = async (response, label) => {
      const result = await response.json();
      if (![401, 403].includes(response.status) || result.code !== '42501')
        throw Error(label + ': expected explicit permission denial');
    };
    for (const [table, key] of [
      ['travel_groups', 'id'],
      ['group_preferences', 'group_id'],
    ]) {
      const mine = await rest(
        tokens[0],
        table + '?' + key + '=eq.' + groups[0] + '&select=*',
      );
      if (!mine.ok || (await mine.json()).length !== 1)
        throw Error('Own row is unavailable: ' + table);
      const other = await rest(
        tokens[0],
        table + '?' + key + '=eq.' + groups[1] + '&select=*',
      );
      if (!other.ok || (await other.json()).length !== 0)
        throw Error('Cross-account row leaked: ' + table);
    }
    await denied(
      await rest(tokens[0], 'travel_groups?id=eq.' + groups[0], {
        method: 'PATCH',
        body: JSON.stringify({ owner_user_id: users[1].id }),
      }),
      'Direct owner change',
    );
    if (!(await localRpc(config, tokens[0], 'get_my_sync_state')).ok)
      throw Error('Local summary failed');
    for (const name of [
      'get_my_sync_state',
      'get_my_mailbox_page',
      'list_my_trip_page',
      'admin_list_reports',
      'get_push_health',
    ]) {
      await denied(
        await localRpc(config, config.ANON_KEY, name),
        'Anonymous RPC: ' + name,
      );
    }
    for (const name of [
      'admin_list_reports',
      'get_push_health',
      'claim_push_deliveries',
    ])
      await denied(
        await localRpc(config, tokens[0], name),
        'Non-admin RPC: ' + name,
      );
    await denied(
      await localRpc(
        config,
        localToken(config, users[0].id, randomUUID()),
        'get_my_sync_state',
      ),
      'Nonexistent session',
    );
    const expired = await localRpc(
      config,
      localToken(config, users[0].id, randomUUID(), -60),
      'get_my_sync_state',
    );
    if (expired.status !== 401) throw Error('Expired JWT was not rejected');
    const trips = [];
    for (let n = 0; n < 6; n++) {
      const saved = await localRpc(config, tokens[1], 'save_my_trip', {
        trip_data: {
          mode: 'planned',
          visibility: 'public',
          start_date: '2099-05-21',
          end_date: '2099-05-24',
          location_id: 'pl-locality:4259',
          location_name: 'Chłapowo',
          location_region: 'pomorskie',
          location_kind: 'village',
          campground_name: '',
          campground_address: '',
          travel_mode: 'Kamper',
          description:
            'Syntetyczny wyjazd do lokalnych testów izolacji i limitów. ' + n,
          landscape: 'coast',
          interests: [],
          animal_kinds: [],
          matching_group_kinds: [],
          matching_child_age_bands: [],
        },
        as_draft: false,
        request_key: randomUUID(),
      });
      if (!saved.ok) throw Error('Local trip fixture failed');
      trips.push((await saved.json()).id);
    }
    const foreign = await localRpc(config, tokens[0], 'get_my_trip', {
      target_trip_id: trips[0],
    });
    if (!foreign.ok || (await foreign.json()) !== null)
      throw Error('Cross-account own trip leaked');
    const keys = Array.from({ length: 25 }, randomUUID);
    const reportTargets = keys.map((_, index) => trips[index % trips.length]);
    const reports = await Promise.all(
      keys.map((request_key, index) =>
        localRpc(config, tokens[0], 'report_trip', {
          target_trip_id: reportTargets[index],
          report_reason: 'Inny powód',
          request_key,
        }),
      ),
    );
    if (reports.filter((response) => response.ok).length !== 20)
      throw Error('Concurrent daily report limit failed');
    for (const response of reports.filter((response) => !response.ok))
      if ((await response.json()).code !== '54000')
        throw Error('Unexpected report rejection');
    if (
      !(
        await localRpc(config, tokens[0], 'report_trip', {
          target_trip_id:
            reportTargets[reports.findIndex((response) => response.ok)],
          report_reason: 'Inny powód',
          request_key: keys[reports.findIndex((response) => response.ok)],
        })
      ).ok
    )
      throw Error('Idempotent retry failed after daily limit');
    const invitations = await Promise.all(
      trips.map((target_trip_id) =>
        localRpc(config, tokens[0], 'send_contact_invitation', {
          target_trip_id,
          message_text: 'Syntetyczne zaproszenie.',
          request_key: randomUUID(),
        }),
      ),
    );
    if (invitations.filter((response) => response.ok).length !== 5)
      throw Error('Concurrent invitation limit failed');
    for (const response of invitations.filter((response) => !response.ok))
      if ((await response.json()).code !== '54000')
        throw Error('Unexpected invitation rejection');
    const recipient = await localRpc(config, tokens[1], 'get_my_sync_state');
    if (!recipient.ok || (await recipient.json()).pending_invitations !== 5)
      throw Error('Recipient summary did not preserve all invitations');
    console.log(
      'Local Auth/PostgREST, two-account isolation, owner spoofing, RPC roles, concurrent limits and idempotency passed.',
    );
  } finally {
    for (const user of users)
      await fetch(config.API_URL + '/auth/v1/admin/users/' + user.id, {
        method: 'DELETE',
        headers: adminHeaders,
      });
  }
}
