import test from 'node:test';
import assert from 'node:assert/strict';
import { nestedPlans, sanitizePlan } from './query-plan-report.mjs';
import { localPostgres } from './support/local-postgres.mjs';

test('query plan reports retain nested operator counters and remove SQL and data', () => {
  const plan = sanitizePlan({
    'Node Type': 'Sort', 'Actual Rows': 5, 'Temp Written Blocks': 22,
    'Sort Key': ['private expression'], Output: ['private row'],
    Plans: [{ 'Node Type': 'Seq Scan', 'Relation Name': 'trip_plans', Filter: 'private value', 'Actual Loops': 3 }],
  });
  assert.deepEqual(plan, { 'Node Type': 'Sort', 'Actual Rows': 5, 'Temp Written Blocks': 22,
    Plans: [{ 'Node Type': 'Seq Scan', 'Relation Name': 'trip_plans', 'Actual Loops': 3 }] });
});

test('auto_explain parser handles braces/escaped quotes in discarded SQL without leaking it', () => {
  const log = 'LOG:  duration: 12.5 ms  plan:\n' + JSON.stringify({ 'Query Text': 'select "{private}\\"value"', Plan: { 'Node Type': 'Result', Output: ['private'], 'Actual Rows': 1 } }) +
    '\nCONTEXT: sensitive context\nLOG:  duration: 65 ms  plan:\n' + JSON.stringify({ Plan: { 'Node Type': 'Aggregate' } });
  const parsed = nestedPlans(log);
  assert.deepEqual(parsed, [{ durationMs: 12.5, plan: { 'Node Type': 'Result', 'Actual Rows': 1 } }, { durationMs: 65, plan: { 'Node Type': 'Aggregate' } }]);
  assert.ok(!JSON.stringify(parsed).includes('private'));
});

test('profiling SQL cannot use a hosted database', () => {
  assert.throws(() => localPostgres({ DB_URL: 'postgresql://test:unused@remote.invalid/db' }, 'select 1'), /loopback/);
});
