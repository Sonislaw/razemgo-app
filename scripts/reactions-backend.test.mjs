import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('trip reactions: real SQL ownership, aggregates, notification deduplication and phone eligibility', async t => {
  const db = new PGlite(), users = Array.from({ length: 4 }, () => randomUUID()), sessions = users.map(() => randomUUID()), groups = [];
  const plan = { mode: 'planned', visibility: 'public', start_date: '2099-05-21', end_date: '2099-05-24',
    location_id: 'test', location_name: 'Chłapowo', location_region: 'Pomorskie', location_kind: 'village',
    campground_name: '', campground_address: '', travel_mode: 'Kamper', description: 'Plaża, rowery i wspólny odpoczynek nad morzem.',
    landscape: 'coast', interests: [], animal_kinds: [], matching_group_kinds: [], matching_child_age_bands: [] };
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
      create table auth.users(id uuid primary key); create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade,not_after timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.session_id',true),''))$$;
      grant usage on schema auth,public to anon,authenticated,service_role; grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated;
      alter default privileges in schema public grant execute on functions to anon,authenticated;`);
    const directory = new URL('../supabase/migrations/', import.meta.url);
    for (const name of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort())
      await db.exec(await readFile(new URL(name, directory), 'utf8'));
    const admin = () => db.exec('reset role');
    const as = async i => { await db.exec('reset role; set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.session_id',$2,false)", [users[i], sessions[i]]); };
    const one = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
    const rpc = (name, args = []) => one(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as value`, args);
    const summaries = (...ids) => rpc('get_trip_reactions', [ids]);
    const react = (id, kind) => rpc('set_my_trip_reaction', [id, kind]);
    const inbox = () => rpc('get_my_notifications');
    const roster = (id, cursor) => rpc('get_my_trip_reactors', [id, cursor?.updated_at ?? null, cursor?.id ?? null]);
    const publish = async (patch = {}, draft = false) => { await as(1); return rpc('save_my_trip', [{ ...plan, ...patch }, null, draft, randomUUID()]); };
    const claim = async () => { await db.exec('reset role; set role service_role'); return (await db.query('select * from public.claim_push_deliveries(100)')).rows; };
    const settle = async () => { const jobs = await claim();
      for (const job of jobs) await db.query('select public.finish_push_delivery($1,$2,$3,$4)', [job.delivery_id, job.claim_key, 'sent', job.push_token]); return jobs; };
    for (let i = 0; i < users.length; i++) {
      await admin(); await db.query('insert into auth.users values($1)', [users[i]]);
      await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [sessions[i], users[i]]);
      await as(i); groups.push((await rpc('save_my_profile', [{ name: 'Ekipa ' + i, avatar_id: 'camp-bear', kind: 'couple',
        adult_count: 2, child_count: 0, child_age_bands: [], travel_mode: 'Kamper', interests: [], animal_kinds: [],
        matching: { group_kinds: [], child_age_bands: [], description: '' } }])).group.id);
      if (i === 1) for (let j = 0; j < 2; j++) await rpc('register_my_push_device', [randomUUID(), randomUUID(),
        'ExponentPushToken[' + randomUUID().replaceAll('-', '') + ']', 'android', 'b7305e7b-7e1c-4b12-9123-caa0587f49b0']);
    }
    const trip = await publish(); let firstNotification;
    await t.test('everyone with trip access sees aggregates; each actor sees only their own choice', async () => {
      await as(0); assert.deepEqual((await summaries(trip.id))[0].counts, {});
      const saved = await react(trip.id, 'love'); assert.equal(saved.mine, 'love'); assert.deepEqual(saved.counts, { love: 1 });
      await as(2); const publicResult = (await summaries(trip.id))[0];
      assert.equal(publicResult.mine, null); assert.deepEqual(publicResult.counts, { love: 1 });
      assert.deepEqual(Object.keys(publicResult).sort(), ['available', 'can_react', 'counts', 'mine', 'trip_id']);
      await as(1); const owned = (await summaries(trip.id))[0]; assert.equal(owned.can_react, false);
      const list = await roster(trip.id); assert.equal(list.items.length, 1); assert.equal(list.items[0].group_id, groups[0]);
      assert.equal(list.items[0].kind, 'love'); assert.equal(list.items[0].name, 'Ekipa 0');
      firstNotification = (await inbox()).items.find(n => n.kind === 'trip_reaction');
      assert.equal(firstNotification.actor_group_id, groups[0]); assert.equal(firstNotification.proposed_trip_id, trip.id);
      assert.equal(firstNotification.reaction_kind, 'love'); assert.equal(firstNotification.reaction_active, true);
      assert.equal(firstNotification.read_at, null); assert.equal(firstNotification.available, true);
      assert.equal((await inbox()).preferences.push_reactions, true);
      const jobs = await settle(); assert.equal(jobs.length, 2);
      assert.ok(jobs.every(j => j.kind === 'trip_reaction' && j.recipient_group_id === groups[1] && j.trip_id === trip.id));
    });
    await t.test('retry and emotion changes reuse one reaction and one notification without resetting reads', async () => {
      await as(0); await react(trip.id, 'love'); await react(trip.id, 'envy');
      await as(1); let entries = (await inbox()).items.filter(n => n.kind === 'trip_reaction');
      assert.equal(entries.length, 1); assert.equal(entries[0].id, firstNotification.id); assert.equal(entries[0].reaction_kind, 'envy');
      await rpc('mark_my_notifications_read', [[firstNotification.id]]);
      await as(0); await react(trip.id, 'curious');
      await as(1); entries = (await inbox()).items.filter(n => n.kind === 'trip_reaction');
      assert.ok(entries[0].read_at); assert.equal(entries[0].reaction_kind, 'curious');
      assert.deepEqual((await summaries(trip.id))[0].counts, { curious: 1 });
      assert.equal((await settle()).length, 0);
    });
    await t.test('separate accounts keep separate choices; owner-only identities respect profile visibility', async () => {
      await as(2); await react(trip.id, 'applause');
      await assert.rejects(roster(trip.id), e => e.code === 'P0002');
      await as(0); await rpc('save_my_group_visibility', [false, '']);
      await as(1); const list = await roster(trip.id);
      assert.equal(list.items.length, 2); assert.equal(list.items.find(p => p.group_id === groups[0]).profile_available, false);
      assert.deepEqual((await summaries(trip.id))[0].counts, { curious: 1, applause: 1 });
      await as(0); await rpc('save_my_group_visibility', [true, '']);
      await settle();
    });
    await t.test('withdrawal clears results and pending push; adding back never spams or revives the queue', async () => {
      const fresh = await publish(); await as(0); await react(fresh.id, 'adventure'); await react(fresh.id, null);
      assert.deepEqual((await summaries(fresh.id))[0].counts, {});
      await as(1); const entry = (await inbox()).items.find(n => n.proposed_trip_id === fresh.id);
      assert.equal(entry.reaction_active, false); assert.equal(entry.available, false); assert.ok(entry.read_at);
      assert.equal((await roster(fresh.id)).items.length, 0); assert.equal((await settle()).length, 0);
      await as(0); await react(fresh.id, 'love');
      await as(1); const readded = (await inbox()).items.filter(n => n.proposed_trip_id === fresh.id);
      assert.equal(readded.length, 1); assert.equal(readded[0].id, entry.id); assert.ok(readded[0].read_at);
      assert.equal(readded[0].reaction_active, true); assert.equal((await settle()).length, 0);
    });
    await t.test('push settings are independent and default-on, and enabling never replays history', async () => {
      await as(1); const settings = await rpc('save_my_notification_preference', ['reactions', false]);
      assert.equal(settings.push_reactions, false); assert.equal(settings.push_messages, true); assert.equal(settings.push_invitations, true);
      const fresh = await publish(); await as(0); await react(fresh.id, 'love');
      assert.equal((await settle()).length, 0);
      await as(1); assert.ok((await inbox()).items.some(n => n.proposed_trip_id === fresh.id));
      await rpc('save_my_notification_preference', ['messages', false]); assert.equal((await inbox()).preferences.push_reactions, false);
      await rpc('save_my_notification_preference', ['reactions', true]); assert.equal((await settle()).length, 0);
      const next = await publish(); await as(0); await react(next.id, 'envy');
      await as(1); await rpc('save_my_notification_preference', ['reactions', false]); await rpc('save_my_notification_preference', ['reactions', true]);
      assert.equal((await settle()).length, 0);
    });
    await t.test('read on a second session suppresses queued push and survives restarting the client', async () => {
      const fresh = await publish(); await as(0); await react(fresh.id, 'love'); await as(1);
      const another = randomUUID(); await admin(); await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [another, users[1]]);
      await as(1); await db.query("select set_config('request.jwt.claim.session_id',$1,false)", [another]);
      const item = (await inbox()).items.find(n => n.proposed_trip_id === fresh.id);
      await rpc('mark_my_notifications_read', [[item.id]]); await as(1);
      assert.ok((await inbox()).items.find(n => n.id === item.id).read_at); assert.equal((await settle()).length, 0);
    });
    await t.test('draft/private/paused/past/hidden trips reject reactions; owners cannot react to themselves', async () => {
      const draft = await publish({}, true), privateTrip = await publish({ visibility: 'private' });
      for (const id of [draft.id, privateTrip.id, randomUUID()]) {
        await as(0); await assert.rejects(react(id, 'love'), e => e.code === 'P0002');
        assert.equal((await summaries(id))[0].available, false);
      }
      for (const action of ['paused', 'past', 'hidden', 'private']) {
        const fresh = await publish(); await as(0); await react(fresh.id, 'love');
        await admin();
        if (action === 'hidden') await db.query('insert into moderation_private.hidden_trips(trip_id) values($1)', [fresh.id]);
        else if (action === 'past') await db.query("update public.trip_plans set status='completed',start_date='2020-01-01',end_date='2020-01-03' where id=$1", [fresh.id]);
        else if (action === 'private') await db.query("update public.trip_plans set visibility='private',status='paused' where id=$1", [fresh.id]);
        else { await as(1); await rpc('change_my_trip_status', [fresh.id, 'paused']); }
        await as(0); await assert.rejects(react(fresh.id, 'envy'), e => e.code === 'P0002');
        assert.equal((await summaries(fresh.id))[0].available, false); assert.equal((await settle()).length, 0);
      }
      await as(1); await assert.rejects(react(trip.id, 'love'), e => e.code === 'P0002');
    });
    await t.test('blocks and account suspensions hide identities, remove active totals and prevent delivery', async () => {
      for (const blocker of [0, 1]) {
        const fresh = await publish(); await as(0); await react(fresh.id, 'love');
        await as(blocker); await rpc('set_group_block', [groups[blocker === 0 ? 1 : 0], true]);
        await as(1); assert.deepEqual((await summaries(fresh.id))[0].counts, {}); assert.equal((await roster(fresh.id)).items.length, 0);
        assert.ok((await inbox()).items.every(n => n.actor_group_id !== groups[0]));
        assert.equal((await settle()).length, 0);
        await as(blocker); await rpc('set_group_block', [groups[blocker === 0 ? 1 : 0], false]);
      }
      const fresh = await publish(); await as(0); await react(fresh.id, 'love');
      await admin(); await db.query('insert into moderation_private.suspended_accounts(user_id) values($1)', [users[0]]);
      await as(1); assert.deepEqual((await summaries(fresh.id))[0].counts, {}); assert.equal((await settle()).length, 0);
      await admin(); await db.query('delete from moderation_private.suspended_accounts where user_id=$1', [users[0]]);
    });
    await t.test('owner identity pagination is stable and cannot be queried by another account', async () => {
      const fresh = await publish(); await admin();
      for (let i = 0; i < 31; i++) {
        const user = randomUUID(), group = randomUUID(); await db.query('insert into auth.users values($1)', [user]);
        await db.query("insert into public.travel_groups(id,owner_user_id,name,avatar_id,kind,adult_count,child_count,child_age_bands,travel_mode,interests,animal_kinds) values($1,$2,$3,'camp-bear','couple',2,0,'{}','Kamper','{}','{}')", [group, user, 'Test ' + i]);
        await db.query("insert into reactions_private.trip_reactions(trip_id,actor_group_id,kind) values($1,$2,'love')", [fresh.id, group]);
      }
      await as(1); const first = await roster(fresh.id), second = await roster(fresh.id, first.items.at(-1));
      assert.equal(first.items.length, 30); assert.equal(first.has_more, true); assert.equal(second.items.length, 1); assert.equal(second.has_more, false);
      assert.equal(new Set([...first.items, ...second.items].map(p => p.id)).size, 31);
      await as(2); await assert.rejects(roster(fresh.id), e => e.code === 'P0002');
      assert.deepEqual((await summaries(fresh.id))[0].counts, { love: 31 });
    });
    await t.test('failed notification creation rolls back the reaction and its queue in the same transaction', async () => {
      const fresh = await publish(); await admin();
      await db.exec(`create function public.qa_reject_reaction() returns trigger language plpgsql as $$begin
        if new.kind='trip_reaction' then raise exception 'QA failure'; end if; return new; end$$;
        create trigger qa_reject_reaction before insert on public.notifications for each row execute function public.qa_reject_reaction();`);
      await as(0); await assert.rejects(react(fresh.id, 'love'));
      await admin(); assert.equal(await one('select count(*)::int value from reactions_private.trip_reactions where trip_id=$1', [fresh.id]), 0);
      await db.exec('drop trigger qa_reject_reaction on public.notifications; drop function public.qa_reject_reaction()');
    });
    await t.test('API validates keys, active sessions, ownership, limits and prevents raw access or forged counts', async () => {
      await as(0); await assert.rejects(react(trip.id, 'negative'), e => e.code === '22023');
      await assert.rejects(summaries(...Array.from({ length: 101 }, () => randomUUID())), e => e.code === '22023');
      await assert.rejects(rpc('get_trip_reactions', [[null]]), e => e.code === '22023');
      await assert.rejects(db.query('select * from reactions_private.trip_reactions'), e => e.code === '42501');
      await assert.rejects(db.query('select public.claim_push_deliveries(30)'), e => e.code === '42501');
      await admin(); await db.query("update auth.sessions set not_after=now()-interval '1 minute' where id=$1", [sessions[0]]);
      await as(0); await assert.rejects(summaries(trip.id), e => e.code === '42501');
      await admin(); await db.query('update auth.sessions set not_after=null where id=$1', [sessions[0]]);
      await db.exec("reset role; set role anon; select set_config('request.jwt.claim.sub','',false)");
      await assert.rejects(summaries(trip.id), e => e.code === '42501'); await assert.rejects(react(trip.id, 'love'), e => e.code === '42501');
    });
    await t.test('rate limits bound new reactions while permitting idempotent retries and withdrawal', async () => {
      await as(1); await rpc('save_my_notification_preference', ['reactions', false]);
      await admin(); await db.exec("update reactions_private.trip_reactions set updated_at=now()-interval '2 minutes'");
      let last;
      for(let i=0;i<30;i++) { last=await publish(); await as(0); await react(last.id,'love'); }
      await as(0); assert.equal((await react(last.id,'love')).mine,'love');
      const next=await publish();await as(0);await assert.rejects(react(next.id,'envy'),e=>e.code==='54000');
      assert.equal((await react(last.id,null)).mine,null);
      await admin();await db.exec("update reactions_private.trip_reactions set updated_at=now()-interval '2 minutes'");
      await as(1);await rpc('save_my_notification_preference',['reactions',true]);
    });
    await t.test('deleting an actor or trip cascades reactions; deleted trips never remain push targets', async () => {
      const fresh = await publish(); await as(0); await react(fresh.id, 'love');
      await as(1); const entry = (await inbox()).items.find(n => n.proposed_trip_id === fresh.id);
      await rpc('delete_my_trip', [fresh.id]);
      const unavailable = (await inbox()).items.find(n => n.id === entry.id);
      assert.equal(unavailable.available, false); assert.equal(unavailable.reaction_active, false); assert.equal((await settle()).length, 0);
      await admin(); await db.query('delete from auth.users where id=$1', [users[0]]);
      assert.equal(await one('select count(*)::int value from reactions_private.trip_reactions where actor_group_id=$1', [groups[0]]), 0);
      await db.query('delete from auth.users where id=$1', [users[1]]);
      assert.equal(await one('select count(*)::int value from reactions_private.trip_reactions'), 0);
    });
  } finally { await db.close(); }
});
