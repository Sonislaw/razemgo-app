import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { asUser, profile, testDatabase } from './support/database.mjs';

test('saved filter sets: private CRUD, canonical snapshots, idempotence, limits and synchronization', async t => {
  const db = await testDatabase();
  const users = [randomUUID(), randomUUID()]; const groups = [];
  const call = async (name, args = []) => (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) value`, args)).rows[0].value;
  const save = (id, kind, name, filters = {}) => call('save_my_filter_set', [id, kind, name, filters === null ? null : JSON.stringify(filters)]);
  const list = () => call('list_my_filter_sets');
  try {
    await db.query('insert into auth.users values($1),($2)', users);
    for (const user of users) { await asUser(db, user); groups.push((await call('save_my_profile', [JSON.stringify(profile('Ekipa ' + groups.length))])).group.id); }
    await asUser(db, users[0]);
    const id = randomUUID();
    const criteria = { trip_modes: ['flexible', 'planned'], landscapes: ['lake'], group_kinds: ['family'], child_age_bands: ['4–6'],
      animal_kinds: ['dog'], favorites_only: true, location_query: ' Mazury ', start_date: '2099-05-01', end_date: '2099-05-05', tolerance_days: 3 };
    let saved;
    await t.test('all trip criteria persist; retries do not duplicate rows or bump revisions', async () => {
      saved = await save(id, 'trips', '  Majówka   nad morzem  ', criteria);
      assert.equal(saved.name, 'Majówka nad morzem'); assert.equal(saved.schema_version, 1); assert.equal(saved.owner_group_id, undefined);
      assert.deepEqual(saved.filters.trip_modes, ['flexible', 'planned']); assert.equal(saved.filters.location_query, 'Mazury');
      assert.equal(saved.filters.tolerance_days, 3); assert.equal(saved.filters.start_date, criteria.start_date);
      const before = (await call('get_my_sync_state')).domains;
      assert.ok(BigInt(before.saved_filters) > 0n);
      assert.deepEqual(await save(id, 'trips', saved.name, criteria), saved);
      assert.equal((await list()).length, 1); assert.deepEqual((await call('get_my_sync_state')).domains, before);
    });
    await t.test('rename, explicit replacement and group-specific criteria are independent', async () => {
      const renamed = await save(id, 'trips', 'Wakacje', null); assert.deepEqual(renamed.filters, saved.filters);
      const replaced = await save(id, 'trips', 'Wakacje', { start_date: '2000-01-01', end_date: '2000-01-05' });
      assert.equal(replaced.filters.start_date, '2000-01-01'); assert.deepEqual(replaced.filters.landscapes, []);
      const crew = await save(randomUUID(), 'groups', 'Wakacje', { name: '#104827', group_kinds: ['family'], child_age_bands: ['7–9'],
        travel_modes: ['Van'], interests: ['Rowery'], animal_kinds: ['cat'], has_trips: true, online_only: true, favorites_only: true });
      assert.equal(crew.filters.name, '#104827'); assert.equal(crew.filters.online_only, true); assert.deepEqual(crew.filters.travel_modes, ['Van']);
      assert.equal((await list()).length, 2);
      await assert.rejects(save(randomUUID(), 'trips', 'wakacje', {}), e => e.code === '23505');
      await save(id, 'trips', 'ŁÓDŹ', null);
      await assert.rejects(save(randomUUID(), 'trips', 'łódź', {}), e => e.code === '23505');
      assert.equal((await save(id, 'trips', '🦊'.repeat(40), null)).name, '🦊'.repeat(40));
      await assert.rejects(save(id, 'trips', '🦊'.repeat(41), null), e => e.code === '22023');
      await save(id, 'trips', 'Wakacje', null);
    });
    await t.test('invalid names, invalid criteria and provenance are rejected without changing saved data', async () => {
      const before = await list();
      for (const name of ['', '  ', 'x'.repeat(41)]) await assert.rejects(save(randomUUID(), 'trips', name), e => e.code === '22023');
      for (const patch of [{ source_trip_id: randomUUID() }, { cursor: {} }, { trip_modes: [] }, { animal_kinds: ['bad'] },
        { child_age_bands: [4] }, { favorites_only: 'true' }, { start_date: '2099-05-01' }, { start_date: '2099-02-31', end_date: '2099-03-03' },
        { tolerance_days: 8 }, { location_query: 'x'.repeat(201) }]) await assert.rejects(save(randomUUID(), 'trips', 'Bad', patch));
      for (const patch of [{ name: 3 }, { has_trips: 'true' }, { travel_modes: ['Campervan'] }, { group_kinds: ['bad'] }, { interests: ['Rowery', 'Rowery'] }])
        await assert.rejects(save(randomUUID(), 'groups', 'Bad', patch));
      assert.deepEqual(await list(), before);
    });
    await t.test('the ten-per-kind limit allows rename, replacement and idempotent retry at capacity', async () => {
      for (let i = 1; i < 10; i++) await save(randomUUID(), 'trips', 'Zestaw ' + i);
      await assert.rejects(save(randomUUID(), 'trips', 'Jedenasty'), e => e.code === '54000');
      await save(id, 'trips', 'Po zmianie', null); await save(id, 'trips', 'Po zmianie', {}); await save(id, 'trips', 'Po zmianie', {});
      assert.equal((await list()).filter(row => row.kind === 'trips').length, 10);
      assert.equal((await list()).filter(row => row.kind === 'groups').length, 1);
    });
    await t.test('other accounts, guests, expired sessions and direct private access cannot bypass ownership', async () => {
      await asUser(db, users[1]); assert.deepEqual(await list(), []);
      await assert.rejects(save(id, 'trips', 'Cudzy', {}), e => e.code === 'P0002');
      await call('delete_my_filter_set', [id]);
      await assert.rejects(db.query('select * from discovery_private.saved_filter_sets'));
      await assert.rejects(db.query('select discovery_private.filter_set_payload($1,$2,$3)', ['trips', '{}', groups[0]]));
      await asUser(db, users[0]); assert.equal((await list()).length, 11);
      await db.exec('reset role'); await db.query("update auth.sessions set not_after=now()-interval '1 second' where user_id=$1", [users[0]]);
      await asUser(db, users[0]); await assert.rejects(list(), e => e.code === '42501');
      await db.exec('reset role'); await db.query('update auth.sessions set not_after=null where user_id=$1', [users[0]]);
      await db.exec('set role anon'); await assert.rejects(list()); await assert.rejects(call('delete_my_filter_set', [id]));
    });
    await t.test('deletion is idempotent, invalidates only saved filters, and deleting an account cascades its sets', async () => {
      await asUser(db, users[0]); const before = (await call('get_my_sync_state')).domains;
      assert.equal(await call('delete_my_filter_set', [id]), true); assert.equal(await call('delete_my_filter_set', [id]), true);
      const after = (await call('get_my_sync_state')).domains;
      assert.equal(BigInt(after.saved_filters), BigInt(before.saved_filters) + 1n);
      for (const key of ['mailbox', 'trips', 'favorites', 'notifications']) assert.equal(after[key], before[key]);
      await db.exec('reset role'); await db.query('delete from auth.users where id=$1', [users[0]]);
      assert.equal((await db.query('select count(*)::int n from discovery_private.saved_filter_sets')).rows[0].n, 0);
    });
  } finally { await db.close(); }
});
