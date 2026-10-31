import { test, expect } from '@playwright/test';
import { A, groupId, state, backend, login } from './trip-fixtures.mjs';
import { expectLoaded, scrollToRow } from './collection-helpers.mjs';

function seed(store, archived) {
  return Array.from({ length: 13 }, (_, index) => {
    const trip = {
      id: '00000000-0000-4000-8000-' + String((archived ? 82000 : 81000) + index).padStart(12, '0'),
      group_id: groupId(A), adult_count:2,child_count:1,child_age_bands:['4–6'],mode:'planned',
      status: archived ? index % 2 ? 'cancelled' : 'completed' : 'published',
      visibility: 'public', start_date: archived ? '2026-05-21' : '2099-05-21',
      end_date: archived ? '2026-05-24' : '2099-05-24',
      location_id: 'pl-locality:4259', location_name: 'Chłapowo', location_region: 'Pomorskie', location_kind: 'village',
      campground_name: '', campground_address: '', travel_mode: 'Kamper',
      description: `${archived ? 'Wspomnienie' : 'Plan'} numer ${index}. ${index >= 11 ? 'Wąski wybór' : 'Spokojny odpoczynek'} nad morzem.`,
      landscape: 'coast', interests: ['Rowery'], animal_kinds: [], matching_group_kinds: [], matching_child_age_bands: [],
      published_at: '2026-05-01T10:00:00Z',
    };
    store.trips.set(trip.id, trip);
    return trip;
  });
}

async function reachEnd(screen) {
  await screen.evaluate(el => { el.scrollTop = el.scrollHeight; });
}

for (const archived of [false, true]) {
  test(`${archived ? 'archived' : 'active'} own listings load 5+5+3 only on click, show progress, retain the detail position and filter the full result set`, async ({page, context}) => {
    test.setTimeout(120000);
    const store = state();
    const active = seed(store, false), past = seed(store, true);
    const trips = archived ? past : active;
    await backend(context, store); await login(page); await page.goto('/trips');
    const screen = page.getByTestId('own-trips-screen');
    await expectLoaded(screen, 5);
    if (archived) {
      await page.getByRole('tab', {name: 'Archiwum, 13', exact: true}).click();
      await expectLoaded(screen, 5);
    }
    await expect(page.getByRole('tab', {name: 'Aktywne, 13', exact: true})).toBeVisible();
    await expect(page.getByRole('tab', {name: 'Archiwum, 13', exact: true})).toBeVisible();
    expect(store.ownTripPageCalls.every(call => call.page_size === 5)).toBe(true);

    let release;
    const pending = new Promise(resolve => { release = resolve; });
    await page.route('**/rest/v1/rpc/list_my_trip_page', async route => {
      const body = route.request().postDataJSON();
      if (body?.after_cursor && body.archived === archived) await pending;
      await route.fallback();
    });
    const moreButton = screen.getByRole('button', {name: 'Pokaż więcej wyjazdów', exact: true});
    await scrollToRow(screen, moreButton);
    await reachEnd(screen);
    await expectLoaded(screen, 5);
    expect(store.ownTripPageCalls.filter(call => call.after_cursor)).toHaveLength(0);
    await moreButton.click();
    const loading = screen.getByRole('button', {name: 'Wczytywanie ogłoszeń', exact: true});
    await expect(loading).toBeVisible();
    await expect(loading).toBeDisabled();
    await expect(loading.getByLabel('Wczytywanie kolejnych ogłoszeń', {exact: true})).toBeVisible();
    release();
    await expectLoaded(screen, 10);
    await scrollToRow(screen, moreButton);
    expect(store.ownTripPageCalls.filter(call => call.after_cursor)).toHaveLength(1);
    await moreButton.click(); await expectLoaded(screen, 13);
    await expect(screen.getByText('Wczytywanie ogłoszeń', {exact: true})).toHaveCount(0);
    await expect(moreButton).toHaveCount(0);
    const more = store.ownTripPageCalls.filter(call => call.archived === archived && call.after_cursor);
    expect(more.map(call => call.after_cursor.id)).toEqual([trips[4].id, trips[9].id]);

    const target = screen.getByTestId('own-trip-' + trips[7].id);
    const details = target.getByRole('button', {name: /^Szczegóły wyjazdu:/});
    await scrollToRow(screen, details);
    const offset = await screen.evaluate(el => el.scrollTop);
    await details.click();
    await expect(page).toHaveURL('http://localhost:8085/trips/' + trips[7].id);
    await page.getByRole('button', {name: 'Wróć do wyjazdów', exact: true}).click();
    await expectLoaded(screen, 13);
    await expect.poll(async () => Math.abs((await screen.evaluate(el => el.scrollTop)) - offset)).toBeLessThan(4);

    await page.getByRole('button', {name: 'Filtruj moje wyjazdy', exact: true}).click();
    await page.getByRole('textbox', {name: 'Opis, miejscowość lub region', exact: true}).fill('Wąski wybór');
    await page.getByRole('button', {name: 'Pokaż wyjazdy', exact: true}).click();
    await expectLoaded(screen, 2);
    await expect(screen.getByText(/2 wyników/)).toBeVisible();
    await expect(screen.getByTestId('own-trip-' + trips[11].id)).toBeAttached();
    await expect(page.getByRole('tab', {name: 'Aktywne, 13', exact: true})).toBeVisible();
    await expect(page.getByRole('tab', {name: 'Archiwum, 13', exact: true})).toBeVisible();
    await page.getByRole('button', {name: 'Wyczyść filtry wyjazdów', exact: true}).click();
    await expectLoaded(screen, 5);
    await page.getByRole('tab', {name: archived ? 'Aktywne, 13' : 'Archiwum, 13', exact: true}).click();
    await expectLoaded(screen, 5);
  });
}

test('failed own-listing pages retain cards and wait for an explicit retry', async ({page, context}) => {
  const store = state(); seed(store, false);
  await backend(context, store); await login(page); await page.goto('/trips');
  const screen = page.getByTestId('own-trips-screen');
  await expectLoaded(screen, 5);
  let fail = true, failedRequests = 0;
  await page.route('**/rest/v1/rpc/list_my_trip_page', async route => {
    if (fail && route.request().postDataJSON()?.after_cursor) {
      failedRequests++;
      return route.fulfill({status: 503, json: {message: 'Offline'}, headers: {'access-control-allow-origin': 'http://localhost:8085'}});
    }
    return route.fallback();
  });
  const more = screen.getByRole('button', {name: 'Pokaż więcej wyjazdów', exact: true});
  await scrollToRow(screen, more); await reachEnd(screen);
  expect(failedRequests).toBe(0);
  await more.click();
  await expect(screen.getByRole('alert')).toContainText('Nie udało się pobrać wyjazdów');
  await expectLoaded(screen, 5);
  const attempts = failedRequests;
  await screen.evaluate(async el => {
    el.scrollTop = 0; await new Promise(requestAnimationFrame);
    el.scrollTop = el.scrollHeight; await new Promise(requestAnimationFrame);
  });
  expect(failedRequests).toBe(attempts);
  fail = false;
  await screen.getByRole('button', {name: 'Spróbuj ponownie', exact: true}).click();
  await expectLoaded(screen, 10);
  await expect(screen.getByRole('alert')).toHaveCount(0);
});
