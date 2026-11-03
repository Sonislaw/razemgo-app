import { test, expect } from '@playwright/test';
import { A, B, groupId, state, backend, login } from './trip-fixtures.mjs';

const TRIP = '00000000-0000-4000-8000-000000000901';
function seeded() {
  const store = state();
  store.trips.set(TRIP, {
    id: TRIP,
    group_id: groupId(A),
    adult_count: 2,
    child_count: 1,
    child_age_bands: ['4–6'],
    mode: 'planned',
    status: 'published',
    visibility: 'public',
    start_date: '2027-05-21',
    end_date: '2027-05-24',
    location_id: 'pl-locality:test',
    location_name: 'Chłapowo',
    location_region: 'Pomorskie',
    location_kind: 'village',
    campground_name: 'Pod Wydmami',
    campground_address: '',
    travel_mode: 'Kamper',
    description: 'Spokojny wyjazd nad morze, rowery i wspólne ognisko.',
    landscape: 'coast',
    interests: ['Rowery'],
    animal_kinds: [],
    matching_group_kinds: ['family'],
    matching_child_age_bands: ['4–6'],
    published_at: '2026-10-24T10:00:00Z',
  });
  return store;
}
function accepted(store, count = 1) {
  const invitation = {
    id: '00000000-0000-4000-8000-000000000902',
    sender_group_id: groupId(B),
    recipient_group_id: groupId(A),
    trip_id: TRIP,
    trip_reference: TRIP,
    trip_snapshot: store.trips.get(TRIP),
    source_trip_id: null,
    source_trip_snapshot: null,
    text: 'Cześć, jedźmy razem!',
    status: 'accepted',
    created_at: '2026-10-24T10:00:00Z',
  };
  const chat = {
    id: '00000000-0000-4000-8000-000000000903',
    invitation_id: invitation.id,
    sender_group_id: groupId(B),
    recipient_group_id: groupId(A),
    updated_at: '2026-10-24T10:00:00Z',
  };
  store.invitations.push(invitation);
  store.conversations.push(chat);
  for (let i = 1; i <= count; i++)
    store.messages.push({
      id: `00000000-0000-4000-9000-${String(i).padStart(12, '0')}`,
      sequence: i,
      conversation_id: chat.id,
      sender_group_id: groupId(B),
      text: `Wiadomość numer ${i}`,
      created_at: '2026-10-24T10:00:00Z',
    });
  return chat.id;
}

for (const width of [320, 390])
  test(`first-message suggestions preserve drafts, allow edits and retry at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 844 });
    const store = seeded();
    await backend(context, store);
    await login(page, 'b@example.com');
    await page.goto('/trip/' + TRIP);
    await page.getByRole('button', { name: 'Zaproś do kontaktu', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Zaproś do kontaktu', exact: true });
    const field = sheet.getByRole('textbox', { name: 'Treść zaproszenia', exact: true });
    const suggestion = label => sheet.getByRole('button', { name: 'Podpowiedź: ' + label, exact: true });
    await expect(field).toHaveValue('');
    await expect(sheet.getByRole('button', { name: /^Podpowiedź:/ })).toHaveCount(3);
    await suggestion('Wspólny wyjazd').click();
    await expect(field).toHaveValue(/Chłapowo/);
    expect(store.invitations).toHaveLength(0);
    await suggestion('Miejsce na nocleg').click();
    await expect(field).toHaveValue(/Pod Wydmami/);
    await expect(sheet.getByRole('button', { name: 'Wstaw podpowiedź', exact: true })).toHaveCount(0);
    const custom = 'Cześć! Możemy dołączyć do Was w sobotę?';
    await field.fill(custom);
    await suggestion('Wspólne aktywności').click();
    await expect(field).toHaveValue(custom);
    await sheet.getByRole('button', { name: 'Zachowaj mój tekst', exact: true }).click();
    await expect(field).toHaveValue(custom);
    await suggestion('Wspólny wyjazd').click();
    await sheet.getByRole('button', { name: 'Wstaw podpowiedź', exact: true }).click();
    await expect(field).toHaveValue(/Chłapowo/);
    const edited = (await field.inputValue()) + ' Możemy przyjechać w sobotę.';
    await field.fill(edited);
    await sheet.screenshot({ path: `.expo/first-message-suggestions-${width}.png` });
    expect(await sheet.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await sheet.getByRole('button', { name: 'Zamknij', exact: true }).click();
    await page.getByRole('button', { name: 'Zaproś do kontaktu', exact: true }).click();
    await expect(field).toHaveValue(edited);
    store.failInvitation = true;
    await sheet.getByRole('button', { name: 'Wyślij zaproszenie', exact: true }).click();
    await expect(sheet.getByRole('alert')).toContainText('Nie udało się');
    await expect(field).toHaveValue(edited);
    expect(store.invitations).toHaveLength(0);
    store.failInvitation = false;
    await sheet.getByRole('button', { name: 'Wyślij zaproszenie', exact: true }).click();
    await expect(page).toHaveURL('http://localhost:8085/messages');
    expect(store.invitations).toHaveLength(1);
    expect(store.invitations[0].text).toBe(edited);
    await page.goto('/trip/' + TRIP);
    await expect(page.getByRole('button', { name: 'Zobacz wysłane zaproszenie', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Podpowiedź:/ })).toHaveCount(0);
  });

test('flexible trips suggest a shared idea rather than a fixed campsite', async ({ page, context }) => {
  const store = seeded();
  Object.assign(store.trips.get(TRIP), { mode: 'flexible', location_name: 'Mazury', location_kind: 'region' });
  await backend(context, store);
  await login(page, 'b@example.com');
  await page.goto('/trip/' + TRIP);
  await page.getByRole('button', { name: 'Zaproś do kontaktu', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Zaproś do kontaktu', exact: true });
  const field = sheet.getByRole('textbox', { name: 'Treść zaproszenia', exact: true });
  await sheet.getByRole('button', { name: 'Podpowiedź: Wspólny pomysł', exact: true }).click();
  await expect(field).toHaveValue(/Szukam pomysłu.*Mazury/);
  await expect(field).not.toHaveValue(/Pod Wydmami/);
  await expect(sheet.getByRole('button', { name: 'Podpowiedź: Miejsce na nocleg', exact: true })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Podpowiedź: Kierunek i termin', exact: true }).click();
  await expect(field).toHaveValue(/termin z ogłoszenia jest elastyczny/);
  expect(store.invitations).toHaveLength(0);
});

test('invitation → acceptance → durable chat, receipts, retries, second device, block and report', async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(150000);
  const store = seeded();
  await backend(context, store);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const other = await browser.newContext({
    baseURL: 'http://localhost:8085',
    viewport: { width: 390, height: 844 },
  });
  const second = await browser.newContext({
    baseURL: 'http://localhost:8085',
    viewport: { width: 320, height: 844 },
  });
  try {
    await backend(other, store);
    const b = await other.newPage();
    b.on('pageerror', (e) => errors.push(e.message));
    await login(b, 'b@example.com');
    await b.goto('/trip/' + TRIP);
    await b
      .getByRole('button', { name: 'Zaproś do kontaktu', exact: true })
      .click();
    await b
      .getByRole('textbox', { name: 'Treść zaproszenia', exact: true })
      .fill('Cześć, spotkajmy się na kempingu!');
    store.failInvitation = 'after-commit';
    await b
      .getByRole('button', { name: 'Wyślij zaproszenie', exact: true })
      .click();
    await expect(b.getByRole('alert')).toContainText('Nie udało się połączyć');
    expect(store.invitations.length).toBe(1);
    store.failInvitation = false;
    await b
      .getByRole('button', { name: 'Wyślij zaproszenie', exact: true })
      .click();
    await expect(b).toHaveURL('http://localhost:8085/messages');
    await expect(b.getByText('Oczekuje', { exact: true })).toBeVisible();
    expect(store.invitations.length).toBe(1);
    await login(page);
    await page.goto('/messages');
    await page.getByRole('tab', { name: /^Zaproszenia/ }).click();
    await expect(page.getByText('Ekipa B', { exact: true })).toBeVisible();
    await expect(
      page
        .getByText('Cześć, spotkajmy się na kempingu!', { exact: true })
        .last(),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Akceptuj', exact: true }).click();
    expect(store.conversations.length).toBe(1);
    const chat = store.conversations[0].id;
    await page.getByRole('button', { name: /^Ekipa B,/ }).click();
    await expect(page).toHaveURL('http://localhost:8085/chat/' + chat);
    await expect(
      page
        .getByTestId('chat-screen')
        .getByText('Cześć, spotkajmy się na kempingu!', { exact: true }),
    ).toBeVisible();
    await expect.poll(() => store.reads.get(chat + groupId(A))).toBe(1);
    store.failSend = true;
    await page
      .getByRole('textbox', { name: 'Treść wiadomości' })
      .fill('Tak, do zobaczenia przy recepcji!');
    await page
      .getByRole('button', { name: 'Wyślij wiadomość', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Ponów wysyłanie', exact: true }),
    ).toBeVisible();
    expect(store.messages.length).toBe(1);
    store.failSend = false;
    await page
      .getByRole('button', { name: 'Ponów wysyłanie', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Ponów wysyłanie', exact: true }),
    ).toHaveCount(0);
    expect(store.messages.length).toBe(2);
    await b.goto('/messages');
    await b.getByRole('tab', { name: /^Rozmowy/ }).click();
    await b.getByRole('button', { name: /^Ekipa A,/ }).click();
    await expect(
      b
        .getByTestId('chat-screen')
        .getByText('Tak, do zobaczenia przy recepcji!', { exact: true }),
    ).toBeVisible();
    await expect.poll(() => store.reads.get(chat + groupId(B))).toBe(2);
    await page.reload();
    await expect(page.getByText(/Odczytano/).first()).toBeVisible();
    // A mounted chat behind another route must not mark a new message read.
    await page
      .getByRole('button', { name: 'Wróć do Wiadomości', exact: true })
      .click();
    await b
      .getByRole('textbox', { name: 'Treść wiadomości' })
      .fill('Daj znać, gdy dotrzesz!');
    await b
      .getByRole('button', { name: 'Wyślij wiadomość', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Odśwież skrzynkę', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: /^Ekipa B,.*nieprzeczytane: 1/ }),
    ).toBeVisible();
    expect(store.reads.get(chat + groupId(A))).toBe(1);
    await page.getByRole('button', { name: /^Ekipa B,/ }).click();
    await expect.poll(() => store.reads.get(chat + groupId(A))).toBe(3);
    await backend(second, store);
    const device = await second.newPage();
    await login(device);
    await device.goto('/chat/' + chat);
    await expect(
      device.getByText('Tak, do zobaczenia przy recepcji!', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', {
        name: 'Opcje bezpieczeństwa rozmowy',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: 'Zgłoś konto', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Zapisz zgłoszenie', exact: true })
      .click();
    await expect(
      page.getByText('Zgłoszenie zapisane.', { exact: true }),
    ).toBeVisible();
    expect(store.reports.length).toBe(1);
    await page
      .getByRole('button', {
        name: 'Opcje bezpieczeństwa rozmowy',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: 'Zablokuj ekipę', exact: true })
      .click();
    await expect(
      page.getByText('Ekipa jest zablokowana', { exact: true }),
    ).toBeVisible();
    await b.reload();
    await expect(
      b.getByText('Kontakt z tą ekipą jest niedostępny', { exact: true }),
    ).toBeVisible();
    await expect(
      b.getByRole('textbox', { name: 'Treść wiadomości' }),
    ).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Odblokuj ekipę', exact: true })
      .click();
    await expect(
      page.getByRole('textbox', { name: 'Treść wiadomości' }),
    ).toBeEditable();
    await page.goto('/messaging-safety');
    await expect(
      page.getByText('Zgłoszenia · 1', { exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await other.close();
    await second.close();
  }
});

test('mailbox and history errors offer real retry without showing fake empty states', async ({
  page,
  context,
}) => {
  const store = seeded(),
    chat = accepted(store);
  store.failMailbox = true;
  await backend(context, store);
  await login(page);
  await page.goto('/messages');
  await expect(
    page.getByText('Nie udało się wczytać skrzynki', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Jeszcze nie masz rozmów', { exact: true }),
  ).toHaveCount(0);
  // Hold the safety poll/debounced recovery while exercising the manual action.
  // Advancing with failures still enabled drains already scheduled callbacks.
  await page.clock.install();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  store.failMailbox = false;
  await page
    .getByRole('button', { name: 'Spróbuj ponownie', exact: true })
    .click();
  await expect(page.getByRole('button', { name: /^Ekipa B,/ })).toBeVisible();
  await page.clock.resume();
  store.failHistory = true;
  await page.goto('/chat/' + chat);
  await expect(page.getByRole('alert')).toContainText(
    'Nie udało się pobrać wiadomości',
  );
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  store.failHistory = false;
  await page
    .getByRole('button', { name: 'Spróbuj ponownie', exact: true })
    .click();
  await expect(
    page.getByText('Wiadomość numer 1', { exact: true }),
  ).toBeVisible();
  await page.clock.resume();
});

test('history pagination and a lost send response never duplicate the committed message', async ({
  page,
  context,
}) => {
  const store = seeded(),
    chat = accepted(store, 65);
  await backend(context, store);
  await login(page);
  await page.goto('/chat/' + chat);
  await page
    .getByRole('button', { name: 'Wczytaj starsze wiadomości', exact: true })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'Wczytaj starsze wiadomości',
      exact: true,
    }),
  ).toHaveCount(0);
  // Loading history preserves the reading anchor. The oldest newly loaded row
  // can be outside FlatList's render window until the user scrolls further.
  const list = page.getByTestId('chat-message-list');
  await expect
    .poll(async () => {
      await list.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      return page.getByText('Wiadomość numer 1', { exact: true }).count();
    })
    .toBe(1);
  await expect(
    page.getByText('Wiadomość numer 1', { exact: true }),
  ).toBeVisible();
  store.failSend = 'after-commit';
  await page
    .getByRole('textbox', { name: 'Treść wiadomości' })
    .fill('Jedna wiadomość mimo utraty odpowiedzi');
  await page
    .getByRole('button', { name: 'Wyślij wiadomość', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Nie udało się połączyć');
  await expect(
    page.getByText('Jedna wiadomość mimo utraty odpowiedzi', { exact: true }),
  ).toHaveCount(1);
  expect(store.messages.length).toBe(66);
  await expect(
    page.getByRole('button', { name: 'Ponów wysyłanie', exact: true }),
  ).toHaveCount(0);
  store.failSend = false;
  await page.reload();
  await expect(
    page.getByText('Jedna wiadomość mimo utraty odpowiedzi', { exact: true }),
  ).toBeVisible();
});

test('history paging waits for pending reaction synchronization before accepting a press', async ({
  page,
  context,
}) => {
  const store = seeded(),
    chat = accepted(store, 65);
  await backend(context, store);
  let release;
  const reactions = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/rest/v1/rpc/get_message_reactions', async (route) => {
    await reactions;
    await route.fallback();
  });
  try {
    await login(page);
    await page.goto('/chat/' + chat);
    const older = page.getByRole('button', {
      name: 'Wczytaj starsze wiadomości',
      exact: true,
    });
    await expect(older).toBeVisible();
    await expect(older).toBeDisabled();
    release();
    await older.click();
    await expect(older).toHaveCount(0);
    const list = page.getByTestId('chat-message-list');
    await expect
      .poll(async () => {
        await list.evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        return page.getByText('Wiadomość numer 1', { exact: true }).count();
      })
      .toBe(1);
  } finally {
    release();
  }
});

test('a background history refresh preserves a press requesting the older page', async ({
  page,
  context,
}) => {
  const store = seeded(),
    chat = accepted(store, 65);
  await backend(context, store);
  await login(page);
  await page.goto('/chat/' + chat);
  const older = page.getByRole('button', {
    name: 'Wczytaj starsze wiadomości',
    exact: true,
  });
  await expect(older).toBeEnabled();
  let release,
    started,
    olderReads = 0;
  const response = new Promise((resolve) => {
    release = resolve;
  });
  const request = new Promise((resolve) => {
    started = resolve;
  });
  await page.route(
    '**/rest/v1/rpc/get_conversation_messages',
    async (route) => {
      if (route.request().postDataJSON().before_sequence) olderReads++;
      else {
        started();
        await response;
      }
      await route.fallback();
    },
  );
  store.messages.push({
    ...store.messages.at(-1),
    id: '00000000-0000-4000-9000-000000000066',
    sequence: 66,
    text: 'Nowa wiadomość w tle',
  });
  try {
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await request;
    await expect(older).toBeEnabled();
    await older.click();
    expect(olderReads).toBe(0);
    release();
    await expect(older).toHaveCount(0);
    expect(olderReads).toBe(1);
  } finally {
    release();
  }
});
