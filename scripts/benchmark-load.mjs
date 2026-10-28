import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { availableParallelism, cpus, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { localBackend, localToken, localRpc } from './local-backend-check.mjs';
import { localPostgres } from './support/local-postgres.mjs';
import { meetsTargets, safeErrorCode, summarizeSamples, validReadResult } from './load-results.mjs';

const config = localBackend();
const sql = (source) => localPostgres(config, source).stdout;

const seedStarted = performance.now();
if (process.argv.includes('--seed'))
  sql(await readFile(new URL('./performance-fixture.sql', import.meta.url), 'utf8'));
const fixture = JSON.parse(sql(`select jsonb_build_object(
  'profiles',(select count(*) from public.travel_groups),
  'trips',(select count(*) from public.trip_plans),
  'messages',(select count(*) from public.chat_messages),
  'sessions',(select count(*) from auth.sessions),
  'pushDevices',(select count(*) from public.push_devices),
  'pushEvents',(select count(*) from push_private.events),
  'proposalJobs',(select count(*) from notifications_private.proposal_jobs));`));
if (fixture.profiles !== 10000 || fixture.trips !== 50000 ||
    fixture.messages !== 500000 || fixture.sessions !== 200 ||
    fixture.pushDevices !== 0 || fixture.pushEvents !== 0 || fixture.proposalJobs !== 0)
  throw Error('Expected disposable synthetic fixture with no outbound jobs');

const databaseSettings = JSON.parse(sql(`select jsonb_build_object(
  'version',current_setting('server_version'),
  'maxConnections',current_setting('max_connections'),
  'sharedBuffers',current_setting('shared_buffers'),
  'workMem',current_setting('work_mem'),
  'authenticatedStatementTimeout',(select split_part(setting,'=',2) from pg_roles r,
    lateral unnest(r.rolconfig) setting where r.rolname='authenticated' and setting like 'statement_timeout=%'));`));
function restSettings() {
  try {
    const names = execFileSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const name = names.split('\n').find((value) => /^supabase_rest_[a-zA-Z0-9_-]+$/.test(value));
    if (!name) return null;
    const [container] = JSON.parse(execFileSync('docker', ['inspect', name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    const allowed = ['PGRST_DB_POOL', 'PGRST_DB_POOL_ACQUISITION_TIMEOUT', 'PGRST_DB_MAX_ROWS'];
    const explicitSettings = {};
    for (const line of container.Config.Env ?? []) {
      const separator = line.indexOf('='), key = line.slice(0, separator), value = line.slice(separator + 1);
      if (allowed.includes(key) && /^[\d.]+(?:ms|s)?$/.test(value)) explicitSettings[key] = value;
    }
    return { image: container.Config.Image, explicitSettings };
  } catch { return null; }
}
const uuid = (text) => createHash('md5').update(text).digest('hex')
  .replace(/^(........)(....)(....)(....)(............)$/, '$1-$2-$3-$4-$5');
const tokens = Array.from({ length: 200 }, (_, i) => localToken(
  config, uuid('synthetic-user-' + (i + 1)), uuid('synthetic-session-' + (i + 1)),
));
const queries = [
  { id: 'summary', rpc: 'get_my_sync_state', args: {}, kind: 'summary', ranking: false },
  { id: 'trips', rpc: 'search_public_trips', args: { page_size: 5 }, kind: 'trips', ranking: false },
  { id: 'groups', rpc: 'list_ranked_public_groups', args: { sort_mode: 'alphabetical', page_size: 5 }, kind: 'groups', ranking: false },
  { id: 'mailbox', rpc: 'get_my_mailbox_page', args: {}, kind: 'mailbox', ranking: false },
  { id: 'tripRanking', rpc: 'search_public_trips', args: { sort_mode: 'compatibility', page_size: 5 }, kind: 'trips', ranking: true },
  { id: 'groupRanking', rpc: 'list_ranked_public_groups', args: { sort_mode: 'compatibility', page_size: 5 }, kind: 'groups', ranking: true },
];
const report = {
  schemaVersion: 2,
  engine: 'Disposable local Supabase HTTP; synthetic read burst, not sustained app sessions',
  startedAt: new Date().toISOString(),
  fixture,
  seedAndVerificationMs: Math.round(performance.now() - seedStarted),
  environment: {
    commit: process.env.GITHUB_SHA ?? null, node: process.version,
    cpuModel: cpus()[0]?.model ?? null, logicalCpus: cpus().length,
    availableCpus: availableParallelism(), memoryBytes: totalmem(),
    database: databaseSettings, postgrest: restSettings(),
  },
  protocol: { requestTimeoutMs: 30000, requestsPerSession: queries.length,
    roundsPerBurst: 1, thinkTimeMs: 0, retries: 0,
    targets: { pageP95Ms: 800, rankingP95Ms: 1500, errorRateBelow: 0.01 },
    control: 'Three sequential samples per endpoint, outside the concurrent stages; not a p95 capacity claim',
  },
  controls: [], runs: [], complete: false,
};
await mkdir('.expo', { recursive: true });
const save = () => writeFile('.expo/hardening-http-load.json', JSON.stringify(report, null, 2) + '\n');
await save();

async function read(token, query) {
  const started = performance.now();
  let bytes = 0, status = 0;
  try {
    const response = await localRpc(config, token, query.rpc, query.args);
    status = response.status;
    const body = await response.arrayBuffer();
    bytes = body.byteLength;
    let value;
    try { value = JSON.parse(new TextDecoder().decode(body)); }
    catch { return { ok: false, status, bytes, ms: performance.now() - started, code: 'INVALID_JSON' }; }
    const ok = response.ok && validReadResult(query.kind, value);
    return { ok, status, bytes, ms: performance.now() - started,
      code: ok ? null : response.ok ? 'INVALID_CONTRACT' : safeErrorCode(value?.code) };
  } catch (error) {
    return { ok: false, status, bytes, ms: performance.now() - started,
      code: error?.name === 'TimeoutError' ? 'CLIENT_TIMEOUT' : 'TRANSPORT_ERROR' };
  }
}

// Prevent leftover timed-out server work from silently contaminating the next
// level. This observes only a count, never queries, claims or connection data.
async function settle() {
  const started = performance.now();
  while (Number(sql("select count(*) from pg_stat_activity where usename='authenticator' and state='active' and pid<>pg_backend_pid();")) > 0) {
    if (performance.now() - started > 45000) throw Error('Local HTTP work did not settle between load stages');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
for (const query of queries) {
  const samples = [];
  for (let round = 0; round < 3; round++) samples.push(await read(tokens[0], query));
  await settle();
  const row = { id: query.id, ranking: query.ranking, metrics: summarizeSamples(samples) };
  report.controls.push(row);
  await save();
  console.log(JSON.stringify({ phase: 'control', ...row }));
}
for (const sessions of [10, 50, 100, 200]) {
  const started = performance.now(), samples = new Map(queries.map((q) => [q.id, []]));
  await Promise.all(tokens.slice(0, sessions).map(async (token) => {
    for (const query of queries) samples.get(query.id).push(await read(token, query));
  }));
  const operations = queries.map((q) => ({ id: q.id, ranking: q.ranking, metrics: summarizeSamples(samples.get(q.id)) }));
  const row = { sessions, durationMs: Math.round(performance.now() - started),
    metrics: summarizeSamples([...samples.values()].flat()), operations, targetsMet: meetsTargets(operations) };
  report.runs.push(row);
  await save();
  console.log(JSON.stringify({ phase: 'burst', ...row }));
  await settle();
}
report.complete = true;
report.completedAt = new Date().toISOString();
report.targetsMet = report.runs.every((row) => row.targetsMet);
await save();
if (process.argv.includes('--strict') && !report.targetsMet) process.exitCode = 1;
