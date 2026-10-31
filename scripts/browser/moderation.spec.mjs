import {test,expect} from '@playwright/test';
import {A,B,backend,login,state,groupId} from './trip-fixtures.mjs';
const reportId='00000000-0000-4000-8000-000000000901';
const summary=(id=reportId,patch={})=>({id,target_kind:'trip',reason:'Spam',status:'new',created_at:'2026-10-24T10:00:00.000Z',updated_at:'2026-10-24T10:00:00.000Z',reported_name:'Ekipa nad jeziorem',reporter_name:'Ekipa zgłaszająca',reported_group_id:groupId(B),reporter_group_id:groupId(A),...patch});
async function fixture(context,store){
  await backend(context,store);
  store.adminCalls=[];store.actions=[];
  store.records=[summary(),summary('00000000-0000-4000-8000-000000000902',{status:'closed',reported_name:'Ekipa z lasu',reason:'Inny powód'})];
  const details=new Map(store.records.map(report=>[report.id,{report,evidence:{trip:{description:'Zachowany opis zgłoszonego wyjazdu.',location_name:'Test',start_date:'2027-05-21',end_date:'2027-05-24'}},trip_id:'00000000-0000-4000-8000-000000000301',trip_hidden:false,account_suspended:false,can_suspend:true,history:[]}]));
  await context.route('http://127.0.0.1:54321/rest/v1/rpc/admin_*',async route=>{
    const request=route.request(),name=new URL(request.url()).pathname.split('/').at(-1),body=request.postDataJSON()??{};
    const headers={'access-control-allow-origin':'http://localhost:8085','access-control-allow-headers':'*','access-control-allow-methods':'POST,OPTIONS','content-type':'application/json'};
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
    store.adminCalls.push({name,body});
    let id;try{id=JSON.parse(Buffer.from(request.headers().authorization.split('.')[1],'base64url')).sub;}catch{}
    const respond=(data,status=200)=>route.fulfill({status,headers,body:JSON.stringify(data)});
    if(!store.admin||id!==A)return respond({code:'42501'},403);
    if(store.failAdmin)return respond({code:'XX000',message:'private backend error'},503);
    if(name==='admin_list_reports'){
      const items=store.records.filter(r=>(body.status_filter==='all'||body.status_filter==='open'&&r.status!=='closed'||r.status===body.status_filter)
        &&(!body.search_text||(r.reported_name+' '+r.reason).toLowerCase().includes(body.search_text.toLowerCase())));
      return respond({items,has_more:false,counts:Object.fromEntries(['new','in_progress','closed'].map(s=>[s,store.records.filter(r=>r.status===s).length]))});
    }
    const detail=details.get(body.report_id);if(!detail)return respond({code:'P0002'},404);
    if(name==='admin_report_detail')return respond(detail);
    if(name==='admin_apply_action'){
      expect(body.user_id).toBeUndefined();expect(body.owner_user_id).toBeUndefined();expect(body.request_key).toMatch(/^[a-f0-9-]{36}$/);
      if(body.expected_updated_at!==detail.report.updated_at)return respond({code:'40001'},409);
      store.actions.push(body);
      detail.trip_hidden=body.moderation_action==='hide_trip'?true:body.moderation_action==='restore_trip'?false:detail.trip_hidden;
      detail.account_suspended=body.moderation_action==='suspend_account'?true:body.moderation_action==='restore_account'?false:detail.account_suspended;
      const status={close:'closed',in_progress:'in_progress',reopen:'new'}[body.moderation_action];if(status)detail.report.status=status;
      detail.report.updated_at='2026-10-24T12:00:00.'+String(store.actions.length).padStart(3,'0')+'Z';
      detail.history.unshift({id:body.request_key,action:body.moderation_action,note:body.action_note,created_at:detail.report.updated_at,actor_name:'Administrator'});
      return respond(detail);
    }
    return respond({},400);
  });
}
test('desktop moderation supports evidence, confirmed actions, audit and queue filters',async({page,context})=>{
  await page.setViewportSize({width:1440,height:1000});const store=state();store.admin=true;await fixture(context,store);await login(page);
  await page.goto('/admin');await page.getByRole('button',{name:'Ekipa nad jeziorem, Spam',exact:true}).click();
  await expect(page.getByText('Zachowany opis zgłoszonego wyjazdu.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Ukryj ogłoszenie',exact:true}).click();await page.getByLabel('Uzasadnienie działania').fill('nie');
  await page.getByRole('button',{name:'Potwierdź działanie',exact:true}).click();await expect(page.getByRole('alert')).toContainText('co najmniej 8 znaków');
  await page.getByLabel('Uzasadnienie działania').fill('Ogłoszenie zawiera powtarzający się spam.');await page.getByRole('button',{name:'Potwierdź działanie',exact:true}).click();
  await expect(page.getByText('Ogłoszenie ukryte',{exact:true})).toBeVisible();await expect(page.getByText('Ogłoszenie zawiera powtarzający się spam.',{exact:true})).toBeVisible();
  expect(store.actions).toHaveLength(1);await page.screenshot({path:'.expo/admin-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Filtr: Zamknięte',exact:true}).click();await expect(page.getByRole('button',{name:'Ekipa z lasu, Inny powód',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Ekipa nad jeziorem, Spam',exact:true})).toHaveCount(0);
});
test('ordinary accounts cannot enter the panel or fetch its privileged data',async({page,context})=>{
  const store=state();await fixture(context,store);await login(page,'b@example.com');await page.goto('/admin');
  await expect(page.getByText('Brak dostępu do panelu',{exact:true})).toBeVisible();expect(store.adminCalls).toHaveLength(0);
  await page.goto('/settings');await expect(page.getByRole('button',{name:'Panel administracyjny',exact:true})).toHaveCount(0);
});
test('mobile-width panel handles report status and a retry after a backend failure',async({page,context})=>{
  const store=state();store.admin=true;await fixture(context,store);await login(page);await page.goto('/admin');
  await page.getByRole('button',{name:'Ekipa nad jeziorem, Spam',exact:true}).click();
  await expect(page.getByRole('button',{name:'Wróć do zgłoszeń',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Zamknij zgłoszenie',exact:true}).click();await page.getByLabel('Uzasadnienie działania').fill('Zgłoszenie zostało zweryfikowane i zamknięte.');
  store.failAdmin=true;await page.getByRole('button',{name:'Potwierdź działanie',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Nie udało się połączyć');
  store.failAdmin=false;await page.getByRole('button',{name:'Potwierdź działanie',exact:true}).click();await expect(page.getByText('Decyzja została zapisana w historii zgłoszenia.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Otwórz ponownie',exact:true})).toBeVisible();await page.screenshot({path:'.expo/admin-mobile.png',fullPage:true});
});
test('a suspended account restores into the blocked screen and can still sign out',async({page,context})=>{
  const store=state();await fixture(context,store);await login(page);store.suspended=A;await page.reload();
  await expect(page.getByText('Konto zostało zablokowane',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Usuń konto',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Wyloguj się',exact:true}).click();await expect(page).toHaveURL(/\/welcome$/);
});

test('reporting a trip supports cancellation, retry and an accessible success confirmation',async({page,context})=>{
  const store=state();
  const trip='00000000-0000-4000-8000-000000000903';
  store.trips.set(trip,{id:trip,group_id:groupId(B),adult_count:2,child_count:1,child_age_bands:['4–6'],mode:'planned',status:'published',visibility:'public',
    start_date:'2027-05-21',end_date:'2027-05-24',location_id:'pl-locality:test',location_name:'Chłapowo',
    location_region:'Pomorskie',location_kind:'village',campground_name:'Pod Wydmami',campground_address:'',
    travel_mode:'Kamper',description:'Spokojny wyjazd nad morze, rowery i wspólne ognisko.',landscape:'coast',
    interests:['Rowery'],animal_kinds:[],matching_group_kinds:['family'],matching_child_age_bands:['4–6'],published_at:'2026-10-24T10:00:00Z'});
  await backend(context,store);
  const requests=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('http://127.0.0.1:54321/rest/v1/rpc/report_trip',async route=>{
    const headers={'access-control-allow-origin':'http://localhost:8085','access-control-allow-headers':'*','access-control-allow-methods':'POST,OPTIONS','content-type':'application/json'};
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
    requests.push(route.request().postDataJSON());
    return route.fulfill({status:requests.length===1?503:200,headers,body:JSON.stringify(requests.length===1?{code:'XX000'}:reportId)});
  });
  await login(page);await page.goto('/trip/'+trip);
  await page.getByRole('button',{name:'Zgłoś ogłoszenie',exact:true}).click();
  await page.getByRole('button',{name:'Zamknij panel',exact:true}).click();expect(requests).toHaveLength(0);
  await page.getByRole('button',{name:'Zgłoś ogłoszenie',exact:true}).click();
  await page.getByRole('button',{name:'Niewłaściwe treści',exact:true}).click();
  await page.getByRole('button',{name:'Wyślij zgłoszenie',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Nie udało się zapisać zgłoszenia');
  await page.getByRole('button',{name:'Wyślij zgłoszenie',exact:true}).click();
  const confirmation=page.getByText('Zgłoszenie trafiło do moderacji. Dziękujemy.',{exact:true});
  await expect(confirmation).toBeVisible();await expect(confirmation).toHaveAttribute('aria-live','polite');
  await expect(page.getByRole('dialog',{name:'Zgłoś ogłoszenie',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Zgłoś ogłoszenie',exact:true})).toHaveCount(0);
  expect(requests).toHaveLength(2);expect(requests[0]).toEqual(requests[1]);
  expect(requests[1]).toEqual({target_trip_id:trip,report_reason:'Niewłaściwe treści',request_key:expect.stringMatching(/^[a-f0-9-]{36}$/)});
  expect(errors).toEqual([]);
});
