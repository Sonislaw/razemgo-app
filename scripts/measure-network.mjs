import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  A,
  B,
  groupId,
  state,
  backend,
  login,
} from './browser/trip-fixtures.mjs';

// Controlled browser comparison; decoded fixture JSON, not compressed wire
// traffic and not a device/hosted-capacity benchmark. No live requests escape
// the fake backend. The same fixture is used for baseline and current code.
const store = state(),
  uuid = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
for (let n = 0; n < 50; n++) {
  const id = uuid(20000 + n);
  store.trips.set(id, {
    id,
    group_id: groupId(A),
    mode: 'planned',
    status: 'published',
    visibility: 'public',
    start_date: '2099-05-21',
    end_date: '2099-05-24',
    location_id: 'pl-locality:4259',
    location_name: 'Chłapowo',
    location_region: 'pomorskie',
    location_kind: 'village',
    campground_name: 'Kemping testowy',
    campground_address: '',
    travel_mode: 'Kamper',
    description: 'Syntetyczny wyjazd nad morze i rowery. ' + n,
    landscape: 'coast',
    interests: ['Rowery'],
    animal_kinds: [],
    matching_group_kinds: [],
    matching_child_age_bands: [],
    published_at: '2026-10-26T10:00:00Z',
  });
}
for (let n = 0; n < 80; n++) {
  const invitation = uuid(21000 + n),
    chat = uuid(22000 + n),
    trip = {
      ...[...store.trips.values()][n % 50],
      id: uuid(24000 + n),
      group_id: groupId(B),
      description:
        'Syntetyczny kontekst rozmowy ' + n + '. Wspólne plany podróży.',
    };
  store.invitations.push({
    id: invitation,
    sender_group_id: groupId(A),
    recipient_group_id: groupId(B),
    context_kind: 'trip',
    trip_id: trip.id,
    trip_reference: trip.id,
    trip_snapshot: trip,
    source_trip_snapshot: null,
    text: 'Syntetyczne zaproszenie.',
    status: 'accepted',
    created_at: '2026-10-26T10:00:00Z',
  });
  store.conversations.push({
    id: chat,
    invitation_id: invitation,
    sender_group_id: groupId(A),
    recipient_group_id: groupId(B),
    updated_at: '2026-10-26T10:00:00Z',
  });
  for (let message = 1; message <= 40; message++)
    store.messages.push({
      id: uuid(30000 + n * 50 + message),
      sequence: n * 50 + message,
      conversation_id: chat,
      sender_group_id: groupId(B),
      text: 'Syntetyczna wiadomość o planach podróży. ' + message,
      created_at: '2026-10-26T10:00:00Z',
    });
}
let available = false;
for (let attempt = 0; attempt < 120 && !available; attempt++) {
  try {
    available = (
      await fetch('http://localhost:8085', {
        signal: AbortSignal.timeout(1000),
      })
    ).ok;
  } catch {
    /* The isolated Metro may still be starting. */
  }
  if (!available) await new Promise((resolve) => setTimeout(resolve, 250));
}
if (!available)
  throw Error(
    'Start the isolated browser QA server on port 8085 before measuring.',
  );
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  baseURL: 'http://localhost:8085',
  viewport: { width: 390, height: 844 },
});
const summarize = (rows) => ({
  requests: rows.length,
  decodedJsonBytes: rows.reduce((total, row) => total + row.bytes, 0),
  operations: Object.fromEntries(
    [...new Set(rows.map((row) => row.endpoint))]
      .sort()
      .map((name) => [
        name,
        {
          requests: rows.filter((row) => row.endpoint === name).length,
          bytes: rows
            .filter((row) => row.endpoint === name)
            .reduce((sum, row) => sum + row.bytes, 0),
        },
      ]),
  ),
});
try {
  await backend(context, store);
  const page = await context.newPage();
  await login(page);
  await page.waitForTimeout(1000);
  const initial = summarize(store.transfers);
  const chats = store.conversations.slice(-3);
  await page.getByRole('tab', { name: /^Wiadomości/ }).click();
  for (const [index, chat] of chats.entries()) {
    if (index)
      await page
        .getByRole('button', { name: 'Wróć do Wiadomości', exact: true })
        .click();
    const button = page.getByRole('button', {
      name: new RegExp(
        '^Ekipa B, Syntetyczny kontekst rozmowy ' + (77 + index) + '\\.',
      ),
    });
    await button.scrollIntoViewIfNeeded();
    await button.click();
    const tail = store.messages
      .filter((message) => message.conversation_id === chat.id)
      .at(-1);
    await expect(page.getByTestId('chat-message-' + tail.id)).toBeVisible();
    await page.waitForTimeout(500);
  }
  store.transfers = [];
  await page.clock.install();
  await page.clock.fastForward(21000);
  await page.waitForTimeout(700);
  const quiet = summarize(store.transfers);
  const last = chats.at(-1);
  store.messages.push({
    id: uuid(999999),
    sequence: 1000000,
    conversation_id: last.id,
    sender_group_id: groupId(B),
    text: 'Syntetyczna nowa wiadomość.',
    created_at: '2026-10-26T10:01:00Z',
  });
  store.transfers = [];
  await page.clock.fastForward(21000);
  await expect(page.getByTestId('chat-message-' + uuid(999999))).toBeAttached();
  await page.waitForTimeout(500);
  const changed = summarize(store.transfers),
    histories = store.transfers.filter(
      (row) => row.endpoint === 'get_conversation_messages',
    );
  const result = {
    kind: 'Browser fixtures: 50 owned trips, 80 conversations, 3 visited histories',
    initial,
    quietPoll: quiet,
    changedPoll: {
      ...changed,
      activeHistoryRequests: histories.filter(
        (row) => row.conversation === last.id,
      ).length,
      inactiveHistoryRequests: histories.filter(
        (row) => row.conversation !== last.id,
      ).length,
    },
  };
  await mkdir('.expo', { recursive: true });
  const file =
    '.expo/hardening-network-' +
    (process.env.MEASUREMENT_LABEL ?? 'after') +
    '.json';
  await writeFile(file, JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({
      file,
      initialRequests: initial.requests,
      quietBytes: quiet.decodedJsonBytes,
      changedBytes: changed.decodedJsonBytes,
      inactiveHistories: result.changedPoll.inactiveHistoryRequests,
    }),
  );
} finally {
  await context.close();
  await browser.close();
}
