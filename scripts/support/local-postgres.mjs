import { spawnSync } from 'node:child_process';

export function localPostgres(config, source) {
  const url = new URL(config.DB_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    throw Error('Disposable loopback database required');
  try {
    const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
      input: source, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
      timeout: 180000, windowsHide: true,
      env: { ...process.env, PGHOST: url.hostname.replaceAll(/[\[\]]/g, ''),
        PGPORT: url.port, PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
        PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) },
    });
    if (result.status !== 0) throw Error('Local SQL command failed');
    return { stdout: result.stdout.trim(), stderr: result.stderr };
  } catch {
    throw Error('Local benchmark SQL failed; connection details and SQL output omitted');
  }
}
