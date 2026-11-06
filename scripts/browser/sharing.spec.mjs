import { test, expect } from '@playwright/test';
import { A, B, groupId, profile, state, backend, login, TEST_API_ORIGIN } from './trip-fixtures.mjs';

const TRIP = '00000000-0000-4000-8000-000000008001';
const PRIVATE = '00000000-0000-4000-8000-000000008002';
const CHAT = '00000000-0000-4000-8000-000000008003';
const INVITE = '00000000-0000-4000-8000-000000008004';
const scheme = process.env.RAZEMGO_SHARING_TEST_SCHEME ?? 'razemgo-dev';
const variant = scheme === 'razemgo' ? 'Preview' : 'Dev';
const tripLink = scheme + '://trip/' + TRIP;
const groupLink = scheme + '://crew/' + groupId(B);

function seed() {
  const store = state();
  const trip = { id: TRIP, group_id: groupId(B), mode: 'planned', status: 'published', visibility: 'public',
    adult_count: 2, child_count: 1, child_age_bands: ['4–6'], start_date: '2027-05-21', end_date: '2027-05-24',
    location_id: 'pl-locality:4259', location_name: 'Chłapowo', location_region: 'pomorskie', location_kind: 'village',
    campground_name: '', campground_address: '', travel_mode: 'Kamper', description: 'Spokojny wyjazd nad morze i wspólne rowery.',
    landscape: 'coast', interests: ['Rowery'], animal_kinds: [], matching_group_kinds: [], matching_child_age_bands: [], published_at: '2026-10-24T10:00:00Z' };
  store.trips.set(TRIP, trip);
  store.trips.set(PRIVATE, { ...trip, id: PRIVATE, group_id: groupId(A), status: 'draft', visibility: 'private', published_at: null });
  store.invitations.push({ id: INVITE, sender_group_id: groupId(B), recipient_group_id: groupId(A),
    trip_id: null, source_trip_id: null, trip_reference: null, trip_snapshot: null, source_trip_snapshot: null,
    context_kind: 'profile', text: 'Porozmawiajmy o podróżach.', status: 'accepted', created_at: '2026-10-24T10:00:00Z' });
  store.conversations.push({ id: CHAT, invitation_id: INVITE, sender_group_id: groupId(B), recipient_group_id: groupId(A), updated_at: '2026-10-24T10:00:00Z' });
  return store;
}

async function copy(page, button, expected) {
  await expect(button).toBeVisible();
  await button.click();
  const sheet = page.getByRole('dialog', { name: /^Udostępnij/ });
  await sheet.getByRole('button', { name: 'Kopiuj link', exact: true }).click();
  await expect(sheet.getByRole('alert')).toHaveText('Link skopiowany');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
  await sheet.getByRole('button', { name: 'Zamknij', exact: true }).click();
}

async function sharingBackend(context, store) {
  await backend(context, store);
  await context.route(TEST_API_ORIGIN + '/rest/v1/rpc/**', async route => {
    const request = route.request();
    const name = new URL(request.url()).pathname.split('/').at(-1);
    if (request.method() === 'OPTIONS' || !['list_public_groups_v3', 'count_public_groups', 'get_public_group_v3', 'refresh_public_group_results_v3'].includes(name)) return route.fallback();
    const userId = JSON.parse(Buffer.from(request.headers().authorization.split('.')[1], 'base64url')).sub;
    const otherId = userId === A ? B : A;
    const body = request.postDataJSON();
    const info = { crew: profile(otherId).group, about: 'Lubimy podróże i rowery.', active_trip_count: 0, trips: [], has_more: false, cursor: null };
    const json = name === 'count_public_groups' ? 1
      : name === 'get_public_group_v3' ? (body.target_group_id === groupId(otherId) ? info : null)
        : name === 'refresh_public_group_results_v3' ? [info]
          : { items: [info], total_count: 1, has_more: false, cursor: null };
    await route.fulfill({ json, headers: { 'access-control-allow-origin': 'http://localhost:8085' } });
  });
}

async function pasteAndSend(page, prefix, expected) {
  await page.goto('/chat/' + CHAT);
  const field = page.getByRole('textbox', { name: 'Treść wiadomości', exact: true });
  await field.fill(prefix);
  await field.press('End');
  await field.press('Control+V');
  await expect(field).toHaveValue(prefix + expected);
  await page.getByRole('button', { name: 'Wyślij wiadomość', exact: true }).click();
  await expect(page.getByRole('link', { name: /^Otwórz udostępnion/ }).last()).toBeVisible();
}

test(`${variant} copies trip and crew links, pastes into durable chat and opens viewer-specific screens on two accounts`, async ({ page, context, browser }) => {
  test.setTimeout(120000);
  const store = seed();
  await sharingBackend(context, store);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await login(page);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/explore');
  const card = page.getByTestId('discovery-trip-' + TRIP);
  await copy(page, card.getByRole('button', { name: 'Udostępnij wyjazd', exact: true }), tripLink);
  await expect(page).toHaveURL('http://localhost:8085/explore');
  await page.screenshot({ path: '.expo/dev-sharing-trip-390.png' });
  await pasteAndSend(page, 'Zobacz ten wyjazd: ', tripLink);
  await expect.poll(() => store.messages.map(message => message.text)).toContain('Zobacz ten wyjazd: ' + tripLink);
  await page.getByRole('link', { name: 'Otwórz udostępniony wyjazd', exact: true }).click();
  await expect(page).toHaveURL('http://localhost:8085/trip/' + TRIP);
  await copy(page, page.getByRole('button', { name: 'Udostępnij wyjazd', exact: true }), tripLink);
  await page.goto('/explore');
  await page.getByRole('tab', { name: 'Ekipy', exact: true }).click();
  const crew = page.getByTestId('group-card-' + groupId(B));
  await copy(page, crew.getByRole('button', { name: 'Udostępnij ekipę', exact: true }), groupLink);
  await expect(page).toHaveURL('http://localhost:8085/explore');
  await page.setViewportSize({ width: 320, height: 844 });
  await page.screenshot({ path: '.expo/dev-sharing-crew-320.png' });
  await pasteAndSend(page, 'A tu ekipa: ', groupLink);
  await page.getByRole('link', { name: 'Otwórz udostępnioną ekipę', exact: true }).click();
  await expect(page).toHaveURL('http://localhost:8085/crew/' + groupId(B));
  await copy(page, page.getByRole('button', { name: 'Udostępnij ekipę', exact: true }), groupLink);

  const peer = await browser.newContext({ baseURL: 'http://localhost:8085', viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] });
  try {
    await sharingBackend(peer, store);
    const b = await peer.newPage(); await login(b, 'b@example.com');
    await b.goto('/chat/' + CHAT);
    await b.getByRole('link', { name: 'Otwórz udostępniony wyjazd', exact: true }).click();
    await expect(b).toHaveURL('http://localhost:8085/trips/' + TRIP);
    await copy(b, b.getByRole('button', { name: 'Udostępnij wyjazd', exact: true }), tripLink);
    await b.goto('/chat/' + CHAT);
    await b.getByRole('link', { name: 'Otwórz udostępnioną ekipę', exact: true }).click();
    await expect(b).toHaveURL('http://localhost:8085/profile');
    await copy(b, b.getByRole('button', { name: 'Udostępnij ekipę', exact: true }), groupLink);
  } finally { await peer.close(); }
  expect(errors).toEqual([]);
});

test(`${variant} handles clipboard denial, retry, private drafts and shared trips no longer available`, async ({ page, context }) => {
  test.setTimeout(90000);
  const store = seed();
  store.messages.push({ id: '00000000-0000-4000-9000-000000008005', sequence: 1, conversation_id: CHAT,
    sender_group_id: groupId(B), text: tripLink, created_at: '2026-10-24T10:00:00Z' });
  await backend(context, store);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await login(page); await page.goto('/trip/' + TRIP);
  await page.evaluate(() => {
    const clipboard = navigator.clipboard;
    const command = document.execCommand;
    window.__restoreShareClipboard = () => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
      document.execCommand = command;
    };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Denied'); } } });
    document.execCommand = () => false;
  });
  await page.getByRole('button', { name: 'Udostępnij wyjazd', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Udostępnij wyjazd', exact: true });
  await sheet.getByRole('button', { name: 'Kopiuj link', exact: true }).click();
  await expect(sheet.getByRole('alert')).toContainText('Nie udało się skopiować');
  await page.evaluate(() => window.__restoreShareClipboard());
  await sheet.getByRole('button', { name: 'Kopiuj link', exact: true }).click();
  await expect(sheet.getByRole('alert')).toHaveText('Link skopiowany');
  await sheet.getByRole('button', { name: 'Zamknij', exact: true }).click();
  await page.goto('/trips/' + PRIVATE);
  await expect(page.getByRole('heading', { name: 'Twój wyjazd', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Udostępnij wyjazd', exact: true })).toHaveCount(0);
  store.trips.get(TRIP).status = 'paused';
  await page.goto('/chat/' + CHAT);
  await page.getByRole('link', { name: 'Otwórz udostępniony wyjazd', exact: true }).click();
  await expect(page.getByText('Nie znaleźliśmy tego wyjazdu', { exact: true })).toBeVisible();
});
