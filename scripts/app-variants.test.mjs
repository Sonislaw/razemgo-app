import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { variants, getAppVariant, assertBackendIsolation, PREVIEW_PROJECT_REF } from '../config/app-variants.cjs';
import { authRedirectUrl, parseAuthCallback } from '../src/features/auth/auth-data.ts';

const require = createRequire(import.meta.url);

test('Dev installs alongside the existing Preview APK and has its own OAuth callback', () => {
  assert.equal(variants.preview.package, 'pl.razemgo.app.dev');
  assert.equal(variants.preview.scheme, 'razemgo');
  assert.notEqual(variants.development.package, variants.preview.package);
  assert.notEqual(variants.development.scheme, variants.preview.scheme);
  assert.notEqual(variants.development.firebaseFile, variants.preview.firebaseFile);
  const dev = authRedirectUrl(variants.development.scheme);
  const preview = authRedirectUrl(variants.preview.scheme);
  assert.equal(dev, 'razemgo-dev://auth/callback');
  assert.equal(authRedirectUrl(variants.development.scheme, undefined, true), dev + '?flow=recovery');
  assert.equal(authRedirectUrl(variants.development.scheme, 'https://dev.example'), 'https://dev.example/auth/callback');
  assert.throws(() => parseAuthCallback(preview + '?code=private', dev));
  assert.throws(() => parseAuthCallback(dev + '?code=private', preview));
  assert.equal(parseAuthCallback(dev + '?code=correct', dev).code, 'correct');
});

test('local development and EAS cannot silently select different app variants', () => {
  assert.equal(getAppVariant({}), 'development');
  assert.equal(getAppVariant({ EAS_BUILD_PROFILE: 'preview' }), 'preview');
  assert.equal(getAppVariant({ APP_VARIANT: 'preview' }), 'preview');
  assert.throws(() => getAppVariant({ APP_VARIANT: 'development', EAS_BUILD_PROFILE: 'preview' }));
  assert.throws(() => getAppVariant({ APP_VARIANT: 'unknown' }));
});

test('Dev is blocked from Preview; Preview is blocked from any other backend', () => {
  const preview = `https://${PREVIEW_PROJECT_REF}.supabase.co`;
  assert.doesNotThrow(() => assertBackendIsolation('preview', preview));
  assert.throws(() => assertBackendIsolation('development', preview));
  assert.throws(() => assertBackendIsolation('development', `  ${preview.toUpperCase()}/  `));
  assert.throws(() => assertBackendIsolation('preview', 'https://different.supabase.co'));
  assert.doesNotThrow(() => assertBackendIsolation('development', 'https://different.supabase.co'));
  assert.doesNotThrow(() => assertBackendIsolation('development', 'http://192.168.1.10:54321'));
  assert.doesNotThrow(() => assertBackendIsolation('development', '')); // Unconfigured welcome screen.
  assert.throws(() => assertBackendIsolation('development', 'malformed'));
});

test('the actual Dev build rejects missing backend config, server keys and Preview Firebase', () => {
  const directory = mkdtempSync(join(tmpdir(), 'razemgo-variants-'));
  const file = join(directory, 'firebase.json');
  const previous = { ...process.env };
  const config = { extra: { eas: { projectId: '00000000-0000-4000-8000-000000000001' } } };
  try {
    process.env = { ...previous, APP_VARIANT: 'development', EAS_BUILD_PROFILE: 'development', EAS_BUILD: 'true',
      EXPO_PUBLIC_SUPABASE_URL: '', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '', GOOGLE_SERVICES_JSON: file };
    const resolveConfig = require('../app.config.js');
    assert.throws(() => resolveConfig({ config }), /separate Dev Supabase/);
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://new-development.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_secret_must_never_be_bundled';
    assert.throws(() => resolveConfig({ config }), /public key/);
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_' + 'a'.repeat(25);
    writeFileSync(file, JSON.stringify({ client: [{ client_info: { android_client_info: { package_name: variants.preview.package } } }] }));
    assert.throws(() => resolveConfig({ config }), /own Firebase/);
    writeFileSync(file, JSON.stringify({ client: [{ client_info: { android_client_info: { package_name: variants.development.package } } }] }));
    const dev = resolveConfig({ config });
    assert.equal(dev.android.package, variants.development.package);
    assert.equal(dev.name, 'RazemGo Dev');
    assert.equal(dev.extra.authScheme, variants.development.scheme);
    assert.equal(dev.extra.eas.projectId, config.extra.eas.projectId);
  } finally {
    process.env = previous;
    const target = resolve(directory);
    // Verify the resolved temporary target before recursive removal on Windows.
    assert.ok(target.startsWith(resolve(tmpdir()) + sep) && target.split(sep).at(-1).startsWith('razemgo-variants-'));
    rmSync(target, { recursive: true, force: true });
  }
});
