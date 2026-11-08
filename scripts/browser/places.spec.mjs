import { test, expect } from '@playwright/test';
import { A,groupId,state,backend,login } from './trip-fixtures.mjs';
import { openSuggestions,suggestionField } from './autocomplete-helpers.mjs';
import { mockMapTiles } from './map-fixtures.mjs';
const id='00000000-0000-4000-8000-000000065432';
const button=(page,name)=>page.getByRole('button',{name,exact:true});
const field=(page,name)=>page.getByRole('textbox',{name,exact:true});
function seed(){const store=state();store.trips.set(id,{id,group_id:groupId(A),mode:'planned',status:'published',visibility:'public',start_date:'2099-05-21',end_date:'2099-05-24',location_id:'pl-locality:4259',location_name:'Chłapowo',location_region:'pomorskie',location_kind:'village',campground_name:'',campground_address:'',travel_mode:'Kamper',description:'Spokojny wyjazd nad morze, rowery i rozmowy przy ognisku.',landscape:'coast',interests:[],animal_kinds:[],matching_group_kinds:[],matching_child_age_bands:[],adult_count:2,child_count:0,child_age_bands:[],published_at:'2026-10-24T12:00:00Z'});return store;}
async function edit(page){await page.goto('/trip-editor?id='+id);await button(page,'Dalej').click();}
for(const width of [320,390])test(`one Google location field selects towns and campsites, retains failures and restores the saved place at ${width}px`,async({page,context})=>{
  await page.setViewportSize({width,height:844});const store=seed();await backend(context,store);await login(page);await edit(page);
  let input=await openSuggestions(page,'Dokąd jedziecie?');await expect(input).toBeFocused();await input.fill('Chłapowo pomorskie');
  await page.getByRole('button',{name:/^Wybierz miejsce: Chłapowo,/}).first().click();
  await expect(field(page,'Nazwa kempingu')).toHaveCount(0);await expect(field(page,'Adres kempingu')).toHaveCount(0);
  input=await openSuggestions(page,'Dokąd jedziecie?');await input.fill('Camping Morski');
  const result=page.getByRole('button',{name:/^Wybierz miejsce: Camping Morski,/});await expect(result).toBeVisible();
  store.failPlaces=true;await result.click();await expect(page.getByRole('alert')).toContainText('Nie udało się wczytać miejsca');
  await expect(input).toHaveValue('Camping Morski');store.failPlaces=false;await result.click();
  await expect(page.getByTestId('trip-editor-location')).toContainText('Armii Krajowej 4, 76-270 Ustka');
  await page.getByTestId('trip-editor-location').screenshot({path:'.expo/google-place-'+width+'.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  store.failSave=true;await button(page,'Zapisz zmiany').click();await expect(page.getByRole('alert')).toContainText('Nie udało się zapisać');
  await expect(suggestionField(page,'Dokąd jedziecie?')).toContainText('Camping Morski');store.failSave=false;
  await button(page,'Zapisz zmiany').click();await expect(page).toHaveURL('http://localhost:8085/trips');
  const p=store.trips.get(id).place_data;expect(p.source).toBe('google');expect(p.googlePlaceId).toBe('qa_camp_morski');expect(p.address).toBe('');expect(p.latitude).toBeUndefined();
  await edit(page);await expect(page.getByTestId('trip-editor-location')).toContainText('Armii Krajowej 4, 76-270 Ustka');
});
test('provider failure still permits a manual campsite with address and a map point, including editing and reload',async({page,context})=>{
  const store=seed();await backend(context,store);await mockMapTiles(context);await login(page);await edit(page);
  store.failPlaces=true;await (await openSuggestions(page,'Dokąd jedziecie?')).fill('Miejsce poza bazą');
  await expect(page.getByRole('alert')).toContainText('Nie udało się pobrać podpowiedzi');
  await button(page,'Nie ma tego miejsca? Dodaj ręcznie').click();await field(page,'Nazwa miejsca').fill('Ręcznie dodany kemping');
  await button(page,'Kemping').click();await field(page,'Adres miejsca').fill('Leśna 17, Ustka');await field(page,'Region').fill('pomorskie');
  await button(page,'Wskaż punkt na mapie').click();
  const map=page.getByTestId('manual-place-map').frameLocator('iframe');await expect(map.locator('.google-map-canvas')).toBeVisible();
  await map.locator('#map').click({position:{x:140,y:130}});await expect(page.getByText('Punkt wybrany.',{exact:false})).toBeVisible();
  await button(page,'Użyj tego miejsca').click();await expect(page.getByTestId('trip-editor-location')).toContainText('Leśna 17, Ustka');
  await button(page,'Zapisz zmiany').click();await expect(page).toHaveURL('http://localhost:8085/trips');
  const p=store.trips.get(id).place_data;expect(p.source).toBe('manual');expect(p.address).toBe('Leśna 17, Ustka');expect(Number.isFinite(p.latitude)).toBe(true);
  await edit(page);await openSuggestions(page,'Dokąd jedziecie?');await expect(field(page,'Adres miejsca')).toHaveValue('Leśna 17, Ustka');
  await field(page,'Adres miejsca').fill('Leśna 19, Ustka');await button(page,'Użyj tego miejsca').click();await button(page,'Zapisz zmiany').click();
  await expect(page).toHaveURL('http://localhost:8085/trips');expect(store.trips.get(id).place_data.address).toBe('Leśna 19, Ustka');
});
