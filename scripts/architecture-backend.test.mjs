import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { testDatabase, asUser, profile, trip } from './support/database.mjs';

test('page fingerprints and domain revisions preserve authorization and isolate unrelated changes', async (t) => {
  const db = await testDatabase();
  const users = [randomUUID(), randomUUID()];
  const groups = [];
  const rpc = async (name, args = []) =>
    (
      await db.query(
        `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) value`,
        args,
      )
    ).rows[0].value;
  try {
    for (const [i, user] of users.entries()) {
      await db.exec('reset role');
      await db.query('insert into auth.users values($1)', [user]);
      await asUser(db, user);
      groups.push(
        (await rpc('save_my_profile', [profile('Crew ' + i)])).group.id,
      );
    }
    const saved = await rpc('save_my_trip', [trip]);
    await asUser(db, users[0]);
    await t.test(
      'shared count rejects the same malformed filters as directory and fingerprints reflect visibility/order',
      async () => {
        for (const filters of [
          { name: 3 },
          { has_trips: 'true' },
          { animal_kinds: ['invalid'] },
        ]) {
          for (const name of ['count_public_groups', 'list_public_groups_v3'])
            await assert.rejects(rpc(name, [filters]));
        }
        const first = await rpc('list_public_groups_v3');
        assert.match(first.result_revision, /^[a-f0-9]{32}$/);
        assert.equal(first.total_count, await rpc('count_public_groups'));
        await asUser(db, users[1]);
        await rpc('save_my_profile', [profile('A different name')]);
        await asUser(db, users[0]);
        assert.notEqual(
          (await rpc('list_public_groups_v3')).result_revision,
          first.result_revision,
        );
        const before = await rpc('search_public_trips_v3');
        await db.exec('reset role');
        // Real bilateral visibility change, without weakening RLS in any read.
        await db.query(
          'insert into public.group_blocks(blocker_group_id,blocked_group_id) values($1,$2)',
          groups,
        );
        await asUser(db, users[0]);
        const blocked = await rpc('search_public_trips_v3');
        assert.equal(blocked.items.length, 0);
        assert.notEqual(blocked.result_revision, before.result_revision);
        await db.exec('reset role');
        await db.exec('delete from public.group_blocks');
        await asUser(db, users[0]);
      },
    );
    await t.test(
      'favorites, trips, mailbox and notifications advance only their domains',
      async () => {
        const before = await rpc('get_my_sync_state');
        await rpc('set_my_trip_favorite', [saved.id, true]);
        const favorite = await rpc('get_my_sync_state');
        assert.notEqual(favorite.domains.favorites, before.domains.favorites);
        for (const key of ['trips', 'mailbox', 'notifications'])
          assert.equal(favorite.domains[key], before.domains[key]);
        await rpc('save_my_trip', [trip]);
        const own = await rpc('get_my_sync_state');
        assert.notEqual(own.domains.trips, favorite.domains.trips);
        assert.equal(own.domains.mailbox, favorite.domains.mailbox);
        await db.exec('reset role');
        await db.query('select messaging_private.touch_pair($1,$2)', groups);
        await asUser(db, users[0]);
        const mailbox = await rpc('get_my_sync_state');
        assert.notEqual(mailbox.domains.mailbox, own.domains.mailbox);
        assert.equal(mailbox.domains.notifications, own.domains.notifications);
        await rpc('save_my_notification_preference', ['messages', false]);
        const notification = await rpc('get_my_sync_state');
        assert.notEqual(
          notification.domains.notifications,
          mailbox.domains.notifications,
        );
        assert.equal(notification.domains.mailbox, mailbox.domains.mailbox);
        await assert.rejects(
          db.query('select * from messaging_private.sync_revisions'),
          (e) => e.code === '42501',
        );
        await asUser(db, users[1]);
        const other = await rpc('get_my_sync_state');
        assert.notEqual(
          other.domains.favorites,
          notification.domains.favorites,
        );
        await db.exec('reset role;set role anon');
        for (const name of [
          'get_my_sync_state',
          'list_public_groups_v3',
          'count_public_groups',
        ])
          await assert.rejects(rpc(name), (e) => e.code === '42501');
      },
    );
    await db.exec('reset role');
    await db.query('delete from auth.users where id=any($1)', [users]);
    assert.equal(
      (
        await db.query(
          'select count(*)::int n from messaging_private.sync_revisions',
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});
