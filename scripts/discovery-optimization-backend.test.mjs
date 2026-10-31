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
    await db.exec('create schema reference; create schema previous; grant usage on schema reference,previous to authenticated');
    for (const [file, name, schema] of [
      ['202610280006_score_batches.sql', 'search_public_trips', 'reference'],
      ['202610280001_technical_reads.sql', 'list_ranked_public_groups', 'reference'],
      ['202610280008_discovery_ranking_cost.sql', 'search_public_trips', 'previous'],
      ['202610280008_discovery_ranking_cost.sql', 'list_ranked_public_groups', 'previous'],
    ]) {
      const source = await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8');
      const start = source.indexOf('create or replace function public.' + name + '(');
      const end = source.indexOf('end $$;', start) + 'end $$;'.length;
      assert.ok(start >= 0 && end > start);
      await db.exec(source.slice(start, end).replace('function public.' + name, 'function ' + schema + '.' + name));
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
        if (name !== 'list_ranked_public_groups') assert.deepEqual(actual, await call('previous', name, args),
          `migration 008 parity/${sort}/${JSON.stringify(filters)} page ${count}`);
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
    await t.test('location dictionaries retain ID precedence, normalized regions and source-specific scores', async () => {
      await db.exec(`reset role; alter table public.trip_plans disable trigger user;
        with variations as (select id,row_number() over(order by id)::int n from public.trip_plans)
        update public.trip_plans p set
          location_id=case when v.n%4=0 then 'shared:exact' else 'distinct:'||p.id::text end,
          location_name=(array['Łąka','Laka','Chłapowo','Chlapowo'])[1+v.n%4],
          location_region=(array['',' ','ŁÓDZKIE','lodzkie','POMORSKIE','pomorskie','obcy region'])[1+v.n%7],
          start_date='2099-05-20'::date+v.n%11,end_date='2099-05-22'::date+v.n%11+v.n%7
        from variations v where p.id=v.id;
        alter table public.trip_plans enable trigger user`);
      await asUser(db, user);
      for (const filter of [{}, { source_trip_id: uuid('synthetic-trip-3') },
        { start_date: '2099-05-23', end_date: '2099-05-30', tolerance_days: 7 }])
        await compare('search_public_trips', filter, 'compatibility', { all: true, size: 20 });
    });
    await t.test('more than 64 own plans are considered without truncating a source dictionary', async () => {
      await db.exec(`reset role; begin; alter table public.trip_plans disable trigger user;
        update public.trip_plans set group_id=md5('synthetic-group-1')::uuid,status='published',visibility='public'
          where id in(select id from public.trip_plans order by id limit 80);
        alter table public.trip_plans enable trigger user`);
      try {
        await asUser(db, user);
        await compare('search_public_trips', {}, 'compatibility', { all: true, size: 20 });
      } finally { await db.exec('reset role; rollback'); await asUser(db, user); }
    });
    await t.test('clipping dates preserves long, disjoint and boundary overlaps including shifted searches', async () => {
      await db.exec(`reset role; begin; alter table public.trip_plans disable trigger user;
        with variations as (select id,row_number() over(order by id)::int n from public.trip_plans)
        update public.trip_plans p set
          start_date=case when v.n%3=0 then '2098-01-01'::date when v.n%3=1 then '2100-01-01'::date else '2099-05-01'::date end,
          end_date=case when v.n%3=0 then '2101-01-01'::date when v.n%3=1 then '2100-01-03'::date else '2099-05-02'::date end
        from variations v where v.id=p.id and p.group_id<>md5('synthetic-group-1')::uuid;
        alter table public.trip_plans enable trigger user`);
      try {
        await asUser(db, user);
        for (const filter of [{}, { start_date: '2099-05-03', end_date: '2099-05-07', tolerance_days: 2 },
          { start_date: '2099-05-03', end_date: '2099-05-07', tolerance_days: 7 }])
          await compare('search_public_trips', filter, 'compatibility', { all: true, size: 20 });
      } finally { await db.exec('reset role; rollback'); await asUser(db, user); }
    });
    await t.test('date envelope equals exhaustive shifted overlaps for 4,656 intervals and three source windows', async () => {
      const { rows } = await db.query(`with sources(a,b,tolerance) as(values(0,3,0),(4,6,2),(10,17,7)),
        envelope as(select min(a-tolerance) lo,max(b+tolerance) hi from sources),
        intervals as(select a,b from generate_series(-30,65) a cross join generate_series(-29,66) b where b>a),
        compared as(select
          greatest(0,least(least(e.hi,greatest(e.lo,t.b))-least(e.hi,greatest(e.lo,t.a)),s.b-s.a,
            least(e.hi,greatest(e.lo,t.b))-(s.a-s.tolerance),s.b+s.tolerance-least(e.hi,greatest(e.lo,t.a)))) clipped,
          (select greatest(0,max(least(t.b,s.b+delta)-greatest(t.a,s.a+delta)))
            from generate_series(-s.tolerance,s.tolerance) delta) original
          from intervals t cross join sources s cross join envelope e)
        select count(*)::int checked,count(*) filter(where clipped<>original)::int differences from compared`);
      assert.equal(rows[0].differences, 0);
      assert.equal(rows[0].checked, 13968);
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
    await t.test('score reuse preserves exact pages when every target has a different location key', async () => {
      await db.exec(`reset role; alter table public.trip_plans disable trigger user;
        update public.trip_plans set location_id='unique:'||id::text,location_name='Miejsce '||id::text,
          status=case when group_id=md5('synthetic-group-1')::uuid then 'published' else status end;
        alter table public.trip_plans enable trigger user`);
      await asUser(db, user);
      for (const sort of ['default', 'compatibility']) await compare('search_public_trips', {}, sort, { all: true });
    });
    await t.test('diverse profile inputs and a missing preference row preserve global crew ranking', async () => {
      await db.exec(`reset role;
        with variations as (select id,row_number() over(order by id)::int n from public.travel_groups)
        update public.travel_groups g set adult_count=1+v.n%8,interests=array(
          select tag from unnest(array['Rowery','Plaża','Ognisko','Przyroda','Fotografia','Kajaki'])
            with ordinality x(tag,position) where (v.n & (1<<(position::int-1)))<>0)
        from variations v where v.id=g.id;
        delete from public.group_preferences where group_id=md5('synthetic-group-7')::uuid`);
      await asUser(db, user);
      for (const sort of ['alphabetical', 'compatibility']) await compare('list_ranked_public_groups', {}, sort, { all: true });
    });
    await t.test('numeric crew ranking retains unknown ages, missing preferences and null scores for different viewers', async () => {
      await db.exec(`reset role; begin;
        update public.travel_groups set child_count=1,child_age_bands='{}',interests='{}'
          where id in(select md5('synthetic-group-'||n)::uuid from generate_series(1,20) n);
        update public.group_preferences set group_kinds='{}',child_age_bands='{}'
          where group_id in(select md5('synthetic-group-'||n)::uuid from generate_series(1,10) n)`);
      try {
        for (const viewer of [1, 2, 7, 20]) {
          await asUser(db, uuid('synthetic-user-' + viewer));
          for (const sort of ['alphabetical', 'compatibility'])
            await compare('list_ranked_public_groups', {}, sort, { all: true });
        }
      } finally { await db.exec('reset role; rollback'); await asUser(db, user); }
    });
    await t.test('read RPCs keep their argument-aware plan even on a connection requesting generic plans', async () => {
      await db.exec('set plan_cache_mode=force_generic_plan');
      await compare('search_public_trips', {}, 'compatibility');
      await compare('list_ranked_public_groups', {}, 'compatibility');
      assert.equal((await db.query('show plan_cache_mode')).rows[0].plan_cache_mode, 'force_generic_plan');
      await db.exec('reset role');
      const { rows } = await db.query(`select proconfig from pg_proc where oid in(
        'public.search_public_trips(jsonb,text,jsonb,integer)'::regprocedure,
        'public.list_ranked_public_groups(jsonb,text,jsonb,integer)'::regprocedure)`);
      assert.equal(rows.length, 2);
      assert.ok(rows.every((row) => row.proconfig.includes('plan_cache_mode=force_custom_plan') && row.proconfig.includes('search_path=""')));
      await db.exec('set plan_cache_mode=auto');
      await asUser(db, user);
    });
    await t.test('every constrained tag has a distinct bit; intersections equal the original array count', async () => {
      await db.exec('reset role');
      const nullability = await db.query(`select attnotnull from pg_attribute where
        (attrelid='public.group_blocks'::regclass and attname in('blocker_group_id','blocked_group_id'))
        or (attrelid='moderation_private.suspended_accounts'::regclass and attname='user_id')
        or (attrelid='moderation_private.hidden_trips'::regclass and attname='trip_id')`);
      assert.equal(nullability.rows.length, 4);
      assert.ok(nullability.rows.every((row) => row.attnotnull), 'anti-join keys must remain NOT NULL');
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
