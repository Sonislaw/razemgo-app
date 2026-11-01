import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { asUser, profile, testDatabase, trip } from './support/database.mjs';

const migration = '202611010002_always_visible_groups.sql';

test('retiring profile visibility makes existing and new crews available without weakening access rules', async (t) => {
  const db = await testDatabase({ before: migration });
  const users = [randomUUID(), randomUUID(), randomUUID()];
  const call = async (name, args = []) => (await db.query(
    `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) value`, args,
  )).rows[0].value;
  const save = (data) => call('save_my_profile', [JSON.stringify(data)]);
  const directory = () => call('list_public_groups_v3', [{}, null, 5]);
  try {
    await db.query('insert into auth.users values($1),($2),($3)', users);
    await asUser(db, users[0]);
    const first = await save({ ...profile('Pierwsza ekipa'), about: 'Dotychczasowy opis pierwszej ekipy.' });
    await call('save_my_group_visibility', [false, null]);
    await asUser(db, users[1]);
    const second = await save(profile('Druga ekipa'));
    await db.exec('reset role');
    await db.query('delete from public.group_public_profiles where group_id=$1', [second.group.id]);
    await db.exec(await readFile(new URL('../supabase/migrations/' + migration, import.meta.url), 'utf8'));

    await t.test('migration reveals previously hidden crews, preserves descriptions and fills missing profile rows', async () => {
      await asUser(db, users[1]);
      const page = await directory();
      assert.equal(page.total_count, 1);
      assert.equal(page.items[0].crew.id, first.group.id);
      assert.equal(page.items[0].about, 'Dotychczasowy opis pierwszej ekipy.');
      assert.ok(await call('get_public_group_v3', [first.group.id, null, 5]));
      await asUser(db, users[0]);
      assert.equal((await directory()).items[0].crew.id, second.group.id);
      assert.equal((await call('get_my_group_visibility')).discoverable, true);
      assert.equal((await call('count_public_groups', [{}])), 1);
    });

    await t.test('older APKs cannot hide a profile, while legacy description saves and all read versions work', async () => {
      const revision = (await directory()).result_revision;
      const result = await call('save_my_group_visibility', [false, 'Opis zapisany przez starsze APK.']);
      assert.deepEqual(result, { discoverable: true, about: 'Opis zapisany przez starsze APK.' });
      await call('save_my_group_visibility', [false, null]);
      assert.equal((await directory()).result_revision, revision);
      await asUser(db, users[1]);
      for (const name of ['get_public_group', 'get_public_group_v2', 'get_public_group_v3'])
        assert.ok(await call(name, [first.group.id]));
      for (const name of ['list_public_groups', 'list_ranked_public_groups', 'list_ranked_public_groups_v2', 'list_public_groups_v3'])
        assert.ok((await call(name)).items.some(item => item.crew.id === first.group.id));
      assert.equal((await directory()).items[0].about, result.about);
    });

    await t.test('new profiles need neither an announcement nor a visibility setting', async () => {
      await asUser(db, users[2]);
      const created = await save({ ...profile('Nowa ekipa'), about: 'Opis nowej ekipy.' });
      await asUser(db, users[0]);
      assert.equal((await directory()).total_count, 2);
      const invitation = await call('send_profile_invitation', [created.group.id, 'Cześć! Poznajmy się.', randomUUID()]);
      assert.ok(invitation);
      // A private trip stays private even though its organizer's profile is available.
      await asUser(db, users[2]);
      const privateTrip = await call('save_my_trip', [JSON.stringify({ ...trip, visibility: 'private' }), null, true]);
      await asUser(db, users[0]);
      assert.ok(await call('get_public_group_v3', [created.group.id]));
      assert.equal(await call('get_discovery_trip_v3', [privateTrip.id]), null);
    });

    await t.test('the database rejects direct attempts to restore hidden flags', async () => {
      await assert.rejects(db.query('update public.group_public_profiles set discoverable=false'), error => error.code === '42501');
      await db.exec('reset role');
      await assert.rejects(db.query('update public.group_public_profiles set discoverable=false where group_id=$1', [first.group.id]), error => error.code === '23514');
      assert.equal((await db.query('select count(*)::integer n from public.group_public_profiles where not discoverable')).rows[0].n, 0);
    });

    await t.test('bilateral blocks, suspension, private data and anonymous access remain protected', async () => {
      await asUser(db, users[0]);
      await call('set_group_block', [second.group.id, true]);
      assert.equal(await call('get_public_group_v3', [second.group.id]), null);
      assert.ok(!(await directory()).items.some(item => item.crew.id === second.group.id));
      await call('set_group_block', [second.group.id, false]);
      await asUser(db, users[1]);
      await call('set_group_block', [first.group.id, true]);
      await asUser(db, users[0]);
      assert.equal(await call('get_public_group_v3', [second.group.id]), null);
      await asUser(db, users[1]);
      await call('set_group_block', [first.group.id, false]);
      await db.exec('reset role');
      await db.query('insert into moderation_private.suspended_accounts(user_id) values($1)', [users[1]]);
      await asUser(db, users[0]);
      assert.equal(await call('get_public_group_v3', [second.group.id]), null);
      assert.ok(!(await directory()).items.some(item => item.crew.id === second.group.id));
      assert.equal((await db.query('select * from public.travel_groups')).rows.length, 1);
      await db.exec('reset role; set role anon');
      await assert.rejects(directory(), error => error.code === '42501');
      await assert.rejects(call('save_my_group_visibility', [false, 'Opis.']), error => error.code === '42501');
      await assert.rejects(db.query('select * from public.group_public_profiles'), error => error.code === '42501');
    });
  } finally {
    await db.close();
  }
});
