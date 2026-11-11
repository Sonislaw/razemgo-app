import { test, expect } from '@playwright/test';
import { loadNextPage } from './collection-helpers.mjs';
import { A, B, groupId, state, backend, login } from './trip-fixtures.mjs';
import { INITIAL_FILTERS } from '../../src/features/discovery/filter-trips.ts';
import { INITIAL_GROUP_FILTERS } from '../../src/features/groups/group-data.ts';
import { filterSetPayload } from '../../src/features/saved-filters/saved-filter-data.ts';

const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
function preset(store, n, name, value, owner = A) {
  const row = { id: uuid(n), name, kind: value.kind, filters: filterSetPayload(value), schema_version: 1,
    created_at: '2026-10-20T12:00:00Z', updated_at: '2026-10-20T12:00:00Z', owner };
  store.filterSets.set(row.id, row); return row;
}
function trips(store) {
  for (let i = 0; i < 12; i++) {
    const id = uuid(8000 + i);
    store.trips.set(id, { id, group_id: groupId(B), adult_count: 2, child_count: 0, child_age_bands: [], mode: 'planned',
      status: 'published', visibility: 'public', start_date: '2099-05-21', end_date: '2099-05-24',
      location_id: 'pl-locality:4259', location_name: 'Chłapowo', location_region: 'Pomorskie', location_kind: 'village',
      campground_name: 'Pod Wydmami', campground_address: '', travel_mode: 'Kamper', description: 'Wspólny urlop nad morzem.',
      landscape: 'coast', interests: ['Rowery'], animal_kinds: [], matching_group_kinds: [], matching_child_age_bands: [],
      published_at: '2026-10-01T10:00:00Z' });
  }
}
const button = (page, name) => page.getByRole('button', { name, exact: true });
async function openTrips(page) { await button(page, 'Otwórz filtry').click(); }
async function saveNew(page, name) {
  await button(page, 'Zapisz zestaw').click();
  await page.getByRole('textbox', { name: 'Nazwa zestawu', exact: true }).fill(name);
  await button(page, 'Zapisz i pokaż wyniki').click();
}
async function load(page, count, name) {
  await button(page, `Zapisane · ${count}`).click();
  await button(page, `Wczytaj zestaw: ${name}`).click();
}
async function manage(page, count, name) {
  await button(page, `Zapisane · ${count}`).click();
  await button(page, `Opcje zestawu: ${name}`).click();
}

test('legacy sets keep the selected type; single-type sets switch it without changing stored criteria', async ({page,context}) => {
  const store=state(); trips(store);
  const legacy=preset(store,1901,'Nad morze',{kind:'trips',filters:{...INITIAL_FILTERS,landscapeKinds:['coast']}});
  preset(store,1902,'Plany',{kind:'trips',filters:{...INITIAL_FILTERS,tripModes:['planned']}});
  preset(store,1903,'Pomysły',{kind:'trips',filters:{...INITIAL_FILTERS,tripModes:['flexible']}});
  const original=structuredClone(legacy);
  await backend(context,store); await login(page); await page.goto('/explore');
  const ideas=page.getByRole('radio',{name:'Szukam pomysłu',exact:true});
  const plans=page.getByRole('radio',{name:'Mam plan',exact:true});
  await load(page,3,'Nad morze');
  await expect(ideas).toBeChecked(); await expect(button(page,'Otwórz filtry')).toContainText('Nad morze');
  await plans.click(); await expect(button(page,'Otwórz filtry')).not.toContainText('Nad morze');
  await load(page,3,'Nad morze');
  await expect(plans).toBeChecked(); await expect(button(page,'Otwórz filtry')).toContainText('Nad morze');
  await load(page,3,'Pomysły'); await expect(ideas).toBeChecked(); await expect(plans).not.toBeChecked();
  await load(page,3,'Plany'); await expect(plans).toBeChecked(); await expect(ideas).not.toBeChecked();
  await expect(button(page,'Otwórz filtry')).toContainText('Plany');
  expect(store.filterSets.get(legacy.id)).toEqual(original);
});

for (const width of [320, 390]) test(`trip sets: retry, first-page reload, rename and deletion at ${width}px`, async ({ page, context }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width, height: 844 });
  const store = state(); trips(store);
  await backend(context, store); await login(page); await page.goto('/explore');
  await page.getByRole('radio', {name: 'Mam plan', exact: true}).click();
  await expect(button(page, 'Zapisane · 0')).toBeVisible();
  await openTrips(page);
  store.loseFilterAcknowledgement = true;
  await saveNew(page, 'Wszystkie plany');
  await expect(page.getByRole('alert')).toContainText('Nie udało się zapisać zestawu');
  await expect(page.getByRole('textbox', { name: 'Nazwa zestawu', exact: true })).toHaveValue('Wszystkie plany');
  await page.screenshot({ path: `.expo/saved-filters-save-${width}.png` });
  const firstId = store.filterSaveCalls[0].target_id;
  await button(page, 'Zapisz i pokaż wyniki').click();
  await expect(button(page, 'Zapisane · 1')).toBeVisible();
  expect(store.filterSaveCalls.at(-1).target_id).toBe(firstId);
  expect(store.filterSets.size).toBe(1);
  await expect(button(page, 'Otwórz filtry')).toContainText('Wszystkie plany');
  const screen = page.getByTestId('discovery-screen');
  await loadNextPage(screen,10);
  await screen.evaluate(el => { el.scrollTop = 0; });
  await load(page, 1, 'Wszystkie plany');
  await expect(screen.getByTestId('discovery-screen-loaded-5')).toBeAttached();
  const searches = store.tripSearchCalls.filter(c => c.endpoint === 'search_public_trips_v3' && c.page_size === 5);
  expect(searches.at(-1).after_cursor ?? null).toBeNull();
  await page.screenshot({ path: `.expo/saved-filters-${width}.png` });
  await manage(page, 1, 'Wszystkie plany');
  await page.screenshot({ path: `.expo/saved-filters-menu-${width}.png` });
  await button(page, 'Zmień nazwę').click();
  await page.getByRole('textbox', { name: 'Nazwa zestawu', exact: true }).fill('Urlop');
  await button(page, 'Zapisz nazwę').click();
  await expect(button(page, 'Wczytaj zestaw: Urlop')).toBeVisible();
  await button(page, 'Opcje zestawu: Urlop').click();
  await button(page, 'Usuń zestaw').click();
  await expect(page.getByText('Usuniesz zapis „Urlop”. Bieżące filtry pozostaną bez zmian.', { exact: true })).toBeVisible();
  await button(page, 'Potwierdź usunięcie').click();
  await expect(page.getByText('Nie masz jeszcze zapisanych zestawów.', { exact: false })).toBeVisible();
  await button(page, 'Zamknij').click();
  await expect(button(page, 'Zapisane · 0')).toBeVisible();
  await expect(button(page, 'Otwórz filtry')).not.toContainText('Urlop');
  await expect(screen.getByTestId('discovery-screen-loaded-5')).toBeAttached();
});

test('expired dates remain exact; crew sets include online/favorites, replace and survive reload independently', async ({ page, context }) => {
  test.setTimeout(120000);
  const store = state();
  const old = preset(store, 901, 'Wakacje', { kind: 'trips', filters: { ...INITIAL_FILTERS, dateRangeId: 'custom',
    customDateRange: { startDate: '2025-05-01', endDate: '2025-05-04' }, dateFlexibilityDays: 3 } });
  await backend(context, store); await login(page); await page.goto('/explore');
  await load(page, 1, 'Wakacje');
  await expect(page.getByRole('alert')).toHaveText('Termin w tym zestawie już minął');
  await button(page, 'Edytuj termin zestawu').click();
  await button(page, 'Zapisz zestaw').click();
  await expect(page.getByRole('dialog', { name: 'Zapisz zestaw filtrów', exact: true })).toContainText('2025');
  await button(page, 'Zamknij').click();
  await button(page, 'Zamknij filtry bez zmian').click();
  expect(old.filters.start_date).toBe('2025-05-01');
  await page.getByRole('tab', { name: 'Ekipy', exact: true }).click();
  await expect(button(page, 'Zapisane · 0')).toBeVisible();
  await button(page, 'Filtry ekip').click();
  await page.getByRole('switch', { name: 'Tylko online', exact: true }).click();
  await page.getByRole('switch', { name: 'Tylko ulubione', exact: true }).click();
  await saveNew(page, 'Wakacje');
  await expect(button(page, 'Zapisane · 1')).toBeVisible();
  const crew = [...store.filterSets.values()].find(row => row.kind === 'groups');
  expect(crew.filters.online_only).toBe(true); expect(crew.filters.favorites_only).toBe(true);
  await button(page, 'Filtry ekip').click();
  await page.getByRole('switch', { name: 'Tylko online', exact: true }).click();
  await button(page, 'Zapisz zestaw').click();
  await button(page, 'Zastąp istniejący').click();
  await button(page, 'Wakacje').click();
  await expect(page.getByText('Potwierdź zastąpienie „Wakacje” kryteriami pokazanymi powyżej.', { exact: true })).toBeVisible();
  await button(page, 'Zastąp zestaw').click();
  await expect(button(page, 'Zapisane · 1')).toBeVisible();
  expect(store.filterSets.get(crew.id).filters.online_only).toBe(false);
  expect(store.filterSets.get(old.id)).toEqual(old);
  await button(page, 'Filtry ekip').click();
  await saveNew(page, 'wakacje');
  await expect(page.getByRole('alert').filter({ hasText: 'Masz już zestaw o tej nazwie' })).toBeVisible();
  await button(page, 'Zamknij').click(); await button(page, 'Zamknij filtry bez zmian').click();
  await page.reload();
  await expect(button(page, 'Zapisane · 1')).toBeVisible();
  await expect(button(page, 'Otwórz filtry')).not.toContainText('Wakacje');
  await page.getByRole('tab', { name: 'Ekipy', exact: true }).click();
  await load(page, 1, 'Wakacje');
  await expect(button(page, 'Filtry ekip')).toContainText('Wakacje');
  await button(page, 'Wyczyść filtry ekip').click();
  await expect(button(page, 'Filtry ekip')).not.toContainText('Wakacje');
  await expect(button(page, 'Zapisane · 1')).toBeVisible();
});

test('cross-device catalog synchronization leaves active search untouched and isolates accounts', async ({ browser }) => {
  test.setTimeout(120000);
  const store = state();
  const first = await browser.newContext(), second = await browser.newContext();
  try {
    await backend(first, store); await backend(second, store);
    const a = await first.newPage(), b = await second.newPage();
    await login(a); await login(b); await a.goto('/explore'); await b.goto('/explore');
    await expect(button(b, 'Zapisane · 0')).toBeVisible();
    await openTrips(b);
    await b.getByRole('switch', { name: 'Tylko ulubione', exact: true }).click();
    await b.getByRole('button', { name: /^Pokaż wyniki/ }).click();
    await b.clock.install();
    await openTrips(a); await saveNew(a, 'Wspólny katalog');
    await expect(button(a, 'Zapisane · 1')).toBeVisible();
    await b.clock.fastForward(20000); await b.clock.runFor(500);
    await expect(button(b, 'Zapisane · 1')).toBeVisible();
    await expect(button(b, 'Otwórz filtry')).toContainText('Tylko ulubione');
    await expect(button(b, 'Otwórz filtry')).not.toContainText('Wspólny katalog');
    await load(b, 1, 'Wspólny katalog');
    await expect(button(b, 'Otwórz filtry')).toContainText('Wspólny katalog');
    await a.goto('/settings');
    await button(a, 'Wyloguj się').click();
    await login(a, 'b@example.com'); await a.goto('/explore');
    await expect(button(a, 'Zapisane · 0')).toBeVisible();
    await expect(button(a, 'Otwórz filtry')).not.toContainText('Wspólny katalog');
    await a.goto('/settings'); await button(a, 'Wyloguj się').click();
    await login(a); await a.goto('/explore');
    await expect(button(a, 'Zapisane · 1')).toBeVisible();
    await expect(button(a, 'Otwórz filtry')).not.toContainText('Wspólny katalog');
  } finally { await first.close(); await second.close(); }
});

test('capacity and errors keep the draft; failed deletion preserves active criteria', async ({ page, context }) => {
  const store = state();
  for (let n = 0; n < 10; n++) preset(store, 1000 + n, `Zestaw ${n}`, { kind: 'groups',
    filters: { ...INITIAL_GROUP_FILTERS, onlineOnly: true, favoritesOnly: true, travelModes: ['Van'] } });
  await backend(context, store); await login(page); await page.goto('/explore'); await page.getByRole('tab', { name: 'Ekipy', exact: true }).click();
  await load(page, 10, 'Zestaw 0');
  await button(page, 'Filtry ekip').click(); await button(page, 'Zapisz zestaw').click();
  await page.getByRole('textbox', { name: 'Nazwa zestawu', exact: true }).fill('Jedenasty');
  await expect(button(page, 'Zapisz i pokaż wyniki')).toBeDisabled();
  await button(page, 'Zastąp istniejący').click(); await button(page, 'Zestaw 0').click();
  store.failFilterSave = true;
  await button(page, 'Zastąp zestaw').click();
  await expect(page.getByRole('alert').filter({ hasText: 'Nie udało się zapisać zestawu' })).toBeVisible();
  store.failFilterSave = false;
  await button(page, 'Zastąp zestaw').click();
  await expect(button(page, 'Zapisane · 10')).toBeVisible();
  await manage(page, 10, 'Zestaw 0'); await button(page, 'Usuń zestaw').click();
  store.failFilterDelete = true; await button(page, 'Potwierdź usunięcie').click();
  await expect(page.getByRole('alert').filter({ hasText: 'Nie udało się usunąć zestawu' })).toBeVisible();
  expect(store.filterSets.size).toBe(10);
  store.failFilterDelete = false; await button(page, 'Potwierdź usunięcie').click();
  await button(page, 'Zamknij').click();
  await expect(button(page, 'Zapisane · 9')).toBeVisible();
  await expect(button(page, 'Filtry ekip')).not.toContainText('Zestaw 0');
  await expect(button(page, 'Filtry ekip')).toContainText('Tylko ulubione');
  await expect(button(page, 'Filtry ekip')).toContainText('Tylko online');
  await expect(button(page, 'Filtry ekip')).toContainText('Kampervan');
});

test('catalog load failure offers retry without changing search or enabling an unverified save', async ({ page, context }) => {
  const store = state(); store.failFilterLoad = true;
  await backend(context, store); await login(page); await page.goto('/explore');
  await openTrips(page); await button(page, 'Zapisz zestaw').click();
  await page.getByRole('textbox', { name: 'Nazwa zestawu', exact: true }).fill('Po odzyskaniu połączenia');
  await expect(page.getByRole('alert').filter({ hasText: 'Nie udało się pobrać zapisanych filtrów' })).toBeVisible();
  await expect(button(page, 'Zapisz i pokaż wyniki')).toBeDisabled();
  store.failFilterLoad = false;
  await button(page, 'Spróbuj ponownie').click();
  await expect(button(page, 'Zapisz i pokaż wyniki')).toBeEnabled();
  await button(page, 'Zapisz i pokaż wyniki').click();
  await expect(button(page, 'Zapisane · 1')).toBeVisible();
});
