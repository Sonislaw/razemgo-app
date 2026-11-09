import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { testDatabase, asUser, profile, trip } from './support/database.mjs';

test('unranked discovery: stable five-item pages, explicit filters and authorized plain projections without scoring', async t => {
  const db = await testDatabase(), users = [], groups = [], trips = [];
  const rpc = async (name, args = []) => (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) value`, args)).rows[0].value;
  const as = i => asUser(db, users[i]);
  const plain = value => {
    const text = JSON.stringify(value);
    assert.doesNotMatch(text, /"(?:compatibility|recommendation|rank|score|owner_user_id)":/);
  };
  try {
    for (let i = 0; i < 13; i++) {
      await db.exec('reset role');
      users.push(randomUUID());
      await db.query('insert into auth.users values($1)', [users[i]]);
      await as(i);
      groups.push((await rpc('save_my_profile', [profile('Ekipa ' + String(12-i).padStart(2, '0'))])).group.id);
      await rpc('save_my_group_visibility', [true, 'Opis publiczny']);
    }
    await as(0); await rpc('save_my_trip', [trip]);
    await as(1);
    for (let i = 0; i < 8; i++) trips.push(await rpc('save_my_trip', [{ ...trip, interests: i === 0 ? ['Rowery'] : ['Kajaki'], child_count: i ? 0 : 1, child_age_bands: i ? [] : ['4–6'] }]));
    await as(0);

    await t.test('new reads do not call the old context, ranking or recommendation functions', async () => {
      await db.exec('reset role');
      const { rows } = await db.query(`select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as args,pg_get_function_result(p.oid) as result
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
        n.nspname='discovery_private' and p.proname in('matching_context','recommendation_rank','trip_recommendation','group_recommendation')
        or n.nspname='messaging_private' and p.proname in('group_compatibility','group_compatibility_values')`);
      for (const row of rows) await db.exec(`create or replace function ${row.nspname}.${row.proname}(${row.args}) returns ${row.result}
        language plpgsql stable set search_path='' as $$ begin raise exception 'Legacy scoring must not run'; end $$`);
      await as(0);
      plain(await rpc('search_public_trips_v3'));
      plain(await rpc('get_discovery_trip_v3', [trips[0].id]));
      plain(await rpc('refresh_public_trip_results_v3', [[trips[0].id]]));
      plain(await rpc('list_public_groups_v3'));
      plain(await rpc('get_public_group_v3', [groups[1]]));
      plain(await rpc('refresh_public_group_results_v3', [[groups[1]]]));
    });
    await t.test('chronological trip pages and crew listings retain 5+3, with no personalized ordering', async () => {
      await db.exec('reset role');
      const expected = (await db.query('select id from public.trip_plans where group_id=$1 order by published_at desc,id', [groups[1]])).rows.map(row => row.id);
      await as(0);
      const first = await rpc('search_public_trips_v3', [{}, null, 5]);
      const second = await rpc('search_public_trips_v3', [{}, first.cursor, 5]);
      assert.equal(first.items.length, 5); assert.equal(first.total_count, 8); assert.equal(first.cursor.version, 3);
      assert.equal(second.items.length, 3); assert.equal(second.has_more, false);
      assert.deepEqual([...first.items, ...second.items].map(row => row.trip.id), expected);
      const crew = await rpc('get_public_group_v3', [groups[1], null, 5]);
      const next = await rpc('get_public_group_v3', [groups[1], crew.cursor, 5]);
      assert.deepEqual([...crew.trips, ...next.trips].map(row => row.trip.id), expected);
      const oldCursor = { ...first.cursor, version: 2 };
      await assert.rejects(rpc('search_public_trips_v3', [{}, oldCursor]), e => e.code === '22023');
      await assert.rejects(rpc('search_public_trips_v3', [{ child_age_bands: ['4–6'] }, first.cursor]), e => e.code === '22023');
      await as(2); await assert.rejects(rpc('search_public_trips_v3', [{}, first.cursor]), e => e.code === '22023'); await as(0);
    });
    await t.test('trip departure sorting is global, stable across pages, bound to its cursor and sensitive to date edits', async () => {
      await db.exec('reset role');
      const original=(await db.query('select id,start_date,end_date,published_at from public.trip_plans where group_id=$1',[groups[1]])).rows;
      const patch=async restore=>{
        await db.exec('reset role;alter table public.trip_plans disable trigger user');
        try {
          const days=[25,23,28,21,23,28,21,22];
          for(const [i,row] of original.entries()) {
            const start=restore?row.start_date:`2099-05-${days[i]}`;
            const end=restore?row.end_date:`2099-06-02`;
            const published=restore?row.published_at:`2026-11-0${1+i%2}T12:00:00Z`;
            await db.query('update public.trip_plans set start_date=$2,end_date=$3,published_at=$4 where id=$1',[row.id,start,end,published]);
          }
        } finally {await db.exec('alter table public.trip_plans enable trigger user');await as(0);}
      };
      await patch(false);
      try {
        for(const [order,sql] of [['newest','published_at desc,id'],['date_asc','start_date,published_at desc,id'],['date_desc','start_date desc,published_at desc,id']]) {
          await db.exec('reset role');
          const expected=(await db.query(`select id from public.trip_plans where group_id=$1 order by ${sql}`,[groups[1]])).rows.map(row=>row.id);
          await as(0);
          const all=[];let cursor=null;
          do {
            const page=await rpc('search_public_trips_v3',[{sort_order:order},cursor,3]);
            assert.equal(page.total_count,8);assert(page.items.length<=3);plain(page);
            if(order!=='newest') assert.equal(page.cursor.start_date,page.items.at(-1).trip.start_date);
            all.push(...page.items.map(row=>row.trip.id));cursor=page.has_more?page.cursor:null;
          } while(cursor);
          assert.deepEqual(all,expected);assert.equal(new Set(all).size,8);
        }
        const ascending=await rpc('search_public_trips_v3',[{sort_order:'date_asc'},null,3]);
        await assert.rejects(rpc('search_public_trips_v3',[{sort_order:'date_desc'},ascending.cursor,3]),e=>e.code==='22023');
        await assert.rejects(rpc('search_public_trips_v3',[{},ascending.cursor,3]),e=>e.code==='22023');
        for(const start_date of [undefined,'2099-02-30','infinity'])
          await assert.rejects(rpc('search_public_trips_v3',[{sort_order:'date_asc'},{...ascending.cursor,start_date},3]),e=>e.code==='22023');
        for(const sort_order of ['unknown',null,3,{}])
          await assert.rejects(rpc('search_public_trips_v3',[{sort_order},null,3]),e=>e.code==='22023');
        const filtered=await rpc('search_public_trips_v3',[{sort_order:'date_desc',child_age_bands:['4–6']}]);
        assert.deepEqual(filtered.items.map(row=>row.trip.id),[trips[0].id]);
        assert.equal(await rpc('count_public_trips',[{sort_order:'date_desc'}]),8);
        await db.exec('reset role;alter table public.trip_plans disable trigger user');
        await db.query("update public.trip_plans set start_date='2099-05-20' where id=$1",[ascending.items.at(-1).trip.id]);
        await db.exec('alter table public.trip_plans enable trigger user');await as(0);
        const changed=await rpc('search_public_trips_v3',[{sort_order:'date_asc'},null,3]);
        assert.notEqual(changed.result_revision,ascending.result_revision);
        assert.equal(changed.items[0].trip.id,ascending.items.at(-1).trip.id);
      } finally {await patch(true);}
    });
    await t.test('alphabetical directory pages retain 5+5+2 and bind cursors to account and filters', async () => {
      const all = []; let cursor = null;
      do {
        const page = await rpc('list_public_groups_v3', [{}, cursor, 5]);
        assert.ok(page.items.length <= 5); plain(page);
        all.push(...page.items); cursor = page.has_more ? page.cursor : null;
      } while (cursor);
      assert.equal(all.length, 12); assert.equal(new Set(all.map(row => row.crew.id)).size, 12);
      assert.deepEqual(all.map(row => row.crew.name), [...all.map(row => row.crew.name)].sort());
      const first = await rpc('list_public_groups_v3');
      await assert.rejects(rpc('list_public_groups_v3', [{ name: 'Ekipa 11' }, first.cursor]), e => e.code === '22023');
      await as(2); await assert.rejects(rpc('list_public_groups_v3', [{}, first.cursor]), e => e.code === '22023'); await as(0);
    });
    await t.test('filters and bounded refresh remain enforced; legacy hide requests preserve profiles and blocks restrict access', async () => {
      const page = await rpc('search_public_trips_v3', [{ child_age_bands: ['4–6'] }]);
      assert.deepEqual(page.items.map(row => row.trip.id), [trips[0].id]);
      await assert.rejects(rpc('refresh_public_trip_results_v3', [Array(101).fill(trips[0].id)]), e => e.code === '22023');
      await assert.rejects(rpc('list_public_groups_v3', [{ interests: ['not-a-valid-interest'] }]), e => e.code === '22023');
      await as(2); await rpc('save_my_group_visibility', [false, '']); await as(0);
      assert.ok(await rpc('get_public_group_v3', [groups[2]]));
      assert.equal((await rpc('refresh_public_group_results_v3', [[groups[2]]])).length, 1);
      await db.exec('reset role');
      await db.query('insert into public.group_blocks(blocker_group_id,blocked_group_id) values($1,$2)', [groups[0], groups[1]]);
      await as(0);
      assert.equal(await rpc('get_discovery_trip_v3', [trips[0].id]), null);
      assert.equal(await rpc('get_public_group_v3', [groups[1]]), null);
      assert.equal((await rpc('refresh_public_trip_results_v3', [[trips[0].id]])).length, 0);
      assert.equal((await rpc('search_public_trips_v3')).total_count, 0);
      await db.exec('reset role; set role anon');
      for (const [name, args] of [['search_public_trips_v3', []], ['list_public_groups_v3', []], ['get_discovery_trip_v3', [trips[0].id]], ['get_public_group_v3', [groups[1]]]])
        await assert.rejects(rpc(name, args), e => e.code === '42501');
    });
  } finally { await db.close(); }
});

test('the current application contains no matching modules or legacy matching RPC calls', async () => {
  for (const file of ['src/features/discovery/discovery-repository.ts','src/features/groups/group-repository.ts']) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /parseRecommendation|(?:get_public_group|get_discovery_trip|search_public_trips|refresh_public_trip_results|refresh_public_group_results|list_ranked_public_groups)_v2/);
  }
});
