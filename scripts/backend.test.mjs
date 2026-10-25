import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const profile = {
  name: 'Ekipa A',
  avatar_id: 'trail-fox',
  kind: 'family',
  adult_count: 2,
  child_count: 1,
  child_age_bands: ['4–6'],
  travel_mode: 'Przyczepa',
  interests: ['Rowery'],
  animal_kinds: ['dog'],
  matching: {
    group_kinds: ['family'],
    child_age_bands: ['4–6'],
    description: 'Spokojne wyjazdy.',
  },
};

test('actual PostgreSQL migration enforces ownership, validation, atomic saves and deletion cascade', async (t) => {
  const db = new PGlite();
  try {
    // Minimal Supabase Auth contract. The migration itself runs unchanged.
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, public to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      insert into auth.users values ('${A}'), ('${B}');`);
    await db.exec(
      await readFile(
        new URL(
          '../supabase/migrations/202610230001_profiles.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    await db.exec(await readFile(
      new URL('../supabase/migrations/202610250012_group_name_length.sql', import.meta.url),
      'utf8',
    ));
    async function asUser(id) {
      await db.exec(
        `reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`,
      );
    }
    const save = async (value) =>
      (
        await db.query('select public.save_my_profile($1::jsonb) as profile', [
          JSON.stringify(value),
        ])
      ).rows[0].profile;
    await asUser(A);
    const saved = await save(profile);
    const id = saved.group.id;
    await t.test('20-character names save, longer names fail through RPC and direct writes', async () => {
      const name = 'ą'.repeat(20);
      const updated = await save({ ...profile, name });
      assert.equal(updated.group.name, name);
      assert.equal(updated.group.id, id);
      await assert.rejects(save({ ...profile, name: name + 'a' }), e => e.code === '23514');
      await assert.rejects(
        db.query('update public.travel_groups set name = $1 where id = $2', [name + 'a', id]),
        e => e.code === '23514',
      );
      assert.equal((await db.query('select name from public.travel_groups')).rows[0].name, name);
      await save(profile);
    });
    await t.test(
      'UUID and owner are server controlled; repeat saves update one group',
      async () => {
        assert.equal(saved.group.owner_user_id, A);
        const updated = await save({
          ...profile,
          name: 'Ekipa po edycji',
          owner_user_id: B,
          id: B,
        });
        assert.equal(updated.group.id, id);
        assert.equal(updated.group.owner_user_id, A);
        assert.equal(
          (
            await db.query(
              'select count(*)::int as n from public.travel_groups',
            )
          ).rows[0].n,
          1,
        );
      },
    );
    await t.test(
      'invalid preferences roll back the group edit in the same transaction',
      async () => {
        await assert.rejects(
          save({
            ...profile,
            name: 'Nie zapisuj',
            matching: { ...profile.matching, description: 'x'.repeat(241) },
          }),
        );
        assert.equal(
          (await db.query('select name from public.travel_groups')).rows[0]
            .name,
          'Ekipa po edycji',
        );
      },
    );
    await t.test(
      'database rejects invalid direct writes, bypassing UI validation',
      async () => {
        for (const patch of [
          { name: 'A' },
          { adult_count: 0 },
          { child_count: 0 },
          { child_age_bands: ['4–6', '4–6'] },
          { animal_kinds: ['other'] },
          { travel_mode: 'Motor' },
          { avatar_id: '../image.png' },
          { matching: { group_kinds: ['unknown'] } },
        ])
          await assert.rejects(save({ ...profile, ...patch }));
      },
    );
    await t.test(
      'owner cannot transfer ownership or create a group for another account',
      async () => {
        await assert.rejects(
          db.query(
            'update public.travel_groups set owner_user_id = $1 where id = $2',
            [B, id],
          ),
        );
        await assert.rejects(
          db.query(
            "insert into public.travel_groups(owner_user_id,name,avatar_id,kind,adult_count,child_count,travel_mode) values($1,'Other','trail-fox','solo',1,0,'Van')",
            [B],
          ),
        );
      },
    );
    await asUser(B);
    await t.test(
      'other account cannot read, update, delete or attach preferences to A',
      async () => {
        assert.deepEqual(
          (await db.query('select * from public.travel_groups')).rows,
          [],
        );
        assert.deepEqual(
          (await db.query('select * from public.group_preferences')).rows,
          [],
        );
        assert.deepEqual(
          (
            await db.query(
              "update public.travel_groups set name = 'Hacked' where id = $1 returning id",
              [id],
            )
          ).rows,
          [],
        );
        assert.deepEqual(
          (
            await db.query(
              'delete from public.travel_groups where id = $1 returning id',
              [id],
            )
          ).rows,
          [],
        );
        await assert.rejects(
          db.query(
            'insert into public.group_preferences(group_id) values($1)',
            [id],
          ),
        );
        await save({ ...profile, name: 'Ekipa B' });
        assert.equal(
          (
            await db.query(
              'select count(*)::int as n from public.travel_groups',
            )
          ).rows[0].n,
          1,
        );
      },
    );
    await db.exec('reset role; set role anon;');
    await t.test(
      'anonymous requests cannot read either table or execute the save function',
      async () => {
        await assert.rejects(db.query('select * from public.travel_groups'));
        await assert.rejects(
          db.query('select * from public.group_preferences'),
        );
        await assert.rejects(save(profile));
      },
    );
    await db.exec('reset role;');
    await t.test(
      'removing Auth account cascades to group and private preferences',
      async () => {
        await db.query('delete from auth.users where id = $1', [A]);
        assert.deepEqual(
          (
            await db.query('select * from public.travel_groups where id = $1', [
              id,
            ])
          ).rows,
          [],
        );
        assert.deepEqual(
          (
            await db.query(
              'select * from public.group_preferences where group_id = $1',
              [id],
            )
          ).rows,
          [],
        );
      },
    );
    await asUser(A);
    await t.test(
      'an unexpired JWT of a deleted account cannot recreate its profile',
      async () => {
        assert.deepEqual(
          (await db.query('select * from public.travel_groups')).rows,
          [],
        );
        await assert.rejects(save(profile));
      },
    );
  } finally {
    await db.close();
  }
});
