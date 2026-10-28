import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { localBackend } from './local-backend-check.mjs';
import { localPostgres } from './support/local-postgres.mjs';
import { nestedPlans, sanitizePlan } from './query-plan-report.mjs';

const config = localBackend();
if (process.argv.includes('--seed')) localPostgres(config,
  await readFile(new URL('./performance-fixture.sql', import.meta.url), 'utf8'));
const uuid = (value) => createHash('md5').update(value).digest('hex')
  .replace(/^(........)(....)(....)(....)(............)$/, '$1-$2-$3-$4-$5');
const claims = JSON.stringify({ sub: uuid('synthetic-user-1'), session_id: uuid('synthetic-session-1'), role: 'authenticated' });
const queries = {
  trips: "public.search_public_trips('{}','default',null,5)",
  tripRanking: "public.search_public_trips('{}','compatibility',null,5)",
  groups: "public.list_ranked_public_groups('{}','alphabetical',null,5)",
  groupRanking: "public.list_ranked_public_groups('{}','compatibility',null,5)",
};
const report = { commit: process.env.GITHUB_SHA ?? null, nestedMinDurationMs: 50,
  timing: false, source: 'Read-only local synthetic SQL; instrumentation overhead applies', operations: [] };
await mkdir('.expo', { recursive: true });
for (const [id, query] of Object.entries(queries)) {
  const result = localPostgres(config, `
    load 'auto_explain';
    set client_min_messages=log;
    set auto_explain.log_min_duration='50ms';
    set auto_explain.log_analyze=on;
    set auto_explain.log_buffers=on;
    set auto_explain.log_nested_statements=on;
    set auto_explain.log_timing=off;
    set auto_explain.log_format=json;
    set auto_explain.log_parameter_max_length=0;
    begin read only;
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
  await writeFile('.expo/hardening-query-plans.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ id, executionMs: outer['Execution Time'], nestedPlans: nested.length }));
}
