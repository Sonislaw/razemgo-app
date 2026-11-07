import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { asUser, profile, testDatabase, trip } from './support/database.mjs';

test('discovery map: full filtered counts, bounded clusters, exact pages and authorization', async (t) => {
  const db = await testDatabase(),
    users = [randomUUID(), randomUUID(), randomUUID()],
    groups = [];
  const bounds = { south: 48, north: 56, west: 13, east: 25 };
  const root = () => db.exec('reset role'),
    as = (i) => asUser(db, users[i]);
  let scoped = false;
  const query = async (sql, args = []) => {
    if (scoped) await db.exec('savepoint map_test');
    try {
      const result = await db.query(sql, args);
      if (scoped) await db.exec('release savepoint map_test');
      return result;
    } catch (e) {
      if (scoped)
        await db.exec(
          'rollback to savepoint map_test;release savepoint map_test',
        );
      throw e;
    }
  };
  const rpc = async (name, args = []) =>
    (
      await query(
        `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) value`,
        args,
      )
    ).rows[0].value;
  const map = async (filters = {}, viewport = bounds, zoom = 5) => {
    await as(0);
    return rpc('search_trip_map', [
      JSON.stringify(filters),
      JSON.stringify(viewport),
      zoom,
    ]);
  };
  const items = async (
    key,
    filters = {},
    cursor = null,
    viewport = bounds,
    zoom = 5,
  ) => {
    await as(0);
    return rpc('get_trip_map_items', [
      JSON.stringify(filters),
      JSON.stringify(viewport),
      zoom,
      key,
      cursor ? JSON.stringify(cursor) : null,
      5,
    ]);
  };
  const publish = async (patch = {}, owner = 1) => {
    await as(owner);
    return rpc('save_my_trip', [
      JSON.stringify({ ...trip, ...patch }),
      null,
      false,
      randomUUID(),
    ]);
  };
  const scenario = async (name, fn) =>
    t.test(name, async () => {
      await root();
      await db.exec('begin');
      scoped = true;
      try {
        await fn();
      } finally {
        scoped = false;
        await db.exec('rollback');
        await root();
      }
    });
  try {
    await query('insert into auth.users values($1),($2),($3)', users);
    for (let i = 0; i < 3; i++) {
      await as(i);
      groups.push(
        (await rpc('save_my_profile', [JSON.stringify(profile('Mapa ' + i))]))
          .group.id,
      );
    }
    const published = [];
    for (let i = 0; i < 13; i++)
      published.push(
        await publish({
          landscape: i === 0 ? 'lake' : 'coast',
          animal_kinds: i === 0 ? ['dog'] : [],
        }),
      );
    const flexible = await publish({
      mode: 'flexible',
      location_id: 'country:PL',
      location_name: 'Polska',
      location_kind: 'country',
      location_region: '',
      campground_name: '',
    });
    await scenario(
      'the map includes all matching publications and groups co-located trips independently of the five-card list',
      async () => {
        const page = await map();
        assert.equal(page.planned_count, 13);
        assert.equal(page.flexible_count, 0);
        assert.equal(page.total_count, 13);
        assert.equal(page.points.length, 1);
        assert.equal(page.points[0].count, 13);
        assert.equal(page.points[0].travel_mode, null);
        assert.deepEqual(page.areas, []);
        assert.equal(
          page.points.reduce((n, p) => n + p.count, 0),
          13,
        );
        const list = await rpc('search_public_trips_v3', [
          JSON.stringify({ trip_modes: ['planned'] }),
          null,
          5,
        ]);
        assert.equal(list.items.length, 5);
        assert.equal(list.total_count, page.total_count);
      },
    );
    await scenario(
      'single markers follow all five crew transport modes rather than the trip transport',
      async () => {
        for (const mode of ['Kamper', 'Van', 'Przyczepa', 'Samochód', 'Namiot']) {
          await as(1);
          await rpc('save_my_profile', [JSON.stringify({ ...profile('Mapa 1'), travel_mode: mode })]);
          const page = await map({ landscapes: ['lake'] });
          assert.equal(page.points.length, 1);
          assert.equal(page.points[0].count, 1);
          assert.equal(page.points[0].travel_mode, mode);
          assert.equal(published[0].travel_mode, 'Kamper');
          assert.equal((await map()).points[0].travel_mode, null);
        }
      },
    );
    await scenario(
      'a cluster opens all its trips through account-bound, filter-bound cursor pages',
      async () => {
        const page = await map();
        const key = page.points[0].key;
        let after = null,
          ids = [];
        do {
          const data = await items(key, {}, after);
          assert.equal(data.total_count, 13);
          assert.ok(data.items.length <= 5);
          for (const row of data.items) {
            ids.push(row.trip.id);
            assert.equal(row.map_area.radius_m, 0);
          }
          if (!data.has_more) break;
          after = data.cursor;
        } while (true);
        assert.equal(new Set(ids).size, 13);
        assert.equal(ids.length, 13);
        const first = await items(key);
        await assert.rejects(
          items(key, { landscapes: ['lake'] }, first.cursor),
          (e) => e.code === '22023',
        );
        await assert.rejects(
          items('areas', {}, first.cursor),
          (e) => e.code === '22023',
        );
        await as(2);
        await assert.rejects(
          rpc('get_trip_map_items', [
            '{}',
            JSON.stringify(bounds),
            5,
            key,
            JSON.stringify(first.cursor),
            5,
          ]),
          (e) => e.code === '22023',
        );
      },
    );
    await scenario(
      'filters use the same server predicate as discovery, including children of the trip and favorites',
      async () => {
        for (const filter of [
          { landscapes: ['lake'] },
          { animal_kinds: ['dog'] },
          { group_kinds: ['family'] },
          { child_age_bands: ['4–6'] },
          {
            start_date: '2099-05-25',
            end_date: '2099-05-27',
            tolerance_days: 2,
          },
          { location_query: 'Chłapowo' },
          { trip_modes: ['flexible'] },
          { favorites_only: true },
        ]) {
          const page = await map(filter);
          const list = await rpc('search_public_trips_v3', [
            JSON.stringify({ ...filter, trip_modes: ['planned'] }),
            null,
            5,
          ]);
          assert.equal(page.total_count, list.total_count);
        }
        await as(0);
        await rpc('set_my_trip_favorite', [published[0].id, true]);
        assert.equal((await map({ favorites_only: true })).total_count, 1);
        const one = await map({ landscapes: ['lake'] });
        const row = (await items(one.points[0].key, { landscapes: ['lake'] }))
          .items[0];
        assert.equal(row.trip.id, published[0].id);
      },
    );
    await scenario(
      'viewport search changes geographic scope without overriding explicit location filters',
      async () => {
        const empty = { south: 49, north: 50, west: 22, east: 23 };
        const page = await map({}, empty);
        assert.equal(page.planned_count, 0);
        assert.equal(page.flexible_count, 0);
        const location = {
          id: 'pl-locality:4259',
          kind: 'village',
          name: 'Chłapowo',
          region: 'pomorskie',
          country: 'Polska',
        };
        const filtered = await map({ location }, empty);
        assert.equal(filtered.planned_count, 0);
        assert.equal(filtered.flexible_count, 0);
        const abroad = await map(
          {},
          { south: 44, north: 47, west: 13, east: 17 },
        );
        assert.equal(abroad.flexible_count, 0);
      },
    );
    await scenario(
      'the map cannot expose flexible publications through filters, IDs or the retired area selector',
      async () => {
        for (const filter of [
          { trip_modes: ['flexible'] },
          { trip_modes: ['planned', 'flexible'] },
          {},
        ]) {
          const page = await map(filter);
          assert.equal(page.planned_count, 13);
          assert.equal(page.total_count, 13);
          assert.equal(page.flexible_count, 0);
          assert.deepEqual(page.areas, []);
          assert.equal(
            (await items('trip:' + flexible.id, filter)).total_count,
            0,
          );
          assert.equal((await items('areas', filter)).total_count, 0);
        }
        const list = await rpc('search_public_trips_v3', [
          JSON.stringify({ trip_modes: ['flexible'] }),
          null,
          5,
        ]);
        assert.equal(list.total_count, 1);
        assert.equal(list.items[0].trip.mode, 'flexible');
        await assert.rejects(items('a:4:5'), (e) => e.code === '22023');
      },
    );
    await scenario(
      'unmapped legacy locations remain counted and do not acquire invented coordinates',
      async () => {
        await root();
        await query(
          "delete from discovery_private.map_locations where id='pl-locality:4259'",
        );
        const page = await map();
        assert.equal(page.unmapped_count, 13);
        assert.equal(page.planned_count, 0);
        assert.equal(page.total_count, 13);
        const list = await rpc('search_public_trips_v3', [
          JSON.stringify({ trip_modes: ['planned'] }),
          null,
          5,
        ]);
        assert.equal(list.total_count, 13);
      },
    );
    await scenario(
      'own, private, hidden, blocked and suspended trips never leak through markers or selections',
      async () => {
        await publish({}, 0);
        await publish({ visibility: 'private' }, 2);
        const hidden = await publish({}, 2);
        await root();
        await query(
          'insert into moderation_private.hidden_trips(trip_id) values($1)',
          [hidden.id],
        );
        assert.equal((await map()).total_count, 13);
        assert.equal((await items('trip:' + hidden.id)).items.length, 0);
        await as(0);
        await rpc('set_group_block', [groups[1], true]);
        const blocked = await map();
        assert.equal(blocked.total_count, 0);
        assert.deepEqual(blocked.areas, []);
        assert.equal((await items('trip:' + published[0].id)).items.length, 0);
        await as(0);
        await rpc('set_group_block', [groups[1], false]);
        await root();
        await query(
          'insert into moderation_private.suspended_accounts(user_id) values($1)',
          [users[1]],
        );
        assert.equal((await map()).total_count, 0);
      },
    );
    await scenario(
      'world-sized high-zoom requests have bounded clusters and retain every matching point',
      async () => {
        const locations = (
          await query(
            'select id,latitude,longitude from discovery_private.map_locations where id like $1 limit 150',
            ['pl-locality:%'],
          )
        ).rows;
        for (const location of locations) {
          await publish({
            location_id: location.id,
            location_name: 'Miejscowość',
            location_region: '',
            location_kind: 'village',
          });
          await publish({
            mode: 'flexible',
            location_id: location.id,
            location_name: 'Obszar',
            location_region: '',
            location_kind: 'village',
          });
        }
        const page = await map(
          {},
          { south: -85, north: 85, west: -180, east: 180 },
          18,
        );
        assert.ok(page.points.length <= 289);
        assert.deepEqual(page.areas, []);
        assert.equal(page.flexible_count, 0);
        assert.equal(
          page.points.reduce((sum, p) => sum + p.count, 0),
          163,
        );
      },
    );
    await scenario(
      'malformed bounds, zoom, cursors and selections are rejected',
      async () => {
        for (const invalid of [
          null,
          {},
          { ...bounds, south: 57 },
          { ...bounds, west: 200 },
          { ...bounds, east: '25' },
          { ...bounds, north: 90 },
        ])
          await assert.rejects(map({}, invalid), (e) => e.code === '22023');
        for (const zoom of [null, 1, 19])
          await assert.rejects(
            map({}, bounds, zoom),
            (e) => e.code === '22023',
          );
        for (const key of ['../../settings', 'p:NaN:3', 'trip:invalid', null])
          await assert.rejects(items(key), (e) => e.code === '22023');
      },
    );
    await scenario(
      'guests, expired sessions and direct access to geographic helpers are denied',
      async () => {
        await as(0);
        await assert.rejects(
          query('select * from discovery_private.map_locations'),
        );
        await assert.rejects(
          query('select discovery_private.map_bounds($1)', [
            JSON.stringify(bounds),
          ]),
        );
        await root();
        await db.exec('set role anon');
        await assert.rejects(rpc('search_trip_map'));
        await assert.rejects(rpc('get_trip_map_items'));
        await root();
        await query(
          "update auth.sessions set not_after=now()-interval '1 second' where user_id=$1",
          [users[0]],
        );
        await assert.rejects(map(), (e) => e.code === '42501');
      },
    );
  } finally {
    await db.close();
  }
});
