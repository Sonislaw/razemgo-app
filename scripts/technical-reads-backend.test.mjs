import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { testDatabase, asUser, profile, trip } from './support/database.mjs';

test('technical read contracts retain privacy, complete pagination and legacy ranking', async (t) => {
  const db = await testDatabase(),
    users = [randomUUID(), randomUUID()],
    groups = [];
  const rpc = async (name, args = []) =>
    (
      await db.query(
        `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) value`,
        args,
      )
    ).rows[0].value;
  try {
    for (const [index, user] of users.entries()) {
      await db.exec('reset role');
      await db.query('insert into auth.users values($1)', [user]);
      await asUser(db, user);
      groups.push(
        (await rpc('save_my_profile', [profile('Ekipa ' + index)])).group.id,
      );
    }
    await asUser(db, users[0]);
    const ids = [];
    for (let n = 0; n < 43; n++)
      ids.push(
        (
          await rpc('save_my_trip', [
            { ...trip, description: trip.description + ' ' + n },
            null,
            false,
            randomUUID(),
          ])
        ).id,
      );
    await t.test(
      'bounded trip pages cover date ties once and counts do not depend on loaded rows',
      async () => {
        let cursor = null;
        const found = [];
        do {
          const page = await rpc('list_my_trip_page', [false, {}, cursor, 5]);
          assert.ok(page.items.length <= 5);
          assert.equal(page.total_count, 43);
          assert.equal(page.active_count, 43);
          found.push(...page.items.map((row) => row.id));
          cursor = page.has_more ? page.cursor : null;
        } while (cursor);
        assert.equal(found.length, 43);
        assert.equal(new Set(found).size, 43);
        assert.ok(await rpc('get_my_trip', [ids[42]]));
      },
    );
    await t.test(
      'filters apply to full descriptions and cursors cannot cross queries',
      async () => {
        const page = await rpc('list_my_trip_page', [false, {}, null, 5]);
        await assert.rejects(
          rpc('list_my_trip_page', [
            false,
            { query: 'ognisko' },
            page.cursor,
            5,
          ]),
          (e) => e.code === '22023',
        );
        assert.equal(
          (
            await rpc('list_my_trip_page', [
              false,
              { query: 'Pomorze' },
              null,
              5,
            ])
          ).total_count,
          43,
        );
        assert.equal(
          (
            await rpc('list_my_trip_page', [
              false,
              { start_date: '2099-05-24' },
              null,
              5,
            ])
          ).total_count,
          0,
        );
        await assert.rejects(
          rpc('list_my_trip_page', [false, {}, null, 100000]),
          (e) => e.code === '22023',
        );
      },
    );
    await t.test(
      'summary is aggregate-only; another owner cannot retrieve a private trip',
      async () => {
        const summary = await rpc('get_my_sync_state');
        assert.equal(summary.active_trips, 43);
        assert.equal(summary.unread_messages, 0);
        assert.doesNotMatch(
          JSON.stringify(summary),
          /Chłapowo|Ekipa|Spokojny|access_token|owner_user/,
        );
        await asUser(db, users[1]);
        assert.equal(await rpc('get_my_trip', [ids[0]]), null);
        assert.equal((await rpc('list_my_trip_page')).items.length, 0);
        await asUser(db, users[0]);
      },
    );
    await t.test(
      'new mailbox pages retain their empty shape and deny foreign context probes',
      async () => {
        const page = await rpc('get_my_mailbox_page');
        assert.deepEqual(page.conversations, []);
        assert.deepEqual(page.invitations, []);
        assert.equal(page.pages.conversations.has_more, false);
        assert.equal(
          (
            await rpc('get_my_mailbox_page', [
              'all',
              null,
              null,
              5,
              randomUUID(),
            ])
          ).conversations.length,
          0,
        );
        await assert.rejects(
          rpc('get_my_mailbox_page', ['all', null, randomUUID()]),
          (e) => e.code === '22023',
        );
        await assert.rejects(
          rpc('get_my_notification_states', [
            Array.from({ length: 101 }, randomUUID),
          ]),
          (e) => e.code === '22023',
        );
      },
    );
    await t.test(
      'both ranking modes still return the same private-preference-safe score',
      async () => {
        const a = await rpc('list_ranked_public_groups', [
          {},
          'alphabetical',
          null,
          5,
        ]);
        const b = await rpc('list_ranked_public_groups', [
          {},
          'compatibility',
          null,
          5,
        ]);
        assert.equal(a.items.length, 1);
        assert.deepEqual(a.items[0].compatibility, b.items[0].compatibility);
        assert.doesNotMatch(
          JSON.stringify(a),
          /owner_user_id|matching_group_kinds/,
        );
      },
    );
    await t.test(
      'faster trip score arithmetic matches the reference JSON implementation, including reason order',
      async () => {
        await db.exec('reset role');
        const batches = await db.query(
          `with contexts as (select discovery_private.matching_context($1,'{}') ctx),
        filters as (select f from (values('{}'::jsonb),('{"child_age_bands":["4–6","7–9"],"group_kinds":["couple"],"start_date":"2099-05-20","end_date":"2099-05-25","tolerance_days":2}'::jsonb)) v(f))
        select discovery_private.score_pair(t,g,ctx,((ctx).trips)[o.ordinality::integer],f) reference,jsonb_build_object('score',batch.score,'reasons',batch.reasons) actual
        from (select * from public.trip_plans limit 3) t join public.travel_groups g on g.id=t.group_id cross join contexts cross join filters
        cross join lateral unnest((ctx).trips) with ordinality o
        cross join lateral discovery_private.score_rows(t,g,ctx,f) batch where batch.pair_order=o.ordinality`,
          [groups[0]],
        );
        assert.ok(batches.rows.length > 100);
        for (const row of batches.rows)
          assert.deepEqual(row.actual, row.reference);
        await asUser(db, users[0]);
      },
    );
    await t.test(
      'mailbox cursors cover all conversations and invitations; context and batch reads are owner-only',
      async () => {
        await db.exec('reset role');
        const conversations = [];
        for (let n = 0; n < 23; n++) {
          const invitation = randomUUID(),
            chat = randomUUID();
          conversations.push(chat);
          await db.query(
            `insert into public.contact_invitations(id,sender_group_id,recipient_group_id,trip_id,trip_reference,trip_snapshot,text,status,request_key)
          values($1,$2,$3,$4,$4,'{}','Synthetic invitation','accepted',$5)`,
            [invitation, groups[0], groups[1], ids[n], randomUUID()],
          );
          await db.query(
            'insert into public.conversations(id,invitation_id,sender_group_id,recipient_group_id) values($1,$2,$3,$4)',
            [chat, invitation, groups[0], groups[1]],
          );
          await db.query(
            'insert into public.chat_messages(conversation_id,sender_group_id,text,request_key) values($1,$2,$3,$4)',
            [chat, groups[1], 'Synthetic message ' + n, randomUUID()],
          );
        }
        await asUser(db, users[0]);
        let cursor = null;
        const found = [];
        do {
          const page = await rpc('get_my_mailbox_page', [
            'conversations',
            cursor?.at ?? null,
            cursor?.id ?? null,
            5,
          ]);
          assert.ok(page.conversations.length <= 5);
          assert.equal(page.invitations.length, page.conversations.length);
          found.push(...page.conversations.map((row) => row.id));
          cursor = page.pages.conversations.has_more
            ? page.pages.conversations.cursor
            : null;
        } while (cursor);
        assert.equal(found.length, 23);
        assert.equal(new Set(found).size, 23);
        const states = await rpc('get_my_mailbox_states', [conversations, []]);
        assert.equal(states.conversations.length, 23);
        assert.equal(
          states.conversations.reduce((n, row) => n + row.unread_count, 0),
          23,
        );
        assert.equal((await rpc('get_my_sync_state')).unread_messages, 23);
        const detail = await rpc('get_my_mailbox_page', [
          'all',
          null,
          null,
          5,
          conversations[22],
        ]);
        assert.deepEqual(
          detail.conversations.map((c) => c.id),
          [conversations[22]],
        );
        const stranger = randomUUID();
        await db.exec('reset role');
        await db.query('insert into auth.users values($1)', [stranger]);
        await asUser(db, stranger);
        await rpc('save_my_profile', [profile('Obca ekipa')]);
        assert.deepEqual(
          (await rpc('get_my_mailbox_states', [conversations, []]))
            .conversations,
          [],
        );
        assert.deepEqual(
          (
            await rpc('get_my_mailbox_page', [
              'all',
              null,
              null,
              5,
              conversations[22],
            ])
          ).conversations,
          [],
        );
        await asUser(db, users[0]);
      },
    );
    await t.test(
      'cached public rows are reauthorized after hiding a profile, trip or blocking a pair',
      async () => {
        await asUser(db, users[1]);
        assert.equal(
          (await rpc('refresh_public_trip_results', [ids.slice(0, 5), {}]))
            .length,
          5,
        );
        assert.equal(
          (await rpc('refresh_public_group_results', [[groups[0]], {}])).length,
          1,
        );
        await db.exec('reset role');
        await db.query(
          'insert into moderation_private.hidden_trips(trip_id) values($1)',
          [ids[0]],
        );
        await asUser(db, users[1]);
        assert.equal(
          (await rpc('refresh_public_trip_results', [[ids[0]], {}])).length,
          0,
        );
        await rpc('set_group_block', [groups[0], true]);
        assert.equal(
          (await rpc('refresh_public_trip_results', [ids.slice(0, 5), {}]))
            .length,
          0,
        );
        assert.equal(
          (await rpc('refresh_public_group_results', [[groups[0]], {}])).length,
          0,
        );
        await rpc('set_group_block', [groups[0], false]);
        await asUser(db, users[0]);
      },
    );
    await t.test(
      'trip contact counts are complete, owner-only and exclude blocked peers',
      async () => {
        await asUser(db, users[1]);
        const invitation = await rpc('send_contact_invitation', [
          ids[1],
          'Poznajmy się na wyjeździe.',
          randomUUID(),
        ]);
        await assert.rejects(
          rpc('get_my_trip_contact_counts', [ids[1]]),
          (e) => e.code === '42501',
        );
        await asUser(db, users[0]);
        assert.deepEqual(await rpc('get_my_trip_contact_counts', [ids[1]]), {
          contacts: 0,
          pending: 1,
        });
        await rpc('respond_contact_invitation', [invitation, 'accepted']);
        assert.deepEqual(await rpc('get_my_trip_contact_counts', [ids[1]]), {
          contacts: 1,
          pending: 0,
        });
        await rpc('set_group_block', [groups[1], true]);
        assert.deepEqual(await rpc('get_my_trip_contact_counts', [ids[1]]), {
          contacts: 0,
          pending: 0,
        });
        await rpc('set_group_block', [groups[1], false]);
      },
    );
    await t.test(
      'a suspended JWT cannot execute any new definer read',
      async () => {
        await db.exec('reset role');
        await db.query(
          'insert into moderation_private.suspended_accounts(user_id) values($1)',
          [users[0]],
        );
        await asUser(db, users[0]);
        for (const name of [
          'get_my_sync_state',
          'list_my_trip_page',
          'get_my_mailbox_page',
        ])
          await assert.rejects(rpc(name), (e) => e.code === '42501');
        assert.equal(await rpc('get_my_trip', [ids[0]]), null);
      },
    );
    await t.test(
      'anonymous users have no read RPCs and the duplicate index is gone',
      async () => {
        await db.exec('reset role;set role anon');
        for (const name of [
          'get_my_sync_state',
          'list_my_trip_page',
          'get_my_mailbox_page',
        ])
          await assert.rejects(rpc(name), (e) => e.code === '42501');
        await db.exec('reset role');
        assert.equal(
          (
            await db.query(
              "select to_regclass('public.trip_discovery_recent') is null value",
            )
          ).rows[0].value,
          true,
        );
      },
    );
  } finally {
    await db.close();
  }
});
