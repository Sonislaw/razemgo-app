import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { testDatabase, asUser } from './support/database.mjs';

const uuid = (value) => createHash('md5').update(value).digest('hex')
  .replace(/^(........)(....)(....)(....)(............)$/, '$1-$2-$3-$4-$5');
const user = uuid('synthetic-user-1'), group = uuid('synthetic-group-1');

test('optimized discovery retains complete legacy pages, scores, reasons and cursors', async (t) => {
  const db = await testDatabase();
  const call = async (schema, name, args) => (await db.query(
    `select ${schema}.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) value`, args,
  )).rows[0].value;
  try {
    // Keep the actual previous implementation as an independent oracle. The
    // reference schema exists only inside this disposable test database.
    await db.exec('create schema reference; grant usage on schema reference to authenticated');
    for (const [file, name] of [
      ['202610280006_score_batches.sql', 'search_public_trips'],
      ['202610280001_technical_reads.sql', 'list_ranked_public_groups'],
    ]) {
      const source = await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8');
      const start = source.indexOf('create or replace function public.' + name + '(');
      const end = source.indexOf('end $$;', start) + 'end $$;'.length;
      assert.ok(start >= 0 && end > start);
      await db.exec(source.slice(start, end).replace('function public.' + name, 'function reference.' + name));
    }
    let fixture = await readFile(new URL('./performance-fixture.sql', import.meta.url), 'utf8');
    fixture = fixture.replace('generate_series(1,200) n;', 'generate_series(1,40) n;')
      .replaceAll('10000', '40').replaceAll('500000', '2000')
      .replaceAll('50000', '200').replaceAll('20000', '80');
    await db.exec(fixture);
    await db.exec(`
      with variations as (select id,row_number() over(order by id)::int n from public.travel_groups)
      update public.travel_groups g set
        name=case when v.n%2=0 then 'Łąka ' else 'Laka ' end||lpad((v.n%9)::text,2,'0'),
        kind=(array['family','couple','solo','friends'])[1+v.n%4],
        child_count=case when v.n%4=0 then 0 else 2 end,
        child_age_bands=case when v.n%4=0 then '{}'::text[] else array[(array['0–3','4–6','7–9','10–12','13–17'])[1+v.n%5]] end,
        travel_mode=(array['Przyczepa','Kamper','Namiot','Van','Samochód'])[1+v.n%5],
        interests=case when v.n%4=0 then '{}'::text[] else array['Rowery',(array['Plaża','Ognisko','Przyroda'])[1+v.n%3]] end,
        animal_kinds=case when v.n%3=0 then array['dog','cat'] when v.n%3=1 then array['cat'] else '{}'::text[] end
      from variations v where v.id=g.id;
      update public.group_preferences p set
        group_kinds=case when g.child_count=0 then '{}'::text[] else array['family','friends'] end,
        child_age_bands=case when g.child_count=0 then '{}'::text[] else array['4–6','10–12'] end
      from public.travel_groups g where g.id=p.group_id;
      alter table public.trip_plans disable trigger user;
      with variations as (select id,row_number() over(order by id)::int n from public.trip_plans)
      update public.trip_plans p set
        mode=case when v.n%2=0 then 'planned' else 'flexible' end,
        campground_name=case when v.n%2=0 then 'Kemping testowy' else '' end,
        start_date='2099-05-20'::date+v.n%7,end_date='2099-05-22'::date+v.n%7+v.n%5,
        location_id=case when v.n%3=0 then 'legacy:place' when v.n%3=1 then 'pl-locality:4259' else 'pl-locality:other' end,
        location_name=case when v.n%4=0 then 'Gdańsk' else 'Chłapowo' end,
        location_region=case when v.n%3=0 then 'Pomorskie' when v.n%3=1 then 'pomorskie' else 'Pomorze' end,
        interests=case when v.n%4=0 then '{}'::text[] else array['Las',(array['Rowery','Ognisko','Kajaki','Fotografia'])[1+v.n%4]] end,
        matching_group_kinds=case when v.n%3=0 then array['couple'] when v.n%3=1 then array['family','friends'] else '{}'::text[] end,
        matching_child_age_bands=case when v.n%3=0 then array['0–3','7–9'] else '{}'::text[] end,
        animal_kinds=case when v.n%3=0 then array['dog','cat'] when v.n%3=1 then array['cat'] else '{}'::text[] end
      from variations v where v.id=p.id;
      update public.trip_plans set status='paused' where id=md5('synthetic-trip-10')::uuid;
      update public.trip_plans set status='draft',visibility='private' where id=md5('synthetic-trip-11')::uuid;
      alter table public.trip_plans enable trigger user;
      update public.group_public_profiles set discoverable=false where group_id=md5('synthetic-group-4')::uuid;
      insert into public.group_blocks(blocker_group_id,blocked_group_id) values(md5('synthetic-group-1')::uuid,md5('synthetic-group-2')::uuid);
      insert into favorites_private.trip_favorites(owner_group_id,target_trip_id)
        values(md5('synthetic-group-1')::uuid,md5('synthetic-trip-35')::uuid);
      insert into favorites_private.group_favorites(owner_group_id,target_group_id)
        values(md5('synthetic-group-1')::uuid,md5('synthetic-group-7')::uuid);
    `);
    await asUser(db, user);

    async function compare(name, filters, sort, { all = false, size = 5 } = {}) {
      let cursor = null, count = 0;
      const ids = [];
      do {
        const args = [filters, sort, cursor, size];
        const expected = await call('reference', name, args);
        const actual = await call('public', name, args);
        assert.deepEqual(actual, expected, `${name}/${sort}/${JSON.stringify(filters)} page ${count}`);
        ids.push(...actual.items.map((item) => item.trip?.id ?? item.crew.id));
        cursor = actual.has_more ? actual.cursor : null;
        count++;
        assert.ok(count <= 50, 'pagination must finish');
        if (!cursor && all) assert.equal(ids.length, actual.total_count);
      } while (cursor && (all || count < 2));
      assert.equal(new Set(ids).size, ids.length);
    }

    await t.test('trip ranking and default order walk the full result set and cross score/date/id ties', async () => {
      for (const sort of ['default', 'compatibility']) {
        await compare('search_public_trips', {}, sort, { all: true });
        for (const size of [1, 20]) await compare('search_public_trips', {}, sort, { size });
      }
    });
    await t.test('trip filters preserve weights, legacy tags, source selection and date tolerance', async () => {
      const filters = [
        { group_kinds: ['family', 'friends'], child_age_bands: ['4–6', '7–9'] },
        { start_date: '2099-05-21', end_date: '2099-05-26', tolerance_days: 2 },
        { trip_modes: ['flexible'], landscapes: ['coast', 'lake'], animal_kinds: ['cat'] },
        { source_trip_id: uuid('synthetic-trip-3') },
        { source_trip_id: uuid('synthetic-trip-35'), location_query: 'Chłapowo' },
        { favorites_only: true },
      ];
      for (const filter of filters) for (const sort of ['default', 'compatibility'])
        await compare('search_public_trips', filter, sort);
    });
    await t.test('group order, private-preference score and filters match complete legacy cards', async () => {
      const filters = [{}, { name: 'Łąka' }, { name: '#100006' }, { group_kinds: ['family'], child_age_bands: ['4–6'] },
        { travel_modes: ['Przyczepa', 'Kamper'], interests: ['Rowery'], animal_kinds: ['cat'] },
        { favorites_only: true }, { online_only: true }, { has_trips: true }];
      for (const filter of filters) for (const sort of ['alphabetical', 'compatibility'])
        await compare('list_ranked_public_groups', filter, sort, { all: Object.keys(filter).length === 0 });
    });
    await t.test('a viewer without an active plan keeps profile-only matching and explicit-date matching', async () => {
      await db.exec('reset role; alter table public.trip_plans disable trigger user');
      await db.query("update public.trip_plans set status='paused' where group_id=$1", [group]);
      await db.exec('alter table public.trip_plans enable trigger user');
      await asUser(db, user);
      for (const filter of [{}, { start_date: '2099-05-21', end_date: '2099-05-24', tolerance_days: 7 }])
        for (const sort of ['default', 'compatibility']) await compare('search_public_trips', filter, sort);
    });
    await t.test('every constrained tag has a distinct bit; intersections equal the original array count', async () => {
      await db.exec('reset role');
      const domains = await db.query(`select distinct
          case when c.conname like '%interests%' then 'interest' when c.conname like '%animal_kinds%' then 'animal' else 'age' end family,
          match[1] tag
        from pg_constraint c cross join lateral regexp_matches(pg_get_constraintdef(c.oid),'''([^'']+)''::text','g') match
        where c.conrelid in('public.trip_plans'::regclass,'public.travel_groups'::regclass,'public.group_preferences'::regclass)
          and (c.conname like '%interests%' or c.conname like '%animal_kinds%' or c.conname like '%child_age_bands%')`);
      assert.ok(domains.rows.length >= 18);
      for (const family of ['interest', 'age', 'animal']) {
        const tags = domains.rows.filter((row) => row.family === family).map((row) => row.tag);
        const bits = [];
        for (const tag of tags) {
          const { rows } = await db.query('select discovery_private.tag_mask($1,$2) mask', [[tag], family]);
          const mask = rows[0].mask;
          assert.ok(mask > 0 && (mask & (mask - 1)) === 0, 'unmapped or overlapping domain tag: ' + tag);
          bits.push(mask);
        }
        assert.equal(new Set(bits).size, tags.length);
        for (let n = 0; n < 30; n++) {
          const wanted = tags.filter((_, i) => (n + i) % 3 !== 0), actual = tags.filter((_, i) => (n * 3 + i) % 4 !== 0);
          const { rows } = await db.query(`select bit_count((discovery_private.tag_mask($1,$3) & discovery_private.tag_mask($2,$3))::bit(32))::int actual,
            (select count(*)::int from unnest($1::text[]) x where x=any($2)) expected`, [wanted, actual, family]);
          assert.equal(rows[0].actual, rows[0].expected);
        }
      }
      await asUser(db, user);
      await assert.rejects(db.query("select discovery_private.tag_mask('{}','interest')"), (error) => error.code === '42501');
    });
  } finally { await db.close(); }
});
