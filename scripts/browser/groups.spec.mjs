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
      const match = (store.publicProfiles.get(other)?.discoverable ?? true) && (!f.name || otherCrew.name.toLowerCase().includes(f.name.toLowerCase()))
        && (!f.group_kinds.length || f.group_kinds.includes(otherCrew.kind)) && !f.has_trips
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
    await expect(page.getByRole('textbox', { name: 'Szukaj po nazwie ekipy', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Filtry ekip', exact: true }).click();
    await page.getByRole('textbox', { name: 'Szukaj po nazwie ekipy', exact: true }).fill('Nie zapisuj');
    await page.getByRole('button', { name: 'Zamknij filtry bez zmian', exact: true }).click();
    await expect(card).toBeVisible(); expect(store.lastGroupFilters.name).toBe('');
    await page.getByRole('button', { name: 'Filtry ekip', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Szukaj po nazwie ekipy', exact: true })).toHaveValue('');
    await page.getByRole('textbox', { name: 'Szukaj po nazwie ekipy', exact: true }).fill('Nieistniejąca');
    await expect(page.getByRole('button', { name: 'Pokaż wyniki · 0', exact: true })).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: '.expo/groups-filters-mobile.png', fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: /^Pokaż wyniki/ }).click();
    await expect(page.getByText('Jeszcze nie ma tu ekip', { exact: true })).toBeVisible();
    expect(store.lastGroupFilters.name).toBe('Nieistniejąca');
    await page.getByRole('button', { name: 'Filtry ekip', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Szukaj po nazwie ekipy', exact: true })).toHaveValue('Nieistniejąca');
    await page.getByRole('button', { name: 'Wyczyść', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Szukaj po nazwie ekipy', exact: true })).toHaveValue('');
    await page.getByRole('button', { name: /^Pokaż wyniki/ }).click(); await expect(card).toBeVisible();
    await page.getByRole('button', { name: 'Filtry ekip', exact: true }).click();
    await page.getByRole('textbox', { name: 'Szukaj po nazwie ekipy', exact: true }).fill('Nieistniejąca');
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
  const name = page.getByRole('textbox', { name: 'Szukaj po nazwie ekipy', exact: true });
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
