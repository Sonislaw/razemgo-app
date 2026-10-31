import { test, expect } from '@playwright/test';
import { A, B, groupId, state, backend, login } from './trip-fixtures.mjs';

test('trip favorites survive restart, match the filter count and stay independent from crew favorites', async ({
  page,
  context,
}) => {
  const store = state(),
    tripId = '00000000-0000-4000-8000-000000000811';
  store.trips.set(tripId, {
    id: tripId,
    group_id: groupId(B),
    adult_count:2,child_count:1,child_age_bands:['4–6'],mode:'planned',
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
    description: 'Plaża, rowery i kawa z widokiem na morze.',
    landscape: 'coast',
    interests: ['Rowery'],
    animal_kinds: [],
    matching_group_kinds: [],
    matching_child_age_bands: [],
    published_at: '2026-10-24T10:00:00Z',
    created_at: '2026-10-24T10:00:00Z',
    updated_at: '2026-10-24T10:00:00Z',
  });
  await backend(context, store);
  await login(page);
  const homeCard = page.getByTestId('home-latest-listing');
  await homeCard
    .getByRole('button', { name: 'Dodaj wyjazd do ulubionych', exact: true })
    .click();
  await expect(
    homeCard.getByRole('button', {
      name: 'Usuń wyjazd z ulubionych',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page).toHaveURL('http://localhost:8085/');
  await homeCard.screenshot({ path: '.expo/favorite-home.png' });
  await page.getByRole('tab', { name: 'Odkrywaj', exact: true }).click();
  const card = page.getByTestId('discovery-trip-' + tripId);
  await expect(card).toBeVisible();
  await expect(
    card.getByRole('button', { name: 'Usuń wyjazd z ulubionych', exact: true }),
  ).toBeVisible();
  expect(store.favoriteTrips.get(A).has(tripId)).toBe(true);
  expect(store.favoriteGroups.get(A)?.size ?? 0).toBe(0);
  await card
    .getByRole('button', { name: 'Zobacz wyjazd', exact: true })
    .click();
  await expect(page).toHaveURL('http://localhost:8085/trip/' + tripId + '?recommendationScope=search');
  await expect(
    page.getByRole('button', { name: 'Wróć do listy wyjazdów', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Usuń wyjazd z ulubionych', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Usuń wyjazd z ulubionych', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Wróć do listy wyjazdów', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Odkrywaj', exact: true }).click();
  await page
    .getByRole('button', { name: 'Otwórz filtry', exact: true })
    .click();
  await page
    .getByRole('switch', { name: 'Tylko ulubione', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Pokaż wyniki · 1', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Pokaż wyniki · 1', exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 800 });
  await card.screenshot({ path: '.expo/favorite-trip.png' });
  await card
    .getByRole('button', { name: 'Usuń wyjazd z ulubionych', exact: true })
    .click();
  await expect(card).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Wyczyść filtry', exact: true })
    .click();
  await expect(card).toBeVisible();
  await expect(
    card.getByRole('button', {
      name: 'Dodaj wyjazd do ulubionych',
      exact: true,
    }),
  ).toBeVisible();
});
