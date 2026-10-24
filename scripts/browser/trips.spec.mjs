import { test, expect } from '@playwright/test';

const A='00000000-0000-4000-8000-000000000001';
const B='00000000-0000-4000-8000-000000000002';
const groupId=id=>id===A?'00000000-0000-4000-8000-000000000101':'00000000-0000-4000-8000-000000000102';
const user=id=>({id,aud:'authenticated',role:'authenticated',email:id===A?'a@example.com':'b@example.com',email_confirmed_at:'2026-10-24T10:00:00Z',app_metadata:{provider:'email',providers:['email']},user_metadata:{},identities:[],created_at:'2026-10-24T10:00:00Z'});
const session=id=>({
  access_token:[Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),Buffer.from(JSON.stringify({sub:id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'test-signature'].join('.'),
  refresh_token:'refresh-'+id,expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:user(id),
});
function profile(id){
  return {
    group:{id:groupId(id),owner_user_id:id,name:id===A?'Ekipa A':'Ekipa B',avatar_id:id===A?'camp-bear':'trail-fox',kind:'family',adult_count:2,child_count:1,child_age_bands:['4–6'],travel_mode:'Kamper',interests:['Rowery'],animal_kinds:[]},
    preferences:{group_id:groupId(id),group_kinds:['family'],child_age_bands:['4–6'],description:''},
  };
}
function state(){return {trips:new Map(),next:301,failSave:false,failLoad:false,failPublic:false};}
async function backend(context,store){
  await context.route('http://127.0.0.1:54321/**',async route=>{
    const request=route.request(),url=new URL(request.url());
    const headers={'access-control-allow-origin':'http://localhost:8085','access-control-allow-headers':'*','access-control-allow-methods':'GET, POST, PUT, DELETE, OPTIONS','content-type':'application/json','x-supabase-api-version':'2024-01-01','access-control-expose-headers':'x-supabase-api-version'};
    const respond=(value,status=200)=>route.fulfill({status,headers,body:JSON.stringify(value)});
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
    const body=request.postDataJSON()??{};
    let id=A;
    try{id=JSON.parse(Buffer.from((request.headers().authorization??'').split('.')[1],'base64url').toString()).sub;}catch{}
    if(url.pathname.endsWith('/token'))return respond(session(body.email==='b@example.com'?B:A));
    if(url.pathname.endsWith('/user'))return respond(user(id));
    if(url.pathname.endsWith('/logout'))return respond({});
    if(url.pathname==='/rest/v1/travel_groups')return respond([profile(id).group]);
    if(url.pathname==='/rest/v1/group_preferences')return respond(profile(id).preferences);
    if(url.pathname==='/rest/v1/trip_plans'){
      if(store.failLoad)return respond({message:'Temporary failure'},503);
      return respond([...store.trips.values()].filter(trip=>trip.group_id===groupId(id)));
    }
    if(url.pathname==='/rest/v1/rpc/list_public_trips'){
      if(store.failPublic)return respond({message:'Temporary failure'},503);
      return respond([...store.trips.values()].filter(trip=>trip.group_id!==groupId(id)&&trip.status==='published'&&trip.visibility==='public'&&trip.end_date>'2026-10-24').map(trip=>({trip,crew:profile(trip.group_id===groupId(A)?A:B).group})));
    }
    if(url.pathname==='/rest/v1/rpc/save_my_trip'){
      if(store.failSave===true)return respond({message:'Temporary failure'},503);
      expect(body.trip_data.group_id).toBeUndefined();expect(body.trip_data.owner_user_id).toBeUndefined();
      expect(body.request_key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      const previous=body.trip_id?store.trips.get(body.trip_id):[...store.trips.values()].find(trip=>trip.group_id===groupId(id)&&trip.create_key===body.request_key);
      if(body.trip_id&&previous?.group_id!==groupId(id))return respond({code:'P0002'},404);
      const tripId=body.trip_id??previous?.id??'00000000-0000-4000-8000-'+String(store.next++).padStart(12,'0');
      let status=previous?.status&&previous.status!=='draft'?previous.status:body.as_draft?'draft':'published';
      if(status==='published'&&body.trip_data.visibility==='private')status='paused';
      const trip={...body.trip_data,id:tripId,create_key:body.request_key,group_id:groupId(id),status,published_at:previous?.published_at??(status==='published'?'2026-10-24T12:00:00Z':null),created_at:previous?.created_at??'2026-10-24T12:00:00Z',updated_at:'2026-10-24T12:00:00Z'};
      store.trips.set(tripId,trip);
      if(store.failSave==='after-commit')return respond({message:'Lost response'},503);
      return respond(trip);
    }
    if(['/rest/v1/rpc/change_my_trip_status','/rest/v1/rpc/duplicate_my_trip','/rest/v1/rpc/delete_my_trip'].includes(url.pathname)){
      const previous=store.trips.get(body.trip_id);
      if(previous?.group_id!==groupId(id))return respond({code:'P0002'},404);
      if(url.pathname.endsWith('/delete_my_trip')){store.trips.delete(body.trip_id);return respond(body.trip_id);}
      if(url.pathname.endsWith('/duplicate_my_trip')){
        const copied={...previous,id:'00000000-0000-4000-8000-'+String(store.next++).padStart(12,'0'),status:'draft',visibility:'private',published_at:null};
        store.trips.set(copied.id,copied);return respond(copied);
      }
      const changed={...previous,status:body.new_status,visibility:body.new_status==='published'?'public':previous.visibility};
      store.trips.set(changed.id,changed);return respond(changed);
    }
    return respond({message:'Unhandled test endpoint'},400);
  });
}
async function login(page,email='a@example.com'){
  await page.clock.setFixedTime(new Date('2026-10-24T12:00:00Z'));
  await page.goto('/auth/sign-in');
  await page.getByRole('textbox',{name:'E-mail',exact:true}).fill(email);
  await page.getByLabel('Hasło',{exact:true}).fill('correct-password');
  await page.getByRole('button',{name:'Zaloguj się',exact:true}).click();
  await expect(page).toHaveURL('http://localhost:8085/');
}
test('real API flow: create, failed save, reload, second device, discovery, lifecycle and isolation',async({page,context,browser})=>{
  test.setTimeout(120000);
  const store=state();await backend(context,store);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await login(page);await page.goto('/trip-editor');
  await page.getByRole('button',{name:'Wybierz zakres dat',exact:true}).click();
  await page.getByLabel(/^25 października 2026/).click();
  await page.getByLabel(/^28 października 2026/).click();
  await page.getByRole('button',{name:'Wybierz daty',exact:true}).click();
  await page.getByRole('button',{name:'Dalej',exact:true}).click();
  await page.getByRole('textbox',{name:'Miasto lub wieś',exact:true}).fill('Chłapowo pomorskie');
  await page.getByRole('button',{name:/^Wybierz lokalizację: Chłapowo,/}).first().click();
  await page.getByRole('textbox',{name:'Nazwa kempingu',exact:true}).fill('Kemping Testowy');
  const description='Spokojny wyjazd nad morze, rowery i wspolne ognisko.';
  await page.getByRole('textbox',{name:'Opis wyjazdu',exact:true}).fill(description);
  await page.getByRole('button',{name:'Dalej',exact:true}).click();
  await expect(page.getByTestId('trip-editor-preview')).toContainText('Kemping Testowy');
  store.failSave=true;
  await page.getByRole('button',{name:'Opublikuj wyjazd',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Nie udało się zapisać');
  expect(store.trips.size).toBe(0);
  await expect(page.getByTestId('trip-editor-preview')).toContainText(description);
  store.failSave='after-commit';
  await page.getByRole('button',{name:'Opublikuj wyjazd',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Nie udało się zapisać');
  expect(store.trips.size).toBe(1);
  store.failSave=false;
  await page.getByRole('button',{name:'Opublikuj wyjazd',exact:true}).click();
  await expect(page).toHaveURL('http://localhost:8085/trips');
  expect(store.trips.size).toBe(1);
  const trip=[...store.trips.values()][0];
  const own=page.getByTestId('own-trip-'+trip.id);
  await expect(own).toContainText('Kemping Testowy');
  await page.reload();await expect(own).toContainText('Kemping Testowy');
  const device=await browser.newContext({baseURL:'http://localhost:8085',viewport:{width:320,height:844}});
  const other=await browser.newContext({baseURL:'http://localhost:8085',viewport:{width:390,height:844}});
  try{
    await backend(device,store);const second=await device.newPage();await login(second);await second.goto('/trips');
    await expect(second.getByTestId('own-trip-'+trip.id)).toContainText('Kemping Testowy');
    await backend(other,store);const b=await other.newPage();b.on('pageerror',error=>errors.push(error.message));
    await login(b,'b@example.com');await b.goto('/explore');
    const card=b.getByTestId('discovery-trip-'+trip.id);
    await expect(card).toContainText('Ekipa A');await expect(card).toContainText('Kemping Testowy');
    await expect(card).toContainText(/\d+% zgodności/);
    await card.getByRole('button',{name:'Zobacz wyjazd',exact:true}).click();
    await expect(b).toHaveURL('http://localhost:8085/trip/'+trip.id);
    await expect(b.getByRole('button',{name:'Zaproś do kontaktu',exact:true})).toBeDisabled();
    await b.goto('/trip-editor?id='+trip.id);await expect(b.getByRole('heading',{name:'Ten wyjazd nie jest dostępny'})).toBeVisible();
    await own.getByRole('button',{name:/^Opcje wyjazdu:/}).click();
    await page.getByRole('button',{name:'Wstrzymaj poszukiwania',exact:true}).click();
    await expect(own.getByRole('button',{name:'Znajdź towarzystwo',exact:true})).toBeDisabled();
    await b.goto('/explore');await expect(b.getByText('Jeszcze się mijamy',{exact:true})).toBeVisible();await expect(card).toHaveCount(0);
    await own.getByRole('button',{name:/^Opcje wyjazdu:/}).click();
    await page.getByRole('button',{name:'Duplikuj jako szkic',exact:true}).click();
    const copied=[...store.trips.values()].find(item=>item.id!==trip.id);
    expect(copied.status).toBe('draft');expect(copied.visibility).toBe('private');
    await page.getByRole('button',{name:'Dalej',exact:true}).click();await page.getByText('Krok 2 z 3',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Dalej',exact:true}).click();await page.getByText('Krok 3 z 3',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Zapisz plan prywatny',exact:true}).click();await expect(page).toHaveURL('http://localhost:8085/trips');
    await own.getByRole('button',{name:/^Opcje wyjazdu:/}).click();
    await page.getByRole('button',{name:'Wznów poszukiwania',exact:true}).click();
    await page.getByRole('button',{name:'Wznów poszukiwania',exact:true}).click();
    await expect(own.getByRole('button',{name:'Znajdź towarzystwo',exact:true})).toBeEnabled();
    await b.goto('/explore');await expect(card).toBeVisible();
    await own.getByRole('button',{name:/^Opcje wyjazdu:/}).click();
    await page.getByRole('button',{name:'Usuń wyjazd',exact:true}).click();
    await page.getByRole('button',{name:'Usuń wyjazd',exact:true}).click();
    await expect(own).toHaveCount(0);
    await b.reload();await expect(b.getByText('Jeszcze się mijamy',{exact:true})).toBeVisible();await expect(card).toHaveCount(0);
    expect(store.trips.has(copied.id)).toBe(true);
    expect(errors).toEqual([]);
  }finally{await device.close();await other.close();}
});
test('load failures offer retry and never masquerade as an empty collection or onboarding',async({page,context})=>{
  const store=state();await backend(context,store);await login(page);
  store.failLoad=true;await page.goto('/trips');
  await expect(page.getByRole('alert')).toContainText('Nie udało się pobrać wyjazdów');
  await expect(page.getByRole('heading',{name:'Dokąd wybierzesz się z ekipą?'})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Poznajmy Twoją ekipę'})).toHaveCount(0);
  store.failLoad=false;await page.getByRole('button',{name:'Spróbuj ponownie',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Dokąd wybierzesz się z ekipą?'})).toBeVisible();
  store.failPublic=true;await page.goto('/explore');
  await expect(page.getByRole('alert')).toContainText('Nie udało się pobrać ogłoszeń');
  await expect(page.getByText('Jeszcze się mijamy',{exact:true})).toHaveCount(0);
  store.failPublic=false;await page.getByRole('button',{name:'Spróbuj ponownie',exact:true}).click();
  await expect(page.getByText('Jeszcze się mijamy',{exact:true})).toBeVisible();
});
test('an incomplete draft persists and request keys do not need crypto.randomUUID',async({page,context})=>{
  await context.addInitScript(()=>{Object.defineProperty(globalThis.crypto,'randomUUID',{value:undefined,configurable:true});});
  const store=state();await backend(context,store);await login(page);
  await page.goto('/trip-editor');
  await page.getByRole('button',{name:'Zapisz szkic',exact:true}).click();
  await expect(page).toHaveURL('http://localhost:8085/trips');
  const draft=[...store.trips.values()][0];expect(draft.status).toBe('draft');
  const card=page.getByTestId('own-trip-'+draft.id);
  await expect(card).toContainText('Termin do uzupełnienia');
  await page.reload();await expect(card).toContainText('Termin do uzupełnienia');
  expect(store.trips.size).toBe(1);
});
