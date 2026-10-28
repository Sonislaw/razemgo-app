import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyFailure,
  createReportLimiter,
  monitoringEnvironment,
  serverMonitoringConfiguration,
  monitoringRoute,
  sanitizeMonitoringEvent,
} from '../shared/monitoring-policy.ts';
import {
  installMonitoringReporter,
  monitoredOperation,
  monitorAuthRefresh,
  reportFailure,
} from '../src/lib/monitoring-core.ts';
import { backendRequest } from '../src/lib/backend-request.ts';

const UUID = '00000000-0000-4000-8000-000000000001';
const metadata = {
  release: 'razemgo@1.0.0',
  environment: 'development',
  platform: 'android',
  osVersion: '16',
  installationId: UUID,
};

test('isolated Dev has independent server errors and heartbeat identity', () => {
  const dev = serverMonitoringConfiguration('dev');
  const existing = serverMonitoringConfiguration('development');
  assert.equal(dev.environment, 'dev');
  assert.equal(dev.monitorSlug, 'razemgo-push-health-dev');
  assert.equal(dev.diagnostics, true);
  assert.notEqual(dev.environment, existing.environment);
  assert.notEqual(dev.monitorSlug, existing.monitorSlug);
  assert.equal(existing.monitorSlug, 'razemgo-push-health');
  assert.equal(serverMonitoringConfiguration('preview').diagnostics, false);
  assert.equal(serverMonitoringConfiguration('production').diagnostics, false);
  assert.equal(
    serverMonitoringConfiguration('private-email@example.com').environment,
    'development',
  );
  assert.equal(
    serverMonitoringConfiguration('private-email@example.com').diagnostics,
    false,
  );
  assert.equal(serverMonitoringConfiguration(undefined).diagnostics, false);
});

test('preview errors have their own Sentry environment without accepting arbitrary values', () => {
  for (const value of ['development', 'preview', 'production'])
    assert.equal(monitoringEnvironment(value), value);
  for (const value of [undefined, 'private-email@example.com', 'staging'])
    assert.equal(monitoringEnvironment(value), 'development');
  assert.equal(
    sanitizeMonitoringEvent(
      {},
      { ...metadata, environment: monitoringEnvironment('preview') },
    ).environment,
    'preview',
  );
});
test('ordinary auth failures, cancelled operations and expected validation do not raise alarms', () => {
  for (const code of [
    'invalid_credentials',
    'email_not_confirmed',
    'otp_expired',
    'weak_password',
    'refresh_token_not_found',
  ])
    assert.equal(classifyFailure({ code }, 'auth.sign_in'), null);
  for (const code of ['22023', 'P0002', '23505', '54000'])
    assert.equal(classifyFailure({ code }, 'trips.save'), null);
  assert.equal(classifyFailure({ name: 'AbortError' }, 'trips.load'), null);
  assert.equal(classifyFailure({ status: 401 }, 'auth.restore'), null);
  assert.equal(classifyFailure({ status: 429 }, 'auth.sign_up'), null);
  assert.equal(
    classifyFailure({ status: 503 }, 'auth.sign_in').category,
    'server',
  );
  assert.equal(
    classifyFailure(
      { code: '42501', details: 'private account' },
      'profile.save',
    ).category,
    'permission',
  );
  assert.equal(
    classifyFailure({ name: 'AbortError' }, 'trips.load', true).code,
    'TIMEOUT',
  );
  assert.equal(
    classifyFailure(
      new TypeError('Failed to fetch secret URL'),
      'messages.send',
    ).code,
    'NETWORK',
  );
});
test('only known route templates and codes leave the device', () => {
  assert.equal(
    monitoringRoute('/chat/' + UUID + '?text=private#token'),
    '/chat/[id]',
  );
  assert.equal(
    monitoringRoute('/auth/callback?code=private'),
    '/auth/callback',
  );
  assert.equal(monitoringRoute('/profile/private-name'), 'unknown');
  assert.equal(
    classifyFailure({ code: 'private-email@example.com' }, 'trips.save').code,
    'UNEXPECTED',
  );
});
test('strict event allowlist removes payloads, raw errors, URLs, users, headers, SQL and breadcrumbs', () => {
  const privateText =
    'private-email@example.com secret-password child-7 message-body sb_secret_service_role';
  const event = {
    event_id: 'a'.repeat(32),
    timestamp: 1234,
    level: 'fatal',
    message: privateText,
    request: {
      url: privateText,
      headers: { authorization: privateText },
      data: privateText,
    },
    user: { email: privateText, id: privateText, ip_address: privateText },
    extra: { profile: privateText },
    contexts: {
      response: { body: privateText },
      device: { name: privateText },
    },
    breadcrumbs: [{ message: privateText }],
    transaction: privateText,
    tags: { sql: privateText },
    logentry: { message: privateText },
    threads: { values: [privateText] },
    exception: {
      values: [
        {
          type: 'TypeError',
          value: privateText,
          mechanism: { data: privateText },
          stacktrace: {
            frames: [
              {
                filename: 'https://example.com/entry.js?token=' + privateText,
                lineno: 15,
                colno: 6,
                vars: { password: privateText },
                pre_context: [privateText],
                context_line: privateText,
                function: privateText,
              },
            ],
          },
        },
      ],
    },
    debug_meta: {
      images: [
        {
          type: 'sourcemap',
          debug_id: UUID,
          code_file: 'https://private-origin/entry.js?token=' + privateText,
        },
      ],
    },
  };
  const safe = sanitizeMonitoringEvent(event, metadata, {
    operation: 'messages.send',
    screen: '/chat/' + UUID,
    code: 'private-token',
    requestId: UUID,
  });
  const encoded = JSON.stringify(safe);
  for (const word of privateText.split(' '))
    assert.equal(encoded.includes(word), false);
  assert.equal(encoded.includes('private-origin'), false);
  assert.equal(encoded.includes('example.com'), false);
  assert.equal(safe.tags.screen, '/chat/[id]');
  assert.equal(safe.tags.code, 'UNEXPECTED');
  assert.deepEqual(safe.user, { id: UUID });
  assert.equal(safe.exception.values[0].type, 'TypeError');
  assert.deepEqual(safe.exception.values[0].stacktrace.frames, [
    { filename: 'app:///entry.js', lineno: 15, colno: 6 },
  ]);
  assert.equal(safe.debug_meta.images[0].debug_id, UUID);
  assert.equal(safe.event_id, 'a'.repeat(32));
  assert.equal(
    sanitizeMonitoringEvent({ type: 'transaction' }, metadata),
    null,
  );
  assert.equal(
    sanitizeMonitoringEvent({ type: 'replay_event' }, metadata),
    null,
  );
});
test('reports are throttled per fingerprint and bounded per minute', () => {
  let now = 100000;
  const allow = createReportLimiter(() => now);
  assert.equal(allow('same'), true);
  assert.equal(allow('same'), false);
  for (let i = 0; i < 9; i++) assert.equal(allow('other' + i), true);
  assert.equal(allow('eleventh'), false);
  now += 60000;
  assert.equal(allow('same'), true);
});
test('a broken reporter cannot change successful results or throw a different application error', async () => {
  installMonitoringReporter(() => {
    throw new Error('reporter unavailable');
  });
  const result = { data: 1, error: { status: 503, message: 'private' } };
  assert.equal(
    await monitoredOperation('profile.save', async () => result),
    result,
  );
  const failure = new Error('private');
  await assert.rejects(
    monitoredOperation('trips.delete', async () => {
      throw failure;
    }),
    (error) => error === failure,
  );
});
test('backend results, thrown failures and real timeout aborts report fixed technical context only', async (t) => {
  const reports = [];
  installMonitoringReporter((error, context) =>
    reports.push({ message: error.message, context }),
  );
  const value = { error: { status: 503, message: 'secret server body' } };
  assert.equal(
    await backendRequest(async () => value, 'notifications.preferences'),
    value,
  );
  assert.equal(reports[0].context.code, 'HTTP_503');
  assert.equal(JSON.stringify(reports).includes('secret'), false);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = backendRequest(
    (signal) =>
      new Promise((resolve) =>
        signal.addEventListener('abort', () =>
          resolve({ error: { name: 'AbortError' } }),
        ),
      ),
    'messages.load',
  );
  const timeout = assert.rejects(
    pending,
    (error) => error.name === 'TimeoutError',
  );
  t.mock.timers.tick(20000);
  await timeout;
  t.mock.timers.reset();
  assert.equal(reports.at(-1).context.code, 'TIMEOUT');
  reportFailure(
    { code: 'invalid_credentials', message: 'secret password' },
    'auth.sign_in',
  );
  assert.equal(reports.length, 2);
});
test('background auth refresh is observed without reading bodies or replacing fetch results', async () => {
  const reports = [];
  installMonitoringReporter((error, context) =>
    reports.push({ message: error.message, context }),
  );
  const result = new Response('private response', { status: 502 });
  let original;
  const fetcher = monitorAuthRefresh(async (input, init) => {
    original = { input, init };
    return result;
  });
  const options = {
    method: 'POST',
    body: 'private refresh token',
    headers: { authorization: 'private bearer' },
  };
  assert.equal(
    await fetcher(
      'https://project.invalid/auth/v1/token?grant_type=refresh_token',
      options,
    ),
    result,
  );
  assert.equal(original.init, options);
  assert.equal(reports.length, 1);
  assert.equal(JSON.stringify(reports).includes('private'), false);
  assert.equal(await result.text(), 'private response');
});
test('function failures correlate by a validated request id without exposing response contents', async () => {
  const reports = [];
  installMonitoringReporter((error, context) =>
    reports.push({ message: error.message, context }),
  );
  reportFailure(
    {
      context: new Response('private deletion error', {
        status: 500,
        headers: { 'x-request-id': UUID, authorization: 'private key' },
      }),
    },
    'account.delete',
  );
  assert.equal(reports[0].context.requestId, UUID);
  assert.equal(reports[0].context.code, 'HTTP_500');
  assert.equal(JSON.stringify(reports).includes('private'), false);
});
