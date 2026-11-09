import {test, expect} from '@playwright/test';
import {B, groupId, state, backend, login} from './trip-fixtures.mjs';
import {expectLoaded, loadNextPage, scrollToRow} from './collection-helpers.mjs';

const uuid = index => '00000000-0000-4000-8000-' + String(9100 + index).padStart(12, '0');
function seed(store) {
  for (const [index, day] of [7, 10, 13, 9, 11, 8, 12, 6, 5, 4, 3, 2, 1].entries()) {
    const id = uuid(index);
    store.trips.set(id, {id, group_id: groupId(B), mode: 'planned', status: 'published', visibility: 'public',
      adult_count: 2, child_count: 0, child_age_bands: [], start_date: '2099-06-' + String(day).padStart(2, '0'), end_date: '2099-07-01',
      location_id: 'pl-locality:4259', location_name: 'Chłapowo', location_region: 'Pomorskie', location_kind: 'village',
      campground_name: '', campground_address: '', travel_mode: 'Kamper', description: 'Wspólny wyjazd nad morze numer ' + index + '.',
      landscape: 'coast', interests: [], animal_kinds: [], matching_group_kinds: [], matching_child_age_bands: [],
      published_at: '2026-10-' + (23 - Math.floor(index / 2)) + 'T10:00:00Z'});
  }
}

for (const width of [320, 390]) test(`trip sorting: global date order, paging and independent filters at ${width}px`, async ({page, context}) => {
  test.setTimeout(120000);
  await page.setViewportSize({width, height: 844});
  const store = state(); seed(store); await backend(context, store); await login(page); await page.goto('/explore');
  const screen = page.getByTestId('discovery-screen');
  const cards = screen.locator('[data-testid^="discovery-trip-"]');
  const sort = page.getByRole('button', {name: 'Sortuj wyjazdy', exact: true});
  const lastQuery = () => store.tripSearchCalls?.filter(call => call.endpoint === 'search_public_trips_v3').at(-1);
  const firstCard = index => expect(cards.first()).toHaveAttribute('data-testid', 'discovery-trip-' + uuid(index));
  await expectLoaded(screen, 5); await firstCard(0);
  const [savedBox, sortBox] = await Promise.all([
    page.getByRole('button', {name: /^Zapisane/}).boundingBox(), sort.boundingBox(),
  ]);
  expect(sortBox.x).toBeGreaterThanOrEqual(savedBox.x + savedBox.width);
  expect(Math.abs(sortBox.y - savedBox.y)).toBeLessThanOrEqual(2);
  await page.getByRole('button', {name: 'Otwórz filtry', exact: true}).click();
  await page.getByRole('checkbox', {name: 'Klimat wyjazdu: Morze', exact: true}).click();
  await page.getByRole('button', {name: /^Pokaż wyniki/}).click();
  await sort.click();
  await expect(page.getByRole('radio', {name: 'Najnowsze ogłoszenia', exact: true})).toBeChecked();
  await page.getByRole('button', {name: 'Zamknij', exact: true}).click();
  const select = async (label, order, first) => {
    await screen.evaluate(el => {el.scrollTop = 0;});
    await sort.click();
    await page.getByRole('radio', {name: label, exact: true}).click();
    await expect(page.getByRole('heading', {name: 'Sortowanie wyjazdów', exact: true})).toHaveCount(0);
    await expect.poll(() => lastQuery()?.filters?.sort_order ?? 'newest').toBe(order);
    expect(lastQuery().after_cursor).toBeNull();
    expect(lastQuery().filters.landscapes).toEqual(['coast']);
    await expectLoaded(screen, 5); await firstCard(first);
  };
  await select('Termin wyjazdu rosnąco', 'date_asc', 12);
  await sort.click();
  await expect(page.getByRole('radio', {name: 'Termin wyjazdu rosnąco', exact: true})).toBeChecked();
  await page.screenshot({path: `.expo/trip-sorting-${width}.png`});
  await page.getByRole('button', {name: 'Zamknij', exact: true}).click();
  await loadNextPage(screen, 13); await expectLoaded(screen, 13);
  expect(lastQuery().after_cursor.start_date).toBeTruthy();
  await scrollToRow(screen, screen.getByTestId('discovery-trip-' + uuid(2)));
  await expect(screen.getByTestId('discovery-trip-' + uuid(2))).toBeVisible();
  await select('Termin wyjazdu malejąco', 'date_desc', 2);
  await select('Najnowsze ogłoszenia', 'newest', 0);
  await select('Termin wyjazdu rosnąco', 'date_asc', 12);
  await page.getByRole('tab', {name: 'Start', exact: true}).click();
  await expect(page).toHaveURL('http://localhost:8085/');
  await page.getByTestId('home-latest-listing').getByRole('button', {name: 'Zobacz wyjazd', exact: true}).click();
  await expect(page).toHaveURL('http://localhost:8085/trip/' + uuid(0));
  await page.goBack();
  await page.getByRole('tab', {name: 'Odkrywaj', exact: true}).click();
  await expectLoaded(screen, 5); await firstCard(12);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});
