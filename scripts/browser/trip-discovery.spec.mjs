import { recommendCrew, recommendTrip } from './trip-fixtures.mjs';
import {test,expect} from '@playwright/test';
import {B,groupId,profile,state,backend,login} from './trip-fixtures.mjs';
import {expectLoaded,scrollToRow} from './collection-helpers.mjs';
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
function seed(store,n=13){
  for(let i=0;i<n;i++){
    const id=uuid(8000+i);
    store.trips.set(id,{id,group_id:groupId(B),adult_count:2,child_count:1,child_age_bands:['4–6'],mode:'planned',status:'published',visibility:'public',start_date:'2099-05-21',end_date:'2099-05-24',
      location_id:'pl-locality:4259',location_name:'Chłapowo',location_region:'Pomorskie',location_kind:'village',campground_name:'Pod Wydmami',campground_address:'',
      travel_mode:i===0?'Kamper':'Namiot',description:i===0?'Najlepszy plan na wspólny czas nad morzem.':'Kontrolny wyjazd do lasu numer '+i+'.',
      landscape:i===0?'coast':'forest',interests:i===0?['Rowery']:['Kajaki'],animal_kinds:[],matching_group_kinds:[],matching_child_age_bands:[],
      published_at:i===0?'2026-01-01T10:00:00Z':'2026-02-01T10:00:00Z'});
  }
}
test('bounded trip pages, load-more retry, full filter counts, global sorting and direct detail links',async({page,context})=>{
  test.setTimeout(120000);const store=state();seed(store);await backend(context,store);await login(page);await page.goto('/explore');
  const cards=page.locator('[data-testid^="discovery-trip-"]');
  const screen=page.getByTestId('discovery-screen');
  await expect(page.getByText('Propozycje · 13',{exact:true})).toBeVisible();await expect(cards).toHaveCount(5);
  expect(store.tripSearchCalls.filter(c=>c.endpoint==='search_public_trips_v2').every(c=>c.page_size===1||c.page_size===5)).toBe(true);
  let releaseMore;const morePending=new Promise(resolve=>{releaseMore=resolve;});
  await page.route('**/rest/v1/rpc/search_public_trips_v2',async route=>{
    if(route.request().postDataJSON()?.after_cursor)await morePending;
    await route.fallback();
  });
  store.failMore=true;await page.getByRole('button',{name:'Pokaż więcej wyjazdów',exact:true}).click();
  const loadingMore=page.getByRole('button',{name:'Wczytywanie ogłoszeń',exact:true});
  await expect(loadingMore).toBeVisible();await expect(loadingMore).toBeDisabled();await expect(cards).toHaveCount(5);
  await expect(loadingMore.getByLabel('Wczytywanie kolejnych ogłoszeń',{exact:true})).toBeVisible();
  releaseMore();
  await expect(page.getByRole('alert')).toContainText('Nie udało się pobrać ogłoszeń');await expect(cards).toHaveCount(5);
  await expect(page.getByRole('button',{name:'Pokaż więcej wyjazdów',exact:true})).toBeEnabled();
  store.failMore=false;await page.getByRole('button',{name:'Spróbuj ponownie',exact:true}).click();await expectLoaded(screen,10);
  await page.getByRole('button',{name:'Pokaż więcej wyjazdów',exact:true}).click();await expectLoaded(screen,13);
  await expect(page.getByRole('button',{name:'Pokaż więcej wyjazdów',exact:true})).toHaveCount(0);
  expect(store.tripSearchCalls.filter(c=>c.endpoint==='search_public_trips_v2').every(c=>c.page_size===1||c.page_size===5)).toBe(true);
  await page.getByRole('tab',{name:'Start',exact:true}).click();await expect(page).toHaveURL('http://localhost:8085/');
  await page.getByRole('tab',{name:'Odkrywaj',exact:true}).click();await expect(cards).toHaveCount(5);
  await expect(page.getByText('Propozycje · 13',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Pokaż więcej wyjazdów',exact:true}).click();await expectLoaded(screen,10);
  await page.getByRole('tab',{name:'Ekipy',exact:true}).click();await expect(cards).toHaveCount(0);
  await page.getByRole('tablist',{name:'Odkrywaj',exact:true}).getByRole('tab',{name:'Wyjazdy',exact:true}).click();await expect(cards).toHaveCount(5);
  await page.getByRole('button',{name:'Sortowanie: Domyślnie',exact:true}).click();await page.getByRole('radio',{name:'Polecane',exact:true}).click();
  await expect(cards).toHaveCount(5);await expect(cards.first()).toContainText('Najlepszy plan');
  await page.getByRole('button',{name:'Otwórz filtry',exact:true}).click();await page.getByRole('checkbox',{name:'Klimat wyjazdu: Morze',exact:true}).click();
  await expect(page.getByRole('button',{name:'Pokaż wyniki · 1',exact:true})).toBeVisible();await page.getByRole('button',{name:'Pokaż wyniki · 1',exact:true}).click();
  await expect(page.getByText('Propozycje · 1',{exact:true})).toBeVisible();await expect(cards).toHaveCount(1);
  await page.goto('/trip/'+uuid(8012));await expect(page.getByRole('heading',{name:'Kontrolny wyjazd do lasu numer 12.',exact:true})).toBeVisible();
  expect(store.tripSearchCalls.some(c=>c.endpoint==='get_discovery_trip_v2'&&c.target_trip_id===uuid(8012))).toBe(true);
});
test('returning from a listing or its crew restores all viewed pages and the scroll position',async({page,context})=>{
  const store=state();seed(store);await backend(context,store);
  await page.route('**/rest/v1/rpc/get_public_group_v2',async route=>{
    if(route.request().method()==='OPTIONS')return route.fallback();
    return route.fulfill({json:{crew:profile(B).group,recommendation:recommendCrew(profile(B).group),about:'Ekipa na wspólne wyjazdy.',active_trip_count:0,trips:[],has_more:false,cursor:null},
      headers:{'access-control-allow-origin':'http://localhost:8085'}});
  });
  await login(page);await page.goto('/explore');
  const screen=page.getByTestId('discovery-screen'),cards=page.locator('[data-testid^="discovery-trip-"]');
  await expect(cards).toHaveCount(5);
  await page.getByRole('button',{name:'Pokaż więcej wyjazdów',exact:true}).click();await expectLoaded(screen,10);
  const target=page.getByTestId('discovery-trip-'+uuid(8009));
  const openTrip=target.getByRole('button',{name:'Zobacz wyjazd',exact:true});
  await scrollToRow(screen,openTrip);const tripScroll=await screen.evaluate(el=>el.scrollTop);
  expect(tripScroll).toBeGreaterThan(1000);
  await openTrip.click();await expect(page).toHaveURL('http://localhost:8085/trip/'+uuid(8009)+'?recommendationScope=search');
  await page.getByRole('button',{name:'Zobacz profil ekipy',exact:true}).click();
  await expect(page).toHaveURL('http://localhost:8085/crew/'+groupId(B));
  await page.getByRole('button',{name:'Wróć',exact:true}).click();await expect(page).toHaveURL('http://localhost:8085/trip/'+uuid(8009)+'?recommendationScope=search');
  await page.getByRole('button',{name:'Wróć do listy wyjazdów',exact:true}).click();
  await expect(page).toHaveURL('http://localhost:8085/explore');await expectLoaded(screen,10);
  await expect(page.getByRole('button',{name:'Pokaż więcej wyjazdów',exact:true})).toBeEnabled();
  await expect.poll(async()=>Math.abs(await screen.evaluate(el=>el.scrollTop)-tripScroll)).toBeLessThan(4);
  const openCrew=target.getByRole('button',{name:/^Zobacz profil:/});
  await openCrew.scrollIntoViewIfNeeded();const crewScroll=await screen.evaluate(el=>el.scrollTop);
  await openCrew.click();await expect(page).toHaveURL('http://localhost:8085/crew/'+groupId(B));
  await page.getByRole('button',{name:'Wróć',exact:true}).click();
  await expect(page).toHaveURL('http://localhost:8085/explore');await expectLoaded(screen,10);
  await expect(page.getByRole('button',{name:'Pokaż więcej wyjazdów',exact:true})).toBeEnabled();
  await expect.poll(async()=>Math.abs(await screen.evaluate(el=>el.scrollTop)-crewScroll)).toBeLessThan(4);
  await page.getByRole('button',{name:'Pokaż więcej wyjazdów',exact:true}).click();await expectLoaded(screen,13);
  await page.getByRole('tab',{name:'Start',exact:true}).click();await expect(page).toHaveURL('http://localhost:8085/');
  await page.getByRole('tab',{name:'Odkrywaj',exact:true}).click();await expect(cards).toHaveCount(5);
});
test('failed trip count offers retry and never shows a fabricated zero',async({page,context})=>{
  const store=state();seed(store,3);await backend(context,store);await login(page);await page.goto('/explore');
  await page.getByRole('button',{name:'Otwórz filtry',exact:true}).click();await expect(page.getByRole('button',{name:'Pokaż wyniki · 3',exact:true})).toBeVisible();
  store.failTripCount=true;await page.getByRole('checkbox',{name:'Klimat wyjazdu: Morze',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Nie udało się sprawdzić liczby wyjazdów');
  await expect(page.getByRole('button',{name:'Pokaż wyniki · 0',exact:true})).toHaveCount(0);
  store.failTripCount=false;await page.getByRole('button',{name:'Policz wyjazdy ponownie',exact:true}).click();
  await expect(page.getByRole('button',{name:'Pokaż wyniki · 1',exact:true})).toBeVisible();
});
