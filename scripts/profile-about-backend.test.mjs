import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { asUser, profile, testDatabase } from './support/database.mjs';

test('crew descriptions save atomically with always-available profiles', async (t) => {
  const db = await testDatabase();
  const users = [randomUUID(), randomUUID()];
  const call = async (name, args = []) => (await db.query(
    `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) value`, args,
  )).rows[0].value;
  const save = (value) => call('save_my_profile', [JSON.stringify(value)]);
  const visibility = () => call('get_my_group_visibility');
  try {
    await db.query('insert into auth.users values($1),($2)', users);
    await asUser(db, users[0]);
    const original = await save(profile('Moja ekipa'));
    await call('save_my_group_visibility', [false, 'Dotychczasowy opis.']);

    await t.test('editing profile identity and description preserves availability and ownership', async () => {
      const saved = await save({ ...profile('Nowa nazwa'), about: '  Góry i spokojne podróże.  ', owner_user_id: users[1], id: users[1] });
      assert.equal(saved.group.id, original.group.id);
      assert.equal(saved.group.owner_user_id, users[0]);
      assert.equal(saved.group.name, 'Nowa nazwa');
      assert.equal(saved.about, 'Góry i spokojne podróże.');
      assert.deepEqual(await visibility(), { discoverable: true, about: saved.about });
    });

    await t.test('legacy profile saves omit the description without erasing it', async () => {
      const saved = await save(profile('Inna nazwa'));
      assert.equal(saved.about, 'Góry i spokojne podróże.');
      assert.equal((await visibility()).discoverable, true);
    });

    await t.test('a rejected description rolls back the entire profile save', async () => {
      const before = await visibility();
      await assert.rejects(save({ ...profile('Nie zapisuj'), about: 'x'.repeat(601) }), error => error.code === '22023');
      assert.equal((await db.query('select name from public.travel_groups')).rows[0].name, 'Inna nazwa');
      assert.deepEqual(await visibility(), before);
      for (const about of [null, 123, {}, []])
        await assert.rejects(save({ ...profile('Nie zapisuj'), about }), error => error.code === '22023');
      assert.equal((await db.query('select name from public.travel_groups')).rows[0].name, 'Inna nazwa');
    });

    await t.test('legacy hide requests preserve the current description and cannot hide a crew', async () => {
      const about = 'ą'.repeat(600);
      await save({ ...profile('Moja ekipa'), about });
      assert.deepEqual(await call('save_my_group_visibility', [true, null]), { discoverable: true, about });
      await call('save_my_group_visibility', [false, null]);
      await save({ ...profile('Moja ekipa'), about: 'Opis po ukryciu.' });
      assert.deepEqual(await visibility(), { discoverable: true, about: 'Opis po ukryciu.' });
      await save({ ...profile('Moja ekipa'), about: '  ' });
      assert.deepEqual(await visibility(), { discoverable: true, about: '' });
      await assert.rejects(call('save_my_group_visibility', [null, null]), error => error.code === '22023');
    });

    await t.test('legacy combined writes and descriptions on new profiles remain supported', async () => {
      assert.deepEqual(await call('save_my_group_visibility', [true, 'Starszy klient.']), { discoverable: true, about: 'Starszy klient.' });
      await asUser(db, users[1]);
      const other = await save({ ...profile('Druga ekipa'), about: 'Opis drugiej ekipy.' });
      assert.equal(other.about, 'Opis drugiej ekipy.');
      assert.deepEqual(await visibility(), { discoverable: true, about: other.about });
      assert.deepEqual((await db.query('select group_id from public.group_public_profiles')).rows, [{ group_id: other.group.id }]);
      await asUser(db, users[0]);
      assert.deepEqual(await visibility(), { discoverable: true, about: 'Starszy klient.' });
    });

    await t.test('anonymous callers cannot save profiles or public profile settings', async () => {
      await db.exec('reset role; set role anon');
      await assert.rejects(save({ ...profile('Anonimowa ekipa'), about: 'Opis.' }), error => error.code === '42501');
      await assert.rejects(call('save_my_group_visibility', [true, null]), error => error.code === '42501');
    });
  } finally {
    await db.close();
  }
});
