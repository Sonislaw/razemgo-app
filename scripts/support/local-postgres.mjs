import { spawnSync } from 'node:child_process';

export function localPostgres(config, source, { profile = false, timeout = 180000 } = {}) {
  const url = new URL(config.DB_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    throw Error('Disposable loopback database required');
  try {
    // Supabase's postgres login is intentionally not a superuser. Only the
    // disposable container's socket admin can load auto_explain. Never used
    // for application traffic, migrations or a hosted connection.
    const command = profile ? 'docker' : 'psql';
    const args = profile
      ? ['exec', '-i', 'supabase_db_razemgo-dev', 'psql', '-U', 'supabase_admin', '-d', 'postgres']
      : [];
    args.push('-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose');
    const result = spawnSync(command, args, {
      input: source, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
      timeout, windowsHide: true,
      env: { ...process.env, PGHOST: url.hostname.replaceAll(/[\[\]]/g, ''),
        PGPORT: url.port, PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
        PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGCONNECT_TIMEOUT: '2' },
    });
    if (result.status !== 0) {
      const code = result.stderr?.match(/ERROR:\s*([0-9A-Z]{5}):/)?.[1];
      throw Error('Local SQL command failed' + (code ? ' (SQLSTATE ' + code + ')' : ''));
    }
    return { stdout: result.stdout.trim(), stderr: result.stderr };
  } catch (error) {
    const code = error.message?.match(/SQLSTATE ([0-9A-Z]{5})/)?.[1];
    throw Error('Local benchmark SQL failed' + (code ? ' (SQLSTATE ' + code + ')' : '') + '; connection details and SQL output omitted');
  }
}
