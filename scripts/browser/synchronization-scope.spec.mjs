import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { A, groupId, state, backend, login } from './trip-fixtures.mjs';

test('five virtual idle minutes use summaries, and a notification change does not reload mailbox or favorites', async ({
  page,
  context,
}) => {
  const store = state();
  await backend(context, store);
  await login(page);
  await page.goto('/messages');
  await expect(
    page.getByRole('heading', { name: 'Jeszcze nie masz rozmów', exact: true }),
  ).toBeVisible();
  await page.clock.install();
  await page.clock.runFor(1000);
  const measurements = {};
  const reads = [];
  const requests = new WeakSet();
  page.on('request', (request) => requests.add(request));
  page.on('response', (response) => {
    const name = new URL(response.url()).pathname.match(
      /^\/rest\/v1\/rpc\/([a-z_]+)$/,
    )?.[1];
    if (
      !name ||
      response.request().method() !== 'POST' ||
      !requests.has(response.request())
    )
      return;
    reads.push(
      response.body().then((body) => {
        const row = (measurements[name] ??= { requests: 0, bytes: 0 });
        row.requests++;
        row.bytes += body.byteLength;
      }),
    );
  });
  store.technicalCalls.length = 0;
  const poll = async () => {
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith('/rpc/get_my_sync_state') &&
        r.request().method() === 'POST',
    );
    await page.clock.fastForward(20000);
    await page.clock.runFor(250);
    await response;
  };
  for (let i = 0; i < 15; i++) await poll();
  const idleCalls = [...store.technicalCalls];
  expect(idleCalls.filter((x) => x === 'get_my_sync_state')).toHaveLength(15);
  for (const name of [
    'get_my_favorites',
    'get_my_mailbox_page',
    'get_my_notifications',
    'list_my_trip_page',
    'list_conversation_messages',
  ])
    expect(idleCalls.filter((x) => x === name)).toHaveLength(0);
  store.notificationPreferences.set(groupId(A), { push_messages: false });
  await poll();
  await expect
    .poll(
      () =>
        store.technicalCalls.filter((x) => x === 'get_my_notifications').length,
    )
    .toBe(1);
  for (const name of [
    'get_my_favorites',
    'get_my_mailbox_page',
    'list_my_trip_page',
    'list_conversation_messages',
  ])
    expect(store.technicalCalls.filter((x) => x === name)).toHaveLength(0);
  await Promise.all(reads);
  await writeFile(
    '.expo/architecture-sync-budget.json',
    JSON.stringify(
      {
        engine:
          'Browser, mocked API, five virtual idle minutes plus one notification change',
        measurements,
      },
      null,
      2,
    ),
  );
});
