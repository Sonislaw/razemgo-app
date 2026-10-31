import { test, expect } from '@playwright/test';
import { B, groupId, state, backend, login } from './trip-fixtures.mjs';

test('trip participants differ from the profile, survive reload and editing, and drive cards and filters', async ({ page, context, browser }) => {
  test.setTimeout(120000);
  const store = state(); await backend(context, store); await login(page);
  await page.goto('/trip-editor');
  await page.getByRole('button', { name: 'Wybierz zakres dat', exact: true }).click();
  await page.getByLabel(/^25 października 2026/).click(); await page.getByLabel(/^28 października 2026/).click();
  await page.getByRole('button', { name: 'Wybierz daty', exact: true }).click();
  await page.getByRole('button', { name: 'Dalej', exact: true }).click();
  await page.getByRole('textbox', { name: 'Miasto lub wieś', exact: true }).fill('Chłapowo pomorskie');
  await page.getByRole('button', { name: /^Wybierz lokalizację: Chłapowo,/ }).first().click();
  await page.getByRole('textbox', { name: 'Opis wyjazdu', exact: true }).fill('Wyjazd nad morze w większym gronie dorosłych.');
  await page.getByRole('button', { name: 'Więcej: Dorośli na wyjeździe', exact: true }).click();
  await page.getByRole('button', { name: 'Więcej: Dorośli na wyjeździe', exact: true }).click();
  await page.getByRole('button', { name: 'Mniej: Dzieci na wyjeździe', exact: true }).click();
  await expect(page.getByTestId('trip-editor-preview')).toContainText('4 dorosłych');
  await expect(page.getByTestId('trip-editor-preview')).not.toContainText('Dzieci 4–6');
  await page.getByRole('button', { name: 'Opublikuj wyjazd', exact: true }).click();
  await expect(page).toHaveURL('http://localhost:8085/trips');
  const trip = [...store.trips.values()][0];
  expect(trip.adult_count).toBe(4); expect(trip.child_count).toBe(0); expect(trip.child_age_bands).toEqual([]);
  await page.reload();
  await expect(page.getByTestId('own-trip-' + trip.id)).toContainText('4 dorosłych');
  const second = await browser.newContext({ baseURL: 'http://localhost:8085', viewport: { width: 390, height: 844 } });
  try {
    await backend(second, store); const other = await second.newPage(); await login(other, 'b@example.com');
    await other.goto('/explore');
    const listing = other.getByTestId('discovery-trip-' + trip.id);
    await expect(listing).toContainText('4 dorosłych');
    await expect(listing).not.toContainText(/Dzieci 4–6|Podobny wiek dzieci/);
    await listing.getByRole('button', { name: 'Zobacz wyjazd', exact: true }).click();
    await expect(other.getByTestId('trip-participants')).toContainText('4 dorosłych');
    await expect(other.getByTestId('trip-participants')).not.toContainText('dzieci');
    await page.goto('/trip-editor?id=' + trip.id);
    await page.getByRole('button', { name: 'Dalej', exact: true }).click();
    await page.getByRole('button', { name: 'Więcej: Dzieci na wyjeździe', exact: true }).click();
    await page.getByRole('button', { name: 'Zapisz zmiany', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Wybierz przedziały wieku dzieci');
    await page.getByRole('button', { name: 'Wiek dzieci na wyjeździe: 7–9 lat', exact: true }).click();
    await page.getByRole('button', { name: 'Zapisz zmiany', exact: true }).click();
    await expect(page).toHaveURL('http://localhost:8085/trips');
    expect(store.trips.get(trip.id).child_count).toBe(1);
    expect(store.trips.get(trip.id).child_age_bands).toEqual(['7–9']);
    await other.goto('/explore');
    await expect(listing).toContainText('Dzieci 7–9 lat');
    await expect(listing).not.toContainText('Dzieci 4–6');
    await other.getByRole('button', { name: 'Otwórz filtry', exact: true }).click();
    await other.getByRole('button', { name: 'Wiek dzieci: 4–6 lat', exact: true }).click();
    await other.getByRole('button', { name: /^Pokaż wyniki/ }).click();
    await expect(listing).toHaveCount(0);
    await page.goto('/profile');
    await expect(page.getByTestId('group-profile-card')).toContainText('2 dorosłych');
    await expect(page.getByTestId('group-profile-card')).toContainText('Dzieci 4–6 lat');
  } finally { await second.close(); }
});

test('legacy trips display an unknown composition instead of the owner profile', async ({ page, context }) => {
  const store = state();
  const trip = {
    id: '00000000-0000-4000-8000-000000077777', group_id: groupId(B), mode: 'planned', status: 'published', visibility: 'public',
    start_date: '2099-05-21', end_date: '2099-05-24', location_id: 'pl-locality:4259', location_name: 'Chłapowo', location_region: 'pomorskie',
    location_kind: 'village', campground_name: '', campground_address: '', travel_mode: 'Kamper',
    description: 'Starsze ogłoszenie z terminem, lecz bez zapisanego składu uczestników.', landscape: 'coast', interests: [], animal_kinds: [],
    matching_group_kinds: [], matching_child_age_bands: [], published_at: '2026-10-24T12:00:00Z',
    adult_count: null, child_count: null, child_age_bands: [],
  };
  store.trips.set(trip.id, trip); await backend(context, store); await login(page); await page.goto('/explore');
  const card = page.getByTestId('discovery-trip-' + trip.id);
  await expect(card).toContainText('Skład wyjazdu do uzupełnienia');
  await expect(card).not.toContainText(/2 dorosłych|Dzieci 4–6|Podobny wiek dzieci/);
  await card.getByRole('button', { name: 'Zobacz wyjazd', exact: true }).click();
  await expect(page.getByTestId('trip-participants')).toContainText('Skład wyjazdu do uzupełnienia');
});
