import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createChunkedStorage } from '../src/features/auth/chunked-storage.ts';
import { cleanUpBeforeSignOut, signOutStoredSession, withAuthRequestTimeout } from '../src/features/auth/auth-network.ts';

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const storageKey = 'test.session';
function session(id) {
  const expires_at = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp: expires_at })).toString('base64url')}.test`,
    refresh_token: 'test-refresh-' + id, expires_at, expires_in: 3600, token_type: 'bearer',
    user: { id, aud: 'authenticated', role: 'authenticated', email: 'test@example.invalid',
      app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  };
}
async function fixture(logout, refresh, timeoutMs = 20) {
  const values = new Map();
  // Exercise the actual native session adapter, not just browser localStorage.
  const storage = createChunkedStorage({
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => { values.delete(key); },
  });
  await storage.setItem(storageKey, JSON.stringify(session(A)));
  const client = createClient('https://auth.example.invalid', 'test-public-key', {
    auth: { storage, storageKey, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: withAuthRequestTimeout(async (input, init) => {
      if (new URL(input).pathname.endsWith('/logout')) return logout(init);
      if (new URL(input).pathname.endsWith('/token') && refresh) return refresh(init);
      throw new Error('Unexpected request');
    }, timeoutMs) },
  });
  await client.auth.getSession();
  return { client, storage, values };
}

for (const failure of ['offline', 'server', 'stalled']) {
  test(`SDK logout clears encrypted storage and emits SIGNED_OUT when ${failure}`, async () => {
    let signal;
    const { client, storage, values } = await fixture(async init => {
      signal = init.signal;
      if (failure === 'offline') throw new TypeError('Network request failed');
      if (failure === 'server') return new Response('{"message":"Unavailable"}', { status: 503 });
      return new Promise(() => {}); // A native transport which ignores abort.
    });
    const events = [];
    client.auth.onAuthStateChange(event => { events.push(event); });
    try {
      const failures = [];
      await signOutStoredSession(client.auth, storage, storageKey, session(A).access_token, error => failures.push(error));
      assert.equal(failures.length, 1);
      assert.equal(await storage.getItem(storageKey), null);
      assert.equal((await client.auth.getSession()).data.session, null);
      assert.ok(events.includes('SIGNED_OUT'));
      assert.equal(values.size, 0);
      if (failure === 'stalled') assert.equal(signal.aborted, true);
    } finally { await client.auth.dispose(); }
  });
}

test('an old timed-out response cannot clear a subsequently signed-in account', async () => {
  let release;
  const { client, storage } = await fixture(() => new Promise(resolve => { release = resolve; }));
  try {
    await signOutStoredSession(client.auth, storage, storageKey, session(A).access_token);
    await storage.setItem(storageKey, JSON.stringify(session(B)));
    assert.equal((await client.auth.getSession()).data.session.user.id, B);
    release(new Response('{}'));
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal((await client.auth.getSession()).data.session.user.id, B);
  } finally { await client.auth.dispose(); }
});

test('an expired stored session can be signed out without attempting a token refresh', async () => {
  let revocations = 0;
  const { client, storage } = await fixture(async () => { revocations++; return new Response('{}'); });
  try {
    await storage.setItem(storageKey, JSON.stringify({ ...session(A), expires_at: 1 }));
    await signOutStoredSession(client.auth, storage, storageKey, session(A).access_token);
    assert.equal(revocations, 1);
    assert.equal((await client.auth.getSession()).data.session, null);
  } finally { await client.auth.dispose(); }
});

test('an already running refresh cannot restore the old account after logout and an account switch', async () => {
  let releaseRefresh, started;
  const refreshing = new Promise(resolve => { started = resolve; });
  const { client, storage } = await fixture(async () => new Response('{}'), () => {
    started();
    return new Promise(resolve => { releaseRefresh = resolve; });
  }, 1000);
  try {
    const pending = client.auth.refreshSession();
    await refreshing;
    await signOutStoredSession(client.auth, storage, storageKey, session(A).access_token);
    await storage.setItem(storageKey, JSON.stringify(session(B)));
    releaseRefresh(new Response(JSON.stringify(session(A))));
    const result = await pending;
    assert.ok(result.error);
    assert.equal((await client.auth.getSession()).data.session.user.id, B);
  } finally { await client.auth.dispose(); }
});

test('a storage removal error is surfaced rather than claiming successful logout', async () => {
  const { client, storage } = await fixture(async () => new Response('{}'));
  try {
    await assert.rejects(signOutStoredSession(client.auth, {
      removeItem: async () => { throw new Error('Secure storage unavailable'); },
    }, storageKey, session(A).access_token), /Secure storage unavailable/);
    assert.notEqual(await storage.getItem(storageKey), null);
  } finally { await client.auth.dispose(); }
});

test('a damaged native manifest can be removed, but failure to delete it is not swallowed', async () => {
  const values = new Map([[storageKey + '.manifest', '{damaged']]);
  let failRemoval = false;
  const storage = createChunkedStorage({
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => {
      if (failRemoval) throw new Error('Secure storage unavailable');
      values.delete(key);
    },
  });
  await storage.removeItem(storageKey);
  assert.equal(await storage.getItem(storageKey), null);
  values.set(storageKey + '.manifest', '{damaged');
  failRemoval = true;
  await assert.rejects(storage.removeItem(storageKey), /Secure storage unavailable/);
  assert.equal(values.get(storageKey + '.manifest'), '{damaged');
});

test('logout cleanup runs all tasks, cancels stalled work, and tolerates rejected and synchronous failures', async () => {
  const started = [], signals = [];
  await cleanUpBeforeSignOut([
    async signal => { started.push('presence'); signals.push(signal); throw new Error('offline'); },
    signal => { started.push('push'); signals.push(signal); return new Promise(() => {}); },
    () => { started.push('tray'); throw new Error('native module unavailable'); },
  ], 20);
  assert.deepEqual(started, ['presence', 'push', 'tray']);
  assert.ok(signals.every(signal => signal.aborted));
});

test('ordinary backend requests keep their own abort policy and response', async () => {
  const expected = new Response('{}');
  const parent = new AbortController();
  let signal;
  const fetcher = withAuthRequestTimeout(async (_input, init) => { signal = init.signal; return expected; }, 20);
  assert.equal(await fetcher('https://auth.example.invalid/rest/v1/rpc/search_public_trips', { signal: parent.signal }), expected);
  assert.equal(signal, parent.signal);
});

test('auth request timeout forwards an upstream abort and cancels its timer after success', async () => {
  const parent = new AbortController();
  let signal;
  const fetcher = withAuthRequestTimeout(async (_input, init) => {
    signal = init.signal;
    parent.abort();
    return new Response('{}');
  }, 20);
  await fetcher('https://auth.example.invalid/auth/v1/logout', { signal: parent.signal });
  assert.equal(signal.aborted, true);
});
