import { recommendCrew, recommendTrip } from './trip-fixtures.mjs';
import { test, expect } from '@playwright/test';
import {
  B,
  groupId,
  profile,
  state,
  backend,
  login,
} from './trip-fixtures.mjs';
import { expectLoaded, scrollToRow } from './collection-helpers.mjs';

const uuid = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

test('crew listings fetch 5/10/13 with a spinner, retry and restore the listing and scroll on return', async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  const store = state(),
    trips = Array.from({ length: 13 }, (_, i) => ({
      id: uuid(8700 + i),
      group_id: groupId(B),
      adult_count:2,child_count:1,child_age_bands:['4–6'],mode:'planned',
      status: 'published',
      visibility: 'public',
      start_date: '2099-05-21',
      end_date: '2099-05-24',
      location_id: 'pl-locality:4259',
      location_name: 'Chłapowo',
      location_region: 'pomorskie',
      location_kind: 'village',
      campground_name: 'Pod Wydmami',
      campground_address: '',
      travel_mode: 'Kamper',
      description:
        'Wyjazd numer ' + i + ' nad morze, rowery i wspólne ogniska.',
      landscape: 'coast',
      interests: ['Rowery'],
      animal_kinds: [],
      matching_group_kinds: [],
      matching_child_age_bands: [],
      published_at: '2026-10-26T10:00:00Z',
    }));
  for (const trip of trips) store.trips.set(trip.id, trip);
  await backend(context, store);
  const calls = [];
  let failFirst = true,
    failMore = true,
    unavailable = false,
    release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/rest/v1/rpc/get_public_group_v2', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fallback();
    const body = route.request().postDataJSON();
    calls.push(body);
    const respond = (json, status = 200) =>
      route.fulfill({
        json,
        status,
        headers: { 'access-control-allow-origin': 'http://localhost:8085' },
      });
    if (failFirst) return respond({ message: 'Offline' }, 503);
    if (body.after_cursor) {
      await pending;
      if (failMore) return respond({ message: 'Offline' }, 503);
    }
    if (unavailable) return respond(null);
    const offset = body.after_cursor
      ? trips.findIndex((trip) => trip.id === body.after_cursor.id) + 1
      : 0;
    const items = trips.slice(offset, offset + body.page_size),
      last = items.at(-1);
    return respond({
      crew: profile(B).group,
      recommendation: recommendCrew(profile(B).group),
      about: 'Wspólne wyjazdy bez pośpiechu.',
      active_trip_count: 13,
      trips: items.map((trip) => ({ trip, crew: profile(B).group, recommendation: recommendTrip(trip, profile(B).group, store) })),
      has_more: offset + items.length < trips.length,
      cursor: last
        ? {
            id: last.id,
            published_at: last.published_at,
            query_key: 'mock-crew',
          }
        : null,
    });
  });
  await login(page);
  await page.goto('/crew/' + groupId(B));
  const screen = page.getByTestId('crew-profile-screen'),
    cards = screen.locator('[data-testid^="discovery-trip-"]');
  await expect(screen.getByRole('alert')).toContainText(
    'Nie udało się pobrać ekip',
  );
  await expect(cards).toHaveCount(0);
  await expect(screen.getByText(/Ta ekipa nie ma teraz/)).toHaveCount(0);
  failFirst = false;
  await screen
    .getByRole('button', { name: 'Spróbuj ponownie', exact: true })
    .click();
  await expect(cards).toHaveCount(5);
  await expect(
    screen.getByRole('heading', { name: 'Ogłoszenia ekipy · 13', exact: true }),
  ).toBeVisible();
  await screen
    .getByRole('button', { name: 'Pokaż więcej wyjazdów', exact: true })
    .click();
  const loading = screen.getByRole('button', {
    name: 'Wczytywanie ogłoszeń',
    exact: true,
  });
  await expect(loading).toBeDisabled();
  await expect(
    loading.getByLabel('Wczytywanie kolejnych ogłoszeń', { exact: true }),
  ).toBeVisible();
  await expect(cards).toHaveCount(5);
  release();
  await expect(screen.getByRole('alert')).toContainText(
    'Nie udało się pobrać ogłoszeń',
  );
  await expect(cards).toHaveCount(5);
  failMore = false;
  await screen
    .getByRole('button', { name: 'Spróbuj ponownie', exact: true })
    .click();
  await expectLoaded(screen, 10);
  expect(calls.at(-1).after_cursor).toEqual(calls.at(-2).after_cursor);
  const target = screen.getByTestId('discovery-trip-' + trips[8].id),
    button = target.getByRole('button', { name: 'Zobacz wyjazd', exact: true });
  await scrollToRow(screen, button);
  const scroll = await screen.evaluate((el) => el.scrollTop);
  expect(scroll).toBeGreaterThan(1000);
  const before = calls.length;
  await button.click();
  await expect(page).toHaveURL('http://localhost:8085/trip/' + trips[8].id);
  await page
    .getByRole('button', { name: 'Wróć do listy wyjazdów', exact: true })
    .click();
  await expect(page).toHaveURL('http://localhost:8085/crew/' + groupId(B));
  await expectLoaded(screen, 10);
  await expect.poll(() => calls.length).toBe(before + 1);
  await expect
    .poll(async () =>
      Math.abs((await screen.evaluate((el) => el.scrollTop)) - scroll),
    )
    .toBeLessThan(4);
  await expect(button).toBeInViewport();
  await screen
    .getByRole('button', { name: 'Pokaż więcej wyjazdów', exact: true })
    .click();
  await expectLoaded(screen, 13);
  await expect(
    screen.getByRole('button', { name: 'Pokaż więcej wyjazdów', exact: true }),
  ).toHaveCount(0);
  expect(calls.every((call) => call.page_size === 5)).toBe(true);
  await page.reload();
  await expect(cards).toHaveCount(5);
  unavailable = true;
  await screen
    .getByRole('button', { name: 'Pokaż więcej wyjazdów', exact: true })
    .click();
  await expect(cards).toHaveCount(0);
  await expect(
    screen.getByRole('heading', {
      name: 'Ten profil jest niedostępny',
      exact: true,
    }),
  ).toBeVisible();
});
