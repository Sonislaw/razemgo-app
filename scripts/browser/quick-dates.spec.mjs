import {test, expect} from '@playwright/test';
import {B, groupId, state, backend, login} from './trip-fixtures.mjs';

test.use({timezoneId: 'Europe/Warsaw'});

function seed(store) {
  const periods = [
    ['2026-10-24', '2026-10-25'], ['2026-10-23', '2026-10-26'],
    ['2026-10-25', '2026-10-26'], ['2026-10-26', '2026-10-27'],
    ['2026-10-28', '2026-10-30'], ['2026-10-30', '2026-11-02'],
    ['2026-11-03', '2026-11-05'],
  ];
  for (const [index, [start_date, end_date]] of periods.entries()) {
    const id = '00000000-0000-4000-8000-' + String(8800 + index).padStart(12, '0');
    store.trips.set(id, {id, group_id: groupId(B), mode: 'planned', status: 'published', visibility: 'public',
      adult_count: 2, child_count: 0, child_age_bands: [], start_date, end_date,
      location_id: 'pl-locality:4259', location_name: 'Chłapowo', location_region: 'Pomorskie', location_kind: 'village',
      campground_name: '', campground_address: '', travel_mode: 'Kamper', description: 'Spokojny wyjazd nad morze numer ' + index + '.',
      landscape: 'coast', interests: [], animal_kinds: [], matching_group_kinds: [], matching_child_age_bands: [], published_at: '2026-10-23T10:00:00Z'});
  }
}

for (const width of [320, 390]) test(`quick dates: horizontal shortcuts update results, toggle off and preserve filters at ${width}px`, async ({page, context}) => {
  test.setTimeout(120000);
  await page.setViewportSize({width, height: 844});
  const store = state(); seed(store); await backend(context, store); await login(page); await page.goto('/explore');
  const screen = page.getByTestId('discovery-screen');
  const strip = page.getByTestId('discovery-quick-dates');
  const chip = label => strip.getByRole('button', {name: label, exact: true});
  const lastQuery = () => store.tripSearchCalls?.filter(c => c.endpoint === 'search_public_trips_v3').at(-1);
  await expect(strip.getByRole('button')).toHaveCount(6);
  const row = strip.getByLabel('Szybkie filtry dat', {exact: true});
  expect(await row.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  const [filterBox, stripBox] = await Promise.all([page.getByRole('button', {name: 'Otwórz filtry', exact: true}).boundingBox(), strip.boundingBox()]);
  expect(stripBox.y).toBeGreaterThanOrEqual(filterBox.y + filterBox.height);
  await page.getByRole('button', {name: 'Otwórz filtry', exact: true}).click();
  await page.getByRole('checkbox', {name: 'Klimat wyjazdu: Morze', exact: true}).click();
  await page.getByRole('button', {name: /^Pokaż wyniki/}).click();
  for (const [label, start, end, total] of [
    ['Dzisiaj', '2026-10-24', '2026-10-25', 2],
    ['Jutro', '2026-10-25', '2026-10-26', 2],
    ['Weekend', '2026-10-23', '2026-10-26', 3],
    ['7 dni', '2026-10-24', '2026-10-31', 6],
    ['Następny weekend', '2026-10-30', '2026-11-02', 1],
    ['30 dni', '2026-10-24', '2026-11-23', 7],
  ]) {
    await chip(label).click();
    await expect(chip(label)).toHaveAttribute('aria-pressed', 'true');
    await expect(strip.locator('[aria-pressed="true"]')).toHaveCount(1);
    await expect.poll(() => lastQuery()?.filters?.start_date).toBe(start);
    expect(lastQuery().filters.end_date).toBe(end);
    expect(lastQuery().filters.tolerance_days).toBe(0);
    expect(lastQuery().filters.landscapes).toEqual(['coast']);
    expect(lastQuery().after_cursor).toBeNull();
    await expect(screen.getByRole('heading', {name: 'Propozycje · ' + total, exact: true})).toBeVisible();
    await chip(label).click();
    await expect(strip.locator('[aria-pressed="true"]')).toHaveCount(0);
    await expect.poll(() => lastQuery()?.filters?.start_date).toBeNull();
    expect(lastQuery().filters.landscapes).toEqual(['coast']);
  }
  await chip('Jutro').click();
  await page.getByRole('button', {name: 'Otwórz filtry', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Wybierz zakres dat', exact: true})).toContainText('25 paź');
  await page.getByRole('button', {name: 'Wyczyść termin', exact: true}).click();
  await page.getByRole('button', {name: /^Pokaż wyniki/}).click();
  await expect(strip.locator('[aria-pressed="true"]')).toHaveCount(0);
  await chip('30 dni').click();
  await strip.screenshot({path: `.expo/discovery-quick-dates-${width}.png`});
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const tabs = page.getByRole('tablist', {name: 'Odkrywaj', exact: true});
  await tabs.getByRole('tab', {name: 'Ekipy', exact: true}).click();
  await expect(strip).toHaveCount(0);
  await tabs.getByRole('tab', {name: 'Wyjazdy', exact: true}).click();
  await expect(chip('30 dni')).toHaveAttribute('aria-pressed', 'true');
});
