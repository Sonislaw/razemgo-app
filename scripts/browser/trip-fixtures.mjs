import { expect } from '@playwright/test';
import {
  proposalFromRow,
  tripFromRow,
} from '../../src/features/trips/trip-mapper.ts';
import { profileFromRows } from '../../src/features/profile/profile-mapper.ts';
import {
  filterProposals,
  INITIAL_FILTERS,
} from '../../src/features/discovery/filter-trips.ts';
import {
  selectOwnTrips,
  isArchivedTrip,
} from '../../src/features/trips/own-trips-state.ts';
import { tripRecommendation } from '../support/legacy-matching/trip-recommendation.ts';
import { groupRecommendation } from '../support/legacy-matching/recommendation.ts';
import { publicGroupFromRow } from '../../src/features/groups/group-data.ts';

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const groupId = (id) =>
  id === A
    ? '00000000-0000-4000-8000-000000000101'
    : '00000000-0000-4000-8000-000000000102';
const user = (id) => ({
  id,
  aud: 'authenticated',
  role: 'authenticated',
  email: id === A ? 'a@example.com' : 'b@example.com',
  email_confirmed_at: '2026-10-24T10:00:00Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  identities: [],
  created_at: '2026-10-24T10:00:00Z',
});
const session = (id) => ({
  access_token: [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
    Buffer.from(
      JSON.stringify({
        sub: id,
        aud: 'authenticated',
        role: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url'),
    'test-signature',
  ].join('.'),
  refresh_token: 'refresh-' + id,
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: user(id),
});
function profile(id) {
  return {
    group: {
      id: groupId(id),
      crew_number: id === A ? 104827 : 104828,
      owner_user_id: id,
      name: id === A ? 'Ekipa A' : 'Ekipa B',
      avatar_id: id === A ? 'camp-bear' : 'trail-fox',
      kind: 'family',
      adult_count: 2,
      child_count: 1,
      child_age_bands: ['4–6'],
      travel_mode: 'Kamper',
      interests: ['Rowery'],
      animal_kinds: [],
    },
    preferences: {
      group_id: groupId(id),
      group_kinds: ['family'],
      child_age_bands: ['4–6'],
      description: '',
    },
  };
}
function state() {
  return {
    trips: new Map(),
    next: 301,
    failSave: false,
    failLoad: false,
    failPublic: false,
    invitations: [],
    conversations: [],
    messages: [],
    reads: new Map(),
    blocks: new Set(),
    reports: [],
    failMailbox: false,
    failSend: false,
    failInvitation: false,
    failHistory: false,
    notifications: [],
    notificationPreferences: new Map(),
    failNotifications: false,
    failNotificationSave: false,
    presence: new Map(),
    favoriteGroups: new Map(),
    favoriteTrips: new Map(),
    reactions: new Map(),
  };
}
async function backend(context, store) {
  await context.route('https://monitoring.razemgo.invalid/**', (route) =>
    route.fulfill({
      status: 200,
      body: '{}',
      headers: { 'access-control-allow-origin': '*' },
    }),
  );
  await context.route('http://127.0.0.1:54321/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const headers = {
      'access-control-allow-origin': 'http://localhost:8085',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'content-type': 'application/json',
      'x-supabase-api-version': '2024-01-01',
      'access-control-expose-headers': 'x-supabase-api-version',
    };
    const respond = (value, status = 200) => {
      const payload = JSON.stringify(value);
      (store.transfers ??= []).push({
        endpoint: url.pathname.split('/').at(-1),
        bytes: Buffer.byteLength(payload),
        conversation:
          request.method() === 'POST'
            ? request.postDataJSON()?.conversation_id
            : undefined,
      });
      return route.fulfill({ status, headers, body: payload });
    };
    if (request.method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers });
    const body = request.postDataJSON() ?? {};
    let id = A;
    try {
      id = JSON.parse(
        Buffer.from(
          (request.headers().authorization ?? '').split('.')[1],
          'base64url',
        ).toString(),
      ).sub;
    } catch {}
    const endpoint = url.pathname.split('/').at(-1);
    (store.technicalCalls ??= []).push(endpoint);
    if (endpoint === 'get_my_sync_state') {
      const mine = store.conversations.filter((c) =>
        [c.sender_group_id, c.recipient_group_id].includes(groupId(id)),
      );
      const own = [...store.trips.values()]
        .filter((t) => t.group_id === groupId(id))
        .map(tripFromRow);
      return respond({
        revision: JSON.stringify([
          store.messages.length,
          store.invitations.map((i) => i.status),
          [...store.reads],
          store.notifications.map((n) => n.read_at),
          store.trips.size,
          [...store.blocks],
          [...(store.messageReactions ?? new Map())],
        ])
          .split('')
          .reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0, 0),
        unread_messages: mine.reduce(
          (n, c) =>
            n +
            store.messages.filter(
              (m) =>
                m.conversation_id === c.id &&
                m.sender_group_id !== groupId(id) &&
                m.sequence > (store.reads.get(c.id + groupId(id)) ?? 0),
            ).length,
          0,
        ),
        pending_invitations: store.invitations.filter(
          (i) => i.recipient_group_id === groupId(id) && i.status === 'pending',
        ).length,
        unread_notifications: store.notifications.filter(
          (n) => n.recipient_group_id === groupId(id) && !n.read_at,
        ).length,
        active_trips: own.filter((t) => !isArchivedTrip(t, '2026-10-24'))
          .length,
        archived_trips: own.filter((t) => isArchivedTrip(t, '2026-10-24'))
          .length,
      });
    }
    if (endpoint === 'get_my_trip_contact_counts') {
      const relevant = store.invitations.filter(
        (i) =>
          !store.blocks.has(groupId(id)) &&
          ((i.recipient_group_id === groupId(id) &&
            i.trip_reference === body.target_trip_id) ||
            (i.sender_group_id === groupId(id) &&
              i.source_trip_snapshot?.id === body.target_trip_id)),
      );
      return respond({
        contacts: new Set(
          relevant
            .filter(
              (i) =>
                i.status === 'accepted' &&
                store.conversations.some((c) => c.invitation_id === i.id),
            )
            .map((i) =>
              i.sender_group_id === groupId(id)
                ? i.recipient_group_id
                : i.sender_group_id,
            ),
        ).size,
        pending: relevant.filter((i) => i.status === 'pending').length,
      });
    }
    if (endpoint === 'get_my_notification_states')
      return respond(
        store.notifications
          .filter(
            (n) =>
              n.recipient_group_id === groupId(id) &&
              body.notification_ids.includes(n.id),
          )
          .map((n) => ({ id: n.id, read_at: n.read_at })),
      );
    if (endpoint === 'get_my_trip')
      return respond(
        store.trips.get(body.target_trip_id)?.group_id === groupId(id)
          ? store.trips.get(body.target_trip_id)
          : null,
      );
    if (endpoint === 'list_my_trip_page') {
      (store.ownTripPageCalls ??= []).push(body);
      if (store.failLoad) return respond({ message: 'Offline' }, 503);
      const own = [...store.trips.values()].filter(
          (t) => t.group_id === groupId(id),
        ),
        all = own.map(tripFromRow);
      const matches = selectOwnTrips(
        all,
        {
          query: body.filters?.query ?? '',
          startDate: body.filters?.start_date ?? '',
          endDate: body.filters?.end_date ?? '',
        },
        body.archived ?? false,
        '2026-10-24',
      );
      const offset = body.after_cursor
          ? matches.findIndex((t) => t.id === body.after_cursor.id) + 1
          : 0,
        items = matches.slice(offset, offset + (body.page_size ?? 20));
      return respond({
        items: items.map((t) => store.trips.get(t.id)),
        total_count: matches.length,
        active_count: all.filter((t) => !isArchivedTrip(t, '2026-10-24'))
          .length,
        archived_count: all.filter((t) => isArchivedTrip(t, '2026-10-24'))
          .length,
        has_more: offset + items.length < matches.length,
        cursor: items.length
          ? {
              id: items.at(-1).id,
              sort_date: items.at(-1).startDate,
              query_key: 'mock',
            }
          : null,
        latest_trip:
          own
            .filter(
              (t) => t.status === 'published' && t.visibility === 'public',
            )
            .sort((a, b) => b.published_at.localeCompare(a.published_at))[0] ??
          null,
      });
    }
    if (url.pathname.endsWith('/token'))
      return respond(session(body.email === 'b@example.com' ? B : A));
    if (url.pathname.endsWith('/user')) return respond(user(id));
    if (url.pathname.endsWith('/logout')) return respond({});
    if (url.pathname === '/rest/v1/rpc/get_my_account_access')
      return respond({
        is_admin: store.admin === true && id === A,
        suspended: store.suspended === id,
        hidden_trip_ids: [],
      });
    if (url.pathname === '/rest/v1/rpc/get_my_group_visibility')
      return respond({ discoverable: true, about: '' });
    const reactionSummary = (tripId) => {
      const trip = store.trips.get(tripId),
        rows = [...store.reactions.values()].filter(
          (r) => r.trip_id === tripId && r.kind,
        );
      const available =
        !!trip &&
        (trip.group_id === groupId(id) ||
          (trip.status === 'published' && trip.visibility === 'public'));
      const counts = {};
      if (available)
        for (const row of rows) counts[row.kind] = (counts[row.kind] ?? 0) + 1;
      return {
        trip_id: tripId,
        available,
        can_react: available && trip.group_id !== groupId(id),
        counts,
        mine: store.reactions.get(tripId + ':' + groupId(id))?.kind ?? null,
      };
    };
    if (url.pathname === '/rest/v1/rpc/get_trip_reactions') {
      (store.reactionLoads ??= []).push(body.trip_ids);
      if (store.failReactionLoad) return respond({ message: 'Offline' }, 503);
      return respond(body.trip_ids.map(reactionSummary));
    }
    if (url.pathname === '/rest/v1/rpc/set_my_trip_reaction') {
      if (store.failReactionSave === true)
        return respond({ message: 'Offline' }, 503);
      const trip = store.trips.get(body.target_trip_id);
      if (!trip || trip.group_id === groupId(id))
        return respond({ code: 'P0002' }, 404);
      const key = trip.id + ':' + groupId(id),
        previous = store.reactions.get(key);
      const row = {
        id:
          previous?.id ??
          '00000000-0000-4000-8000-' + String(store.next++).padStart(12, '0'),
        trip_id: trip.id,
        group_id: groupId(id),
        kind: body.reaction_kind,
        updated_at: new Date().toISOString(),
      };
      store.reactions.set(key, row);
      let entry = store.notifications.find(
        (n) => n.kind === 'trip_reaction' && n.source_id === row.id,
      );
      if (!entry && body.reaction_kind) {
        entry = {
          id:
            '00000000-0000-4000-8000-' + String(store.next++).padStart(12, '0'),
          kind: 'trip_reaction',
          source_id: row.id,
          recipient_group_id: trip.group_id,
          actor_group_id: groupId(id),
          actor_name: profile(id).group.name,
          actor_avatar_id: profile(id).group.avatar_id,
          actor_crew_number: profile(id).group.crew_number,
          trip_label: trip.description,
          proposed_trip_id: trip.id,
          own_trip_id: null,
          invitation_id: null,
          conversation_id: null,
          created_at: row.updated_at,
          read_at: null,
        };
        store.notifications.push(entry);
      }
      if (entry) {
        entry.reaction_kind = body.reaction_kind ?? entry.reaction_kind;
        entry.reaction_active = !!body.reaction_kind;
        entry.available = !!body.reaction_kind;
        if (!body.reaction_kind) entry.read_at ??= row.updated_at;
      }
      if (store.failReactionSave === 'after-commit')
        return respond({ message: 'Lost reply' }, 503);
      return respond(reactionSummary(trip.id));
    }
    if (url.pathname === '/rest/v1/rpc/get_my_trip_reactors') {
      if (store.failReactorLoad) return respond({ message: 'Offline' }, 503);
      const trip = store.trips.get(body.target_trip_id);
      if (trip?.group_id !== groupId(id))
        return respond({ code: 'P0002' }, 404);
      const rows = [...store.reactions.values()]
        .filter((r) => r.trip_id === trip.id && r.kind)
        .map((r) => ({
          ...r,
          ...{
            name: profile(r.group_id === groupId(A) ? A : B).group.name,
            avatar_id: profile(r.group_id === groupId(A) ? A : B).group
              .avatar_id,
            crew_number: profile(r.group_id === groupId(A) ? A : B).group
              .crew_number,
            profile_available: true,
          },
        }));
      return respond({ items: rows, has_more: false });
    }
    if (url.pathname === '/rest/v1/rpc/get_my_favorites') {
      if (store.failFavoriteLoad) return respond({ message: 'Offline' }, 503);
      return respond({
        group_ids: [...(store.favoriteGroups.get(id) ?? [])],
        trip_ids: [...(store.favoriteTrips.get(id) ?? [])],
      });
    }
    if (
      [
        '/rest/v1/rpc/set_my_group_favorite',
        '/rest/v1/rpc/set_my_trip_favorite',
      ].includes(url.pathname)
    ) {
      if (store.failFavoriteSave === true)
        return respond({ message: 'Offline' }, 503);
      const groups = url.pathname.endsWith('set_my_group_favorite'),
        collection = groups ? store.favoriteGroups : store.favoriteTrips;
      const target = groups ? body.target_group_id : body.target_trip_id;
      const ids = collection.get(id) ?? new Set();
      if (body.is_favorite) ids.add(target);
      else ids.delete(target);
      collection.set(id, ids);
      if (store.failFavoriteSave === 'after-commit')
        return respond({ message: 'Lost reply' }, 503);
      return respond(body.is_favorite);
    }
    if (url.pathname === '/rest/v1/rpc/set_my_presence') {
      const key = id + ':' + body.connection_id,
        previous = store.presence.get(key);
      store.presence.set(key, {
        groupId: groupId(id),
        online: previous?.online === false ? false : body.is_online,
      });
      return respond(null);
    }
    if (url.pathname === '/rest/v1/rpc/get_online_groups')
      return respond([
        ...new Set(
          [...store.presence.values()]
            .filter((p) => p.online && body.group_ids.includes(p.groupId))
            .map((p) => p.groupId),
        ),
      ]);
    if (url.pathname === '/rest/v1/travel_groups')
      return respond([profile(id).group]);
    if (url.pathname === '/rest/v1/group_preferences')
      return respond(profile(id).preferences);
    if (url.pathname === '/rest/v1/rpc/get_my_notifications') {
      if (store.failNotifications) return respond({ message: 'Offline' }, 503);
      const all = store.notifications.filter(
        (n) => n.recipient_group_id === groupId(id),
      );
      const entries = all
        .filter(
          (n) =>
            (!body.only_unread || !n.read_at) &&
            (!body.before_at ||
              n.created_at < body.before_at ||
              (n.created_at === body.before_at && n.id < body.before_id)),
        )
        .sort(
          (a, b) =>
            b.created_at.localeCompare(a.created_at) ||
            b.id.localeCompare(a.id),
        );
      return respond({
        items: entries.slice(0, body.page_size ?? 30),
        has_more: entries.length > (body.page_size ?? 30),
        unread_count: all.filter((n) => !n.read_at).length,
        preferences: store.notificationPreferences.get(groupId(id)) ?? {
          push_messages: true,
          push_invitations: true,
          push_favorite_trips: true,
          push_reactions: true,
          push_proposals: true,
          updated_at: null,
        },
        fetched_at: new Date().toISOString(),
      });
    }
    if (url.pathname === '/rest/v1/rpc/mark_my_notifications_read') {
      if (store.failNotificationSave)
        return respond({ message: 'Offline' }, 503);
      let changed = 0;
      for (const n of store.notifications)
        if (
          n.recipient_group_id === groupId(id) &&
          !n.read_at &&
          (body.notification_ids
            ? body.notification_ids.includes(n.id)
            : n.created_at <= body.read_through)
        ) {
          n.read_at = new Date().toISOString();
          changed++;
        }
      return respond(changed);
    }
    if (url.pathname === '/rest/v1/rpc/save_my_notification_preference') {
      if (store.failNotificationSave)
        return respond({ message: 'Offline' }, 503);
      const previous = store.notificationPreferences.get(groupId(id)) ?? {
        push_messages: true,
        push_invitations: true,
        push_favorite_trips: true,
        push_reactions: true,
        push_proposals: true,
        updated_at: null,
      };
      const fields = {
        messages: 'push_messages',
        invitations: 'push_invitations',
        favorite_trips: 'push_favorite_trips',
        reactions: 'push_reactions',
        proposals: 'push_proposals',
      };
      if (!fields[body.preference_key]) return respond({ code: '22023' }, 400);
      const saved = {
        ...previous,
        [fields[body.preference_key]]: body.enabled,
        updated_at: new Date().toISOString(),
      };
      store.notificationPreferences.set(groupId(id), saved);
      return respond(saved);
    }
    if (
      url.pathname.startsWith('/rest/v1/rpc/') &&
      [
        'get_my_mailbox',
        'get_my_mailbox_page',
        'get_my_mailbox_states',
        'send_contact_invitation',
        'respond_contact_invitation',
        'send_chat_message',
        'mark_conversation_read',
        'get_conversation_messages',
        'get_message_reactions',
        'set_message_reaction',
        'set_group_block',
        'report_conversation',
      ].includes(url.pathname.split('/').at(-1))
    )
      return messagingEndpoint(
        url.pathname.split('/').at(-1),
        id,
        body,
        store,
        respond,
      );
    if (url.pathname === '/rest/v1/trip_plans') {
      if (store.failLoad) return respond({ message: 'Temporary failure' }, 503);
      return respond(
        [...store.trips.values()].filter(
          (trip) => trip.group_id === groupId(id),
        ),
      );
    }
    if (
      [
        'search_public_trips_v3',
        'refresh_public_trip_results_v3',
        'count_public_trips',
        'get_discovery_trip_v3',
      ].includes(url.pathname.split('/').at(-1))
    ) {
      const endpoint = url.pathname.split('/').at(-1),
        f = body.filters ?? {};
      (store.tripSearchCalls ??= []).push({ endpoint, ...body });
      if (
        store.failPublic ||
        (endpoint === 'search_public_trips_v3' &&
          body.after_cursor &&
          store.failMore)
      )
        return respond({ message: 'Temporary failure' }, 503);
      if (endpoint === 'count_public_trips' && store.failTripCount)
        return respond({ message: 'Temporary failure' }, 503);
      const filters = {
        ...INITIAL_FILTERS,
        tripModes: f.trip_modes ?? INITIAL_FILTERS.tripModes,
        landscapeKinds: f.landscapes ?? [],
        groupKinds: f.group_kinds ?? [],
        childAgeBands: f.child_age_bands ?? [],
        animalKinds: f.animal_kinds ?? [],
        favoritesOnly: f.favorites_only ?? false,
        location: f.location_query ?? '',
        locationId: f.location?.id,
        sourceTripId: f.source_trip_id ?? undefined,
        dateRangeId: f.start_date ? 'custom' : 'all',
        customDateRange: f.start_date
          ? { startDate: f.start_date, endDate: f.end_date }
          : undefined,
        dateFlexibilityDays: f.tolerance_days ?? 0,
      };
      const currentProfile = profile(id),
        own = [...store.trips.values()]
          .filter((t) => t.group_id === groupId(id))
          .map(tripFromRow);
      const rows = [...store.trips.values()]
        .filter(
          (t) =>
            t.group_id !== groupId(id) &&
            t.status === 'published' &&
            t.visibility === 'public' &&
            t.end_date > '2026-10-24',
        )
        .map((trip) => ({
          trip,
          crew: profile(trip.group_id === groupId(A) ? A : B).group,
        }));
      if (endpoint === 'get_discovery_trip_v3')
        return respond(
          rows.find((r) => r.trip.id === body.target_trip_id)
            ? rows.find((r) => r.trip.id === body.target_trip_id)
            : null,
        );
      const allowed = new Set(
        filterProposals(
          rows.map(proposalFromRow),
          filters,
          undefined,
          store.favoriteTrips.get(id) ?? new Set(),
        ).map((p) => p.trip.id),
      );
      const result = rows
        .filter((r) => allowed.has(r.trip.id))
        .sort(
          (a, b) =>
            b.trip.published_at.localeCompare(a.trip.published_at) ||
            a.trip.id.localeCompare(b.trip.id),
        );
      if (endpoint === 'count_public_trips') return respond(result.length);
      if (endpoint === 'refresh_public_trip_results_v3')
        return respond(result.filter((r) => body.trip_ids.includes(r.trip.id)));
      const offset = body.after_cursor
          ? result.findIndex((r) => r.trip.id === body.after_cursor.id) + 1
          : 0,
        size = body.page_size ?? 20,
        items = result.slice(offset, offset + size),
        last = items.at(-1);
      return respond({
        items,
        total_count: result.length,
        has_more: offset + items.length < result.length,
        cursor: last
          ? {
              id: last.trip.id,
              published_at: last.trip.published_at,
              version: 3,
              query_key: 'mock',
            }
          : null,
      });
    }
    if (url.pathname === '/rest/v1/rpc/list_public_trips') {
      if (store.failPublic)
        return respond({ message: 'Temporary failure' }, 503);
      return respond(
        [...store.trips.values()]
          .filter(
            (trip) =>
              trip.group_id !== groupId(id) &&
              trip.status === 'published' &&
              trip.visibility === 'public' &&
              trip.end_date > '2026-10-24',
          )
          .map((trip) => ({
            trip,
            crew: profile(trip.group_id === groupId(A) ? A : B).group,
          })),
      );
    }
    if (url.pathname === '/rest/v1/rpc/save_my_trip') {
      if (store.failSave === true)
        return respond({ message: 'Temporary failure' }, 503);
      expect(body.trip_data.group_id).toBeUndefined();
      expect(body.trip_data.owner_user_id).toBeUndefined();
      expect(body.request_key).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      const previous = body.trip_id
        ? store.trips.get(body.trip_id)
        : [...store.trips.values()].find(
            (trip) =>
              trip.group_id === groupId(id) &&
              trip.create_key === body.request_key,
          );
      if (body.trip_id && previous?.group_id !== groupId(id))
        return respond({ code: 'P0002' }, 404);
      const tripId =
        body.trip_id ??
        previous?.id ??
        '00000000-0000-4000-8000-' + String(store.next++).padStart(12, '0');
      let status =
        previous?.status && previous.status !== 'draft'
          ? previous.status
          : body.as_draft
            ? 'draft'
            : 'published';
      if (status === 'published' && body.trip_data.visibility === 'private')
        status = 'paused';
      const trip = {
        ...body.trip_data,
        id: tripId,
        create_key: body.request_key,
        group_id: groupId(id),
        status,
        published_at:
          previous?.published_at ??
          (status === 'published' ? '2026-10-24T12:00:00Z' : null),
        created_at: previous?.created_at ?? '2026-10-24T12:00:00Z',
        updated_at: '2026-10-24T12:00:00Z',
      };
      store.trips.set(tripId, trip);
      if (store.failSave === 'after-commit')
        return respond({ message: 'Lost response' }, 503);
      return respond(trip);
    }
    if (
      [
        '/rest/v1/rpc/change_my_trip_status',
        '/rest/v1/rpc/duplicate_my_trip',
        '/rest/v1/rpc/delete_my_trip',
      ].includes(url.pathname)
    ) {
      const previous = store.trips.get(body.trip_id);
      if (previous?.group_id !== groupId(id))
        return respond({ code: 'P0002' }, 404);
      if (url.pathname.endsWith('/delete_my_trip')) {
        store.trips.delete(body.trip_id);
        return respond(body.trip_id);
      }
      if (url.pathname.endsWith('/duplicate_my_trip')) {
        const copied = {
          ...previous,
          id:
            '00000000-0000-4000-8000-' + String(store.next++).padStart(12, '0'),
          status: 'draft',
          visibility: 'private',
          published_at: null,
        };
        store.trips.set(copied.id, copied);
        return respond(copied);
      }
      const changed = {
        ...previous,
        status: body.new_status,
        visibility:
          body.new_status === 'published' ? 'public' : previous.visibility,
      };
      store.trips.set(changed.id, changed);
      return respond(changed);
    }
    return respond({ message: 'Unhandled test endpoint' }, 400);
  });
}
async function login(page, email = 'a@example.com') {
  await page.clock.setFixedTime(new Date('2026-10-24T12:00:00Z'));
  await page.goto('/auth/sign-in');
  await page.getByRole('textbox', { name: 'E-mail', exact: true }).fill(email);
  await page.getByLabel('Hasło', { exact: true }).fill('correct-password');
  await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
  await expect(page).toHaveURL('http://localhost:8085/');
}

export { A, B, groupId, user, session, profile, state, backend, login };

async function messagingEndpoint(name, id, body, store, respond) {
  const me = groupId(id),
    other = groupId(id === A ? B : A);
  const next = () =>
    `00000000-0000-4000-8000-${String(store.next++).padStart(12, '0')}`;
  const now = () => new Date().toISOString();
  const pairBlocked = () => store.blocks.has(me) || store.blocks.has(other);
  const owned = () =>
    store.conversations.find(
      (c) =>
        c.id === body.conversation_id &&
        [c.sender_group_id, c.recipient_group_id].includes(me),
    );
  if (
    ['get_my_mailbox', 'get_my_mailbox_page', 'get_my_mailbox_states'].includes(
      name,
    )
  ) {
    if (store.failMailbox) return respond({ message: 'Offline' }, 503);
    const invitations = store.invitations.filter((i) =>
      [i.sender_group_id, i.recipient_group_id].includes(me),
    );
    const conversations = store.conversations
      .filter((c) => [c.sender_group_id, c.recipient_group_id].includes(me))
      .map((c) => {
        const messages = store.messages.filter(
          (m) => m.conversation_id === c.id,
        );
        const self = store.reads.get(c.id + me) ?? 0,
          peer = store.reads.get(c.id + other) ?? 0;
        return {
          ...c,
          blocked: pairBlocked(),
          self_read_sequence: self,
          other_read_sequence: peer,
          unread_count: messages.filter(
            (m) => m.sender_group_id !== me && m.sequence > self,
          ).length,
          last_message: messages.at(-1) ?? null,
        };
      });
    if (name === 'get_my_mailbox_states')
      return respond({
        conversations: conversations
          .filter((c) => body.conversation_ids.includes(c.id))
          .map(
            ({
              id,
              blocked,
              self_read_sequence,
              other_read_sequence,
              unread_count,
              updated_at,
            }) => ({
              id,
              blocked,
              self_read_sequence,
              other_read_sequence,
              unread_count,
              updated_at,
            }),
          ),
        invitations: invitations
          .filter((i) => body.invitation_ids.includes(i.id))
          .map(({ id, status }) => ({ id, status })),
      });
    if (name === 'get_my_mailbox')
      return respond({
        invitations,
        conversations,
        contacts: invitations.length ? [profile(id === A ? B : A).group] : [],
        blocked_group_ids: store.blocks.has(me) ? [other] : [],
        reports: store.reports.filter((r) => r.reporter === me),
      });
    const cursors = {},
      size = body.page_size ?? 20;
    const contextMatch = (i) =>
      (!body.target_group_id ||
        [i.sender_group_id, i.recipient_group_id].includes(
          body.target_group_id,
        )) &&
      (!body.target_trip_id || i.trip_reference === body.target_trip_id) &&
      (!body.target_conversation_id ||
        conversations.some(
          (c) =>
            c.id === body.target_conversation_id && c.invitation_id === i.id,
        ));
    const page = (kind, rows, time) => {
      if (
        body.page_kind &&
        body.page_kind !== 'all' &&
        body.page_kind !== kind &&
        !body.target_conversation_id &&
        !body.target_group_id &&
        !body.target_trip_id
      ) {
        cursors[kind] = { has_more: false, cursor: null };
        return [];
      }
      const sorted = rows
        .filter(
          (r) =>
            !body.before_at ||
            r[time] < body.before_at ||
            (r[time] === body.before_at && r.id < body.before_id),
        )
        .sort(
          (a, b) => b[time].localeCompare(a[time]) || b.id.localeCompare(a.id),
        );
      const items = sorted.slice(0, size),
        last = items.at(-1);
      cursors[kind] = {
        has_more: sorted.length > size,
        cursor: last ? { id: last.id, at: last[time] } : null,
      };
      return items;
    };
    let selectedConversations = page(
      'conversations',
      conversations.filter((c) =>
        invitations.some((i) => i.id === c.invitation_id && contextMatch(i)),
      ),
      'updated_at',
    );
    let selectedInvitations = [
      ...page(
        'received',
        invitations.filter(
          (i) => i.recipient_group_id === me && contextMatch(i),
        ),
        'created_at',
      ),
      ...page(
        'sent',
        invitations.filter((i) => i.sender_group_id === me && contextMatch(i)),
        'created_at',
      ),
    ];
    selectedInvitations = [
      ...new Map(
        [
          ...selectedInvitations,
          ...invitations.filter((i) =>
            selectedConversations.some((c) => c.invitation_id === i.id),
          ),
        ].map((i) => [i.id, i]),
      ).values(),
    ];
    selectedConversations = [
      ...new Map(
        [
          ...selectedConversations,
          ...conversations.filter((c) =>
            selectedInvitations.some((i) => i.id === c.invitation_id),
          ),
        ].map((c) => [c.id, c]),
      ).values(),
    ];
    return respond({
      invitations: selectedInvitations,
      conversations: selectedConversations,
      contacts: invitations.length ? [profile(id === A ? B : A).group] : [],
      blocked_group_ids: store.blocks.has(me) ? [other] : [],
      reports: store.reports.filter((r) => r.reporter === me),
      pages: cursors,
    });
  }
  if (name === 'send_contact_invitation') {
    if (store.failInvitation === true)
      return respond({ message: 'Offline' }, 503);
    const target = store.trips.get(body.target_trip_id);
    if (!target || target.group_id === me || target.status !== 'published')
      return respond({ code: 'P0002' }, 404);
    const previous = store.invitations.find(
      (i) => i.request_key === body.request_key && i.sender_group_id === me,
    );
    if (previous) return respond(previous.id);
    if (pairBlocked()) return respond({ code: '42501' }, 403);
    const invitation = {
      id: next(),
      sender_group_id: me,
      recipient_group_id: target.group_id,
      trip_id: target.id,
      source_trip_id: body.source_trip_id,
      trip_reference: target.id,
      trip_snapshot: target,
      source_trip_snapshot: body.source_trip_id
        ? store.trips.get(body.source_trip_id)
        : null,
      text: body.message_text,
      status: 'pending',
      created_at: now(),
      request_key: body.request_key,
    };
    store.invitations.push(invitation);
    if (store.failInvitation === 'after-commit')
      return respond({ message: 'Lost response' }, 503);
    return respond(invitation.id);
  }
  if (name === 'respond_contact_invitation') {
    const invitation = store.invitations.find(
      (i) => i.id === body.invitation_id,
    );
    if (!invitation) return respond({ code: 'P0002' }, 404);
    if (
      (body.response === 'withdrawn'
        ? invitation.sender_group_id
        : invitation.recipient_group_id) !== me
    )
      return respond({ code: '42501' }, 403);
    if (invitation.status !== body.response && invitation.status !== 'pending')
      return respond({ code: '22023' }, 400);
    invitation.status = body.response;
    if (body.response !== 'accepted') return respond(null);
    let c = store.conversations.find((c) => c.invitation_id === invitation.id);
    if (!c) {
      c = {
        id: next(),
        invitation_id: invitation.id,
        sender_group_id: invitation.sender_group_id,
        recipient_group_id: invitation.recipient_group_id,
        updated_at: now(),
      };
      store.conversations.push(c);
      store.messages.push({
        id: next(),
        sequence: 1,
        conversation_id: c.id,
        sender_group_id: invitation.sender_group_id,
        text: invitation.text,
        created_at: now(),
      });
    }
    return respond(c.id);
  }
  if (name === 'send_chat_message') {
    if (!owned()) return respond({ code: '42501' }, 403);
    if (store.failSend === true) return respond({ message: 'Offline' }, 503);
    const existing = store.messages.find(
      (m) => m.request_key === body.request_key && m.sender_group_id === me,
    );
    if (existing) return respond(existing);
    if (pairBlocked()) return respond({ code: '42501' }, 403);
    const m = {
      id: next(),
      sequence: Math.max(0, ...store.messages.map((m) => m.sequence)) + 1,
      conversation_id: body.conversation_id,
      sender_group_id: me,
      text: body.message_text,
      request_key: body.request_key,
      created_at: now(),
    };
    store.messages.push(m);
    owned().updated_at = now();
    if (store.failSend === 'after-commit')
      return respond({ message: 'Lost response' }, 503);
    return respond(m);
  }
  if (name === 'get_conversation_messages') {
    if (!owned()) return respond({ code: '42501' }, 403);
    if (store.failHistory) return respond({ message: 'Offline' }, 503);
    return respond(
      store.messages
        .filter(
          (m) =>
            m.conversation_id === body.conversation_id &&
            (!body.before_sequence || m.sequence < body.before_sequence),
        )
        .sort((a, b) => b.sequence - a.sequence)
        .slice(0, body.page_size ?? 50),
    );
  }
  if (name === 'get_message_reactions') {
    if (!owned()) return respond({ code: '42501' }, 403);
    if (store.failMessageReactionLoad)
      return respond({ message: 'Offline' }, 503);
    return respond(
      body.message_ids.map((message_id) => ({
        message_id,
        kind: store.messageReactions?.get(message_id) ?? null,
      })),
    );
  }
  if (name === 'set_message_reaction') {
    if (store.failMessageReactionSave === true)
      return respond({ message: 'Offline' }, 503);
    const message = store.messages.find((m) => m.id === body.target_message_id);
    const chat = store.conversations.find(
      (c) =>
        c.id === message?.conversation_id &&
        [c.sender_group_id, c.recipient_group_id].includes(me),
    );
    if (!message || !chat || message.sender_group_id === me || pairBlocked())
      return respond({ code: '42501' }, 403);
    store.messageReactions ??= new Map();
    store.messageReactions.set(message.id, body.reaction_kind);
    if (store.failMessageReactionSave === 'after-commit')
      return respond({ message: 'Lost reply' }, 503);
    return respond({ message_id: message.id, kind: body.reaction_kind });
  }
  if (name === 'mark_conversation_read') {
    if (!owned()) return respond({ code: '42501' }, 403);
    const m = store.messages.find(
      (m) =>
        m.id === body.through_message_id &&
        m.conversation_id === body.conversation_id,
    );
    if (!m) return respond({ code: 'P0002' }, 404);
    const value = Math.max(
      store.reads.get(body.conversation_id + me) ?? 0,
      m.sequence,
    );
    store.reads.set(body.conversation_id + me, value);
    for (const n of store.notifications)
      if (
        n.recipient_group_id === me &&
        n.conversation_id === body.conversation_id &&
        !n.read_at
      )
        n.read_at = now();
    return respond(value);
  }
  if (name === 'set_group_block') {
    if (body.blocked) store.blocks.add(me);
    else store.blocks.delete(me);
    return respond(null);
  }
  if (name === 'report_conversation') {
    if (!owned()) return respond({ code: '42501' }, 403);
    let report = store.reports.find(
      (r) => r.request_key === body.request_key && r.reporter === me,
    );
    if (!report) {
      report = {
        id: next(),
        reporter: me,
        group_id: other,
        conversation_id: body.conversation_id,
        reason: body.report_reason,
        request_key: body.request_key,
      };
      store.reports.push(report);
    }
    return respond(report.id);
  }
}

export function recommendCrew(crew, viewerId = A) {
  const group = value => publicGroupFromRow({ crew: value, about: '', active_trip_count: 0 }).group;
  return groupRecommendation(group(profile(viewerId).group), group(crew));
}
export function recommendTrip(trip, crew = profile(B).group, store, viewerId = A) {
  const viewer = profile(viewerId);
  return tripRecommendation(proposalFromRow({trip, crew}), profileFromRows(viewer.group, viewer.preferences),
    [...(store?.trips.values() ?? [])].filter(t => t.group_id === groupId(viewerId)).map(tripFromRow), INITIAL_FILTERS, '2026-10-24').recommendation;
}
