import {test,expect} from '@playwright/test';
import {B,groupId,state,backend,login} from './trip-fixtures.mjs';
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
function seed(store,n=45){
  for(let i=0;i<n;i++){
    const id=uuid(8000+i);
    store.trips.set(id,{id,group_id:groupId(B),mode:'planned',status:'published',visibility:'public',start_date:'2099-05-21',end_date:'2099-05-24',
      location_id:'pl-locality:4259',location_name:'Chłapowo',location_region:'Pomorskie',location_kind:'village',campground_name:'Pod Wydmami',campground_address:'',
      travel_mode:i===0?'Kamper':'Namiot',description:i===0?'Najlepszy plan na wspólny czas nad morzem.':'Kontrolny wyjazd do lasu numer '+i+'.',
      landscape:i===0?'coast':'forest',interests:i===0?['Rowery']:['Kajaki'],animal_kinds:[],matching_group_kinds:[],matching_child_age_bands:[],
      published_at:i===0?'2026-01-01T10:00:00Z':'2026-02-01T10:00:00Z'});
  }
}
test('bounded trip pages, load-more retry, full filter counts, global sorting and direct detail links',async({page,context})=>{
  test.setTimeout(120000);const store=state();seed(store);await backend(context,store);await login(page);await page.goto('/explore');
  const cards=page.locator('[data-testid^="discovery-trip-"]');
  await expect(page.getByText('Propozycje · 45',{exact:true})).toBeVisible();await expect(cards).toHaveCount(20);
  expect(store.tripSearchCalls.filter(c=>c.endpoint==='search_public_trips').every(c=>c.page_size<=20)).toBe(true);
  store.failMore=true;await page.getByRole('button',{name:'Pokaż więcej wyjazdów',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Nie udało się pobrać ogłoszeń');await expect(cards).toHaveCount(20);
  store.failMore=false;await page.getByRole('button',{name:'Spróbuj ponownie',exact:true}).click();await expect(cards).toHaveCount(40);
  await page.getByRole('button',{name:'Pokaż więcej wyjazdów',exact:true}).click();await expect(cards).toHaveCount(45);
  await expect(page.getByRole('button',{name:'Pokaż więcej wyjazdów',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Sortowanie: Domyślnie',exact:true}).click();await page.getByRole('radio',{name:'Najwyższa zgodność',exact:true}).click();
  await expect(cards).toHaveCount(20);await expect(cards.first()).toContainText('Najlepszy plan');
  await page.getByRole('button',{name:'Otwórz filtry',exact:true}).click();await page.getByRole('checkbox',{name:'Klimat wyjazdu: Morze',exact:true}).click();
  await expect(page.getByRole('button',{name:'Pokaż wyniki · 1',exact:true})).toBeVisible();await page.getByRole('button',{name:'Pokaż wyniki · 1',exact:true}).click();
  await expect(page.getByText('Propozycje · 1',{exact:true})).toBeVisible();await expect(cards).toHaveCount(1);
  await page.goto('/trip/'+uuid(8044));await expect(page.getByRole('heading',{name:'Kontrolny wyjazd do lasu numer 44.',exact:true})).toBeVisible();
  expect(store.tripSearchCalls.some(c=>c.endpoint==='get_discovery_trip'&&c.target_trip_id===uuid(8044))).toBe(true);
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
