import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const files = [
  ...new Set(
    execFileSync(
      'git',
      ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      { encoding: 'utf8' },
    )
      .split('\0')
      .filter(Boolean),
  ),
];
const failures = [];
const textFiles = files.filter(
  (file) =>
    /\.(?:[cm]?[jt]sx?|json|ya?ml|toml|sql|md|local|env|txt)$/.test(file) &&
    existsSync(file),
);
for (const file of textFiles) {
  const source = readFileSync(file, 'utf8');
  const secret =
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source) ||
    /\bsb_secret_[a-zA-Z0-9_-]{20,}/.test(
      source
        .replaceAll('sb_secret_must_never_be_bundled', '')
        .replaceAll('sb_secret_private-server-credential', ''),
    ) ||
    /"private_key"\s*:\s*"[^"\n]{40,}/.test(source);
  if (secret) failures.push(file + ': private key material');
  for (const match of source.matchAll(
    /eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]{20,}/g,
  )) {
    try {
      if (
        JSON.parse(Buffer.from(match[1], 'base64url')).role === 'service_role'
      )
        failures.push(file + ': service role JWT');
    } catch {
      /* Not a token. */
    }
  }
  if (
    /(?:SENTRY_AUTH_TOKEN|SUPABASE_ACCESS_TOKEN|PUSH_DISPATCH_SECRET)\s*[=:]\s*["']?(?:sntrys_|sbp_)[A-Za-z0-9_-]{20,}/.test(
      source,
    )
  )
    failures.push(file + ': administrative token');
  if (/^\.env(?:\.|$)/.test(file) && !/\.example$/.test(file))
    failures.push(file + ': environment file must stay untracked');
}

// Check runtime imports, including literal require/dynamic import. Type-only
// edges are ignored; generated/schema and infrastructure cannot depend on UI.
const modules = textFiles.filter((file) => /^src\/.+\.[jt]sx?$/.test(file));
const paths = new Map(modules.map((file) => [resolve(file), file]));
const graph = new Map();
for (const file of modules) {
  const source = readFileSync(file, 'utf8')
    .replace(/import\s+type\s+[^;]+;/g, '')
    .replace(/export\s+type\s+[^;]+;/g, '')
    .replace(/\bimport\(['"][^'"]+['"]\)\./g, 'type.');
  const imports = [
    ...source.matchAll(
      /(?:import\s+(?:[^;'"\n]*?\s+from\s*)?|export\s+[^;]*?\s+from\s*|(?:require|import)\s*\(\s*)['"]([^'"]+)['"]/g,
    ),
  ].map((match) => match[1]);
  const dependencies = [];
  for (const path of imports) {
    const base = path.startsWith('@/')
      ? resolve('src', path.slice(2))
      : path.startsWith('.')
        ? resolve(dirname(file), path)
        : null;
    if (!base) continue;
    const target = [
      base,
      ...['.ts', '.tsx', '.js', '/index.ts', '/index.tsx'].map(
        (ext) => base + ext,
      ),
    ]
      .map((path) => paths.get(path))
      .find(Boolean);
    if (!target) continue;
    dependencies.push(target);
    if (
      /^src\/(?:lib|data\/contracts|types)\//.test(file) &&
      /^src\/(?:app|components|hooks|features)\//.test(target)
    )
      failures.push(file + ': infrastructure imports runtime UI: ' + target);
  }
  graph.set(file, dependencies);
}
const visiting = new Set(),
  visited = new Set();
function visit(file) {
  if (visiting.has(file)) {
    failures.push('Runtime dependency cycle: ' + file);
    return;
  }
  if (visited.has(file)) return;
  visiting.add(file);
  for (const next of graph.get(file) ?? []) visit(next);
  visiting.delete(file);
  visited.add(file);
}
for (const file of modules) visit(file);
if (failures.length) {
  console.error([...new Set(failures)].join('\n'));
  process.exitCode = 1;
} else
  console.log(
    'Source boundaries, runtime cycles and tracked secret checks passed.',
  );
