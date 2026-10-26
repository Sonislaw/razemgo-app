import {test,expect} from '@playwright/test';
import {B,groupId,profile,state,backend,login} from './trip-fixtures.mjs';
import {expectLoaded,scrollToRow} from './collection-helpers.mjs';

const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');

test('crew pages load five at a time, show progress, retry and restore profile scroll before a tab reset',async({page,context})=>{
  test.setTimeout(120000);
  const store=state();await backend(context,store);
  const tripId=uuid(9800);
  const trip={id:tripId,group_id:groupId(B),mode:'planned',status:'published',visibility:'public',start_date:'2099-05-21',end_date:'2099-05-24',
    location_id:'pl-locality:4259',location_name:'Chłapowo',location_region:'pomorskie',location_kind:'village',campground_name:'Pod Wydmami',campground_address:'',
    travel_mode:'Przyczepa',description:'Plaża, rowery i wspólny czas nad morzem.',landscape:'coast',interests:['Rowery'],animal_kinds:[],
    matching_group_kinds:[],matching_child_age_bands:[],published_at:'2026-10-26T10:00:00Z'};
  store.trips.set(tripId,trip);
  const rows=Array.from({length:13},(_,i)=>({crew:{...profile(B).group,id:i===8?groupId(B):uuid(9000+i),name:'Ekipa '+String(i).padStart(2,'0')},
    about:'Przyczepa, rowery i wspólne przygody.',active_trip_count:i===8?1:0,
    compatibility:{score:95-i,reasons:['Podobne zainteresowania'],limited_data:false,evaluated_weight:100}}));
  const calls=[];let failMore=false,releaseMore;
  const pendingMore=new Promise(resolve=>{releaseMore=resolve;});
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/**',async route=>{
    const name=new URL(route.request().url()).pathname.split('/').at(-1);
    if(!['list_ranked_public_groups','count_public_groups','get_public_group'].includes(name))return route.fallback();
    if(route.request().method()==='OPTIONS')return route.fallback();
    const body=route.request().postDataJSON();
    const respond=(json,status=200)=>route.fulfill({json,status,headers:{'access-control-allow-origin':'http://localhost:8085'}});
    if(name==='get_public_group'){
      const row=rows.find(row=>row.crew.id===body.target_group_id);
      return respond({...row,trips:body.target_group_id===groupId(B)?[{trip,crew:row.crew}]:[],has_more:false,cursor:null});
    }
    const filtered=rows.filter(row=>!body.filters.name||row.crew.name.includes(body.filters.name));
    if(name==='count_public_groups')return respond(filtered.length);
    calls.push(body);
    if(body.after_cursor){await pendingMore;if(failMore)return respond({message:'Offline'},503);}
    const offset=body.after_cursor?filtered.findIndex(row=>row.crew.id===body.after_cursor.id)+1:0;
    const items=filtered.slice(offset,offset+body.page_size),last=items.at(-1);
    return respond({items,total_count:filtered.length,has_more:offset+items.length<filtered.length,
      cursor:last?{id:last.crew.id,name:last.crew.name,score:last.compatibility.score,sort:body.sort_mode}:null});
  });
  await login(page);await page.goto('/explore');await page.getByRole('tab',{name:'Ekipy',exact:true}).click();
  const screen=page.getByTestId('discovery-screen'),cards=page.locator('[data-testid^="public-group-"]');
  await expect(cards).toHaveCount(5);await expect(page.getByText('Ekipy · 13',{exact:true})).toBeVisible();
  failMore=true;await page.getByRole('button',{name:'Pokaż więcej ekip',exact:true}).click();
  const progress=page.getByRole('button',{name:'Wczytywanie ekip',exact:true});
  await expect(progress).toBeDisabled();await expect(progress.getByLabel('Wczytywanie kolejnych ekip',{exact:true})).toBeVisible();
  await expect(cards).toHaveCount(5);releaseMore();
  await expect(page.getByRole('alert')).toContainText('Nie udało się pobrać ekip');await expect(cards).toHaveCount(5);
  failMore=false;await page.getByRole('button',{name:'Spróbuj ponownie',exact:true}).click();await expectLoaded(screen,10);
  const id='public-group-'+rows[8].crew.id,target=page.getByTestId(id);
  await scrollToRow(screen,target);const scroll=await screen.evaluate(el=>el.scrollTop);expect(scroll).toBeGreaterThan(1000);
  await target.click();await expect(page).toHaveURL('http://localhost:8085/crew/'+id.replace('public-group-',''));
  await page.getByRole('button',{name:'Zobacz wyjazd',exact:true}).click();await expect(page).toHaveURL('http://localhost:8085/trip/'+tripId);
  await page.getByRole('button',{name:'Wróć do listy wyjazdów',exact:true}).click();await expect(page).toHaveURL('http://localhost:8085/crew/'+groupId(B));
  await page.getByRole('button',{name:'Wróć',exact:true}).click();await expect(page).toHaveURL('http://localhost:8085/explore');
  await expectLoaded(screen,10);await expect(page.getByText('Ekipy · 13',{exact:true})).toBeAttached();
  await expect.poll(async()=>Math.abs(await screen.evaluate(el=>el.scrollTop)-scroll)).toBeLessThan(4);
  const profileButton=page.getByRole('button',{name:'Otwórz profil: Ekipa 08',exact:true});
  await profileButton.scrollIntoViewIfNeeded();const buttonScroll=await screen.evaluate(el=>el.scrollTop);
  await profileButton.click();await expect(page).toHaveURL('http://localhost:8085/crew/'+groupId(B));
  await page.getByRole('button',{name:'Wróć',exact:true}).click();await expect(page).toHaveURL('http://localhost:8085/explore');
  await expectLoaded(screen,10);await expect.poll(async()=>Math.abs(await screen.evaluate(el=>el.scrollTop)-buttonScroll)).toBeLessThan(4);
  await page.getByRole('button',{name:'Pokaż więcej ekip',exact:true}).click();await expectLoaded(screen,13);
  await expect(page.getByRole('button',{name:'Pokaż więcej ekip',exact:true})).toHaveCount(0);
  expect(calls.every(call=>call.page_size===5)).toBe(true);
  await page.getByRole('tab',{name:'Start',exact:true}).click();await expect(page).toHaveURL('http://localhost:8085/');
  await page.getByRole('tab',{name:'Odkrywaj',exact:true}).click();await expect(cards).toHaveCount(5);
  await page.getByRole('tablist',{name:'Odkrywaj',exact:true}).getByRole('tab',{name:'Wyjazdy',exact:true}).click();await expect(cards).toHaveCount(0);
  await page.getByRole('tab',{name:'Ekipy',exact:true}).click();await expect(cards).toHaveCount(5);
  await page.getByRole('button',{name:'Sortowanie ekip: Najwyższa zgodność',exact:true}).click();
  await page.getByRole('radio',{name:'Alfabetycznie',exact:true}).click();await expect(cards).toHaveCount(5);
  await page.getByRole('button',{name:'Filtry ekip',exact:true}).click();
  await page.getByRole('textbox',{name:'Szukaj po nazwie lub numerze ekipy',exact:true}).fill('Ekipa 01');
  await page.getByRole('button',{name:'Pokaż wyniki · 1',exact:true}).click();
  await expect(cards).toHaveCount(1);await expect(page.getByText('Ekipy · 1',{exact:true})).toBeVisible();
  await page.getByRole('tablist',{name:'Odkrywaj',exact:true}).getByRole('tab',{name:'Wyjazdy',exact:true}).click();
  await page.getByRole('tab',{name:'Ekipy',exact:true}).click();await expect(cards).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Sortowanie ekip: Alfabetycznie',exact:true})).toBeVisible();
});
