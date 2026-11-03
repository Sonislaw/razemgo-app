import { test, expect } from '@playwright/test';
import { A, B, groupId, state, backend, login } from './trip-fixtures.mjs';
import { mockMapTiles } from './map-fixtures.mjs';
import {
  INITIAL_FILTERS,
  selectDiscoveryLocation,
} from '../../src/features/discovery/filter-trips.ts';
import { filterSetPayload } from '../../src/features/saved-filters/saved-filter-data.ts';
import { getLocalities } from '../../src/data/locations/polish-localities.ts';
const uuid = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const button = (page, name) => page.getByRole('button', { name, exact: true });
function seed(store) {
  for (let i = 0; i < 13; i++) {
    const id = uuid(8000 + i);
    store.trips.set(id, {
      id,
      group_id: groupId(B),
      adult_count: 2,
      child_count: 1,
      child_age_bands: ['4–6'],
      mode: 'planned',
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
      travel_mode: 'Przyczepa',
      description: 'Wspólny urlop nad morzem numer ' + i + '.',
      landscape: i === 0 ? 'lake' : 'coast',
      interests: ['Rowery'],
      animal_kinds: [],
      matching_group_kinds: [],
      matching_child_age_bands: [],
      published_at: '2026-10-01T10:00:00Z',
    });
  }
  const first = store.trips.values().next().value;
  store.trips.set(uuid(9000), {
    ...first,
    id: uuid(9000),
    mode: 'flexible',
    location_id: 'country:PL',
    location_name: 'Polska',
    location_region: '',
    location_kind: 'country',
    campground_name: '',
  });
}
for (const width of [320, 390])
  test(`map shows only planned clusters and selection at ${width}px`, async ({
    page,
    context,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 844 });
    const store = state();
    seed(store);
    await backend(context, store);
    await mockMapTiles(context);
    await login(page);
    await page.goto('/explore');
    await expect(
      page.getByText('Propozycje · 14', { exact: true }),
    ).toBeVisible();
    await button(page, 'Pokaż mapę wyjazdów').click();
    const map = page.getByTestId('discovery-map-screen');
    await expect(map).toBeVisible();
    await expect(
      map.getByText('Plany w obszarze: 13', { exact: true }),
    ).toBeVisible();
    const frame = page.frameLocator(
      'iframe[data-testid="discovery-map-frame"]',
    );
    await expect(frame.locator('.leaflet-tile-loaded').first()).toBeVisible();
    await expect
      .poll(() =>
        frame
          .locator('.leaflet-tile-loaded')
          .first()
          .evaluate((el) => Number(getComputedStyle(el).opacity)),
      )
      .toBe(1);
    await frame.locator('.leaflet-marker-icon[title="Wyjazdy: 13"]').click();
    await expect(
      page.getByRole('dialog', { name: 'Wyjazdy w tym miejscu', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Wyniki: 13', { exact: true })).toBeVisible();
    await button(page, 'Pokaż więcej wyjazdów w tym miejscu').click();
    await expect
      .poll(
        () =>
          store.mapCalls.filter(
            (c) => c.endpoint === 'get_trip_map_items' && c.after_cursor,
          ).length,
      )
      .toBe(1);
    await page
      .getByRole('button', {
        name: 'Wybierz wyjazd: Wspólny urlop nad morzem numer 0.',
        exact: true,
      })
      .click();
    await expect(page.getByTestId('map-trip-preview')).toContainText('Ekipa B');
    await expect(page.getByTestId('map-trip-preview')).toContainText(
      'Dorośli: 2 · Dzieci: 1',
    );
    await page.screenshot({ path: `.expo/discovery-map-${width}.png` });
    await button(page, 'Zamknij podgląd wyjazdu').click();
    await expect(
      frame.locator('.crew-area,.map-search-area,.map-selected-area'),
    ).toHaveCount(0);
    await button(page, 'Wróć do listy wyjazdów').click();
    await expect(page.getByTestId('discovery-map-screen')).toHaveCount(0);
    await expect(
      page.getByText('Propozycje · 13', { exact: true }),
    ).toBeVisible();
  });
for (const width of [320, 390])
  test(`map locks Mam plan through clearing and saved filters; the list unlocks at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const store = state();
    seed(store);
    const saved = {
      id: uuid(9950),
      owner: A,
      name: 'Pomysły nad jeziorem',
      kind: 'trips',
      schema_version: 1,
      filters: filterSetPayload({
        kind: 'trips',
        filters: {
          ...INITIAL_FILTERS,
          tripModes: ['flexible'],
          landscapeKinds: ['lake'],
          childAgeBands: ['4–6'],
        },
      }),
      created_at: '2026-10-20T12:00:00Z',
      updated_at: '2026-10-20T12:00:00Z',
    };
    store.filterSets.set(saved.id, saved);
    const original = structuredClone(saved);
    await backend(context, store);
    await mockMapTiles(context);
    await login(page);
    await page.goto('/explore');
    await button(page, 'Otwórz filtry').click();
    await page.getByRole('checkbox', { name: 'Mam plan', exact: true }).click();
    await page.getByRole('button', { name: /^Pokaż wyniki/ }).click();
    await expect(
      page.getByText('Propozycje · 1', { exact: true }),
    ).toBeVisible();
    await button(page, 'Pokaż mapę wyjazdów').click();
    await expect(
      page.getByText('Plany w obszarze: 13', { exact: true }),
    ).toBeVisible();
    await expect(button(page, 'Wyczyść filtry')).toHaveCount(0);
    await button(page, 'Otwórz filtry').click();
    const mode = page.getByRole('checkbox', { name: 'Mam plan', exact: true });
    await expect(mode).toBeChecked();
    await expect(mode).toBeDisabled();
    await expect(
      page.getByRole('checkbox', { name: 'Szukam pomysłu', exact: true }),
    ).toHaveCount(0);
    await expect(button(page, 'Wyczyść')).toHaveCount(0);
    await page
      .getByRole('checkbox', { name: 'Klimat wyjazdu: Jeziora', exact: true })
      .click();
    await button(page, 'Wyczyść').click();
    await expect(button(page, 'Wyczyść')).toHaveCount(0);
    await expect(mode).toBeChecked();
    await expect(mode).toBeDisabled();
    await page.getByRole('button', { name: /^Pokaż wyniki/ }).click();
    await button(page, 'Zapisane · 1').click();
    await button(page, 'Wczytaj zestaw: ' + saved.name).click();
    await expect(
      page.getByText('Plany w obszarze: 1', { exact: true }),
    ).toBeVisible();
    await expect(button(page, 'Otwórz filtry')).not.toContainText(saved.name);
    const query = store.mapCalls
      .filter((c) => c.endpoint === 'search_trip_map')
      .at(-1);
    expect(query.filters.trip_modes).toEqual(['planned']);
    expect(query.filters.landscapes).toEqual(['lake']);
    expect(query.filters.child_age_bands).toEqual(['4–6']);
    expect(store.filterSets.get(saved.id)).toEqual(original);
    await button(page, 'Wyczyść filtry').click();
    await expect(button(page, 'Wyczyść filtry')).toHaveCount(0);
    await expect(
      page.getByText('Plany w obszarze: 13', { exact: true }),
    ).toBeVisible();
    const frame = page.frameLocator(
      'iframe[data-testid="discovery-map-frame"]',
    );
    await expect(
      frame.locator('.crew-area,.map-search-area,.map-selected-area'),
    ).toHaveCount(0);
    await page.screenshot({ path: `.expo/map-planned-only-${width}.png` });
    expect(
      store.mapCalls.every(
        (c) => JSON.stringify(c.filters.trip_modes) === '["planned"]',
      ),
    ).toBe(true);
    await button(page, 'Wróć do listy wyjazdów').click();
    await expect(
      page.getByText('Propozycje · 13', { exact: true }),
    ).toBeVisible();
    await button(page, 'Otwórz filtry').click();
    await expect(mode).toBeChecked();
    await expect(mode).toBeEnabled();
    const idea = page.getByRole('checkbox', {
      name: 'Szukam pomysłu',
      exact: true,
    });
    await expect(idea).toBeEnabled();
    await idea.click();
    await mode.click();
    await page.getByRole('button', { name: /^Pokaż wyniki/ }).click();
    await expect(
      page.getByText('Propozycje · 1', { exact: true }),
    ).toBeVisible();
  });

test('a saved-filter alert leaves the map and applies its exact flexible criteria to the list', async ({
  page,
  context,
}) => {
  const store = state();
  seed(store);
  const saved = {
    id: uuid(9960),
    owner: A,
    name: 'Pomysły nad jeziorem',
    kind: 'trips',
    schema_version: 1,
    filters: filterSetPayload({
      kind: 'trips',
      filters: {
        ...INITIAL_FILTERS,
        tripModes: ['flexible'],
        landscapeKinds: ['lake'],
      },
    }),
    created_at: '2026-10-20T12:00:00Z',
    updated_at: '2026-10-20T12:00:00Z',
  };
  store.filterSets.set(saved.id, saved);
  const event = uuid(9961);
  store.notifications.push({
    id: event,
    recipient_group_id: groupId(A),
    actor_group_id: groupId(A),
    actor_name: 'Zapisane filtry',
    actor_avatar_id: 'trail-fox',
    kind: 'saved_filter',
    filter_set_id: saved.id,
    filter_result_count: 1,
    trip_label: saved.name,
    own_trip_id: null,
    proposed_trip_id: null,
    conversation_id: null,
    invitation_id: null,
    available: true,
    created_at: '2026-10-24T10:00:00Z',
    read_at: null,
  });
  await backend(context, store);
  await mockMapTiles(context);
  await login(page);
  await page.goto('/explore');
  await button(page, 'Pokaż mapę wyjazdów').click();
  await expect(
    page.getByText('Plany w obszarze: 13', { exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Start', exact: true }).click();
  await page.getByTestId('home-notifications-bell').click();
  await page
    .getByTestId('home-notifications-popover')
    .getByTestId('notification-entry-' + event)
    .click();
  await expect(page).toHaveURL(/\/explore/);
  await expect(page.getByTestId('discovery-map-screen')).toHaveCount(0);
  await expect(page.getByText('Propozycje · 1', { exact: true })).toBeVisible();
  await expect(button(page, 'Otwórz filtry')).toContainText(saved.name);
  const search = store.tripSearchCalls
    .filter((c) => c.endpoint === 'search_public_trips_v3')
    .at(-1);
  expect(search.filters.trip_modes).toEqual(['flexible']);
  expect(search.filters.landscapes).toEqual(['lake']);
});

test('zoom and pan automatically search the visible area while filters remain unchanged', async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  const store = state();
  seed(store);
  await backend(context, store);
  await mockMapTiles(context);
  await login(page);
  await page.goto('/explore');
  await button(page, 'Pokaż mapę wyjazdów').click();
  await expect(
    page.getByText('Plany w obszarze: 13', { exact: true }),
  ).toBeVisible();
  const frame = page.frameLocator('iframe[data-testid="discovery-map-frame"]');
  const searches = () =>
    store.mapCalls.filter((c) => c.endpoint === 'search_trip_map');
  const initialFilters = searches().at(-1).filters;
  await frame.getByTitle('Przybliż mapę', { exact: true }).click();
  await expect.poll(() => searches().at(-1).map_zoom).toBe(6);
  await expect(button(page, 'Szukaj w tym obszarze')).toHaveCount(0);
  await button(page, 'Wróć do listy wyjazdów').click();
  await button(page, 'Pokaż mapę wyjazdów').click();
  await expect(
    page.getByText('Plany w obszarze: 13', { exact: true }),
  ).toBeVisible();
  expect(
    store.mapCalls.filter((c) => c.endpoint === 'search_trip_map').at(-1)
      .map_zoom,
  ).toBe(6);
  await frame.getByTitle('Oddal mapę', { exact: true }).click();
  await expect.poll(() => searches().at(-1).map_zoom).toBe(5);
  const beforePan = searches().at(-1).viewport;
  const box = await frame.locator('#map').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 65,
    box.y + box.height / 2 + 35,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect.poll(() => searches().at(-1).viewport).not.toEqual(beforePan);
  expect(searches().at(-1).filters).toEqual(initialFilters);
  await button(page, 'Otwórz filtry').click();
  await page
    .getByRole('checkbox', { name: 'Klimat wyjazdu: Jeziora', exact: true })
    .click();
  await page.getByRole('button', { name: /^Pokaż wyniki/ }).click();
  await expect
    .poll(
      () =>
        store.mapCalls.filter((c) => c.endpoint === 'search_trip_map').at(-1)
          .filters.landscapes,
    )
    .toEqual(['lake']);
  await button(page, 'Wróć do listy wyjazdów').click();
  await expect(button(page, 'Otwórz filtry')).toContainText('Jeziora');
});
test('quick zoom steps search only the final viewport and keep existing points while loading', async ({
  page,
  context,
}) => {
  const store = state();
  seed(store);
  await backend(context, store);
  await mockMapTiles(context);
  await login(page);
  await page.goto('/explore');
  await button(page, 'Pokaż mapę wyjazdów').click();
  await expect(
    page.getByText('Plany w obszarze: 13', { exact: true }),
  ).toBeVisible();
  const frame = page.frameLocator('iframe[data-testid="discovery-map-frame"]');
  const searches = () =>
    store.mapCalls.filter((c) => c.endpoint === 'search_trip_map');
  const before = searches().length;
  let release,
    requests = 0;
  await context.route('**/rpc/search_trip_map', async (route) => {
    requests++;
    await new Promise((resolve) => {
      release = resolve;
    });
    await route.fallback();
  });
  try {
    await frame.getByTitle('Przybliż mapę', { exact: true }).evaluate((el) => {
      el.click();
      el.click();
      el.click();
    });
    await expect.poll(() => !!release).toBe(true);
    expect(requests).toBe(1);
    await expect(frame.locator('.crew-cluster')).toHaveCount(1);
    await expect(
      page.getByText('Wczytywanie wyników…', { exact: true }),
    ).toBeVisible();
    release();
    await expect.poll(() => searches().at(-1).map_zoom).toBe(8);
    expect(searches().length).toBe(before + 1);
    await expect(
      page.getByText('Plany w obszarze: 0', { exact: true }),
    ).toBeVisible();
    await expect(frame.locator('.crew-cluster,.crew-pin')).toHaveCount(0);
  } finally {
    release?.();
  }
});

test('map network failure retries, preserves the list and does not claim fabricated counts', async ({
  page,
  context,
}) => {
  const store = state();
  seed(store);
  store.failMap = true;
  await backend(context, store);
  await mockMapTiles(context);
  await login(page);
  await page.goto('/explore');
  await button(page, 'Pokaż mapę wyjazdów').click();
  await expect(page.getByRole('alert')).toContainText(
    'Nie udało się pobrać wyjazdów na mapie',
  );
  await expect(
    page.getByText('Plany w obszarze: 0', { exact: true }),
  ).toHaveCount(0);
  store.failMap = false;
  await button(page, 'Pobierz wyjazdy ponownie').click();
  await expect(
    page.getByText('Plany w obszarze: 13', { exact: true }),
  ).toBeVisible();
  await button(page, 'Wróć do listy wyjazdów').click();
  await expect(
    page.getByText('Propozycje · 13', { exact: true }),
  ).toBeVisible();
});

test('list pages and scroll, map camera and selected trip survive switching and detail navigation', async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  const store = state();
  seed(store);
  await backend(context, store);
  await mockMapTiles(context);
  await login(page);
  await page.goto('/explore');
  await button(page, 'Otwórz filtry').click();
  await page
    .getByRole('checkbox', { name: 'Szukam pomysłu', exact: true })
    .click();
  await page.getByRole('button', { name: /^Pokaż wyniki/ }).click();
  await expect(
    page.getByText('Propozycje · 13', { exact: true }),
  ).toBeVisible();
  await button(page, 'Pokaż więcej wyjazdów').click();
  const screen = page.getByTestId('discovery-screen');
  await expect(screen.getByTestId('discovery-screen-loaded-10')).toBeAttached();
  await screen.evaluate((el) => {
    el.scrollTop = 420;
  });
  await button(page, 'Pokaż mapę wyjazdów').evaluate((el) => el.click());
  await expect(
    page.getByText('Plany w obszarze: 13', { exact: true }),
  ).toBeVisible();
  const frame = page.frameLocator('iframe[data-testid="discovery-map-frame"]');
  await frame.getByTitle('Przybliż mapę', { exact: true }).click();
  await expect
    .poll(
      () =>
        store.mapCalls.filter((c) => c.endpoint === 'search_trip_map').at(-1)
          .map_zoom,
    )
    .toBe(6);
  await button(page, 'Wróć do listy wyjazdów').click();
  await expect(screen.getByTestId('discovery-screen-loaded-10')).toBeAttached();
  expect(await screen.evaluate((el) => el.scrollTop)).toBe(420);
  await button(page, 'Pokaż mapę wyjazdów').evaluate((el) => el.click());
  await expect(
    page.getByText('Plany w obszarze: 13', { exact: true }),
  ).toBeVisible();
  expect(
    store.mapCalls.filter((c) => c.endpoint === 'search_trip_map').at(-1)
      .map_zoom,
  ).toBe(6);
  await frame.locator('.leaflet-marker-icon[title="Wyjazdy: 13"]').click();
  await page
    .getByRole('button', {
      name: 'Wybierz wyjazd: Wspólny urlop nad morzem numer 0.',
      exact: true,
    })
    .click();
  await button(page, 'Zobacz wyjazd').click();
  await expect(page).toHaveURL(/\/trip\/00000000-0000-4000-8000-000000008000/);
  await page.goBack();
  await expect(page.getByTestId('map-trip-preview')).toBeVisible();
  await button(page, 'Wróć do listy wyjazdów').click();
  await expect(screen.getByTestId('discovery-screen-loaded-10')).toBeAttached();
});

test('a single point at maximum zoom opens its preview without ever mounting a list sheet', async ({
  page,
  context,
}) => {
  const store = state();
  seed(store);
  const saved = {
    id: uuid(9980),
    owner: A,
    name: 'Jeden wyjazd',
    kind: 'trips',
    schema_version: 1,
    filters: filterSetPayload({
      kind: 'trips',
      filters: selectDiscoveryLocation(
        {
          ...INITIAL_FILTERS,
          tripModes: ['planned'],
          landscapeKinds: ['lake'],
        },
        'pl-locality:4259',
      ),
    }),
    created_at: '2026-10-20T12:00:00Z',
    updated_at: '2026-10-20T12:00:00Z',
  };
  store.filterSets.set(saved.id, saved);
  await backend(context, store);
  await mockMapTiles(context);
  await login(page);
  await page.goto('/explore');
  await button(page, 'Zapisane · 1').click();
  await button(page, 'Wczytaj zestaw: ' + saved.name).click();
  await button(page, 'Pokaż mapę wyjazdów').click();
  await expect(
    page.getByText('Plany w obszarze: 1', { exact: true }),
  ).toBeVisible();
  const frame = page.frameLocator('iframe[data-testid="discovery-map-frame"]');
  await frame.getByTitle('Przybliż mapę', { exact: true }).evaluate((el) => {
    for (let i = 0; i < 8; i++) el.click();
  });
  await expect
    .poll(
      () =>
        store.mapCalls.filter((c) => c.endpoint === 'search_trip_map').at(-1)
          .map_zoom,
    )
    .toBe(18);
  await expect(
    page.getByText('Plany w obszarze: 1', { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.__mapChoiceSheetOpened = false;
    const selector = '[role="dialog"][aria-label="Wyjazdy w tym miejscu"]';
    new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes)
          if (
            node instanceof Element &&
            (node.matches(selector) || node.querySelector(selector))
          )
            window.__mapChoiceSheetOpened = true;
    }).observe(document.body, { childList: true, subtree: true });
  });
  let release;
  await context.route('**/rpc/get_trip_map_items', async (route) => {
    if (!route.request().postDataJSON().cluster_key.startsWith('p:'))
      return route.fallback();
    await new Promise((resolve) => {
      release = resolve;
    });
    await route.fallback();
  });
  try {
    await frame.locator('.crew-pin').click();
    await expect.poll(() => !!release).toBe(true);
    await expect(
      page.getByText('Wczytywanie wyjazdu…', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('dialog', { name: 'Wyjazdy w tym miejscu', exact: true }),
    ).toHaveCount(0);
    release();
    await expect(page.getByTestId('map-trip-preview')).toContainText(
      'Wspólny urlop nad morzem numer 0.',
    );
    expect(await page.evaluate(() => window.__mapChoiceSheetOpened)).toBe(
      false,
    );
  } finally {
    release?.();
  }
});

test('saved filters load on the map and selection errors retry without losing criteria', async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  const store = state();
  seed(store);
  const saved = {
    id: uuid(9901),
    name: 'Jezioro z dziećmi',
    kind: 'trips',
    filters: filterSetPayload({
      kind: 'trips',
      filters: {
        ...INITIAL_FILTERS,
        tripModes: ['planned'],
        landscapeKinds: ['lake'],
        childAgeBands: ['4–6'],
      },
    }),
    schema_version: 1,
    created_at: '2026-10-20T12:00:00Z',
    updated_at: '2026-10-20T12:00:00Z',
    owner: A,
  };
  store.filterSets.set(saved.id, saved);
  await backend(context, store);
  await mockMapTiles(context);
  await login(page);
  await page.goto('/explore');
  await button(page, 'Pokaż mapę wyjazdów').click();
  await expect(
    page.getByText('Plany w obszarze: 13', { exact: true }),
  ).toBeVisible();
  await button(page, 'Zapisane · 1').click();
  await button(page, 'Wczytaj zestaw: Jezioro z dziećmi').click();
  await expect(
    page.getByText('Plany w obszarze: 1', { exact: true }),
  ).toBeVisible();
  await expect(button(page, 'Otwórz filtry')).toContainText(saved.name);
  store.failMapItems = true;
  const frame = page.frameLocator('iframe[data-testid="discovery-map-frame"]');
  await frame.locator('.crew-pin').click();
  await expect(page.getByRole('alert')).toContainText('Nie udało się pobrać');
  store.failMapItems = false;
  await button(page, 'Spróbuj ponownie').click();
  await expect(page.getByTestId('map-trip-preview')).toContainText('numer 0');
  await button(page, 'Wróć do listy wyjazdów').click();
  await expect(page.getByText('Propozycje · 1', { exact: true })).toBeVisible();
  await expect(button(page, 'Otwórz filtry')).toContainText(saved.name);
  expect(store.filterSets.get(saved.id)).toEqual(saved);
});

test('a cluster spanning nearby localities zooms and fetches its points without opening a truncated list', async ({
  page,
  context,
}) => {
  const store = state();
  seed(store);
  const city = getLocalities().places.find(
    (row) => row[1] === 'Władysławowo' && row[2] === 1,
  );
  expect(city).toBeTruthy();
  const first = store.trips.values().next().value;
  store.trips.set(uuid(9100), {
    ...first,
    id: uuid(9100),
    location_id: 'pl-locality:' + city[0],
    location_name: city[1],
    location_kind: 'city',
  });
  await backend(context, store);
  await mockMapTiles(context);
  await login(page);
  await page.goto('/explore');
  await button(page, 'Pokaż mapę wyjazdów').click();
  await expect(
    page.getByText('Plany w obszarze: 14', { exact: true }),
  ).toBeVisible();
  const frame = page.frameLocator('iframe[data-testid="discovery-map-frame"]');
  await frame.locator('.leaflet-marker-icon[title="Wyjazdy: 14"]').click();
  await expect
    .poll(
      () =>
        store.mapCalls.filter((c) => c.endpoint === 'search_trip_map').at(-1)
          .map_zoom,
    )
    .toBeGreaterThan(5);
  await expect(
    page.getByRole('dialog', { name: 'Wyjazdy w tym miejscu', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText('Plany w obszarze: 14', { exact: true }),
  ).toBeVisible();
});
