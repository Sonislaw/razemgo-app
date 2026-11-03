import { test,expect } from '@playwright/test';
import { A,B,groupId,state,backend,login } from './trip-fixtures.mjs';
import { filterSetPayload } from '../../src/features/saved-filters/saved-filter-data.ts';
import { INITIAL_FILTERS } from '../../src/features/discovery/filter-trips.ts';
import { INITIAL_GROUP_FILTERS } from '../../src/features/groups/group-data.ts';
const id='00000000-0000-4000-8000-000000007001',event='00000000-0000-4000-8000-000000007002';
const button=(page,name)=>page.getByRole('button',{name,exact:true});
function seed(store,kind='trips'){
  store.filterSets.set(id,{id,owner:A,kind,name:'Mazury z ekipą',filters:filterSetPayload(kind==='trips'
    ?{kind,filters:{...INITIAL_FILTERS,landscapeKinds:['lake']}}:{kind,filters:INITIAL_GROUP_FILTERS}),
    schema_version:1,created_at:'2026-10-24T10:00:00Z',updated_at:'2026-10-24T10:00:00Z',notifications_enabled:false});
}
for(const width of [320,390])test(`subscription toggle, confirmed writes, reload and global preference at ${width}px`,async({page,context})=>{
  await page.setViewportSize({width,height:844});
  const store=state();seed(store);await backend(context,store);await login(page);await page.goto('/explore');
  await button(page,'Zapisane · 1').click();
  const toggle=page.getByRole('switch',{name:'Powiadamiaj o nowych wyjazdach: Mazury z ekipą',exact:true});
  await expect(toggle).not.toBeChecked();store.failFilterNotifications=true;await toggle.click();
  await expect(page.getByRole('alert')).toContainText('Nie udało się zmienić powiadomień');await expect(toggle).not.toBeChecked();
  store.failFilterNotifications=false;await toggle.click();await expect(toggle).toBeChecked();
  await page.screenshot({path:`.expo/filter-alerts-${width}.png`});
  await button(page,'Zamknij').click();await page.reload();await button(page,'Zapisane · 1').click();await expect(toggle).toBeChecked();
  await button(page,'Zamknij').click();await page.goto('/settings');
  const global=page.getByRole('switch',{name:'Push: Wyniki zapisanych filtrów',exact:true});
  await expect(global).toBeChecked();await global.click();await expect(global).not.toBeChecked();
  expect(store.notificationPreferences.get(groupId(A)).push_saved_filters).toBe(false);
  expect(store.filterSets.get(id).notifications_enabled).toBe(true);
});
test('digest opens its set from history; cold link reloads exact filters; deleted and foreign sets stay unavailable',async({page,context})=>{
  const store=state();seed(store);
  store.notifications.push({id:event,recipient_group_id:groupId(A),actor_group_id:groupId(A),actor_name:'Zapisane filtry',actor_avatar_id:'trail-fox',
    kind:'saved_filter',filter_set_id:id,filter_result_count:3,trip_label:'Mazury z ekipą',own_trip_id:null,proposed_trip_id:null,
    conversation_id:null,invitation_id:null,available:true,created_at:'2026-10-24T10:00:00Z',read_at:null});
  await backend(context,store);await login(page);await page.goto('/notifications');
  const entry=page.getByTestId('notification-entry-'+event);await expect(entry).toContainText('Nowe pasujące wyjazdy: 3');await entry.click();
  await expect(page).toHaveURL(/\/explore/);await expect(button(page,'Otwórz filtry')).toContainText('Mazury z ekipą');
  expect(store.notifications[0].read_at).toBeTruthy();
  // The tab remains mounted when visiting Start; opening a digest must switch it back to trips.
  await page.getByRole('tab',{name:'Ekipy',exact:true}).click();await page.getByRole('tab',{name:'Start',exact:true}).click();
  await page.getByTestId('home-notifications-bell').click();await page.getByTestId('home-notifications-popover').getByTestId('notification-entry-'+event).click();
  await expect(button(page,'Otwórz filtry')).toContainText('Mazury z ekipą');
  await page.goto('/saved-filter/'+id);await expect(page).toHaveURL(/\/explore/);await expect(button(page,'Otwórz filtry')).toContainText('Mazury z ekipą');
  expect(store.tripSearchCalls.filter(c=>c.endpoint==='search_public_trips_v3').at(-1).filters.landscapes).toEqual(['lake']);
  store.filterSets.delete(id);await page.goto('/saved-filter/'+id);await expect(page.getByText('Ten zestaw filtrów jest już niedostępny.',{exact:true})).toBeVisible();
  seed(store);store.filterSets.get(id).owner=B;await page.reload();await expect(page.getByText('Ten zestaw filtrów jest już niedostępny.',{exact:true})).toBeVisible();
});
test('set links require login and expired sets cannot enable alerts',async({page,context})=>{
  const store=state();seed(store);await backend(context,store);await page.goto('/saved-filter/'+id);
  await expect(page).toHaveURL(/\/welcome/);
  store.filterSets.get(id).filters=filterSetPayload({kind:'trips',filters:{...INITIAL_FILTERS,dateRangeId:'custom',
    customDateRange:{startDate:'2000-01-01',endDate:'2000-01-02'}}});
  await login(page);await page.goto('/explore');await button(page,'Zapisane · 1').click();
  await expect(page.getByRole('switch',{name:'Powiadamiaj o nowych wyjazdach: Mazury z ekipą',exact:true})).toBeDisabled();
  await expect(page.getByText('Termin w tym zestawie już minął',{exact:true})).toBeVisible();
});
test('subscription synchronizes across sessions without applying criteria and is absent for crew filters',async({page,context,browser})=>{
  const store=state();seed(store);await backend(context,store);await login(page);await page.goto('/explore');
  await button(page,'Zapisane · 1').click();
  const second=await browser.newContext();try{
    await backend(second,store);const other=await second.newPage();await login(other);await other.goto('/explore');await button(other,'Zapisane · 1').click();
    await other.clock.install();
    const label='Powiadamiaj o nowych wyjazdach: Mazury z ekipą';await page.getByRole('switch',{name:label,exact:true}).click();
    await expect(page.getByRole('switch',{name:label,exact:true})).toBeChecked();
    await other.clock.fastForward(20000);await other.clock.runFor(500);await expect(other.getByRole('switch',{name:label,exact:true})).toBeChecked();
    await button(other,'Zamknij').click();await expect(button(other,'Otwórz filtry')).not.toContainText('Mazury z ekipą');
  }finally{await second.close();}
  await button(page,'Zamknij').click();seed(store,'groups');await page.reload();await page.getByRole('tab',{name:'Ekipy',exact:true}).click();
  await button(page,'Zapisane · 1').click();await expect(page.getByRole('switch',{name:/Powiadamiaj o nowych wyjazdach/})).toHaveCount(0);
});
