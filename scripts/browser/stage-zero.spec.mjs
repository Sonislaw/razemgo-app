import {test,expect} from '@playwright/test';
import {A,B,groupId,state,backend,login} from './trip-fixtures.mjs';

test('privacy settings link to real visibility and blocked-crew screens without future promises',async({page,context})=>{
  const store=state();await backend(context,store);await login(page);await page.goto('/settings');
  await expect(page.getByRole('heading',{name:'Prywatność',exact:true})).toBeVisible();
  await expect(page.getByText('Wkrótce',{exact:true})).toHaveCount(0);
  await expect(page.getByText(/wyboru motywu pojawi/)).toHaveCount(0);
  await page.getByRole('button',{name:'Widoczność profilu',exact:true}).click();
  await expect(page).toHaveURL('http://localhost:8085/group-visibility');
  await expect(page.getByRole('heading',{name:'Profil publiczny',exact:true})).toBeVisible();
  await page.goBack();await expect(page).toHaveURL('http://localhost:8085/settings');
  await page.getByRole('button',{name:'Zablokowane ekipy',exact:true}).click();
  await expect(page).toHaveURL('http://localhost:8085/messaging-safety?from=settings');
  await expect(page.getByRole('heading',{name:'Zablokowane ekipy · 0',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Wróć do ustawień',exact:true}).click();
  await expect(page).toHaveURL('http://localhost:8085/settings');
});

test('own-trip contacts explain invitation acceptance and keep access to an accepted conversation',async({page,context})=>{
  const store=state(),id='00000000-0000-4000-8000-000000000901';
  const trip={id,group_id:groupId(A),adult_count:2,child_count:1,child_age_bands:['4–6'],mode:'planned',status:'published',visibility:'public',start_date:'2099-05-21',end_date:'2099-05-24',
    location_id:'pl-locality:4259',location_name:'Chłapowo',location_region:'pomorskie',location_kind:'village',campground_name:'',campground_address:'',
    travel_mode:'Kamper',description:'Spokojny wyjazd nad morze, rowery i wspólne ognisko.',landscape:'coast',interests:[],animal_kinds:[],
    matching_group_kinds:[],matching_child_age_bands:[],published_at:'2026-10-24T10:00:00Z'};
  store.trips.set(id,trip);await backend(context,store);await login(page);await page.goto('/trips/'+id);
  await expect(page.getByRole('heading',{name:'Kontakty tego wyjazdu · 0',exact:true})).toBeAttached();
  await expect(page.getByText(/Akceptacja zaproszenia nie oznacza potwierdzenia wspólnego wyjazdu/)).toBeAttached();
  await expect(page.getByText(/umówionego spotkania/)).toHaveCount(0);
  const invitation={id:'00000000-0000-4000-8000-000000000902',sender_group_id:groupId(B),recipient_group_id:groupId(A),trip_id:id,
    trip_reference:id,trip_snapshot:trip,source_trip_id:null,source_trip_snapshot:null,text:'Porozmawiajmy o wyjeździe.',status:'accepted',created_at:'2026-10-24T10:00:00Z'};
  const chat={id:'00000000-0000-4000-8000-000000000903',invitation_id:invitation.id,sender_group_id:groupId(B),recipient_group_id:groupId(A),updated_at:invitation.created_at};
  store.invitations.push(invitation);store.conversations.push(chat);await page.reload();
  await expect(page.getByRole('heading',{name:'Kontakty tego wyjazdu · 1',exact:true})).toBeAttached();
  await expect(page.getByText('Zaakceptowane ekipy',{exact:false})).toHaveCount(0);
  await page.getByRole('button',{name:'Przejdź do rozmowy',exact:true}).click();
  await expect(page).toHaveURL('http://localhost:8085/chat/'+chat.id);
});
