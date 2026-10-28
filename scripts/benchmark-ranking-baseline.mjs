import { spawnSync } from 'node:child_process';
import { localBackend } from './local-backend-check.mjs';
import { localPostgres } from './support/local-postgres.mjs';
import { rankingDefinition } from './support/ranking-version.mjs';

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--diverse')) throw Error('Only --diverse is supported');
const config = localBackend(); // Loopback only; never a Dev/Preview URL.
try {
  localPostgres(config, await rankingDefinition(true));
  const result = spawnSync(process.execPath,
    ['scripts/benchmark-sessions.mjs', '--baseline', ...args], { stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) throw Error('Baseline measurement did not complete');
} finally {
  localPostgres(config, await rankingDefinition());
}
