import { test, expect } from '@playwright/test';
import { A,B,groupId,state,backend,login } from './trip-fixtures.mjs';

const TRIP='00000000-0000-4000-8000-000000009950';
function fixture(){
  const store=state();store.trips.set(TRIP,{id:TRIP,group_id:groupId(B),mode:'planned',status:'published',visibility:'public',
    start_date:'2027-05-21',end_date:'2027-05-24',location_id:'test',location_name:'Chłapowo',location_region:'Pomorskie',location_kind:'village',
    campground_name:'Pod Wydmami',campground_address:'',travel_mode:'Kamper',description:'Plaża, rowery i kawa z widokiem na morze.',
    landscape:'coast',interests:['Rowery'],animal_kinds:[],matching_group_kinds:[],matching_child_age_bands:[],
    published_at:'2026-10-24T11:00:00Z',created_at:'2026-10-24T11:00:00Z',updated_at:'2026-10-24T11:00:00Z'});return store;
}
test('reactions work on Start, Discover and details, persist on reload and keep favorites separate',async({page,context})=>{
  const store=fixture();await backend(context,store);await login(page);
  const home=page.getByTestId('home-latest-listing'),reaction=page.locator('[data-testid="trip-reactions-'+TRIP+'"]:visible');
  await home.getByTestId('trip-reactions-'+TRIP).click();await page.getByRole('button',{name:'Ciekawy plan',exact:true}).click();
  await expect(home.getByTestId('trip-reactions-'+TRIP)).toHaveAttribute('aria-label',/Twoja reakcja: Ciekawy plan.*1/);
  expect(store.favoriteTrips.get(A)?.size??0).toBe(0);
  await page.getByRole('tab',{name:'Odkrywaj',exact:true}).click();
  const card=page.getByTestId('discovery-trip-'+TRIP);
  await expect(card.getByTestId('trip-reactions-'+TRIP)).toHaveAttribute('aria-label',/Twoja reakcja: Ciekawy plan/);
  await card.getByTestId('trip-reactions-'+TRIP).click();await page.getByRole('button',{name:'Zazdroszczę!',exact:true}).click();
  expect(store.reactions.get(TRIP+':'+groupId(A)).kind).toBe('envy');expect(store.notifications).toHaveLength(1);
  await card.getByRole('button',{name:'Zobacz wyjazd',exact:true}).click();
  await expect(page).toHaveURL('http://localhost:8085/trip/'+TRIP);
  await expect(reaction).toHaveAttribute('aria-label',/Twoja reakcja: Zazdroszczę!/);
  await page.reload();await expect(reaction).toHaveAttribute('aria-label',/Twoja reakcja: Zazdroszczę!/);
  await reaction.click();await page.getByRole('button',{name:'Cofnij reakcję',exact:true}).click();
  await expect(reaction).toHaveAttribute('aria-label',/Dodaj reakcję.*0/);
  await reaction.click();await page.getByRole('button',{name:'Podoba mi się',exact:true}).click();
  expect(store.notifications).toHaveLength(1);expect(store.notifications[0].read_at).toBeTruthy();
  await page.setViewportSize({width:320,height:800});await page.goto('/explore');
  await expect(card).toBeVisible();await card.screenshot({path:'.expo/reactions-trip-small.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('failed and lost saves keep confirmed counts; retry never creates a second actor or notification',async({page,context})=>{
  const store=fixture();await backend(context,store);await login(page);await page.goto('/explore');
  const reaction=page.getByTestId('discovery-trip-'+TRIP).getByTestId('trip-reactions-'+TRIP);
  await reaction.click();store.failReactionSave=true;await page.getByRole('button',{name:'Podoba mi się',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Nie udało się zapisać reakcji');
  expect(store.reactions.size).toBe(0);await expect(reaction).toHaveAttribute('aria-label',/Dodaj reakcję.*0/);
  store.failReactionSave='after-commit';await page.getByRole('button',{name:'Ponów zapis reakcji',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Nie udało się zapisać reakcji');expect(store.reactions.size).toBe(1);
  store.failReactionSave=false;await page.getByRole('button',{name:'Ponów zapis reakcji',exact:true}).click();
  await expect(reaction).toHaveAttribute('aria-label',/Twoja reakcja: Podoba mi się.*1/);expect(store.notifications).toHaveLength(1);
});
test('owner sees the actor and emotion in bell, own cards and roster; push category defaults on',async({page,context,browser})=>{
  const store=fixture();await backend(context,store);await login(page);await page.goto('/explore');
  await page.getByTestId('discovery-trip-'+TRIP).getByTestId('trip-reactions-'+TRIP).click();
  await page.getByRole('button',{name:'Ale przygoda!',exact:true}).click();
  const owner=await browser.newContext({baseURL:'http://localhost:8085',viewport:{width:320,height:844}});
  try{
    await backend(owner,store);const device=await owner.newPage();await login(device,'b@example.com');
    await device.getByTestId('home-notifications-bell').click();
    const entry=device.getByTestId('notification-entry-'+store.notifications[0].id);
    await expect(entry).toContainText('Ekipa A');await expect(entry).toContainText('Ale przygoda!');
    await entry.click();await expect(device).toHaveURL('http://localhost:8085/trips/'+TRIP);
    expect(store.notifications[0].read_at).toBeTruthy();
    await device.locator('[data-testid="trip-reactions-'+TRIP+'"]:visible').click();
    await expect(device.getByTestId('trip-reactor-'+groupId(A))).toContainText('Ekipa A');
    await expect(device.getByTestId('trip-reactor-'+groupId(A))).toContainText('Ale przygoda!');
    await device.getByRole('dialog').screenshot({path:'.expo/reactions-owner-small.png'});
    await expect(device.getByTestId('reaction-option-love')).toHaveCount(0);
    await device.getByRole('button',{name:'Zamknij',exact:true}).click();await device.goto('/trips');
    await expect(device.getByTestId('own-trip-'+TRIP).getByTestId('trip-reactions-'+TRIP)).toHaveAttribute('aria-label',/Zobacz reakcje.*1/);
    await device.goto('/settings');const toggle=device.getByRole('switch',{name:'Push: Reakcje na ogłoszenia',exact:true});
    await expect(toggle).toBeChecked();await toggle.click();await expect(toggle).not.toBeChecked();
    await device.reload();await expect(toggle).not.toBeChecked();
    await expect(device.getByRole('switch',{name:'Push: Wiadomości',exact:true})).toBeChecked();
  }finally{await owner.close();}
});
test('reaction loading errors allow retry and do not show fake zero counts',async({page,context})=>{
  const store=fixture();store.failReactionLoad=true;await backend(context,store);await login(page);
  await page.getByTestId('home-latest-listing').getByTestId('trip-reactions-'+TRIP).click();
  await expect(page.getByRole('alert')).toContainText('Nie udało się wczytać reakcji');
  await expect(page.getByTestId('reaction-option-love')).toBeDisabled();
  store.failReactionLoad=false;await page.getByRole('button',{name:'Wczytaj reakcje ponownie',exact:true}).click();
  await expect(page.getByTestId('reaction-option-love')).toBeEnabled();
});
