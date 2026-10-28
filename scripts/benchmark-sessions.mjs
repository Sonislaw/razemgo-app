import { fork } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { availableParallelism, cpus, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { localBackend } from './local-backend-check.mjs';
import { localPostgres } from './support/local-postgres.mjs';
import { createResourceSampler, summarizeResources } from './load-resources.mjs';
import { sessionDefaults } from './session-load.mjs';

const args = process.argv.slice(2);
if (args.some(arg => !['--seed', '--diverse', '--strict'].includes(arg))) throw Error('Unknown session benchmark argument');
const config = localBackend(); // Resolves CLI's disposable loopback stack only.
const sql = source => localPostgres(config, source).stdout;
if (args.includes('--seed')) sql(await readFile(new URL('./performance-fixture.sql', import.meta.url), 'utf8'));
const fixture = JSON.parse(sql(`select jsonb_build_object(
  'profiles',(select count(*) from public.travel_groups),'trips',(select count(*) from public.trip_plans),
  'messages',(select count(*) from public.chat_messages),'sessions',(select count(*) from auth.sessions),
  'pushDevices',(select count(*) from public.push_devices),'pushEvents',(select count(*) from push_private.events),
  'proposalJobs',(select count(*) from notifications_private.proposal_jobs),
  'distinctLocations',(select count(distinct location_id) from public.trip_plans));`));
if (fixture.profiles !== 10000 || fixture.trips !== 50000 || fixture.messages !== 500000 ||
    fixture.sessions !== 200 || fixture.pushDevices !== 0 || fixture.pushEvents !== 0 || fixture.proposalJobs !== 0 ||
    fixture.distinctLocations !== (args.includes('--diverse') ? 50000 : 1))
  throw Error('Expected complete disposable synthetic fixture without outbound jobs');
const projectId = (await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8')).match(/^project_id\s*=\s*"([\w-]+)"/m)?.[1];
const sampler = await createResourceSampler(config, projectId ?? '');
const output = '.expo/hardening-session-load' + (args.includes('--diverse') ? '-diverse' : '') + '.json';
const report = { schemaVersion: 1, complete: false, startedAt: new Date().toISOString(), fixture,
  engine: 'Disposable local Supabase HTTP; paced synthetic read sessions, not full app or hosted capacity',
  environment: { commit: process.env.GITHUB_SHA ?? null, node: process.version, cpuModel: cpus()[0]?.model ?? null,
    logicalCpus: cpus().length, availableCpus: availableParallelism(), memoryBytes: totalmem(),
    generatorIsolation: 'Separate process on the same shared host; not a separate machine', postgrest: sampler.settings },
  protocol: { ...sessionDefaults, actionWeights: { trips: 0.45, groups: 0.25, mailbox: 0.20, tripRanking: 0.05, groupRanking: 0.05 },
    pageSize: 5, requestTimeoutMs: 30000, retries: 0, resourceIntervalMs: 5000,
    targets: { pageP95Ms: 800, rankingP95Ms: 1500, errorRateBelow: 0.01, missedRateBelow: 0.01,
      schedulingP95Ms: 100, minimumSamplesPerOperation: sessionDefaults.minimumSamples },
    exclusions: ['Realtime', 'chat history', 'writes', 'push', 'real devices', 'WAN latency'],
  }, resources: [] };
await mkdir('.expo', { recursive: true });
let writes = Promise.resolve();
const save = () => { const json = JSON.stringify(report, null, 2) + '\n'; return writes = writes.then(() => writeFile(output, json)); };
await save();
let started = performance.now();
report.resources.push(await sampler.sample(0));
let finished = false, sampling;
const child = fork(new URL('./session-load-worker.mjs', import.meta.url), [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
const stop = () => child.kill();
process.once('SIGINT', stop); process.once('SIGTERM', stop);
const timeout = setTimeout(stop, sessionDefaults.rampMs + sessionDefaults.steadyMs + 60000);
try {
  const result = await new Promise((resolve, reject) => {
    child.on('message', message => {
      if (message.type === 'ready') {
        started = performance.now();
        sampling = (async () => {
          let next = started + 5000;
          while (!finished) {
            await delay(Math.max(0, next - performance.now()));
            if (finished) break;
            report.resources.push(await sampler.sample(performance.now() - started));
            await save();
            next = Math.max(next + 5000, performance.now());
          }
        })();
      } else if (message.type === 'progress') {
        console.log(JSON.stringify({ phase: 'sessions', ...message.progress }));
      } else if (message.type === 'complete') {
        finished = true;
        resolve({ result: message.result, generator: message.generator });
      } else if (message.type === 'failed') reject(Error('Session generator failed; details omitted'));
    });
    child.once('error', () => reject(Error('Session generator unavailable')));
    child.once('exit', () => { if (!finished) reject(Error('Session generator ended before measurement completed')); });
    // Credentials stay in IPC memory, never shell arguments, reports or stdout.
    child.send({ config: { API_URL: config.API_URL, ANON_KEY: config.ANON_KEY, JWT_SECRET: config.JWT_SECRET }, settings: sessionDefaults });
  });
  finished = true;
  await sampling;
  report.resources.push(await sampler.sample(performance.now() - started));
  Object.assign(report, result);
  report.resourceSummary = summarizeResources(report.resources);
  report.complete = true;
  report.completedAt = new Date().toISOString();
  report.targetsMet = result.result.targetsMet;
  report.diagnosticsAvailable = report.resourceSummary.databaseSamples > 1 &&
    report.resourceSummary.services.database.samples > 1 && report.resourceSummary.services.postgrest.samples > 1;
  await save();
  console.log(JSON.stringify({ phase: 'complete', dataset: args.includes('--diverse') ? 'diverse' : 'uniform',
    targetsMet: report.targetsMet, diagnosticsAvailable: report.diagnosticsAvailable,
    operations: result.result.steady.operations, generator: result.generator, resources: report.resourceSummary }));
  if (args.includes('--strict') && (!report.targetsMet || !report.diagnosticsAvailable)) process.exitCode = 1;
} finally {
  finished = true; clearTimeout(timeout); process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  if (child.connected) child.disconnect();
  child.kill();
  await sampling;
  await writes;
}
