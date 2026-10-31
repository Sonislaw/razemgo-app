import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('favorite crew publications: durable inbox, default-on push, deduplication, revocation and access control', async t => {
  const db = new PGlite();
  const users = Array.from({ length: 4 }, () => randomUUID()), sessions = users.map(() => randomUUID()), groups = [];
  const plan = { adult_count:2,child_count:1,child_age_bands:['4–6'],mode:'planned', visibility: 'public', start_date: '2099-05-21', end_date: '2099-05-24',
    location_id: 'test', location_name: 'Chłapowo', location_region: 'Pomorskie', location_kind: 'village',
    campground_name: '', campground_address: '', travel_mode: 'Kamper', description: 'Wyjazd ulubionej ekipy nad morze i wspólne rowery.',
    landscape: 'coast', interests: [], animal_kinds: [], matching_group_kinds: [], matching_child_age_bands: [] };
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
      create table auth.users(id uuid primary key); create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade,not_after timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.session_id',true),''))$$;
      grant usage on schema auth,public to anon,authenticated,service_role; grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated;
      alter default privileges in schema public grant execute on functions to anon,authenticated;`);
    const directory = new URL('../supabase/migrations/', import.meta.url), migration = '202610250008_favorite_trip_notifications.sql';
    for (const name of (await readdir(directory)).filter(name => name.endsWith('.sql') && name < migration).sort())
      await db.exec(await readFile(new URL(name, directory), 'utf8'));
    const admin = () => db.exec('reset role');
    const as = async i => { await db.exec('reset role; set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.session_id',$2,false)", [users[i], sessions[i]]); };
    const one = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
    const rpc = (name, args = []) => one(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as value`, args);
    const inbox = () => rpc('get_my_notifications');
    const favorites = async (i, enabled = true) => { await as(i); return rpc('set_my_group_favorite', [groups[1], enabled]); };
    const preference = (key, enabled) => rpc('save_my_notification_preference', [key, enabled]);
    const publish = async (values = plan, id = null, draft = false, key = randomUUID()) => {
      await as(1); return rpc('save_my_trip', [values, id, draft, key]);
    };
    const claim = async () => { await db.exec('reset role; set role service_role');
      return (await db.query('select * from public.claim_push_deliveries(100)')).rows; };
    const settle = async () => { const jobs = await claim();
      for (const job of jobs) await db.query('select public.finish_push_delivery($1,$2,$3,$4)', [job.delivery_id, job.claim_key, 'sent', job.push_token]);
      return jobs; };
    for (let i = 0; i < users.length; i++) {
      await admin(); await db.query('insert into auth.users values($1)', [users[i]]);
      await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [sessions[i], users[i]]);
      await as(i); groups.push((await rpc('save_my_profile', [{ name: 'Ekipa ' + i, avatar_id: 'camp-bear', kind: 'couple',
        adult_count: 2, child_count: 0, child_age_bands: [], travel_mode: 'Kamper', interests: [], animal_kinds: [],
        matching: { group_kinds: [], child_age_bands: [], description: '' } }])).group.id);
      if (i !== 1) for (let device = 0; device < 2; device++) await rpc('register_my_push_device', [randomUUID(), randomUUID(),
        'ExponentPushToken[' + randomUUID().replaceAll('-', '') + ']', 'android', 'b7305e7b-7e1c-4b12-9123-caa0587f49b0']);
    }
    const historical = await publish(); await favorites(0); await favorites(3);
    await as(2); await rpc('set_my_trip_favorite', [historical.id, true]);
    await admin(); await db.exec(await readFile(new URL(migration, directory), 'utf8'));
    await as(0); await preference('favorite_trips', false);
    await admin(); await db.exec(await readFile(new URL('202610250009_default_favorite_trip_push.sql', directory), 'utf8'));
    await db.exec(await readFile(new URL('202610250010_trip_reactions.sql', directory), 'utf8'));
    await t.test('default-on migration preserves saved opt-outs without backfilling old publications', async () => {
      await as(0); assert.equal((await inbox()).preferences.push_favorite_trips, false);
      assert.equal((await inbox()).items.filter(n => n.kind === 'favorite_trip').length, 0);
      await as(3); assert.equal((await inbox()).preferences.push_favorite_trips, true);
      await admin(); assert.equal(await one("select notifications_private.push_allowed($1,'favorite_trip') as value", [groups[3]]), true);
      assert.equal(await one("select notifications_private.push_allowed($1,'unknown') as value", [groups[3]]), false);
      const inserted = (await db.query('insert into public.notification_preferences(group_id) values($1) returning push_favorite_trips', [groups[1]])).rows[0];
      assert.equal(inserted.push_favorite_trips, true);
      await as(1); await rpc('change_my_trip_status', [historical.id, 'paused']); await rpc('change_my_trip_status', [historical.id, 'published']);
      await as(0); assert.equal((await inbox()).items.filter(n => n.kind === 'favorite_trip').length, 0);
      await as(3); await preference('messages', false); await preference('invitations', false);
      assert.equal((await inbox()).preferences.push_favorite_trips, true);
      await as(2); assert.equal((await preference('invitations', false)).push_favorite_trips, true);
    });
    let first;
    await t.test('publication reaches crew followers only, with no need for their own trip or push permission', async () => {
      first = await publish();
      for (const i of [0, 3]) { await as(i); const item = (await inbox()).items.find(n => n.kind === 'favorite_trip');
        assert.equal(item.proposed_trip_id, first.id); assert.equal(item.actor_group_id, groups[1]); assert.equal(item.available, true);
        assert.equal(item.read_at, null); assert.match(item.trip_label, /Wyjazd ulubionej/); }
      for (const i of [1, 2]) { await as(i); assert.equal((await inbox()).items.some(n => n.kind === 'favorite_trip'), false); }
      const jobs = await settle(); assert.equal(jobs.length, 2);
      assert.ok(jobs.every(j => j.kind === 'favorite_trip' && j.recipient_group_id === groups[3] && j.trip_id === first.id));
    });
    await t.test('retry, editing, resume and following after publication never repeat an announcement', async () => {
      const key = randomUUID(); const trip = await publish(plan, null, false, key);
      assert.equal((await publish(plan, null, false, key)).id, trip.id);
      await publish({ ...plan, description: 'Zmieniony opis ogłoszenia, bez kolejnego powiadomienia.' }, trip.id);
      await favorites(2);
      await as(1); await rpc('change_my_trip_status', [trip.id, 'paused']); await rpc('change_my_trip_status', [trip.id, 'published']);
      await as(0); assert.equal((await inbox()).items.filter(n => n.kind === 'favorite_trip' && n.proposed_trip_id === trip.id).length, 1);
      await as(2); assert.equal((await inbox()).items.some(n => n.kind === 'favorite_trip'), false);
      await favorites(2, false); await settle();
      const unobserved = await publish(); await favorites(2); await publish(plan, unobserved.id);
      await as(2); assert.equal((await inbox()).items.some(n => n.proposed_trip_id === unobserved.id), false);
      await favorites(2, false); await settle();
    });
    await t.test('draft/private plans are silent and their first public publication announces once', async () => {
      const draft = await publish(plan, null, true), privateTrip = await publish({ ...plan, visibility: 'private' });
      await as(0); assert.ok((await inbox()).items.every(n => ![draft.id, privateTrip.id].includes(n.proposed_trip_id)));
      await publish(plan, draft.id); await as(1); await rpc('change_my_trip_status', [privateTrip.id, 'published']);
      await as(0); assert.equal((await inbox()).items.filter(n => [draft.id, privateTrip.id].includes(n.proposed_trip_id)).length, 2);
      await settle();
    });
    await t.test('enabling push never replays history; disabling cancels only this category and does not revive it', async () => {
      await as(0); await preference('favorite_trips', true); assert.equal((await claim()).length, 0);
      const trip = await publish(); await as(0); await preference('favorite_trips', false); const saved = await preference('favorite_trips', true);
      assert.equal(saved.push_messages, true); assert.equal(saved.push_invitations, true);
      const jobs = await settle(); assert.equal(jobs.length, 2); assert.ok(jobs.every(j => j.recipient_group_id === groups[3] && j.trip_id === trip.id));
    });
    await t.test('removing a favorite cancels queued alerts even if it is immediately added back', async () => {
      const trip = await publish(); await favorites(3, false); await favorites(3);
      const jobs = await settle(); assert.equal(jobs.length, 2); assert.ok(jobs.every(j => j.recipient_group_id === groups[0] && j.trip_id === trip.id));
      await as(3); assert.ok((await inbox()).items.some(n => n.proposed_trip_id === trip.id));
    });
    await t.test('reading on another device persists and suppresses queued phone alerts without changing chat receipts', async () => {
      const trip = await publish(); await as(0); const entry = (await inbox()).items.find(n => n.proposed_trip_id === trip.id);
      assert.equal(await rpc('mark_my_notifications_read', [[entry.id]]), 1);
      assert.ok((await inbox()).items.find(n => n.id === entry.id).read_at);
      const jobs = await settle(); assert.equal(jobs.length, 2); assert.ok(jobs.every(j => j.recipient_group_id === groups[3]));
      await admin(); assert.equal(await one('select count(*)::int as value from public.conversation_reads'), 0);
    });
    await t.test('withdrawal, moderation and deletion make the destination unavailable and cancel unsent push', async () => {
      for (const action of ['pause', 'private', 'hidden', 'delete']) {
        const trip = await publish();
        await as(0); const notificationId = (await inbox()).items.find(n => n.proposed_trip_id === trip.id).id;
        if (action === 'pause') { await as(1); await rpc('change_my_trip_status', [trip.id, 'paused']); }
        if (action === 'private') await publish({ ...plan, visibility: 'private' }, trip.id);
        if (action === 'hidden') { await admin(); await db.query('insert into moderation_private.hidden_trips(trip_id) values($1)', [trip.id]); }
        if (action === 'delete') { await as(1); await rpc('delete_my_trip', [trip.id]); }
        assert.equal((await settle()).length, 0, action);
        await as(0); const entry = (await inbox()).items.find(n => n.id === notificationId);
        assert.ok(entry); assert.equal(entry.available, false);
      }
    });
    await t.test('bilateral blocking and account suspension prevent delivery and hide blocked actors', async () => {
      for (const blocker of [0, 1]) {
        await publish(); await as(blocker); await rpc('set_group_block', [groups[blocker === 0 ? 1 : 0], true]);
        const jobs = await settle(); assert.ok(jobs.every(j => j.recipient_group_id !== groups[0]));
        await as(0); assert.ok((await inbox()).items.every(n => n.actor_group_id !== groups[1]));
        await as(blocker); await rpc('set_group_block', [groups[blocker === 0 ? 1 : 0], false]);
      }
      await publish(); await admin(); await db.query('insert into moderation_private.suspended_accounts(user_id) values($1)', [users[1]]);
      assert.equal((await settle()).length, 0);
      await as(0); assert.ok((await inbox()).items.every(n => n.actor_group_id !== groups[1]));
      await admin(); await db.query('delete from moderation_private.suspended_accounts where user_id=$1', [users[1]]);
    });
    await t.test('history remains owner-only and clients cannot forge notifications or claim deliveries', async () => {
      await as(0); assert.ok((await db.query('select * from public.notifications')).rows.every(n => n.recipient_group_id === groups[0]));
      await assert.rejects(db.query('select * from notifications_private.favorite_trip_publications'), e => e.code === '42501');
      await assert.rejects(db.query('select public.claim_push_deliveries(30)'), e => e.code === '42501');
      await assert.rejects(db.query("insert into public.notifications(recipient_group_id,actor_group_id,kind,source_id) values($1,$2,'favorite_trip',$3)", [groups[2], groups[1], randomUUID()]), e => e.code === '42501');
      await assert.rejects(db.query('update public.notification_preferences set push_favorite_trips=true where group_id=$1', [groups[2]]), e => e.code === '42501');
      await assert.rejects(preference('favorite_trips', null)); await assert.rejects(preference('unknown', true));
      await db.exec("reset role; set role anon; select set_config('request.jwt.claim.sub','',false)");
      await assert.rejects(inbox(), e => e.code === '42501');
      await assert.rejects(preference('favorite_trips', true), e => e.code === '42501');
      await admin(); await db.query('delete from auth.users where id=$1', [users[1]]);
      assert.equal(await one("select count(*)::int as value from public.notifications where kind='favorite_trip'"), 0);
      assert.equal(await one('select count(*)::int as value from notifications_private.favorite_trip_publications'), 0);
    });
  } finally { await db.close(); }
});
