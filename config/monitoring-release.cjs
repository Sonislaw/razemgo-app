const { createHash } = require('node:crypto');
const { existsSync, readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

// Configuration/build time only. Never hash .env, credentials or user files.
// Includes uncommitted source changes, unlike a commit SHA alone.
function monitoringRelease(root, version, variant) {
  const hash = createHash('sha256');
  function add(path) {
    if (!existsSync(join(root, path))) return;
    hash.update(path);
    hash.update(readFileSync(join(root, path)));
  }
  function walk(path) {
    for (const entry of readdirSync(join(root, path), {
      withFileTypes: true,
    }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const next = path + '/' + entry.name;
      if (entry.isDirectory()) walk(next);
      else if (entry.isFile()) add(next);
    }
  }
  for (const directory of ['src', 'shared', 'assets'])
    if (existsSync(join(root, directory))) walk(directory);
  for (const file of [
    'app.json',
    'app.config.js',
    'package-lock.json',
    'metro.config.js',
    'config/app-variants.cjs',
  ])
    add(file);
  return (
    'razemgo@' + version + '+' + variant + '.' + hash.digest('hex').slice(0, 12)
  );
}
module.exports = { monitoringRelease };
