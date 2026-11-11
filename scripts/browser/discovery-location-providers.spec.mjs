import { test, expect } from '@playwright/test';
import { state, backend, login } from './trip-fixtures.mjs';
import { openSuggestions, suggestionField } from './autocomplete-helpers.mjs';

const label = 'Gdzie chcecie pojechać?';
const button = (page, name) => page.getByRole('button', { name, exact: true });

for (const width of [320, 390]) for (const mode of ['flexible', 'planned']) {
  test(`discovery ${mode} filters use only their own location provider at ${width}px`, async ({page, context}) => {
    await page.setViewportSize({width, height:844});
    const store=state();
    await backend(context,store); await login(page); await page.goto('/explore');
    if (mode === 'planned') await page.getByRole('radio',{name:'Mam plan',exact:true}).click();
    await button(page,'Otwórz filtry').click();
    const input=await openSuggestions(page,label);
    const flexible=mode==='flexible', name=flexible?'Kozienice':'Camping Morski';
    await expect(page.getByTestId(flexible?'geoapify-area-suggestions':'google-place-suggestions')).toBeVisible();
    await expect(page.getByTestId(flexible?'google-place-suggestions':'geoapify-area-suggestions')).toHaveCount(0);
    await input.fill(flexible?'Koz':'Camping');
    await page.getByRole('button',{name:new RegExp('^Wybierz miejsce: '+name+',')}).click();
    await expect(suggestionField(page,label)).toContainText(name);
    await page.getByRole('button',{name:/^Pokaż wyniki/}).click();
    const queries=()=>store.tripSearchCalls.filter(c=>c.endpoint==='search_public_trips_v3'&&c.page_size===5);
    await expect.poll(()=>queries().at(-1)?.filters.location?.place?.source).toBe(flexible?'geoapify':'google');
    const filters=queries().at(-1).filters;
    expect(filters.trip_modes).toEqual([mode]);
    expect(filters.location.place.source).toBe(flexible?'geoapify':'google');
    if(flexible) {
      expect(filters.location.name).toBe(name);
      expect(filters.location.place.latitude).toBe(51.585);
      expect(filters.location.place.bounds).toBeTruthy();
      expect(store.placeCalls??[]).toHaveLength(0);
      expect(store.areaCalls).toHaveLength(1);
    } else {
      expect(store.areaCalls??[]).toHaveLength(0);
      expect(store.placeCalls.filter(c=>c.action==='details')).toHaveLength(1);
      expect(store.placeCalls.find(c=>c.action==='autocomplete').mode).toBe('planned');
    }
    // Reopening an unchanged selection must not perform another lookup.
    const before={areas:(store.areaCalls??[]).length,places:(store.placeCalls??[]).length};
    await button(page,'Otwórz filtry').click(); await openSuggestions(page,label);
    await expect(button(page,(flexible?'Użyj wybranego obszaru: ':'Użyj wybranego miejsca: ')+name)).toBeVisible();
    await page.waitForTimeout(650);
    expect({areas:(store.areaCalls??[]).length,places:(store.placeCalls??[]).length}).toEqual(before);
    await page.screenshot({path:`.expo/discovery-location-${mode}-${width}.png`});
  });
}

test('failed Geoapify discovery search keeps the query and never falls back to Google; switching to plans uses Google',async({page,context})=>{
  const store=state(); await backend(context,store); await login(page); await page.goto('/explore');
  await button(page,'Otwórz filtry').click();
  store.failAreas=true;
  const input=await openSuggestions(page,label); await input.fill('Koz');
  await expect(page.getByRole('alert')).toContainText('Nie udało się pobrać obszarów');
  await expect(input).toHaveValue('Koz'); expect(store.placeCalls??[]).toHaveLength(0);
  store.failAreas=false; await button(page,'Spróbuj ponownie').click();
  await page.getByRole('button',{name:/^Wybierz miejsce: Kozienice,/}).click();
  await page.getByRole('button',{name:/^Pokaż wyniki/}).click();
  expect(store.placeCalls??[]).toHaveLength(0);
  const areaCount=store.areaCalls.length;
  await page.getByRole('radio',{name:'Mam plan',exact:true}).click();
  await button(page,'Otwórz filtry').click();
  const googleInput=await openSuggestions(page,label); await googleInput.fill('Camping');
  await page.getByRole('button',{name:/^Wybierz miejsce: Camping Morski,/}).click();
  expect(store.areaCalls).toHaveLength(areaCount);
  expect(store.placeCalls.filter(c=>c.action==='details')).toHaveLength(1);
});
