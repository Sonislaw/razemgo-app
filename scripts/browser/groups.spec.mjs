import { test, expect } from '@playwright/test';
import { A, B, groupId, profile, state, backend, login } from './trip-fixtures.mjs';

async function groupBackend(context, store) {
  await backend(context, store);
  store.publicProfiles ??= new Map([[groupId(B), { discoverable: true, about: 'Lubimy rowery i podróże bez pośpiechu.' }]]);
  await context.route('http://127.0.0.1:54321/rest/v1/rpc/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1);
    if (!['list_public_groups', 'list_ranked_public_groups', 'count_public_groups', 'get_public_group', 'get_my_group_visibility', 'save_my_group_visibility', 'send_profile_invitation', 'report_profile'].includes(name)) return route.fallback();
    const request = route.request();
    const headers = { 'access-control-allow-origin': 'http://localhost:8085', 'access-control-allow-headers': '*',
      'access-control-allow-methods': 'POST, OPTIONS', 'content-type': 'application/json' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const respond = (data, status = 200) => route.fulfill({ status, headers, body: JSON.stringify(data) });
    const body = request.postDataJSON();
    const id = JSON.parse(Buffer.from(request.headers().authorization.split('.')[1], 'base64url')).sub;
    const me = groupId(id), other = groupId(id === A ? B : A);
    const target = body.target_group_id;
    const otherCrew = profile(id === A ? B : A).group;
    const info = () => ({ crew: otherCrew, about: store.publicProfiles.get(other)?.about ?? '', active_trip_count: 0, trips: [],
      compatibility: store.groupMatch ?? { score: 100, reasons: ['Pasujący rodzaj ekipy', 'Pasujący wiek dzieci', 'Rowery'], limited_data: false, evaluated_weight: 100 } });
    if (name === 'list_public_groups' || name === 'list_ranked_public_groups' || name === 'count_public_groups') {
      if (name !== 'count_public_groups') {
        store.lastGroupFilters = body.filters;
        store.lastGroupSort = body.sort_mode;
        if (store.failGroups) return respond({ code: store.missingGroups ? 'PGRST202' : '503', message: 'Local test failure' }, store.missingGroups ? 404 : 503);
      }
      const f = body.filters;
      const query = f.name?.trim() ?? '';
      const match = (store.publicProfiles.get(other)?.discoverable ?? true) && (!query || (/^#?\s*\d+$/.test(query)
        ? Number(query.replace(/^#?\s*/, '')) === otherCrew.crew_number : otherCrew.name.toLowerCase().includes(query.toLowerCase())))
        && (!f.group_kinds.length || f.group_kinds.includes(otherCrew.kind)) && !f.has_trips
        && (!f.online_only || [...store.presence.values()].some(p => p.groupId === other && p.online))
        && (!f.favorites_only || store.favoriteGroups.get(id)?.has(other))
        && (!f.travel_modes.length || f.travel_modes.includes(otherCrew.travel_mode));
      if (name === 'count_public_groups') {
        (store.countRequests ??= []).push(f.name);
        if (store.failGroupCount) return respond({ code: '503' }, 503);
        const delay = store.groupCountDelay?.(f) ?? 0;
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        const result = await respond(match ? 1 : 0);
        (store.countResponses ??= []).push(f.name);
        return result;
      }
      return respond({ items: match ? [info()] : [], has_more: false, cursor: null });
    }
    if (name === 'get_public_group') {
      if (store.failGroupDetail) return respond({ code: '503' }, 503);
      if (target !== other || store.blocks.has(me) || store.blocks.has(other)) return respond(null);
      return respond(info());
    }
    if (name === 'get_my_group_visibility') return respond(store.publicProfiles.get(me) ?? { discoverable: true, about: '' });
    if (name === 'save_my_group_visibility') {
      if (store.failVisibilitySave) return respond({ code: '503' }, 503);
      const saved = { discoverable: body.is_discoverable, about: body.about_text }; store.publicProfiles.set(me, saved); return respond(saved);
    }
    if (name === 'report_profile') return respond('00000000-0000-4000-8000-000000000991');
    if (name === 'send_profile_invitation') {
      if (store.failInvitation === true) return respond({ code: '503' }, 503);
      let saved = store.invitations.find(i => i.request_key === body.request_key && i.sender_group_id === me);
      if (!saved) {
        saved = { id: `00000000-0000-4000-8000-${String(store.next++).padStart(12, '0')}`, sender_group_id: me, recipient_group_id: target,
          context_kind: 'profile', trip_id: null, source_trip_id: null, trip_reference: null, trip_snapshot: null, source_trip_snapshot: null,
          request_key: body.request_key, status: 'pending', text: body.message_text, created_at: new Date().toISOString() };
        store.invitations.push(saved);
      }
      if (store.failInvitation === 'after-commit') return respond({ code: '503' }, 503);
      return respond(saved.id);
    }
  });
}

test('crew numbers identify profiles and conversations and support exact live-count search', async ({ page, context }) => {
  test.setTimeout(90000);
  const store = state(), invitation = '00000000-0000-4000-8000-000000009101', chat = '00000000-0000-4000-8000-000000009102';
  store.invitations.push({ id: invitation, sender_group_id: groupId(A), recipient_group_id: groupId(B), context_kind: 'profile',
    trip_id: null, trip_reference: null, source_trip_id: null, trip_snapshot: null, source_trip_snapshot: null,
    text: 'Poznajmy się!', status: 'accepted', created_at: '2026-10-24T10:00:00Z' });
  store.conversations.push({ id: chat, invitation_id: invitation, sender_group_id: groupId(A), recipient_group_id: groupId(B), updated_at: '2026-10-24T10:00:00Z' });
  await groupBackend(context, store); await login(page);
  await page.goto('/profile'); await expect(page.getByTestId('crew-number-' + groupId(A))).toHaveText('Ekipa #104827');
  await page.goto('/explore'); await page.getByRole('tab', { name: 'Ekipy', exact: true }).click();
  const card = page.getByTestId('public-group-' + groupId(B));
  await expect(card).toContainText('Ekipa #104828');
  await page.setViewportSize({ width: 320, height: 844 });
  await card.screenshot({ path: '.expo/crew-number-card-small.png' });
  await page.getByRole('button', { name: 'Filtry ekip', exact: true }).click();
  const query = page.getByRole('textbox', { name: 'Szukaj po nazwie lub numerze ekipy', exact: true });
  await query.fill('#104828'); await expect(page.getByRole('button', { name: 'Pokaż wyniki · 1', exact: true })).toBeVisible();
  await query.fill('#104827'); await expect(page.getByRole('button', { name: 'Pokaż wyniki · 0', exact: true })).toBeVisible();
  await query.fill('104828'); await page.getByRole('button', { name: 'Pokaż wyniki · 1', exact: true }).click();
  await expect(card).toBeVisible(); await card.click(); await expect(page).toHaveURL('http://localhost:8085/crew/' + groupId(B));
  await expect(page.locator('[data-testid="crew-number-' + groupId(B) + '"]:visible')).toHaveText('Ekipa #104828');
  await page.goto('/chat/' + chat); await expect(page.getByTestId('chat-screen')).toContainText('Ekipa #104828');
  await page.getByRole('button', { name: 'Opcje bezpieczeństwa rozmowy', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Ekipa #104828');
  await page.getByRole('dialog').screenshot({ path: '.expo/crew-number-chat-small.png' });
});

test('online avatar dots follow another account, backgrounding, reconnection and logout', async ({ page, context, browser }) => {
  const store = state(); await groupBackend(context, store);
  const second = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await groupBackend(second, store);
    const b = await second.newPage(); await login(b, 'b@example.com');
    await b.getByRole('tab', { name: 'Profil', exact: true }).click();
    await expect(b.getByTestId('profile-identity-avatar-online')).toBeVisible();
    await login(page); await page.goto('/explore');
    await page.getByRole('tab', { name: 'Ekipy', exact: true }).click();
    const dot = page.getByTestId('group-avatar-' + groupId(B) + '-online');
    const offlineDot = page.getByTestId('group-avatar-' + groupId(B) + '-offline');
    await expect(dot).toBeVisible();
    await page.screenshot({ path: '.expo/presence-directory.png', fullPage: true });
    const visibility = async value => b.evaluate(value => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value });
      document.dispatchEvent(new Event('visibilitychange'));
    }, value);
    await visibility('hidden');
    await expect.poll(() => [...store.presence.values()].filter(p => p.groupId === groupId(B) && p.online).length).toBe(0);
    await page.clock.install(); await page.clock.fastForward(15_000);
    await expect(dot).toHaveCount(0);
    await expect(offlineDot).toBeVisible();
    await expect(offlineDot).toHaveCSS('background-color', 'rgb(156, 163, 175)');
    await visibility('visible');
    await expect(b.getByTestId('profile-identity-avatar-online')).toBeVisible();
    await page.clock.fastForward(15_000); await expect(dot).toBeVisible();
    await expect(offlineDot).toHaveCount(0);
    await page.getByTestId('public-group-' + groupId(B)).click();
    await expect(page.getByLabel(/Awatar:.*Online/)).toBeVisible();
    await b.getByRole('button', { name: 'Ustawienia aplikacji', exact: true }).click();
    await b.getByRole('button', { name: 'Wyloguj się', exact: true }).click();
    await expect(b).toHaveURL('http://localhost:8085/welcome');
    await page.clock.fastForward(15_000); await expect(dot).toHaveCount(0);
    await expect(page.getByTestId('group-profile-card').getByTestId('group-avatar-' + groupId(B) + '-offline')).toBeVisible();
    await expect(page.getByTestId('group-profile-card').getByText('Ekipa B', { exact: true })).toBeVisible();
  } finally { await second.close().catch(() => undefined); }
});

test('online-only crew filter counts all matches, updates results and resets to unfiltered', async ({ page, context }) => {
  const store = state(); await groupBackend(context, store); await login(page);
  await page.getByRole('tab', { name: 'Odkrywaj', exact: true }).click();
  await page.getByRole('tab', { name: 'Ekipy', exact: true }).click();
  const card = page.getByTestId('public-group-' + groupId(B));
  await expect(card).toBeVisible(); expect(store.lastGroupFilters.online_only).toBe(false);
  await page.getByRole('button', { name: 'Filtry ekip', exact: true }).click();
  const onlineSwitch = page.getByRole('switch', { name: 'Tylko online', exact: true });
  await expect(onlineSwitch).not.toBeChecked(); await onlineSwitch.click();
  await expect(page.getByRole('button', { name: 'Pokaż wyniki · 0', exact: true })).toBeVisible();
  await page.screenshot({ path: '.expo/online-group-filter.png', fullPage: true });
  await page.getByRole('button', { name: 'Pokaż wyniki · 0', exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Jeszcze nie ma tu ekip', exact: true })).toBeVisible();
  await page.clock.install();
  store.presence.set('other-session', { groupId: groupId(B), online: true });
  await page.clock.fastForward(15_000);
  await expect(card).toBeVisible(); expect(store.lastGroupFilters.online_only).toBe(true);
  await page.getByRole('button', { name: 'Filtry ekip', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pokaż wyniki · 1', exact: true })).toBeVisible();
  store.presence.get('other-session').online = false;
  await page.clock.fastForward(15_000);
  await expect(page.getByRole('button', { name: 'Pokaż wyniki · 0', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Wyczyść', exact: true }).click();
  await expect(onlineSwitch).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Pokaż wyniki · 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pokaż wyniki · 1', exact: true }).click();
  await expect(card).toBeVisible(); expect(store.lastGroupFilters.online_only).toBe(false);
});

test('crew hearts save only after confirmation, retry safely, sync devices and filter favorites', async ({ page, context, browser }) => {
  test.setTimeout(150000);
  const store = state(); await groupBackend(context, store); await login(page);
  await page.getByRole('tab', { name: 'Odkrywaj', exact: true }).click();
  await page.getByRole('tab', { name: 'Ekipy', exact: true }).click();
  const add = page.getByRole('button', { name: 'Dodaj ekipę do ulubionych', exact: true });
  const remove = page.getByRole('button', { name: 'Usuń ekipę z ulubionych', exact: true });
  await expect(add).toBeEnabled(); store.failFavoriteSave = 'after-commit'; await add.click();
  await expect(page.getByRole('dialog', { name: 'Ulubione', exact: true })).toBeVisible();
  expect(store.favoriteGroups.get(A).has(groupId(B))).toBe(true);
  await page.clock.install(); await page.clock.fastForward(30000);
  await expect(page.getByTestId('favorite-group-' + groupId(B))).toHaveAttribute('aria-label', 'Usuń ekipę z ulubionych');
  store.failFavoriteSave = false; await page.getByRole('button', { name: 'Spróbuj ponownie', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Ulubione', exact: true })).toHaveCount(0);
  expect(store.favoriteGroups.get(A).has(groupId(B))).toBe(true);
  await expect(remove).toBeVisible(); await expect(page).toHaveURL('http://localhost:8085/explore');
  await page.getByTestId('public-group-' + groupId(B)).click();
  await expect(page.getByRole('button', { name: 'Usuń ekipę z ulubionych', exact: true })).toBeVisible();
  await page.screenshot({ path: '.expo/favorite-crew-profile.png', fullPage: true });
  await page.getByRole('button', { name: 'Wróć', exact: true }).click();
  await page.getByRole('button', { name: 'Filtry ekip', exact: true }).click();
  await page.getByRole('switch', { name: 'Tylko ulubione', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pokaż wyniki · 1', exact: true })).toBeVisible();
  await page.getByRole('switch', { name: 'Tylko online', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pokaż wyniki · 0', exact: true })).toBeVisible();
  await page.getByRole('switch', { name: 'Tylko online', exact: true }).click();
  await page.getByRole('button', { name: 'Pokaż wyniki · 1', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 800 });
  await page.screenshot({ path: '.expo/favorite-groups.png', fullPage: true });
  expect(store.lastGroupFilters.favorites_only).toBe(true);
  const second = await browser.newContext();
  try {
    await groupBackend(second, store); const other = await second.newPage(); await login(other);
    await other.getByRole('tab', { name: 'Odkrywaj', exact: true }).click(); await other.getByRole('tab', { name: 'Ekipy', exact: true }).click();
    await other.getByRole('button', { name: 'Usuń ekipę z ulubionych', exact: true }).click();
    await expect(other.getByRole('button', { name: 'Dodaj ekipę do ulubionych', exact: true })).toBeVisible();
    await page.clock.fastForward(30000);
    await expect(page.getByTestId('public-group-' + groupId(B))).toHaveCount(0);
    await other.getByRole('tab', { name: 'Profil', exact: true }).click();
    await other.getByRole('button', { name: 'Ustawienia aplikacji', exact: true }).click();
    await other.getByRole('button', { name: 'Wyloguj się', exact: true }).click();
    await login(other, 'b@example.com');
    await other.getByRole('tab', { name: 'Odkrywaj', exact: true }).click(); await other.getByRole('tab', { name: 'Ekipy', exact: true }).click();
    await expect(other.getByRole('button', { name: 'Dodaj ekipę do ulubionych', exact: true })).toBeVisible();
  } finally { await second.close(); }
});

test('directory → profile without trips → invitation retry → accepted chat on two accounts', async ({ page, context, browser }) => {
  test.setTimeout(150000);
  const store = state(); await groupBackend(context, store);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const other = await browser.newContext({ baseURL: 'http://localhost:8085', viewport: { width: 360, height: 800 } });
  try {
    await login(page); await page.goto('/explore'); await page.getByRole('tab', { name: 'Ekipy', exact: true }).click();
    const card = page.getByTestId('public-group-' + groupId(B));
    await expect(card).toBeVisible(); expect(store.lastGroupFilters.group_kinds).toEqual([]);
    await expect(page.getByRole('button', { name: 'Wyczyść filtry ekip', exact: true })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Szukaj po nazwie lub numerze ekipy', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Filtry ekip', exact: true }).click();
    await page.getByRole('textbox', { name: 'Szukaj po nazwie lub numerze ekipy', exact: true }).fill('Nie zapisuj');
    await page.getByRole('button', { name: 'Zamknij filtry bez zmian', exact: true }).click();
    await expect(card).toBeVisible(); expect(store.lastGroupFilters.name).toBe('');
    await page.getByRole('button', { name: 'Filtry ekip', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Szukaj po nazwie lub numerze ekipy', exact: true })).toHaveValue('');
    await page.getByRole('textbox', { name: 'Szukaj po nazwie lub numerze ekipy', exact: true }).fill('Nieistniejąca');
    await expect(page.getByRole('button', { name: 'Pokaż wyniki · 0', exact: true })).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: '.expo/groups-filters-mobile.png', fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: /^Pokaż wyniki/ }).click();
    await expect(page.getByText('Jeszcze nie ma tu ekip', { exact: true })).toBeVisible();
    expect(store.lastGroupFilters.name).toBe('Nieistniejąca');
    await page.getByRole('button', { name: 'Filtry ekip', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Szukaj po nazwie lub numerze ekipy', exact: true })).toHaveValue('Nieistniejąca');
    await page.getByRole('button', { name: 'Wyczyść', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Szukaj po nazwie lub numerze ekipy', exact: true })).toHaveValue('');
    await page.getByRole('button', { name: /^Pokaż wyniki/ }).click(); await expect(card).toBeVisible();
    await page.getByRole('button', { name: 'Filtry ekip', exact: true }).click();
    await page.getByRole('textbox', { name: 'Szukaj po nazwie lub numerze ekipy', exact: true }).fill('Nieistniejąca');
    await page.getByRole('button', { name: /^Pokaż wyniki/ }).click();
    await expect(page.getByText('Jeszcze nie ma tu ekip', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Pokaż wszystkie ekipy', exact: true }).click(); await expect(card).toBeVisible();
    await page.getByRole('button', { name: 'Filtry ekip', exact: true }).click();
    await page.getByRole('switch', { name: 'Tylko z aktywnymi ogłoszeniami', exact: true }).click();
    await page.getByRole('button', { name: /^Pokaż wyniki/ }).click();
    await expect(page.getByText('Jeszcze nie ma tu ekip', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Pokaż wszystkie ekipy', exact: true }).click();
    await card.click(); await expect(page).toHaveURL('http://localhost:8085/crew/' + groupId(B));
    await expect(page.getByText(/Ta ekipa nie ma teraz aktywnych ogłoszeń/)).toBeVisible();
    await page.getByRole('button', { name: 'Zaproś do kontaktu', exact: true }).click();
    await page.getByRole('textbox', { name: 'Treść zaproszenia', exact: true }).fill('Cześć, wspólnie wymyślimy wyjazd?');
    store.failInvitation = 'after-commit';
    await page.getByRole('button', { name: 'Wyślij zaproszenie', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Nie udało się połączyć'); expect(store.invitations.length).toBe(1);
    store.failInvitation = false;
    await page.getByRole('button', { name: 'Wyślij zaproszenie', exact: true }).click();
    await expect(page).toHaveURL('http://localhost:8085/messages');
    await expect(page.getByText('Kontakt z profilu · zobacz ekipę', { exact: true })).toBeVisible();
    expect(store.invitations[0].trip_id).toBeNull(); expect(store.invitations.length).toBe(1);
    await groupBackend(other, store); const b = await other.newPage(); b.on('pageerror', e => errors.push(e.message));
    await login(b, 'b@example.com'); await b.goto('/messages'); await b.getByRole('tab', { name: /^Zaproszenia/ }).click();
    await b.getByRole('button', { name: 'Akceptuj', exact: true }).click();
    await b.getByRole('button', { name: /^Ekipa A,/ }).click();
    await expect(b.getByTestId('chat-screen')).toContainText('Kontakt z profilu');
    await expect(b.getByTestId('chat-screen')).toContainText('Cześć, wspólnie wymyślimy wyjazd?');
    await b.getByRole('textbox', { name: 'Treść wiadomości', exact: true }).fill('Jasne, jedziemy nad jezioro!');
    await b.getByRole('button', { name: 'Wyślij wiadomość', exact: true }).click();
    await page.reload(); await page.getByRole('tab', { name: /^Rozmowy/ }).click();
    await page.getByRole('button', { name: /^Ekipa B,/ }).click();
    await expect(page.getByTestId('chat-screen')).toContainText('Jasne, jedziemy nad jezioro!');
    await page.getByRole('button', { name: 'Zobacz profil: Ekipa B', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Przejdź do rozmowy', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Zaproś do kontaktu', exact: true }).count().then(n => expect(n).toBe(0));
    expect(errors).toEqual([]);
  } finally { await other.close(); }
});

test('live profile counts follow draft filters, ignore stale replies and recover from failures', async ({ page, context }) => {
  const store = state(); await groupBackend(context, store); await login(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/explore'); await page.getByRole('tab', { name: 'Ekipy', exact: true }).click();
  await page.getByRole('button', { name: 'Filtry ekip', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pokaż wyniki · 1', exact: true })).toBeVisible();
  const name = page.getByRole('textbox', { name: 'Szukaj po nazwie lub numerze ekipy', exact: true });
  store.groupCountDelay = filters => filters.name === 'Brak' ? 800 : 0;
  await name.fill('Brak');
  await expect(page.getByRole('button', { name: 'Pokaż wyniki · …', exact: true })).toBeVisible();
  await expect.poll(() => store.countRequests ?? []).toContain('Brak');
  await name.fill('Ekipa B');
  await expect(page.getByRole('button', { name: 'Pokaż wyniki · 1', exact: true })).toBeVisible();
  await expect.poll(() => store.countResponses ?? []).toContain('Brak');
  await expect(page.getByRole('button', { name: 'Pokaż wyniki · 1', exact: true })).toBeVisible();
  expect(store.lastGroupFilters.name).toBe('');
  await page.getByRole('switch', { name: 'Tylko z aktywnymi ogłoszeniami', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pokaż wyniki · 0', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Wyczyść', exact: true }).click();
  await expect(name).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Pokaż wyniki · 1', exact: true })).toBeVisible();
  store.failGroupCount = true;
  await name.fill('Nieistniejąca');
  await expect(page.getByRole('alert')).toContainText('Nie udało się sprawdzić liczby profili.');
  await expect(page.getByRole('button', { name: 'Pokaż wyniki', exact: true })).toBeVisible();
  store.failGroupCount = false;
  await page.getByRole('button', { name: 'Policz profile ponownie', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pokaż wyniki · 0', exact: true })).toBeInViewport({ ratio: 1 });
  await page.getByRole('button', { name: 'Pokaż wyniki · 0', exact: true }).click();
  await expect(page.getByText('Jeszcze nie ma tu ekip', { exact: true })).toBeVisible();
  expect(store.lastGroupFilters.name).toBe('Nieistniejąca');
});

test('public profile settings save only after backend confirmation and survive reload', async ({ page, context }) => {
  const store = state(); await groupBackend(context, store); await login(page);
  await page.goto('/profile'); await page.getByRole('button', { name: 'Edytuj: Profil publiczny', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Pokaż moją ekipę w wyszukiwarce' })).toBeChecked();
  await page.getByRole('textbox', { name: 'O mojej ekipie', exact: true }).fill('Kamper, książki i leśne ścieżki.');
  await page.getByRole('switch', { name: 'Pokaż moją ekipę w wyszukiwarce' }).click();
  store.failVisibilitySave = true;
  await page.getByRole('button', { name: 'Zapisz widoczność profilu', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Nie udało się zapisać');
  expect(store.publicProfiles.has(groupId(A))).toBe(false);
  store.failVisibilitySave = false;
  await page.getByRole('button', { name: 'Zapisz widoczność profilu', exact: true }).click();
  await expect(page).toHaveURL('http://localhost:8085/profile');
  const ownProfile = page.getByTestId('group-profile-card');
  await expect(ownProfile).toContainText('Kamper, książki i leśne ścieżki.');
  await expect(ownProfile).toContainText('Ekipa A');
  await expect(ownProfile).toContainText('Dzieci 4–6 lat');
  await expect(ownProfile).toContainText('Rowery');
  await page.goto('/group-visibility'); await expect(page.getByRole('textbox', { name: 'O mojej ekipie', exact: true })).toHaveValue('Kamper, książki i leśne ścieżki.');
  await expect(page.getByRole('switch', { name: 'Pokaż moją ekipę w wyszukiwarce' })).not.toBeChecked();
});

test('unavailable migration and failed requests are retryable and distinct from empty results', async ({ page, context }) => {
  const store = state(); store.failGroups = true; store.missingGroups = true;
  await groupBackend(context, store); await login(page); await page.goto('/explore');
  await page.getByRole('tab', { name: 'Ekipy', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('wymaga nowej migracji');
  await expect(page.getByText('Jeszcze nie ma tu ekip', { exact: true })).toHaveCount(0);
  store.failGroups = false;
  await page.getByRole('button', { name: 'Spróbuj ponownie', exact: true }).click();
  await expect(page.getByTestId('public-group-' + groupId(B))).toBeVisible();
  store.failGroupDetail = true; await page.getByTestId('public-group-' + groupId(B)).click();
  await expect(page.getByRole('alert')).toContainText('Nie udało się pobrać ekip');
  store.failGroupDetail = false; await page.getByRole('button', { name: 'Spróbuj ponownie', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Zaproś do kontaktu', exact: true })).toBeVisible();
});

test('profile scores, explanations, sort selection and incomplete data are clear on mobile', async ({ page, context }) => {
  const store = state(); await groupBackend(context, store); await login(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/explore'); await page.getByRole('tab', { name: 'Ekipy', exact: true }).click();
  const card = page.getByTestId('public-group-' + groupId(B));
  await expect(card).toContainText('100% zgodności profili'); await expect(card).toContainText('Pasujący wiek dzieci');
  await page.getByLabel('100% zgodności profili', { exact: true }).screenshot({ path: '.expo/compatibility-100.png' });
  await page.screenshot({ path: '.expo/groups-discovery-controls-small.png', fullPage: true });
  expect(store.lastGroupSort).toBe('compatibility');
  await page.getByRole('button', { name: 'Sortowanie ekip: Najwyższa zgodność', exact: true }).click();
  await page.getByRole('radio', { name: 'Alfabetycznie', exact: true }).click();
  await expect(card).toBeVisible(); expect(store.lastGroupSort).toBe('alphabetical');
  await card.click();
  await expect(page.getByTestId('profile-group-compatibility')).toContainText('100% zgodności profili');
  await expect(page.getByTestId('profile-group-compatibility')).toContainText('preferencje obu ekip');
  store.groupMatch = { score: 0, reasons: [], limited_data: false, evaluated_weight: 100 };
  await page.reload(); await expect(page.getByTestId('profile-group-compatibility')).toContainText('0% zgodności profili');
  await page.getByLabel('0% zgodności profili', { exact: true }).screenshot({ path: '.expo/compatibility-0.png' });
  store.groupMatch = { score: null, reasons: ['Podobny sposób podróżowania'], limited_data: true, evaluated_weight: 10 };
  await page.reload(); await expect(page.getByTestId('profile-group-compatibility')).toContainText('Za mało danych do oceny');
  await expect(page.getByTestId('profile-group-compatibility').getByText(/% zgodności profili/)).toHaveCount(0);
  store.groupMatch = { score: 85, reasons: ['Rowery'], limited_data: true, evaluated_weight: 70 };
  await page.reload(); await expect(page.getByTestId('profile-group-compatibility')).toContainText('85% zgodności profili');
  await expect(page.getByTestId('profile-group-compatibility')).toContainText('Ograniczone dane');
  store.groupMatch = { score: 41, reasons: ['Rowery'], limited_data: false, evaluated_weight: 100 };
  await page.reload(); await expect(page.getByTestId('profile-group-compatibility')).toContainText('41% zgodności profili');
  await page.getByLabel('41% zgodności profili', { exact: true }).screenshot({ path: '.expo/compatibility-41.png' });
  await page.screenshot({ path: '.expo/compatibility-profile-small.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
