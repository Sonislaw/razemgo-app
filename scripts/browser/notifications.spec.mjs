import { test, expect } from '@playwright/test';
import { A,B,groupId,state,backend,login } from './trip-fixtures.mjs';

const CHAT='00000000-0000-4000-8000-000000009001';
function notification(index,patch={}){
  return {id:'00000000-0000-4000-8000-'+String(1000+index).padStart(12,'0'),recipient_group_id:groupId(A),
    actor_group_id:groupId(B),actor_name:'Ekipa B',actor_avatar_id:'trail-fox',kind:'invitation_received',
    source_id:'00000000-0000-4000-8000-000000008001',invitation_id:'00000000-0000-4000-8000-000000008001',
    conversation_id:null,own_trip_id:null,proposed_trip_id:null,trip_label:'Wspólny wyjazd nad morze',available:true,
    created_at:'2026-10-24T10:00:00.000Z',read_at:null,...patch};
}

test('home bell opens the preview and full history, including entries read earlier',async({page,context})=>{
  await page.setViewportSize({width:320,height:844});
  const store=state();store.notifications=[notification(0),notification(1,{read_at:'2026-10-24T11:00:00Z'})];
  await backend(context,store);await login(page);await page.goto('/notifications');
  await page.getByRole('tab',{name:/^Nieodczytane/}).click();
  await expect(page.getByTestId(/^notification-entry-/)).toHaveCount(1);
  await page.getByRole('button',{name:'Wróć na Start',exact:true}).click();
  await expect(page).toHaveURL('http://localhost:8085/');
  await page.getByTestId('home-notifications-bell').click();
  await expect(page.getByTestId('home-notifications-popover')).toBeVisible();
  await expect(page.getByTestId(/^notification-entry-/)).toHaveCount(2);
  await page.getByRole('button',{name:'Zobacz wszystkie powiadomienia',exact:true}).click();
  await expect(page).toHaveURL('http://localhost:8085/notifications');
  await expect(page.getByRole('tab',{name:'Wszystkie',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.getByTestId(/^notification-entry-/)).toHaveCount(2);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'.expo/notification-center-small.png',fullPage:true});
  await page.goto('/settings');
  await expect(page.getByRole('switch',{name:'Push: Wiadomości',exact:true})).toBeVisible();
  await page.screenshot({path:'.expo/notification-settings-small.png',fullPage:true});
});

test('notification history persists across reload and another device, with filtering and pagination',async({page,context,browser})=>{
  const store=state();store.notifications=Array.from({length:35},(_,i)=>notification(i));
  await backend(context,store);await login(page);await page.goto('/notifications');
  await expect(page.getByTestId(/^notification-entry-/)).toHaveCount(30);
  await page.getByRole('button',{name:'Wczytaj starsze powiadomienia',exact:true}).click();
  await expect(page.getByTestId(/^notification-entry-/)).toHaveCount(35);
  const target=store.notifications.at(-1);
  await page.getByTestId('notification-entry-'+target.id).click();
  await expect(page).toHaveURL('http://localhost:8085/messages');expect(target.read_at).toBeTruthy();
  await page.goto('/notifications');await page.reload();
  await expect(page.getByTestId('notification-entry-'+target.id)).not.toHaveAttribute('aria-label',/^Nieodczytane/);
  await page.getByRole('tab',{name:/^Nieodczytane/}).click();
  await expect(page.getByTestId('notification-entry-'+target.id)).toHaveCount(0);
  await page.getByRole('button',{name:'Oznacz wszystkie jako odczytane',exact:true}).click();
  await expect(page.getByText('Wszystko odczytane',{exact:true})).toBeVisible();
  const second=await browser.newContext({baseURL:'http://localhost:8085',viewport:{width:320,height:844}});
  try{
    await backend(second,store);const device=await second.newPage();await login(device);await device.goto('/notifications');
    await expect(device.getByTestId(/^notification-entry-/)).toHaveCount(30);
    await expect(device.getByRole('button',{name:'Oznacz wszystkie jako odczytane',exact:true})).toBeDisabled();
  }finally{await second.close();}
});

test('push preferences wait for the server and persist independently across accounts and devices',async({page,context,browser})=>{
  const store=state();await backend(context,store);await login(page);await page.goto('/settings');
  const messages=page.getByRole('switch',{name:'Push: Wiadomości',exact:true});
  const invitations=page.getByRole('switch',{name:'Push: Zaproszenia',exact:true});
  await expect(messages).toBeChecked();await expect(invitations).toBeChecked();
  store.failNotificationSave=true;await messages.click();
  await expect(page.getByRole('alert')).toContainText('Nie udało się zapisać');await expect(messages).toBeChecked();
  store.failNotificationSave=false;await messages.click();await expect(messages).not.toBeChecked();await expect(invitations).toBeChecked();
  await invitations.click();await expect(invitations).not.toBeChecked();
  await messages.click();await expect(messages).toBeChecked();await expect(invitations).not.toBeChecked();
  await page.reload();await expect(messages).toBeChecked();await expect(invitations).not.toBeChecked();
  const second=await browser.newContext({baseURL:'http://localhost:8085',viewport:{width:320,height:844}});
  try{
    await backend(second,store);const device=await second.newPage();await login(device);await device.goto('/settings');
    await expect(device.getByRole('switch',{name:'Push: Zaproszenia',exact:true})).not.toBeChecked();
    await device.getByRole('switch',{name:'Push: Zaproszenia',exact:true}).click();
    await page.reload();await expect(invitations).toBeChecked();
    await device.getByRole('button',{name:'Wyloguj się',exact:true}).click();await login(device,'b@example.com');await device.goto('/settings');
    await expect(device.getByRole('switch',{name:'Push: Wiadomości',exact:true})).toBeChecked();
  }finally{await second.close();}
});

test('loading and save failures offer retry and do not pretend an empty or read inbox',async({page,context})=>{
  const store=state();const entry=notification(0);store.notifications=[entry];store.failNotifications=true;
  await backend(context,store);await login(page);await page.goto('/notifications');
  await expect(page.getByRole('alert')).toContainText('Nie udało się wczytać');
  await expect(page.getByText('Jeszcze nie masz powiadomień',{exact:true})).toHaveCount(0);
  store.failNotifications=false;await page.getByRole('button',{name:'Odśwież powiadomienia',exact:true}).click();
  await expect(page.getByTestId('notification-entry-'+entry.id)).toBeVisible();
  store.failNotificationSave=true;await page.getByTestId('notification-entry-'+entry.id).click();
  await expect(page.getByRole('alert')).toContainText('Nie udało się zapisać');expect(entry.read_at).toBeNull();
  store.failNotificationSave=false;await page.getByTestId('notification-entry-'+entry.id).click();
  await expect(page).toHaveURL('http://localhost:8085/messages');expect(entry.read_at).toBeTruthy();
});

test('marking alerts read leaves the chat unread and opening chat acknowledges its alert',async({page,context})=>{
  const store=state();const entry=notification(0,{kind:'message',conversation_id:CHAT});store.notifications=[entry];
  const trip='00000000-0000-4000-8000-000000009003';
  store.invitations=[{id:entry.invitation_id,sender_group_id:groupId(B),recipient_group_id:groupId(A),
    trip_id:null,source_trip_id:null,trip_reference:trip,
    trip_snapshot:{id:trip,group_id:groupId(A),mode:'planned',description:'Spokojny weekend przy morzu.',
      start_date:'2027-05-21',end_date:'2027-05-24',location_name:'Chlapowo',location_region:'Pomorskie',
      campground_name:'',landscape:'coast'},source_trip_snapshot:null,text:'Jedziemy razem!',
    status:'accepted',created_at:entry.created_at}];
  store.conversations=[{id:CHAT,invitation_id:entry.invitation_id,sender_group_id:groupId(B),recipient_group_id:groupId(A),updated_at:entry.created_at}];
  store.messages=[{id:'00000000-0000-4000-8000-000000009002',sequence:1,conversation_id:CHAT,sender_group_id:groupId(B),text:'Do zobaczenia na wyjeździe!',created_at:entry.created_at}];
  await backend(context,store);await login(page);await page.goto('/notifications');
  await page.getByRole('button',{name:'Oznacz wszystkie jako odczytane',exact:true}).click();
  await expect(page.getByRole('button',{name:'Oznacz wszystkie jako odczytane',exact:true})).toBeDisabled();
  expect(store.reads.get(CHAT+groupId(A))??0).toBe(0);
  await page.getByTestId('notification-entry-'+entry.id).click();
  await expect(page).toHaveURL('http://localhost:8085/chat/'+CHAT);
  await expect.poll(()=>store.reads.get(CHAT+groupId(A))).toBe(1);
});
