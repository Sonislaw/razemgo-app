import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { monitoringRelease } from '../config/monitoring-release.cjs';

test('release identity includes uncommitted source and variant but excludes secrets', () => {
  const root = mkdtempSync(join(tmpdir(), 'razemgo-release-'));
  try {
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/main.ts'), 'export const value = 1;');
    const release = () => monitoringRelease(root, '1.2.0', 'development');
    const first = release();
    assert.match(first, /^razemgo@1\.2\.0\+development\.[a-f0-9]{12}$/);
    writeFileSync(join(root, '.env.local'), 'TEST_CONFIGURATION=first');
    assert.equal(release(), first);
    writeFileSync(join(root, '.env.local'), 'TEST_CONFIGURATION=changed');
    assert.equal(release(), first);
    assert.notEqual(monitoringRelease(root, '1.2.0', 'preview'), first);
    writeFileSync(join(root, 'src/main.ts'), 'export const value = 2;');
    assert.notEqual(release(), first);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
