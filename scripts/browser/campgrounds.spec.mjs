import { test, expect } from '@playwright/test';
import { A, groupId, state, backend, login } from './trip-fixtures.mjs';
import { searchTripLocations } from '../../src/features/trips/trip-locations.ts';
import { openSuggestions, suggestionField } from './autocomplete-helpers.mjs';

const tripId = '00000000-0000-4000-8000-000000065432';
const button = (page, name) => page.getByRole('button', { name, exact: true });
const field = (page, name) => page.getByRole('textbox', { name, exact: true });
function seed() {
  const store = state();
  const location = searchTripLocations('Ustka', 'planned').find(item => item.name === 'Ustka');
  store.trips.set(tripId, {
    id: tripId, group_id: groupId(A), mode: 'planned', status: 'published', visibility: 'public',
    start_date: '2099-05-21', end_date: '2099-05-24',
    location_id: location.id, location_name: location.name, location_kind: location.kind, location_region: location.region,
    campground_name: '', campground_address: '', description: 'Wspólny wyjazd nad morze i spokojne wieczory na kempingu.',
    travel_mode: 'Kamper', landscape: 'coast', interests: [], animal_kinds: [],
    adult_count: 2, child_count: 1, child_age_bands: ['4–6'], matching_group_kinds: [], matching_child_age_bands: [],
    published_at: '2026-10-24T12:00:00Z',
  });
  return store;
}
async function edit(page) {
  await page.goto('/trip-editor?id=' + tripId);
  await button(page, 'Dalej').click();
}

for (const width of [320, 390]) test(`campground suggestions fill an editable address and preserve it on save at ${width}px`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 844 });
  const store = seed();
  await backend(context, store); await login(page); await edit(page);
  const search = await openSuggestions(page, 'Nazwa kempingu');
  await expect(search).toBeFocused();
  await search.fill('camping morski');
  await page.getByTestId('autocomplete-search-layer').screenshot({ path: `.expo/autocomplete-campground-${width}.png` });
  await page.getByRole('button', { name: /^Wybierz kemping: Camping Morski,/ }).click();
  await expect(suggestionField(page, 'Nazwa kempingu')).toContainText('Camping Morski');
  await expect(field(page, 'Adres kempingu')).toHaveValue('Armii Krajowej 4, 76-270 Ustka');
  await expect(page.getByTestId('campground-suggestions')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Źródło danych o kempingach: OpenStreetMap' })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
  await page.getByTestId('trip-editor-location').screenshot({ path: `.expo/campgrounds-${width}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await field(page, 'Adres kempingu').fill('Armii Krajowej 4, wjazd od strony lasu');
  store.failSave = true;
  await button(page, 'Zapisz zmiany').click();
  await expect(page.getByRole('alert')).toContainText('Nie udało się zapisać');
  await expect(field(page, 'Adres kempingu')).toHaveValue('Armii Krajowej 4, wjazd od strony lasu');
  store.failSave = false;
  await button(page, 'Zapisz zmiany').click();
  await expect(page).toHaveURL('http://localhost:8085/trips');
  expect(store.trips.get(tripId).campground_name).toBe('Camping Morski');
  expect(store.trips.get(tripId).campground_address).toBe('Armii Krajowej 4, wjazd od strony lasu');
  await edit(page);
  await expect(suggestionField(page, 'Nazwa kempingu')).toContainText('Camping Morski');
  await expect(field(page, 'Adres kempingu')).toHaveValue('Armii Krajowej 4, wjazd od strony lasu');
});

test('local suggestions work offline, missing addresses clear previous autofill and an unlisted name saves freely', async ({ page, context }) => {
  const store = seed();
  const osmRequests = [];
  page.on('request', request => { if (/overpass|nominatim/.test(request.url())) osmRequests.push(request.url()); });
  await backend(context, store); await login(page); await edit(page);
  await context.setOffline(true);
  try {
    await (await openSuggestions(page, 'Nazwa kempingu')).fill('camping morski');
    await page.getByRole('button', { name: /^Wybierz kemping: Camping Morski,/ }).click();
    await expect(field(page, 'Adres kempingu')).toHaveValue('Armii Krajowej 4, 76-270 Ustka');
    await (await openSuggestions(page, 'Nazwa kempingu')).fill('wok');
    await page.getByRole('button', { name: /^Wybierz kemping: Wok,/ }).click();
    await expect(suggestionField(page, 'Nazwa kempingu')).toContainText('Wok');
    await expect(field(page, 'Adres kempingu')).toHaveValue('');
    await (await openSuggestions(page, 'Nazwa kempingu')).fill('Kemping NieobecnyWKataloguXYZ');
    await expect(page.getByTestId('campground-suggestions')).toContainText('Możesz zachować wpisaną nazwę');
    await button(page, 'Wróć do formularza').click();
    await field(page, 'Adres kempingu').fill('Leśna 8');
  } finally { await context.setOffline(false); }
  await button(page, 'Zapisz zmiany').click();
  await expect(page).toHaveURL('http://localhost:8085/trips');
  expect(store.trips.get(tripId).campground_name).toBe('Kemping NieobecnyWKataloguXYZ');
  expect(store.trips.get(tripId).campground_address).toBe('Leśna 8');
  await edit(page);
  await expect(suggestionField(page, 'Nazwa kempingu')).toContainText('Kemping NieobecnyWKataloguXYZ');
  await expect(field(page, 'Adres kempingu')).toHaveValue('Leśna 8');
  expect(osmRequests).toEqual([]);
});
