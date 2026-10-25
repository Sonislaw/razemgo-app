import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { assertBackendIsolation } from '../config/app-variants.cjs';

// Each target gets its own CLI workdir, without user data or connection caches.
try {
  const [target, action = 'plan'] = process.argv.slice(2);
  if (!['development', 'preview'].includes(target) || !['link', 'plan', 'migrate', 'deploy'].includes(action)) {
    throw new Error('Use: npm run backend:dev|backend:preview -- plan|migrate|deploy (Dev also supports link)');
  }
  if (target === 'preview' && action === 'link') throw new Error('Główny katalog CLI może być powiązany wyłącznie z Dev.');
  const file = target === 'preview' ? '.env.preview.local' : '.env.local';
  const env = parseEnv(readFileSync(file, 'utf8'));
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error(`Najpierw uzupełnij osobny backend w ${file}.`);
  assertBackendIsolation(target, url);
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)) {
    throw new Error('Podaj adres HTTPS projektu Supabase.');
  }
  const ref = parsed.hostname.match(/^([a-z]{20})\.supabase\.co$/)?.[1];
  if (!ref) throw new Error('Ten skrypt wdraża do hostowanego Supabase. Lokalną instancję uruchom przez supabase start.');
  const workdir = action === 'link' ? resolve('.') : resolve('.expo', 'backend-' + target);
  if (action !== 'link') {
    mkdirSync(join(workdir, 'supabase'), { recursive: true });
    for (const directory of ['migrations', 'functions', 'templates']) {
      cpSync(join('supabase', directory), join(workdir, 'supabase', directory), { recursive: true });
    }
    // Edge Functions import the shared privacy policy outside supabase/.
    cpSync('shared', join(workdir, 'shared'), { recursive: true });
    let config = readFileSync('supabase/config.toml', 'utf8');
    if (target === 'preview') config = config.replaceAll('razemgo-dev://', 'razemgo://');
    writeFileSync(join(workdir, 'supabase/config.toml'), config);
  }
  const npx = process.env.npm_execpath
    ? join(dirname(process.env.npm_execpath), 'npx-cli.js')
    : join(dirname(process.execPath), 'node_modules/npm/bin/npx-cli.js');
  if (!existsSync(npx)) throw new Error('Uruchom polecenie przez npm run backend:dev lub npm run backend:preview.');
  function cli(args) {
    const result = spawnSync(process.execPath, [npx, '--yes', 'supabase@2.122.0', ...args, '--workdir', workdir], {
      stdio: 'inherit', windowsHide: true,
    });
    if (result.status !== 0) throw new Error('Polecenie Supabase nie powiodło się. Wdrożenie przerwane.');
  }
  console.log(`Cel: ${target}; projekt: ${ref}; akcja: ${action}`);
  cli(['link', '--project-ref', ref, '--yes']);
  if (action === 'plan') cli(['db', 'push', '--linked', '--dry-run']);
  if (action === 'migrate') cli(['db', 'push', '--linked', '--yes']);
  if (action === 'deploy') cli(['functions', 'deploy', '--project-ref', ref, '--use-api']);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
