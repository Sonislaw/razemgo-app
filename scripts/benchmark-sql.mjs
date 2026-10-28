import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { testDatabase, asUser } from './support/database.mjs';

// Embedded PostgreSQL helps compare query plans. It cannot simulate concurrent
// PostgREST sessions or prove hosted capacity; use benchmark:load for that.
const db = await testDatabase();
try {
  const started = performance.now();
  await db.exec(
    await readFile(
      new URL('./performance-fixture.sql', import.meta.url),
      'utf8',
    ),
  );
  const seedMs = Math.round(performance.now() - started);
  const hex = createHash('md5').update('synthetic-user-1').digest('hex');
  await asUser(
    db,
    hex.replace(
      /^(........)(....)(....)(....)(............)$/,
      '$1-$2-$3-$4-$5',
    ),
  );
  const queries = {
    trips: "select public.search_public_trips('{}','default',null,5)",
    tripRanking:
      "select public.search_public_trips('{}','compatibility',null,5)",
    crews:
      "select public.list_ranked_public_groups('{}','alphabetical',null,5)",
    crewRanking:
      "select public.list_ranked_public_groups('{}','compatibility',null,5)",
    summary: 'select public.get_my_sync_state()',
    mailbox: 'select public.get_my_mailbox_page()',
  };
  const results = {};
  for (const [name, sql] of Object.entries(queries)) {
    const times = [];
    let bytes = 0;
    for (let n = 0; n < 3; n++) {
      const start = performance.now(),
        response = await db.query(sql);
      times.push(performance.now() - start);
      bytes = Buffer.byteLength(JSON.stringify(response.rows));
    }
    times.sort((a, b) => a - b);
    results[name] = {
      medianMs: Math.round(times[1]),
      maxMs: Math.round(times[2]),
      responseBytes: bytes,
    };
    console.log(
      name +
        ': median ' +
        results[name].medianMs +
        ' ms, max ' +
        results[name].maxMs +
        ' ms',
    );
  }
  await mkdir('.expo', { recursive: true });
  await writeFile(
    '.expo/hardening-sql-benchmark.json',
    JSON.stringify(
      {
        engine: 'PGlite single session; not an HTTP load test',
        profiles: 10000,
        trips: 50000,
        messages: 500000,
        seedMs,
        results,
      },
      null,
      2,
    ),
  );
} finally {
  await db.close();
}
