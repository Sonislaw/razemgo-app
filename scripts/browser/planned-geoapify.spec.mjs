import {test,expect} from '@playwright/test';
import {B,groupId,state,backend,login} from './trip-fixtures.mjs';
import {mockSearchAreas} from './places-fixtures.mjs';
import {openSuggestions,suggestionField} from './autocomplete-helpers.mjs';
import {mockMapTiles} from './map-fixtures.mjs';

const button=(page,name)=>page.getByRole('button',{name,exact:true});
const field=(page,name)=>page.getByRole('textbox',{name,exact:true});
async function start(page) {
  await page.goto('/trip-editor');await page.getByRole('radio',{name:'Mam plan',exact:true}).click();
  await button(page,'Wybierz zakres dat').click();
  await page.getByLabel(/^25 października 2026/).click();await page.getByLabel(/^28 października 2026/).click();
  await button(page,'Wybierz daty').click();await button(page,'Dalej').click();
}
async function area(page,name='Ustka') {
  await (await openSuggestions(page,'Miejscowość / wieś')).fill(name);
  await page.getByRole('button',{name:new RegExp('^Wybierz miejsce: '+name+',')}).first().click();
}
async function camp(page) {
  await (await openSuggestions(page,'Konkretne miejsce')).fill('Camp');
  await page.getByRole('button',{name:/^Wybierz miejsce: Camping Morski,/}).click();
}
for(const width of [320,390])test(`planned trips require area then place, persist the locality and Google place and reuse the existing selection at ${width}px`,async({page,context})=>{
  test.setTimeout(120000);await page.setViewportSize({width,height:844});
  const store=state();await backend(context,store);await mockMapTiles(context);await login(page);await start(page);
  await expect(suggestionField(page,'Konkretne miejsce')).toHaveCount(0);
  await field(page,'Opis wyjazdu').fill('Spokojny wypoczynek na kempingu i wieczorne rozmowy przy ognisku.');
  await button(page,'Opublikuj wyjazd').click();await expect(field(page,'Miejscowość / wieś')).toBeFocused();
  await field(page,'Miejscowość / wieś').fill('Ustka');await page.getByRole('button',{name:/^Wybierz miejsce: Ustka,/}).first().click();
  await expect(suggestionField(page,'Konkretne miejsce')).toBeVisible();
  await button(page,'Opublikuj wyjazd').click();await expect(field(page,'Konkretne miejsce')).toBeFocused();
  await field(page,'Konkretne miejsce').fill('Camp');await page.getByRole('button',{name:/^Wybierz miejsce: Camping Morski,/}).click();
  await expect(page.getByTestId('trip-editor-location')).toContainText('Armii Krajowej 4');
  const selectedArea=store.placeCalls.find(c=>c.action==='autocomplete').areaId;
  expect(store.areaCalls.every(call=>call.localitiesOnly===true)).toBe(true);
  await openSuggestions(page,'Miejscowość / wieś');await button(page,'Użyj wybranej miejscowości: Ustka').click();
  await expect(suggestionField(page,'Konkretne miejsce')).toContainText('Camping Morski');
  await page.getByTestId('trip-editor-location').screenshot({path:'.expo/planned-geoapify-'+width+'.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await button(page,'Opublikuj wyjazd').click();await expect(page).toHaveURL('http://localhost:8085/trips');
  const trip=[...store.trips.values()][0];
  expect(trip.search_area_data.id).toBe(selectedArea);expect(trip.search_area_data.name).toBe('Ustka');
  expect(trip.place_data.source).toBe('google');expect(trip.place_data.googlePlaceId).toBe('qa_camp_morski');expect(trip.place_data.latitude).toBeUndefined();
  const before={areas:store.areaCalls.length,places:store.geoPlaceCalls?.length??0};
  await page.goto('/trips/'+trip.id);await expect(page.getByTestId('trip-map-card')).toContainText('Google Maps');
  await expect(page.getByTestId('trip-google-map').frameLocator('iframe').locator('.google-map-canvas')).toBeAttached();
  await page.reload();await expect(page.getByText('Camping Morski',{exact:true})).toBeAttached();
  await page.goto('/trip-editor?id='+trip.id);await button(page,'Dalej').click();
  await expect(suggestionField(page,'Miejscowość / wieś')).toContainText('Ustka');await expect(suggestionField(page,'Konkretne miejsce')).toContainText('Camping Morski');
  await openSuggestions(page,'Konkretne miejsce');await button(page,'Użyj wybranego miejsca: Camping Morski').click();
  expect({areas:store.areaCalls.length,places:store.geoPlaceCalls?.length??0}).toEqual(before);expect(store.placeCalls.filter(c=>c.action==='autocomplete')).toHaveLength(1);
  await area(page,'Kozienice');await expect(suggestionField(page,'Konkretne miejsce')).not.toContainText('Camping Morski');
  await button(page,'Zapisz zmiany').click();await expect(field(page,'Konkretne miejsce')).toBeFocused();
});

for(const width of [320,390])test(`planned discovery cards display the stored town without Google reads; only details resolve the campsite at ${width}px`,async({page,context})=>{
  await page.setViewportSize({width,height:844});
  const store=state(),id='00000000-0000-4000-8000-000000062355';
  const town=mockSearchAreas({query:'Ustka',localitiesOnly:true}).areas.find(a=>a.name==='Ustka');
  const google={id:'google:qa_camp_morski',source:'google',googlePlaceId:'qa_camp_morski',kind:'campground',name:'Camp',userLabel:'Camp',address:'',region:'',country:''};
  store.trips.set(id,{id,group_id:groupId(B),mode:'planned',status:'published',visibility:'public',start_date:'2099-05-21',end_date:'2099-05-24',
    search_area_data:town,place_data:google,location_id:google.id,location_name:'Camp',location_region:'',location_kind:'locality',
    campground_name:'',campground_address:'',travel_mode:'Kamper',description:'Spokojny wypoczynek nad morzem i wspólne spacery.',landscape:'coast',
    interests:[],animal_kinds:[],matching_group_kinds:[],matching_child_age_bands:[],adult_count:2,child_count:0,child_age_bands:[],published_at:'2026-10-24T12:00:00Z'});
  await backend(context,store);await mockMapTiles(context);await login(page);await page.goto('/explore');
  await page.getByRole('radio',{name:'Mam plan',exact:true}).click();
  const card=page.getByTestId('discovery-trip-'+id);
  await expect(card.getByText('Ustka',{exact:true})).toBeVisible();
  await expect(card).not.toContainText('Camping Morski');expect(store.placeCalls??[]).toHaveLength(0);expect(store.areaCalls??[]).toHaveLength(0);
  await card.getByRole('button',{name:'Zobacz wyjazd',exact:true}).click();
  await expect(page).toHaveURL('http://localhost:8085/trip/'+id);
  await expect(page.getByText('Camping Morski',{exact:true})).toBeAttached();
  expect(store.placeCalls.filter(c=>c.action==='details')).toHaveLength(1);expect(store.areaCalls??[]).toHaveLength(0);
});

test('a failed Google place search retries in the same town and a manual destination keeps its address and permanent point',async({page,context})=>{
  const store=state();await backend(context,store);await login(page);await start(page);await area(page);
  store.failPlaces=true;await (await openSuggestions(page,'Konkretne miejsce')).fill('Camp');
  await expect(page.getByRole('alert')).toContainText('Nie udało się pobrać podpowiedzi');
  await expect(field(page,'Konkretne miejsce')).toHaveValue('Camp');expect(store.placeCalls.filter(c=>c.action==='details')).toHaveLength(0);
  store.failPlaces=false;await button(page,'Spróbuj ponownie').click();await page.getByRole('button',{name:/^Wybierz miejsce: Camping Morski,/}).click();
  await openSuggestions(page,'Konkretne miejsce');await button(page,'Nie ma tego miejsca? Dodaj ręcznie').click();
  await field(page,'Nazwa miejsca').fill('Nasza polana');await field(page,'Adres miejsca').fill('Armii Krajowej 4, Ustka');
  await button(page,'Użyj tego miejsca').click();
  await field(page,'Opis wyjazdu').fill('Wspólne spacery, wycieczki rowerowe i odpoczynek nad morzem.');
  await button(page,'Opublikuj wyjazd').click();await expect(page).toHaveURL('http://localhost:8085/trips');
  const saved=[...store.trips.values()][0];expect(saved.place_data.source).toBe('manual');expect(saved.place_data.latitude).toBe(54.579);expect(saved.place_data.googlePlaceId).toBeUndefined();
  expect(store.geoPlaceCalls.filter(c=>c.action==='manual-address')).toHaveLength(1);expect(store.placeCalls.filter(c=>c.action==='details')).toHaveLength(1);
  expect(saved.place_data.coordinateSource).toBe('address');
  await page.goto('/trip-editor?id='+saved.id);await button(page,'Dalej').click();await openSuggestions(page,'Konkretne miejsce');
  await field(page,'Adres miejsca').fill('Armii Krajowej 6, Ustka');await button(page,'Użyj tego miejsca').click();
  expect(store.geoPlaceCalls.filter(c=>c.action==='manual-address')).toHaveLength(2);
});

test('manual area and pinned destination remain available without any location provider',async({page,context})=>{
  const store=state();await backend(context,store);await mockMapTiles(context);await login(page);await start(page);
  await openSuggestions(page,'Miejscowość / wieś');await button(page,'Nie ma tej miejscowości? Dodaj ręcznie').click();
  await expect(page.getByText('Rodzaj obszaru',{exact:true})).toHaveCount(0);
  for(const name of ['Region','Kraj'])await expect(button(page,name)).toHaveCount(0);
  await field(page,'Nazwa miejscowości / wsi').fill('Chłapowo');await field(page,'Region').fill('pomorskie');await button(page,'Użyj tej miejscowości').click();
  await openSuggestions(page,'Konkretne miejsce');await expect(page.getByTestId('manual-place-form')).toBeVisible();
  await field(page,'Nazwa miejsca').fill('Leśna polana');await button(page,'Wskaż punkt na mapie').click();
  const map=page.getByTestId('manual-place-map').frameLocator('iframe');await expect(map.locator('.google-map-canvas')).toBeVisible();
  await map.locator('#map').click({position:{x:140,y:130}});await button(page,'Użyj tego miejsca').click();
  await field(page,'Opis wyjazdu').fill('Odpoczynek na leśnej polanie i wspólne ognisko wieczorem.');
  await button(page,'Opublikuj wyjazd').click();await expect(page).toHaveURL('http://localhost:8085/trips');
  const saved=[...store.trips.values()][0];expect(saved.search_area_data.source).toBe('manual');expect(saved.place_data.source).toBe('manual');
  expect(saved.search_area_data.kind).toBe('locality');
  expect(Number.isFinite(saved.place_data.latitude)).toBe(true);expect(store.placeCalls??[]).toHaveLength(0);expect(store.geoPlaceCalls??[]).toHaveLength(0);expect(store.areaCalls??[]).toHaveLength(0);
});

test('planned town picker excludes regions and countries before searching for a concrete destination',async({page,context})=>{
  const store=state();await backend(context,store);await login(page);await start(page);
  const input=await openSuggestions(page,'Miejscowość / wieś');
  await input.fill('pomorskie');
  await expect(page.getByText('Wybierz miejscowość lub wieś',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/^Wybierz miejsce:.*,( Region| Kraj)$/})).toHaveCount(0);
  await expect(page.getByRole('button',{name:/^Wybierz miejsce:.*Miejscowość$/}).first()).toBeVisible();
  await input.fill('Polska');
  await expect.poll(()=>store.areaCalls.at(-1)?.query).toBe('Polska');
  await expect(page.getByText('Brak pasujących miejscowości. Możesz dodać własną.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/^Wybierz miejsce:/})).toHaveCount(0);
  expect(store.areaCalls.every(call=>call.localitiesOnly===true)).toBe(true);
  expect(store.geoPlaceCalls??[]).toHaveLength(0);expect(store.placeCalls??[]).toHaveLength(0);
});
