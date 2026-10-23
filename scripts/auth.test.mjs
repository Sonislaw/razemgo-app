import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  authErrorMessage,
  normalizeEmail,
  parseAuthCallback,
  validateCredentials,
} from '../src/features/auth/auth-data.ts';
import { createChunkedStorage } from '../src/features/auth/chunked-storage.ts';
import {
  profileFromRows,
  profileToPayload,
} from '../src/features/profile/profile-mapper.ts';
import { createEmptyProfile } from '../src/features/profile/profile-data.ts';

test('registration validates email and password without modifying password whitespace', () => {
  assert.equal(normalizeEmail('  Test@Example.COM '), 'test@example.com');
  assert.deepEqual(validateCredentials('a@example.com', '0123456789'), []);
  assert.ok(validateCredentials('a@example.com', '123456789').length);
  assert.ok(validateCredentials('bad email@example.com').length);
  assert.ok(validateCredentials('a@example.com', 'a'.repeat(129)).length);
});
test('callback accepts PKCE code only at the expected origin, scheme and route', () => {
  assert.deepEqual(
    parseAuthCallback(
      'razemgo://auth/callback?code=abc&flow=recovery',
      'razemgo://auth/callback',
    ),
    { code: 'abc', error: null, flowId: null, recovery: true },
  );
  for (const bad of [
    'other://auth/callback?code=a',
    'razemgo://evil/callback?code=a',
    'https://evil.example/auth/callback?code=a',
    'https://app.example/other?code=a',
  ])
    assert.throws(() =>
      parseAuthCallback(bad, 'https://app.example/auth/callback'),
    );
  assert.equal(
    parseAuthCallback(
      'https://app.example/auth/callback#access_token=untrusted',
      'https://app.example/auth/callback',
    ).code,
    null,
  );
});
test('auth errors expose useful Polish messages without leaking server contents', () => {
  assert.match(
    authErrorMessage({ code: 'invalid_credentials' }),
    /Niepoprawny/,
  );
  assert.match(authErrorMessage({ code: 'otp_expired' }), /wygasł/);
  assert.match(authErrorMessage(new TypeError('Failed to fetch')), /internet/);
  assert.doesNotMatch(
    authErrorMessage({ message: 'secret database diagnostics' }),
    /secret/,
  );
});
function storageFixture() {
  const values = new Map();
  let fail = false;
  const store = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      if (fail) throw new Error('Storage unavailable');
      assert.ok(Buffer.byteLength(value) <= 2048);
      values.set(key, Buffer.from(value).toString('utf8'));
    },
    removeItem: async (key) => {
      values.delete(key);
    },
  };
  return {
    values,
    storage: createChunkedStorage(store),
    setFail: (value) => {
      fail = value;
    },
  };
}
test('encrypted session adapter handles large Unicode Google metadata and cleans replaced chunks', async () => {
  const { values, storage } = storageFixture();
  const session = JSON.stringify({
    metadata: '🚐🌲ąćę'.repeat(4000),
    refresh_token: 'private-token',
  });
  await storage.setItem('session', session);
  assert.equal(await storage.getItem('session'), session);
  await storage.setItem('session', 'new-session');
  assert.equal(await storage.getItem('session'), 'new-session');
  assert.equal(values.size, 2);
  await storage.removeItem('session');
  assert.equal(await storage.getItem('session'), null);
  assert.equal(values.size, 0);
});
test('failed secure storage writes retain the previous session instead of claiming success', async () => {
  const { storage, setFail } = storageFixture();
  await storage.setItem('session', 'previous');
  setFail(true);
  await assert.rejects(storage.setItem('session', 'next'));
  assert.equal(await storage.getItem('session'), 'previous');
});
test('secure adapter serializes writes and rejects incomplete sessions', async () => {
  const { values, storage } = storageFixture();
  await Promise.all([
    storage.setItem('session', 'one'),
    storage.setItem('session', 'two'),
  ]);
  assert.equal(await storage.getItem('session'), 'two');
  const chunk = [...values.keys()].find((key) => !key.endsWith('.manifest'));
  values.delete(chunk);
  await assert.rejects(storage.getItem('session'));
  await storage.removeItem('session');
  assert.equal(values.size, 0);
});
test('profile mapping stores a scalar travel mode and cannot submit ownership or fake IDs', () => {
  const profile = createEmptyProfile();
  profile.group.id = 'fake-group';
  profile.group.name = '  Ekipa  ';
  profile.group.travelModes = ['Kamper'];
  profile.group.animals.animals = [{ kind: 'dog' }];
  const payload = profileToPayload(profile);
  assert.equal(payload.name, 'Ekipa');
  assert.equal(payload.travel_mode, 'Kamper');
  assert.ok(!('owner_user_id' in payload));
  assert.ok(!('id' in payload));
  const loaded = profileFromRows(
    { ...payload, id: 'server-group', owner_user_id: 'server-user' },
    { ...payload.matching, group_id: 'server-group' },
  );
  assert.equal(loaded.group.id, 'server-group');
  assert.deepEqual(loaded.group.travelModes, ['Kamper']);
  assert.deepEqual(loaded.group.animals.animals, [{ kind: 'dog' }]);
  loaded.group.interests.push('Rowery');
  assert.deepEqual(payload.interests, []);
});
