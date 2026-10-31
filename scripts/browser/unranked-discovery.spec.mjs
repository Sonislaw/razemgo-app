import { test, expect } from '@playwright/test';
import { A, B, groupId, profile, state, backend, login, recommendCrew, recommendTrip } from './trip-fixtures.mjs';

const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const plan = (n, owner) => ({
  id: uuid(n), group_id: groupId(owner), adult_count:2,child_count:1,child_age_bands:['4–6'],mode:'planned', status: 'published', visibility: 'public',
  start_date: '2099-05-21', end_date: '2099-05-24', location_id: 'pl-locality:4259',
  location_name: 'Chłapowo', location_region: 'pomorskie', location_kind: 'village',
  campground_name: 'Pod Wydmami', campground_address: '', travel_mode: 'Kamper',
  description: 'Wspólny odpoczynek nad morzem i rowery o zachodzie słońca.', landscape: 'coast',
  interests: ['Rowery'], animal_kinds: [], matching_group_kinds: [], matching_child_age_bands: [],
  published_at: '2026-10-31T10:00:00Z',
});

test('Start and trip cards show ordinary facts without personalized labels or matching details', async ({ page, context }) => {
  const store = state(), own = plan(9901, A), other = plan(9902, B);
  other.published_at = '2026-10-31T11:00:00Z';
  for (const trip of [own, other]) store.trips.set(trip.id, trip);
  await backend(context, store); await login(page);
  const home = page.getByTestId('home-latest-listing');
  await expect(home).not.toContainText(/Podobne plany|Wspólne zainteresowania|Podobny wiek dzieci/);
  await expect(home).not.toContainText('Terminy się pokrywają');
  await expect(home).not.toContainText(/\d+%/);
  await page.goto('/explore');
  const card = page.getByTestId('discovery-trip-' + other.id);
  await expect(card).not.toContainText(/Podobne plany|Wspólne zainteresowania|Podobny wiek dzieci/);
  await expect(card).not.toContainText('Terminy się pokrywają');
  await expect(card.getByText('Rowery', { exact: true })).toBeVisible();
  await expect(card.getByText('Dzieci 4–6 lat', { exact: true })).toBeVisible();
  await expect(card).not.toContainText(/\d+%|wspólnych nocy|wspólne noce/);
  await page.setViewportSize({ width: 320, height: 800 });
  await card.screenshot({ path: '.expo/recommendation-trip-small.png' });
  expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth + 2)).toBe(true);
  await card.getByRole('button', { name: 'Zobacz wyjazd', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Wyjazd', exact: true })).toBeVisible();
  await expect(page.locator('[data-testid="recommendation-details"]:visible')).toHaveCount(0);
  await expect(page.getByText('Rowery', { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zaproś do kontaktu', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Wróć do listy wyjazdów', exact: true }).click();
  await expect(card).not.toContainText(/Podobne plany|Wspólne zainteresowania|Podobny wiek dzieci/);
});

test('a card without shared evidence has no rating and still permits contact', async ({ page, context }) => {
  const store = state(), trip = { ...plan(9903, B), interests: [], travel_mode: 'Namiot' };
  store.trips.set(trip.id, trip); await backend(context, store);
  const crew = { ...profile(B).group, kind: 'couple', child_count: 0, child_age_bands: [], interests: [], travel_mode: 'Namiot' };
  const item = { trip, crew, recommendation: { version: 2, label: null, reasons: [], context: { kind: 'profile' } } };
  await page.route('**/rest/v1/rpc/search_public_trips_v3', async route => {
    if (route.request().method() === 'OPTIONS') return route.fallback();
    return route.fulfill({ json: { items: [item], total_count: 1, has_more: false, cursor: null },
      headers: { 'access-control-allow-origin': 'http://localhost:8085' } });
  });
  await page.route('**/rest/v1/rpc/get_discovery_trip_v3', async route => {
    if (route.request().method() === 'OPTIONS') return route.fallback();
    return route.fulfill({ json: item, headers: { 'access-control-allow-origin': 'http://localhost:8085' } });
  });
  await login(page); await page.goto('/explore');
  const card = page.getByTestId('discovery-trip-' + trip.id);
  await expect(card).toBeVisible();
  await expect(card).not.toContainText(/Podobne plany|Wspólne zainteresowania|Podobny wiek dzieci|Za mało danych|\d+%/);
  await card.getByRole('button', { name: 'Zobacz wyjazd', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Wyjazd', exact: true })).toBeVisible();
  await expect(page.locator('[data-testid="recommendation-details"]:visible')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Zaproś do kontaktu', exact: true })).toBeEnabled();
});

test('welcome examples describe an idea without claiming a personal match or putting a percentage in accessibility labels', async ({ page, context }) => {
  await backend(context, state()); await page.goto('/welcome');
  const card = page.getByTestId('welcome-featured-listing');
  await expect(card).not.toContainText('Pomysł na wyjazd');
  await expect(card).not.toContainText(/\d+%|Podobne plany|Wspólne zainteresowania/);
  await expect(card.locator('[aria-label*="%"]')).toHaveCount(0);
  await card.getByRole('button', { name: 'Dołącz', exact: true }).click();
  await expect(page).toHaveURL('http://localhost:8085/auth/sign-up');
});

test('Start and crew listings open direct details without personal context and preserve unrelated discovery filters', async ({ page, context }) => {
  const store=state(),own=plan(9911,A),other={...plan(9912,B),published_at:'2026-10-31T11:00:00Z'};
  for(const trip of [own,other])store.trips.set(trip.id,trip);
  await backend(context,store);
  const crewInfo={crew:profile(B).group,about:'Rowery i wspólne wyjazdy.',active_trip_count:1,
    recommendation:recommendCrew(profile(B).group),trips:[{trip:other,crew:profile(B).group,recommendation:recommendTrip(other,profile(B).group,store)}],has_more:false,cursor:null};
  await page.route('**/rest/v1/rpc/get_public_group_v3',async route=>{
    if(route.request().method()==='OPTIONS')return route.fallback();
    return route.fulfill({json:crewInfo,
      headers:{'access-control-allow-origin':'http://localhost:8085'}});
  });
  await page.route('**/rest/v1/rpc/list_public_groups_v3',async route=>{
    if(route.request().method()==='OPTIONS')return route.fallback();
    return route.fulfill({json:{items:[crewInfo],total_count:1,has_more:false,cursor:null},headers:{'access-control-allow-origin':'http://localhost:8085'}});
  });
  await login(page);await page.goto('/explore');
  await page.getByRole('button',{name:'Otwórz filtry',exact:true}).click();
  await page.getByRole('button',{name:'Wybierz zakres dat',exact:true}).click();
  await page.getByLabel(/^25 października 2026/).click();await page.getByLabel(/^28 października 2026/).click();
  await page.getByRole('button',{name:'Wybierz daty',exact:true}).click();
  await page.getByRole('button',{name:/^Pokaż wyniki/}).click();
  await expect(page.getByText('Propozycje · 0',{exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'Start',exact:true}).click();
  const home=page.getByTestId('home-latest-listing');await expect(home).not.toContainText('Podobne plany');
  await home.getByRole('button',{name:'Zobacz wyjazd',exact:true}).click();
  await expect(page.getByRole('heading', { name: 'Wyjazd', exact: true })).toBeVisible();
  await expect(page.locator('[data-testid="recommendation-details"]:visible')).toHaveCount(0);
  const detailCalls=()=>store.tripSearchCalls.filter(call=>call.endpoint==='get_discovery_trip_v3');
  expect(detailCalls().at(-1).filters).toBeUndefined();
  await page.getByRole('button',{name:'Wróć do listy wyjazdów',exact:true}).click();
  await page.getByRole('tab',{name:'Odkrywaj',exact:true}).click();
  await expect(page.getByText('Propozycje · 0',{exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'Ekipy',exact:true}).click();
  await page.getByTestId('public-group-'+groupId(B)).click();
  const card=page.getByTestId('discovery-trip-'+other.id);await expect(card).not.toContainText('Podobne plany');
  await card.getByRole('button',{name:'Zobacz wyjazd',exact:true}).click();
  await expect(page.getByRole('heading', { name: 'Wyjazd', exact: true })).toBeVisible();
  await expect(page.locator('[data-testid="recommendation-details"]:visible')).toHaveCount(0);
  expect(detailCalls().at(-1).filters).toBeUndefined();
});
