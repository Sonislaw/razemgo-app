import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { localBackend } from './local-backend-check.mjs';
import { localPostgres } from './support/local-postgres.mjs';
import { nestedPlans, sanitizePlan } from './query-plan-report.mjs';

const config = localBackend();
if (process.argv.includes('--seed')) localPostgres(config,
  await readFile(new URL('./performance-fixture.sql', import.meta.url), 'utf8'));
const legacy = process.argv.includes('--legacy');
const diverse = process.argv.includes('--diverse') || process.argv.includes('--make-diverse');
if (process.argv.includes('--make-diverse')) {
  const count = Number(localPostgres(config, `select count(*) from public.trip_plans t
    where t.id in(select md5('synthetic-trip-'||n)::uuid from generate_series(1,50000) n);`).stdout);
  if (count !== 50000) throw Error('Complete synthetic fixture required for diversity profiling');
  localPostgres(config, `begin; alter table public.trip_plans disable trigger user;
    update public.trip_plans t set location_id='diverse:'||t.id::text,location_name='Miejsce '||t.id::text
      where t.id in(select md5('synthetic-trip-'||n)::uuid from generate_series(1,50000) n);
    alter table public.trip_plans enable trigger user; commit; analyze public.trip_plans;`);
}
let previousDefinitions = '';
if (legacy) {
  // Only inside each disposable profiling transaction, rolled back afterward.
  // Keep before/after on the same runner, rows, statistics and resource limits.
  for (const [file, name] of [
    ['202610280005_discovery_cost.sql', 'discovery_private.candidates'],
    ['202610280006_score_batches.sql', 'public.search_public_trips'],
    ['202610280001_technical_reads.sql', 'public.list_ranked_public_groups'],
    ['202610250001_group_discovery.sql', 'messaging_private.search_text'],
    ['202610250011_crew_numbers.sql', 'messaging_private.group_search_matches'],
  ]) {
    const source = await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8');
    const marker = source.includes('create or replace function ' + name + '(') ? 'create or replace function ' : 'create function ';
    const start = source.indexOf(marker + name + '('), end = source.indexOf('$$;', start) + 3;
    if (start < 0 || end <= start) throw Error('Previous profiling definition missing');
    previousDefinitions += source.slice(start, end).replace(/^create function /, 'create or replace function ') + '\n';
  }
}
const uuid = (value) => createHash('md5').update(value).digest('hex')
  .replace(/^(........)(....)(....)(....)(............)$/, '$1-$2-$3-$4-$5');
const claims = JSON.stringify({ sub: uuid('synthetic-user-1'), session_id: uuid('synthetic-session-1'), role: 'authenticated' });
const queries = {
  trips: "public.search_public_trips('{}','default',null,5)",
  tripRanking: "public.search_public_trips('{}','compatibility',null,5)",
  groups: "public.list_ranked_public_groups('{}','alphabetical',null,5)",
  groupRanking: "public.list_ranked_public_groups('{}','compatibility',null,5)",
};
const report = { commit: process.env.GITHUB_SHA ?? null, nestedMinDurationMs: 10,
  timing: false, legacy, dataset: diverse ? 'unique locations' : 'uniform fixture',
  source: 'Disposable synthetic SQL; legacy definitions rolled back; instrumentation overhead applies', operations: [] };
const output = '.expo/hardening-query-plans' + (diverse ? '-diverse' : '') + (legacy ? '-legacy' : '') + '.json';
await mkdir('.expo', { recursive: true });
for (const [id, query] of Object.entries(queries)) {
  const result = localPostgres(config, `
    load 'auto_explain';
    set client_min_messages=log;
    set auto_explain.log_min_duration='10ms';
    set auto_explain.log_analyze=on;
    set auto_explain.log_buffers=on;
    set auto_explain.log_nested_statements=on;
    set auto_explain.log_timing=off;
    set auto_explain.log_format=json;
    set auto_explain.log_parameter_max_length=0;
    ${legacy ? 'begin;' : 'begin read only;'}
    ${previousDefinitions}
    set local statement_timeout='60s';
    set local request.jwt.claims='${claims}';
    set local role authenticated;
    explain (analyze,buffers,timing off,format json) select ${query};
    rollback;
  `, { profile: true });
  const [outer] = JSON.parse(result.stdout);
  const nested = nestedPlans(result.stderr);
  report.operations.push({ id, executionMs: outer['Execution Time'],
    planningMs: outer['Planning Time'], outer: sanitizePlan(outer.Plan), nested });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ id, legacy, diverse, executionMs: outer['Execution Time'], nestedPlans: nested.length }));
}
