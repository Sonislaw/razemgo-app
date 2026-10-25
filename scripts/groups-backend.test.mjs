import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('group directory and profile invitations: real local SQL, privacy, safety and compatibility', async t => {
  const db = new PGlite();
  const users = Array.from({ length: 4 }, randomUUID), sessions = users.map(() => randomUUID()), groups = [];
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
      create table auth.users(id uuid primary key);
      create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade,not_after timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.session_id',true),''))$$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated;
      alter default privileges in schema public grant execute on functions to anon,authenticated;`);
    const migrations = new URL('../supabase/migrations/', import.meta.url);
    const defaultVisibilityMigration = '202610250002_default_group_visibility.sql';
    for (const file of (await readdir(migrations)).filter(f => f.endsWith('.sql') && f !== defaultVisibilityMigration).sort())
      await db.exec(await readFile(new URL(file, migrations), 'utf8'));
    const root = () => db.exec('reset role');
    const as = async i => {
      await db.exec('reset role; set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.session_id',$2,false)", [users[i], sessions[i]]);
    };
    const rpc = async (name, args = []) => (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as value`, args)).rows[0].value;
    const profile = { avatar_id: 'camp-bear', kind: 'family', adult_count: 2, child_count: 1, child_age_bands: ['4–6'],
      travel_mode: 'Kamper', interests: ['Rowery'], animal_kinds: ['dog'],
      matching: { group_kinds: ['family'], child_age_bands: ['4–6'], description: 'SECRET MATCHING PREFERENCES' } };
    for (let i = 0; i < users.length; i++) {
      await root(); await db.query('insert into auth.users values($1)', [users[i]]);
      await db.query('insert into auth.sessions values($1,$2,null)', [sessions[i], users[i]]);
      await as(i); groups.push((await rpc('save_my_profile', [{ ...profile, name: ['Moja ekipa', 'Łąkowe ścieżki', 'Dwoje w drodze', 'Ukryta ekipa'][i],
        ...(i === 2 ? { kind: 'couple', child_count: 0, child_age_bands: [], travel_mode: 'Van', animal_kinds: ['cat'] } : {}) }])).group.id);
    }
    const list = (filters = {}, name = null, id = null) => rpc('list_public_groups', [filters, name, id]);
    const detail = id => rpc('get_public_group', [id]);
    const visible = (value, about = 'Publiczny opis ekipy.') => rpc('save_my_group_visibility', [value, about]);
    const invite = (target, token = randomUUID(), text = 'Cześć! Może wspólnie zaplanujemy wyjazd?') => rpc('send_profile_invitation', [target, text, token]);
    const respond = (id, response) => rpc('respond_contact_invitation', [id, response]);
    const plan = { mode: 'planned', visibility: 'public', start_date: '2099-05-21', end_date: '2099-05-24', location_id: 'test',
      location_name: 'Chłapowo', location_region: 'Pomorskie', location_kind: 'village', travel_mode: 'Kamper',
      description: 'Spokojny wyjazd nad morze i wspólne ognisko.', landscape: 'coast', interests: ['Rowery'], animal_kinds: [], matching_group_kinds: [], matching_child_age_bands: [] };

    await t.test('migration defaults existing unset profiles to visible and preserves explicit hidden settings', async () => {
      await as(3); await visible(false, 'Zachowaj ukryty profil i opis.');
      await root(); await db.exec(await readFile(new URL(defaultVisibilityMigration, migrations), 'utf8'));
      await as(0); assert.equal((await rpc('get_my_group_visibility')).discoverable, true);
      assert.equal((await list()).items.length, 2);
      assert.ok(await detail(groups[1]));
      await as(3); assert.deepEqual(await rpc('get_my_group_visibility'), { discoverable: false, about: 'Zachowaj ukryty profil i opis.' });
      await as(1); await visible(false); await as(2); await visible(false); await as(0); await visible(false, '');
    });
    await t.test('new profiles are immediately searchable; subsequent edits preserve a choice to hide', async () => {
      const index = users.length; users.push(randomUUID()); sessions.push(randomUUID());
      await root(); await db.query('insert into auth.users values($1)', [users[index]]);
      await db.query('insert into auth.sessions values($1,$2,null)', [sessions[index], users[index]]);
      await as(index); const saved = await rpc('save_my_profile', [{ ...profile, name: 'Nowa widoczna ekipa' }]);
      assert.equal((await rpc('get_my_group_visibility')).discoverable, true);
      await as(0); assert.ok((await list()).items.some(x => x.crew.id === saved.group.id));
      await as(index); await visible(false, 'Opis ukrytej ekipy.');
      await rpc('save_my_profile', [{ ...profile, name: 'Nowa nazwa ukrytej' }]);
      assert.deepEqual(await rpc('get_my_group_visibility'), { discoverable: false, about: 'Opis ukrytej ekipy.' });
      await as(0); assert.equal((await list()).items.some(x => x.crew.id === saved.group.id), false);
      await root(); await db.query('delete from auth.users where id=$1', [users[index]]);
    });
    await t.test('explicit hidden settings control visibility and public profiles omit private preferences', async () => {
      await as(0); assert.deepEqual((await list()).items, []); assert.equal(await detail(groups[1]), null);
      assert.deepEqual(await rpc('get_my_group_visibility'), { about: '', discoverable: false });
      await as(1); await visible(true, '  Rowery, natura i kawa.  ');
      await rpc('register_my_push_device', [randomUUID(), randomUUID(), 'ExpoPushToken[local_test_device_123]', 'android', 'b7305e7b-7e1c-4b12-9123-caa0587f49b0']);
      await as(2); await visible(true);
      await as(0); const page = await list(); assert.equal(page.items.length, 2);
      const family = page.items.find(x => x.crew.id === groups[1]); assert.equal(family.about, 'Rowery, natura i kawa.');
      assert.equal(family.active_trip_count, 0); assert.equal(family.crew.owner_user_id, undefined);
      assert.equal(JSON.stringify(page).includes('SECRET'), false);
      assert.equal((await detail(groups[1])).trips.length, 0);
      const settings = (await db.query('select * from public.group_public_profiles')).rows;
      assert.equal(settings.length, 1); assert.equal(settings[0].group_id, groups[0]);
      assert.equal((await db.query('select * from public.travel_groups')).rows.length, 1);
      await assert.rejects(db.query('update public.group_public_profiles set discoverable=true where group_id=$1', [groups[3]]));
    });
    await t.test('server filters normalize Polish names and combine categories without interpreting wildcards', async () => {
      assert.equal((await list({ name: 'lakowe sciezki', group_kinds: ['family'], child_age_bands: ['4–6'], travel_modes: ['Kamper'], interests: ['Rowery'], animal_kinds: ['dog'] })).items.length, 1);
      for (const filter of [{ name: '%' }, { name: '_' }, { child_age_bands: ['13–17'] }, { has_trips: true }, { interests: ['Kajaki'] }, { group_kinds: ['family'], animal_kinds: ['cat'] }])
        assert.equal((await list(filter)).items.length, 0);
      assert.equal((await list({ group_kinds: ['couple'], animal_kinds: ['cat'] })).items.length, 1);
      for (const bad of [{ group_kinds: ['unknown'] }, { child_age_bands: ['4–6', '4–6'] }, { travel_modes: ['Train'] }, { animal_kinds: ['other'] }, { name: 'x'.repeat(81) }, { has_trips: 'true' }])
        await assert.rejects(list(bad));
      await assert.rejects(list({}, 'name', null), e => e.code === '22023');
    });
    await t.test('visibility save validates at database boundary and cannot change ownership', async () => {
      await as(1); await assert.rejects(visible(true, 'x'.repeat(601)), e => e.code === '22023');
      await assert.rejects(visible(null), e => e.code === '22023');
      assert.equal((await rpc('get_my_group_visibility')).about, 'Rowery, natura i kawa.');
      await as(0); assert.equal((await rpc('get_my_group_visibility')).discoverable, false);
      await assert.rejects(db.query('select messaging_private.public_trip_count($1)', [groups[1]]));
    });
    let invitation, chat;
    await t.test('a visible profile can be blocked and unblocked before first contact; unknown UUIDs cannot be probed', async () => {
      await as(0); await rpc('set_group_block', [groups[2], true]);
      const box = await rpc('get_my_mailbox'); assert.equal(box.invitations.length, 0);
      assert.deepEqual(box.blocked_group_ids, [groups[2]]); assert.equal(box.contacts[0].name, 'Dwoje w drodze');
      assert.equal(box.contacts[0].owner_user_id, undefined); assert.equal(box.contacts[0].child_age_bands, undefined);
      assert.equal(await detail(groups[2]), null);
      await rpc('set_group_block', [groups[2], false]); assert.ok(await detail(groups[2]));
      await assert.rejects(rpc('set_group_block', [randomUUID(), true]), e => e.code === 'P0002');
      await assert.rejects(rpc('set_group_block', [groups[2], null]), e => e.code === '22023');
    });
    const request = randomUUID();
    await t.test('contact without any trip is idempotent, private and creates push/notification events', async () => {
      invitation = await invite(groups[1], request);
      assert.equal(await invite(groups[1], request), invitation);
      assert.equal(await invite(groups[1]), invitation);
      const box = await rpc('get_my_mailbox'); assert.equal(box.invitations.length, 1);
      assert.equal(box.invitations[0].context_kind, 'profile'); assert.equal(box.invitations[0].trip_reference, null);
      assert.equal(box.invitations[0].trip_snapshot, null); assert.equal(box.conversations.length, 0);
      assert.equal(JSON.stringify(box).includes('SECRET'), false);
      await assert.rejects(invite(groups[0]), e => e.code === 'P0002');
      await assert.rejects(invite(groups[3]), e => e.code === 'P0002');
      await assert.rejects(invite(groups[2], request), e => e.code === '22023');
      await assert.rejects(invite(groups[2], randomUUID(), ''), e => e.code === '22023');
      await assert.rejects(invite(groups[2], randomUUID(), 'x'.repeat(501)), e => e.code === '22023');
      await as(2); await assert.rejects(respond(invitation, 'accepted')); assert.equal((await rpc('get_my_mailbox')).invitations.length, 0);
      await as(1); assert.equal((await rpc('get_my_notifications')).items[0].kind, 'invitation_received');
      await root(); assert.equal((await db.query("select count(*)::int n from push_private.events where kind='invitation_received'")).rows[0].n, 1);
    });
    await t.test('pending profile invitations stay accessible after hiding; reciprocal invitations reuse the request', async () => {
      await as(1); assert.equal(await invite(groups[0]), invitation); await visible(false);
      assert.ok(await detail(groups[0]));
      await as(2); assert.equal(await detail(groups[1]), null); await assert.rejects(invite(groups[1]));
      await as(0); assert.equal((await list()).items.length, 1); assert.ok(await detail(groups[1]));
      await assert.rejects(respond(invitation, 'accepted'), e => e.code === '42501');
    });
    await t.test('acceptance yields one durable conversation, with unread/read states and ordinary chat', async () => {
      await as(1); chat = await respond(invitation, 'accepted'); assert.equal(await respond(invitation, 'accepted'), chat);
      assert.equal((await rpc('get_my_mailbox')).conversations[0].unread_count, 1);
      const messages = (await db.query('select * from public.get_conversation_messages($1)', [chat])).rows;
      assert.equal(messages.length, 1); assert.equal(messages[0].text, 'Cześć! Może wspólnie zaplanujemy wyjazd?');
      await rpc('mark_conversation_read', [chat, messages[0].id]);
      const key = randomUUID(); const saved = await rpc('send_chat_message', [chat, 'Tak, porozmawiajmy!', key]);
      assert.equal((await rpc('send_chat_message', [chat, 'Tak, porozmawiajmy!', key])).id, saved.id);
      await as(0); assert.equal((await rpc('get_my_mailbox')).conversations[0].unread_count, 1);
      assert.equal(await invite(groups[1]), invitation);
      await as(2); await assert.rejects(rpc('send_chat_message', [chat, 'Intruz', randomUUID()]));
    });
    let trip;
    await t.test('existing trip APIs survive unchanged and cannot reuse a profile request key', async () => {
      await as(2); trip = await rpc('save_my_trip', [plan]);
      await as(0); await assert.rejects(rpc('send_contact_invitation', [trip.id, 'Cześć!', request]), e => e.code === '22023');
      const old = await rpc('send_contact_invitation', [trip.id, 'Cześć z wyjazdu!', randomUUID()]);
      assert.equal((await rpc('get_my_mailbox')).invitations.find(i => i.id === old).context_kind, 'trip');
      assert.equal(await invite(groups[2]), old);
      assert.equal((await list({ has_trips: true })).items[0].active_trip_count, 1);
      assert.equal((await detail(groups[2])).trips[0].trip.id, trip.id);
      await root(); await db.query('insert into moderation_private.hidden_trips(trip_id) values($1)', [trip.id]);
      await as(0); assert.equal((await list({ has_trips: true })).items.length, 0); assert.equal((await detail(groups[2])).trips.length, 0);
    });
    let report;
    await t.test('profile reports enter the existing admin queue with only public evidence', async () => {
      await as(0); const token = randomUUID(); report = await rpc('report_profile', [groups[1], 'Spam', token]);
      assert.equal(await rpc('report_profile', [groups[1], 'Spam', token]), report);
      await assert.rejects(rpc('report_profile', [groups[2], 'Spam', token]), e => e.code === '22023');
      await assert.rejects(rpc('admin_report_detail', [report]), e => e.code === '42501');
      await root(); await db.query('insert into moderation_private.administrators(user_id) values($1)', [users[0]]);
      await as(0); const evidence = await rpc('admin_report_detail', [report]);
      assert.equal(evidence.report.target_kind, 'profile'); assert.equal(evidence.evidence.profile.name, 'Łąkowe ścieżki');
      assert.equal(JSON.stringify(evidence).includes('SECRET'), false); assert.equal(evidence.evidence.messages, undefined);
      assert.equal((await rpc('admin_list_reports')).items.length, 1);
    });
    await t.test('either side block and administrator suspension hide discovery and deny existing-token contact', async () => {
      await as(1); await visible(true); await rpc('set_group_block', [groups[0], true]);
      await as(0); assert.equal(await detail(groups[1]), null); await assert.rejects(invite(groups[1]));
      await assert.rejects(rpc('send_chat_message', [chat, 'Zablokowane', randomUUID()]), e => e.code === '42501');
      assert.equal((await list()).items.some(i => i.crew.id === groups[1]), false);
      await as(1); await rpc('set_group_block', [groups[0], false]);
      await root(); await db.query('insert into moderation_private.suspended_accounts(user_id) values($1)', [users[1]]);
      await as(0); assert.equal(await detail(groups[1]), null); await assert.rejects(invite(groups[1]));
      await as(1); for (const name of ['get_my_group_visibility', 'list_public_groups', 'get_my_mailbox']) await assert.rejects(rpc(name), e => e.code === '42501');
      await assert.rejects(visible(true), e => e.code === '42501');
      await root(); await db.query('delete from moderation_private.suspended_accounts where user_id=$1', [users[1]]);
    });
    await t.test('keyset pagination is stable for identical names and limits each page to twenty', async () => {
      await root();
      for (let i = 0; i < 22; i++) {
        const id = randomUUID(); await db.query('insert into auth.users values($1)', [id]);
        const group = (await db.query(`insert into public.travel_groups(owner_user_id,name,avatar_id,kind,adult_count,child_count,travel_mode)
          values($1,'Pagination crew','camp-bear','solo',1,0,'Kamper') returning id`, [id])).rows[0].id;
        assert.ok(group);
      }
      await as(0); const first = await list({ name: 'Pagination' }); assert.equal(first.items.length, 20); assert.equal(first.has_more, true);
      const next = await list({ name: 'Pagination' }, first.cursor.name, first.cursor.id); assert.equal(next.items.length, 2); assert.equal(next.has_more, false);
      assert.equal(new Set([...first.items, ...next.items].map(x => x.crew.id)).size, 22);
    });
    await t.test('anonymous access and direct RPC bypasses remain denied; deletion cascades', async () => {
      await db.exec('reset role; set role anon');
      for (const name of ['list_public_groups', 'get_my_group_visibility', 'get_my_mailbox']) await assert.rejects(rpc(name));
      await assert.rejects(detail(groups[1])); await assert.rejects(visible(true)); await assert.rejects(invite(groups[1]));
      await assert.rejects(db.query('select * from public.group_public_profiles'));
      await root(); await db.query('delete from auth.users where id=$1', [users[1]]);
      assert.equal((await db.query('select * from public.group_public_profiles where group_id=$1', [groups[1]])).rows.length, 0);
      await as(0); assert.equal(await detail(groups[1]), null); assert.equal((await rpc('get_my_mailbox')).conversations.length, 0);
    });
  } finally { await db.close(); }
});
