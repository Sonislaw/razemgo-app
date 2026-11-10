import {test, expect} from '@playwright/test';
import {A, B, groupId, state, backend, login} from './trip-fixtures.mjs';

const id = n => '00000000-0000-4000-8000-' + String(9500 + n).padStart(12, '0');
function seed(store) {
  const base = {group_id: groupId(B), mode: 'planned', status: 'published', visibility: 'public', adult_count: 2, child_count: 0, child_age_bands: [],
    start_date: '2026-10-25', end_date: '2026-10-28', location_id: 'pl-locality:4259', location_name: 'Chłapowo', location_region: 'Pomorskie', location_kind: 'village',
    campground_name: '', campground_address: '', travel_mode: 'Kamper', description: 'Nadmorski wypoczynek i wspólne spacery po plaży.', landscape: 'coast',
    interests: [], animal_kinds: [], matching_group_kinds: [], matching_child_age_bands: [], published_at: '2026-10-23T10:00:00Z'};
  store.trips.set(id(0), {id: id(0), ...base});
  store.trips.set(id(1), {id: id(1), ...base, start_date: '2099-05-01', end_date: '2099-05-04'});
  store.trips.set(id(2), {id: id(2), ...base, mode: 'flexible', location_id: 'pl-region:pomorskie', location_kind: 'region', location_name: 'Pomorskie'});
  store.trips.set(id(3), {id: id(3), ...base, group_id: groupId(A), end_date: '2026-10-27'});
  const forecast = {state: 'forecast', partial: true, timeZone: 'Europe/Warsaw', fetchedAt: '2026-10-24T11:55:00Z', alertsAvailable: true,
    days: [25, 26, 27].map(day => ({date: `2026-10-${day}`, condition: 'RAIN', description: 'Przelotny deszcz', minC: 4, maxC: 12,
      precipitationPercent: 70, precipitationMm: 3.5, windKmh: 18, gustKmh: 40})),
    alerts: [{id: 'wind', title: 'Silny wiatr', severity: 'SEVERE', description: 'Prognozowane silne porywy wiatru na wybrzeżu.',
      startTime: '2026-10-25T06:00:00Z', endTime: '2026-10-26T12:00:00Z', source: 'Meteoalarm', sourceUrl: 'https://meteoalarm.org/'}]};
  store.weatherByTrip = new Map([[id(0), forecast], [id(3), {...forecast, partial: false}]]);
}
for (const width of [320, 390]) test(`trip weather: retry, daily forecast, alerts, future dates and own trips at ${width}px`, async ({page, context}) => {
  test.setTimeout(120000);
  await page.setViewportSize({width, height: 844});
  const store = state(); seed(store); store.failWeather = true;
  await backend(context, store); await login(page); await page.goto('/trip/' + id(0));
  const weather = page.getByTestId('trip-weather');
  const retry = weather.getByRole('button', {name: 'Wczytaj pogodę ponownie', exact: true});
  await expect(retry).toBeAttached(); await retry.scrollIntoViewIfNeeded();
  await expect(weather).toContainText('Nie udało się pobrać pogody');
  store.failWeather = false; await retry.click();
  await expect(weather.getByText('Przelotny deszcz', {exact: true})).toHaveCount(3);
  await expect(weather).toContainText('Opady: 70% · 3.5 mm');
  await expect(weather).toContainText('Wiatr: 18 km/h');
  await expect(weather).toContainText('Pozostałe pojawią się bliżej terminu');
  await expect(weather).toContainText('Google Maps');
  const days = weather.getByLabel('Prognoza dzienna na wyjazd', {exact: true});
  expect(await days.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  await weather.screenshot({path: `.expo/trip-weather-${width}.png`});
  await weather.getByRole('button', {name: 'Ostrzeżenia pogodowe · 1', exact: true}).click();
  const sheet = page.getByRole('dialog', {name: 'Ostrzeżenia pogodowe', exact: true});
  await expect(sheet).toContainText('Silny wiatr');
  await expect(sheet).toContainText('Źródło: Meteoalarm');
  await sheet.getByRole('button', {name: 'Zamknij', exact: true}).click();
  const calls = store.weatherCalls.length;
  await page.goto('/trip/' + id(1)); await expect(weather).toContainText('Prognoza będzie dostępna bliżej wyjazdu');
  expect(store.weatherCalls.length).toBe(calls);
  await page.goto('/trip/' + id(2)); await expect(weather).toContainText('konkretnej miejscowości');
  expect(store.weatherCalls.length).toBe(calls);
  await page.goto('/trips/' + id(3)); await expect(weather.getByText('Przelotny deszcz', {exact: true})).toHaveCount(3);
  expect(store.weatherCalls.at(-1).tripId).toBe(id(3));
  await expect(weather).not.toContainText('Pozostałe pojawią się bliżej terminu');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('trip weather uses the complete Google place name instead of the unfinished search on public and own trips', async ({page, context}) => {
  test.setTimeout(90000);
  const store = state(); seed(store);
  for (const tripId of [id(0), id(3)]) {
    const original = store.trips.get(tripId);
    store.trips.set(tripId, {...original, location_id: 'google:qa_camp_morski', location_name: 'Camp', location_kind: 'locality',
      place_data: {id: 'google:qa_camp_morski', source: 'google', googlePlaceId: 'qa_camp_morski', kind: 'campground',
        userLabel: 'Camp', name: 'Camp', address: '', region: '', country: ''}});
  }
  let releaseDetails;
  const detailsReady = new Promise(resolve => {releaseDetails = resolve;});
  await backend(context, store);
  await page.route('**/functions/v1/places', async route => {
    if (route.request().postDataJSON()?.action === 'details') await detailsReady;
    await route.fallback();
  });
  await login(page); await page.goto('/trip/' + id(0));
  const weather = page.getByTestId('trip-weather');
  await expect(weather.getByText('Przelotny deszcz', {exact: true})).toHaveCount(3);
  await expect(weather.getByText('Camp', {exact: true})).toHaveCount(0);
  releaseDetails();
  await expect(weather.getByText('Camping Morski', {exact: true})).toBeAttached();
  await page.goto('/trips/' + id(3));
  await expect(weather.getByText('Camping Morski', {exact: true})).toBeAttached();
  await expect(weather.getByText('Camp', {exact: true})).toHaveCount(0);
});
