import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { asUser, profile, testDatabase, trip } from './support/database.mjs';

const migration = '202611010003_proposal_criteria.sql';

test('current proposals use dates and destination while preserving delivery, history and access rules', async (t) => {
  const db = await testDatabase({ before: migration });
  const users = [randomUUID(), randomUUID()];
  const groups = [];
  const root = () => db.exec('reset role');
  const as = (index) => asUser(db, users[index]);
  const call = async (name, args = []) => (await db.query(
    `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) value`, args,
  )).rows[0].value;
  const publish = async (index, patch = {}, id = null, draft = false) => {
    await as(index);
    return call('save_my_trip', [JSON.stringify({ ...trip, ...patch }), id, draft, randomUUID()]);
  };
  const run = async () => {
    await root();
    await db.exec('set role service_role');
    return call('process_proposal_notifications', [10]);
  };
  const matches = async (own, proposed) => {
    await root();
    return (await db.query(`select notifications_private.proposal_matches(o,p) value
      from public.trip_plans o cross join public.trip_plans p where o.id=$1 and p.id=$2`, [own, proposed])).rows[0].value;
  };
  const entries = async (proposed) => {
    await root();
    return (await db.query(`select * from public.notifications
      where recipient_group_id=$1 and proposed_trip_id=$2 and kind='proposal'`, [groups[0], proposed])).rows;
  };
  const dueAndClaim = async () => {
    await root();
    await db.exec("update push_private.deliveries set due_at=now()-interval '1 second' where status='pending'; set role service_role");
    return (await db.query('select * from public.claim_push_deliveries(100)')).rows;
  };
  const snapshot = async () => {
    await root();
    const result = {};
    for (const table of ['public.trip_plans', 'public.notifications', 'notifications_private.proposal_seen',
      'notifications_private.proposal_jobs', 'push_private.events', 'push_private.deliveries'])
      result[table] = (await db.query(`select to_jsonb(t) value from ${table} t order by to_jsonb(t)::text`)).rows;
    return result;
  };
  const scenario = async (name, action) => t.test(name, async () => {
    await root();
    await db.exec('begin');
    try { await action(); } finally { await db.exec('rollback'); await root(); }
  });
  try {
    await db.query('insert into auth.users values($1),($2)', users);
    for (let index = 0; index < users.length; index++) {
      await as(index);
      const data = index === 0 ? profile('Pierwsza ekipa') : {
        ...profile('Druga ekipa'), kind: 'couple', child_count: 0, child_age_bands: [],
      };
      groups.push((await call('save_my_profile', [JSON.stringify(data)])).group.id);
    }
    await as(0);
    await call('register_my_push_device', [randomUUID(), randomUUID(),
      'ExponentPushToken[' + randomUUID().replaceAll('-', '') + ']', 'android', 'b7305e7b-7e1c-4b12-9123-caa0587f49b0']);
    const own = await publish(0);
    const previous = await publish(1, { child_count: 0, child_age_bands: [] });
    await run();
    const oldEntry = (await entries(previous.id))[0];
    assert.ok(oldEntry);
    await publish(0, { matching_group_kinds: ['solo'], matching_child_age_bands: ['13–17'] }, own.id);
    assert.equal(await matches(own.id, previous.id), false, 'the previous rule still excludes this historical pair');
    const before = await snapshot();
    await db.exec(await readFile(new URL('../supabase/migrations/' + migration, import.meta.url), 'utf8'));

    await t.test('upgrading preserves saved trips, history, deduplication, pending work and delivery state', async () => {
      assert.deepEqual(await snapshot(), before);
      assert.equal(await matches(own.id, previous.id), true);
      await root();
      assert.equal((await db.query(`select notifications_private.proposal_available(n) value
        from public.notifications n where n.id=$1`, [oldEntry.id])).rows[0].value, true);
    });

    await scenario('legacy preferences and different crew demographics do not exclude new matching trips', async () => {
      const proposed = await publish(1, {
        child_count: 0, child_age_bands: [], travel_mode: 'Namiot', interests: ['Kajaki'], animal_kinds: ['dog'],
        matching_group_kinds: ['friends'], matching_child_age_bands: ['0–3'],
      });
      assert.equal(await matches(own.id, proposed.id), true);
      assert.equal(await matches(proposed.id, own.id), true);
      assert.equal((await run()).created, 1);
      assert.equal((await entries(proposed.id)).length, 1);
      assert.equal((await run()).created, 0);
      await publish(1, { description: 'Inny opis wyjazdu z tym samym terminem i kierunkiem.' }, proposed.id);
      await run();
      assert.equal((await entries(proposed.id)).length, 1);
      assert.equal((await entries(previous.id)).length, 1, 'old proposals are never replayed');
    });

    await scenario('changing crew kind or child ages no longer enqueues proposal work', async () => {
      await root();
      await db.exec('delete from notifications_private.proposal_jobs');
      await as(1);
      await call('save_my_profile', [JSON.stringify({ ...profile('Druga po zmianie'), child_count: 2, child_age_bands: ['7–9'] })]);
      await root();
      assert.equal((await db.query('select count(*)::integer n from notifications_private.proposal_jobs')).rows[0].n, 0);
      assert.equal(await matches(own.id, previous.id), true);
    });

    for (const [name, patch, draft] of [
      ['disjoint dates', { start_date: '2099-06-01', end_date: '2099-06-05' }, false],
      ['touching arrival/departure dates', { start_date: trip.end_date, end_date: '2099-05-27' }, false],
      ['a different region', { location_id: 'other-place', location_name: 'Zakopane', location_region: 'małopolskie' }, false],
      ['a private trip', { visibility: 'private' }, false],
      ['a draft', {}, true],
    ]) await scenario(`${name} still prevent a proposal`, async () => {
      const proposed = await publish(1, patch, null, draft);
      assert.equal(await matches(own.id, proposed.id), false);
      await run();
      assert.equal((await entries(proposed.id)).length, 0);
    });

    await scenario('the Poland-wide area still matches another region without mixing different countries', async () => {
      await publish(0, { mode: 'flexible', location_id: 'country:PL', location_name: 'Polska', location_kind: 'country', location_region: '' }, own.id);
      const proposed = await publish(1, { location_id: 'legacy-place', location_name: 'Zakopane', location_region: 'małopolskie' });
      for (const region of ['dolnośląskie', 'kujawsko-pomorskie', 'lubelskie', 'lubuskie', 'łódzkie', 'małopolskie',
        'mazowieckie', 'opolskie', 'podkarpackie', 'podlaskie', 'pomorskie', 'śląskie', 'świętokrzyskie',
        'warmińsko-mazurskie', 'wielkopolskie', 'zachodniopomorskie']) {
        await publish(1, { location_id: 'legacy-place', location_region: region }, proposed.id);
        assert.equal(await matches(own.id, proposed.id), true, region);
      }
      await publish(0, { mode: 'flexible', location_id: 'country:SI', location_name: 'Słowenia', location_kind: 'country', location_region: '' }, own.id);
      assert.equal(await matches(own.id, proposed.id), false);
    });

    for (const restriction of ['paused', 'completed', 'blocked-by-owner', 'blocked-by-other', 'suspended-owner', 'suspended-other', 'hidden-own', 'hidden-proposed'])
      await scenario(`${restriction} still prevents generation and delivery`, async () => {
        const proposed = await publish(1);
        assert.equal(await matches(own.id, proposed.id), true);
        if (['paused', 'completed'].includes(restriction)) {
          await as(1); await call('change_my_trip_status', [proposed.id, restriction]);
        } else if (restriction.startsWith('blocked')) {
          const blocker = restriction === 'blocked-by-owner' ? 0 : 1;
          await as(blocker); await call('set_group_block', [groups[1 - blocker], true]);
        } else {
          await root();
          if (restriction.startsWith('suspended'))
            await db.query('insert into moderation_private.suspended_accounts(user_id) values($1)', [users[restriction === 'suspended-owner' ? 0 : 1]]);
          else await db.query('insert into moderation_private.hidden_trips(trip_id) values($1)', [restriction === 'hidden-own' ? own.id : proposed.id]);
        }
        assert.equal(await matches(own.id, proposed.id), false);
        await run();
        assert.equal((await entries(proposed.id)).length, 0);
      });

    await scenario('new proposals keep one digest, unread selection and deduplication', async () => {
      const first = await publish(1);
      const second = await publish(1);
      await run();
      assert.equal((await entries(first.id)).length, 1);
      assert.equal((await entries(second.id)).length, 1);
      await as(0);
      await call('mark_my_notifications_read', [[oldEntry.id]]);
      const jobs = await dueAndClaim();
      assert.equal(jobs.length, 1);
      assert.equal(jobs[0].kind, 'proposal');
      assert.equal(jobs[0].proposal_count, 2);
      assert.ok([first.id, second.id].includes(jobs[0].trip_id));
      await run();
      assert.equal((await entries(first.id)).length, 1);
    });

    await scenario('push opt-out preserves history and opt-in does not replay old alerts', async () => {
      await as(0); await call('save_my_notification_preference', ['proposals', false]);
      const proposed = await publish(1);
      await run();
      assert.equal((await entries(proposed.id)).length, 1);
      assert.equal((await dueAndClaim()).length, 0);
      await as(0); await call('save_my_notification_preference', ['proposals', true]);
      await run();
      assert.equal((await dueAndClaim()).length, 0);
    });

    for (const role of ['authenticated', 'anon']) await scenario(`${role} cannot invoke the processor or private matcher`, async () => {
      await as(0);
      await db.exec('set role ' + role);
      for (const action of [() => call('process_proposal_notifications', [10]),
        () => db.query('select notifications_private.proposal_matches(o,p) from public.trip_plans o cross join public.trip_plans p')]) {
        await db.exec('savepoint denied');
        try { await assert.rejects(action, error => error.code === '42501'); }
        finally { await db.exec('rollback to denied; release denied'); }
      }
    });
  } finally {
    await db.close();
  }
});
