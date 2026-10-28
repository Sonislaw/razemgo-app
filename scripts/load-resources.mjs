import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { isIP } from 'node:net';
import { localPostgres } from './support/local-postgres.mjs';

const execute = promisify(execFile);
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const knownMetrics = {
  pgrst_db_pool_available: 'available', pgrst_db_pool_waiting: 'waiting',
  pgrst_db_pool_max: 'max', pgrst_db_pool_timeouts_total: 'timeouts',
};
const databaseFields = ['active', 'idle', 'lockWaiters', 'ioWaiters', 'longestActiveMs',
  'commits', 'rollbacks', 'tempBytes', 'blocksRead', 'blocksHit', 'deadlocks'];

export function poolMetrics(text) {
  const result = {};
  for (const line of text.split('\n')) {
    const match = line.match(/^(pgrst_db_pool_[a-z_]+)\s+([\d.eE+-]+)\s*$/);
    if (!match || !knownMetrics[match[1]]) continue;
    const value = number(Number(match[2]));
    if (value !== null) result[knownMetrics[match[1]]] = value;
  }
  return Object.keys(result).length === 4 ? result : null;
}

export function dockerUsage(row) {
  const percent = value => typeof value === 'string' && /^\d+(?:\.\d+)?%$/.test(value) ? Number(value.slice(0, -1)) : null;
  const bytes = value => {
    const match = typeof value === 'string' && value.trim().match(/^(\d+(?:\.\d+)?)\s*(B|kB|MB|GB|TB|KiB|MiB|GiB|TiB)$/);
    if (!match) return null;
    const multipliers = { B: 1, kB: 1000, MB: 1e6, GB: 1e9, TB: 1e12, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, TiB: 1024 ** 4 };
    return Math.round(Number(match[1]) * multipliers[match[2]]);
  };
  const [used, limit] = typeof row.MemUsage === 'string' ? row.MemUsage.split('/') : [];
  return { cpuCorePercent: percent(row.CPUPerc), memoryBytes: bytes(used), memoryLimitBytes: bytes(limit),
    memoryPercent: percent(row.MemPerc), pids: /^\d+$/.test(row.PIDs ?? '') ? Number(row.PIDs) : null };
}

export function databaseMetrics(value) {
  const result = {};
  for (const field of databaseFields) result[field] = number(value?.[field]);
  return Object.values(result).every(value => value !== null) ? result : null;
}

const databaseQuery = `begin read only; set local statement_timeout='1500ms';
select jsonb_build_object(
  'active',count(*) filter(where state='active'),
  'idle',count(*) filter(where state='idle'),
  'lockWaiters',count(*) filter(where state='active' and wait_event_type='Lock'),
  'ioWaiters',count(*) filter(where state='active' and wait_event_type='IO'),
  'longestActiveMs',coalesce(max(extract(epoch from clock_timestamp()-query_start)*1000) filter(where state='active'),0),
  'commits',(select xact_commit from pg_stat_database where datname=current_database()),
  'rollbacks',(select xact_rollback from pg_stat_database where datname=current_database()),
  'tempBytes',(select temp_bytes from pg_stat_database where datname=current_database()),
  'blocksRead',(select blks_read from pg_stat_database where datname=current_database()),
  'blocksHit',(select blks_hit from pg_stat_database where datname=current_database()),
  'deadlocks',(select deadlocks from pg_stat_database where datname=current_database()))
from pg_stat_activity where datname=current_database() and usename='authenticator' and pid<>pg_backend_pid(); rollback;`;

async function docker(args) {
  const { stdout } = await execute('docker', args, { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024, windowsHide: true });
  return stdout;
}

export async function createResourceSampler(config, projectId) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(projectId)) throw Error('Invalid disposable project ID');
  const containers = new Map(['db', 'rest', 'kong', 'auth'].map(name => [
    `supabase_${name}_${projectId}`, ({ db: 'database', rest: 'postgrest', kong: 'gateway', auth: 'auth' })[name],
  ]));
  const settings = { poolMax: null, poolAcquisitionTimeoutSeconds: null, metricsEnabled: false };
  let metricsUrl = null;
  try {
    // --dump-config resolves actual defaults. Raw output includes db-uri and
    // stays in memory; only these three non-secret numeric values are read.
    const text = await docker(['exec', `supabase_rest_${projectId}`, 'postgrest', '--dump-config']);
    const setting = name => {
      const value = text.match(new RegExp('^' + name + '\\s*=\\s*"?(\\d+(?:\\.\\d+)?)"?\\s*$', 'm'));
      return value ? Number(value[1]) : null;
    };
    settings.poolMax = setting('db-pool');
    settings.poolAcquisitionTimeoutSeconds = setting('db-pool-acquisition-timeout');
    const port = setting('admin-server-port');
    if (port && port <= 65535) {
      const [container] = JSON.parse(await docker(['inspect', `supabase_rest_${projectId}`]));
      const ip = Object.values(container.NetworkSettings?.Networks ?? {}).map(network => network.IPAddress).find(
        value => isIP(value) === 4 && /^(?:10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)/.test(value),
      );
      if (ip) { metricsUrl = `http://${ip}:${port}/metrics`; settings.metricsEnabled = true; }
    }
  } catch { /* Unavailable diagnostics are explicit, never a zero or healthy pool. */ }
  return { settings, async sample(elapsedMs) {
    const result = { elapsedMs: Math.round(elapsedMs), database: null, pool: null, containers: {} };
    try { result.database = databaseMetrics(JSON.parse(localPostgres(config, databaseQuery, { timeout: 3000 }).stdout)); }
    catch { /* Snapshot failure is counted below. */ }
    const tasks = [
      (async () => {
        try {
          const text = await docker(['stats', '--no-stream', '--format', 'json', ...containers.keys()]);
          for (const line of text.trim().split('\n')) {
            const row = JSON.parse(line), service = containers.get(row.Name);
            if (service) result.containers[service] = dockerUsage(row);
          }
        } catch { /* No raw Docker error, command, container name or environment in reports. */ }
      })(),
      (async () => {
        if (!metricsUrl) return;
        try {
          const response = await fetch(metricsUrl, { signal: AbortSignal.timeout(2000), redirect: 'error' });
          if (response.ok) result.pool = poolMetrics((await response.text()).slice(0, 262144));
        } catch { /* Optional admin metrics are not enabled by restarting the API. */ }
      })(),
    ];
    await Promise.all(tasks);
    return result;
  } };
}

export function summarizeResources(samples) {
  const max = values => values.length ? Math.max(...values) : null;
  const values = (rows, field) => rows.map(row => row?.[field]).filter(value => number(value) !== null);
  const databases = samples.map(row => row.database).filter(Boolean), pools = samples.map(row => row.pool).filter(Boolean);
  const databaseDeltas = {};
  for (const field of ['commits', 'rollbacks', 'tempBytes', 'blocksRead', 'blocksHit', 'deadlocks']) {
    const numbers = values(databases, field);
    databaseDeltas[field] = numbers.length >= 2 && numbers.every((n, i) => i === 0 || n >= numbers[i - 1]) ? numbers.at(-1) - numbers[0] : null;
  }
  const services = {};
  for (const service of ['database', 'postgrest', 'gateway', 'auth']) {
    const rows = samples.map(row => row.containers?.[service]).filter(Boolean);
    services[service] = { samples: rows.length, peakCpuCorePercent: max(values(rows, 'cpuCorePercent')),
      peakMemoryBytes: max(values(rows, 'memoryBytes')), peakPids: max(values(rows, 'pids')) };
  }
  return { samples: samples.length, databaseSamples: databases.length, poolSamples: pools.length,
    maxSampleGapMs: max(samples.slice(1).map((row, i) => row.elapsedMs - samples[i].elapsedMs)),
    peakActiveConnections: max(values(databases, 'active')), peakLockWaiters: max(values(databases, 'lockWaiters')),
    peakIoWaiters: max(values(databases, 'ioWaiters')), peakPoolWaiting: max(values(pools, 'waiting')),
    poolTimeoutsDelta: pools.length >= 2 && pools.at(-1).timeouts >= pools[0].timeouts ? pools.at(-1).timeouts - pools[0].timeouts : null,
    databaseDeltas, services };
}
