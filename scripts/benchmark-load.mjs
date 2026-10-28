import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { localBackend, localToken, localRpc } from './local-backend-check.mjs';

const config = localBackend();
// psql stdin avoids putting any password in command-line output. DB_URL comes
// only from the guarded local CLI status, never from application .env files.
if (process.argv.includes('--seed')) {
  const url = new URL(config.DB_URL);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    throw Error('Local database required');
  execFileSync('psql', [config.DB_URL, '-v', 'ON_ERROR_STOP=1'], {
    input: await readFile(
      new URL('./performance-fixture.sql', import.meta.url),
      'utf8',
    ),
    stdio: ['pipe', 'ignore', 'pipe'],
  });
}
const uuid = (text) =>
  createHash('md5')
    .update(text)
    .digest('hex')
    .replace(/^(........)(....)(....)(....)(............)$/, '$1-$2-$3-$4-$5');
const tokens = Array.from({ length: 200 }, (_, i) =>
  localToken(
    config,
    uuid('synthetic-user-' + (i + 1)),
    uuid('synthetic-session-' + (i + 1)),
  ),
);
const levels = [10, 50, 100, 200],
  runs = [];
const queries = [
  ['get_my_sync_state', {}, false],
  ['search_public_trips', { page_size: 5 }, false],
  [
    'list_ranked_public_groups',
    { sort_mode: 'alphabetical', page_size: 5 },
    false,
  ],
  ['get_my_mailbox_page', {}, false],
  ['search_public_trips', { sort_mode: 'compatibility', page_size: 5 }, true],
  [
    'list_ranked_public_groups',
    { sort_mode: 'compatibility', page_size: 5 },
    true,
  ],
];
for (const concurrency of levels) {
  const timings = [],
    failures = [];
  await Promise.all(
    tokens.slice(0, concurrency).map(async (token, i) => {
      for (const [name, args, ranking] of queries) {
        const started = performance.now();
        try {
          const response = await localRpc(config, token, name, args);
          await response.arrayBuffer();
          timings.push({ name, ms: performance.now() - started, ranking });
          if (!response.ok) failures.push({ name, status: response.status });
        } catch {
          failures.push({ name, status: 0 });
        }
      }
    }),
  );
  const p95 = (ranking) => {
    const values = timings
      .filter((t) => t.ranking === ranking)
      .map((t) => t.ms)
      .sort((a, b) => a - b);
    return Math.round(values[Math.ceil(values.length * 0.95) - 1] ?? 0);
  };
  const row = {
    sessions: concurrency,
    p95PageMs: p95(false),
    p95RankingMs: p95(true),
    unexpectedErrorRate: failures.length / (concurrency * queries.length),
  };
  runs.push(row);
  console.log(JSON.stringify(row));
}
await mkdir('.expo', { recursive: true });
await writeFile(
  '.expo/hardening-http-load.json',
  JSON.stringify(
    {
      engine: 'Local Supabase HTTP, synthetic accounts, no email or push',
      profiles: 10000,
      trips: 50000,
      messages: 500000,
      runs,
    },
    null,
    2,
  ),
);
if (
  process.argv.includes('--strict') &&
  runs.some(
    (row) =>
      row.p95PageMs > 800 ||
      row.p95RankingMs > 1500 ||
      row.unexpectedErrorRate >= 0.01,
  )
)
  process.exitCode = 1;
