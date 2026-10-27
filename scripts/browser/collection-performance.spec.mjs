import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {A,B,groupId,profile,state,backend,login} from './trip-fixtures.mjs';
import {expectLoaded,scrollToRow} from './collection-helpers.mjs';

const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
function seed(store,owner=B,count=50,base=10000){
  const trips=Array.from({length:count},(_,i)=>({id:uuid(base+i),group_id:groupId(owner),mode:'planned',status:'published',visibility:'public',
    start_date:'2099-05-21',end_date:'2099-05-24',location_id:'pl-locality:4259',location_name:'Chłapowo',location_region:'pomorskie',location_kind:'village',campground_name:'Pod Wydmami',campground_address:'',
    travel_mode:'Kamper',description:'Przygoda numer '+i+' nad morzem i wspólne wycieczki.',landscape:['coast','lake','mountain','forest'][i%4],
    interests:i%2?['Rowery','Ognisko','Przyroda']:['Kajaki'],animal_kinds:i%3?[]:['dog'],matching_group_kinds:[],matching_child_age_bands:[],published_at:'2026-10-26T10:00:00Z'}));
  for(const trip of trips)store.trips.set(trip.id,trip);return trips;
}
async function loadAll(screen,label,count=50){
  for(let n=5;n<count;n+=5){
    const more=screen.getByRole('button',{name:label,exact:true});
    // Reach the footer through the render window, as a person scrolling would.
    // Playwright's instant scroll can move it again while FlatList measures rows,
    // cancelling the press even though the click action reports success.
    await scrollToRow(screen,more);
    await more.click();await expectLoaded(screen,Math.min(n+5,count));
  }
}
async function bounded(screen,prefix,total){
  const cards=screen.locator('[data-testid^="'+prefix+'"]');
  await expect.poll(()=>cards.count()).toBeLessThan(total/2);
  expect(await cards.count()).toBeGreaterThan(0);return cards.count();
}

test('50 discovery trips unmount distant cards, retain favorites, restore the last listing and isolate accounts',async({page,context})=>{
  test.setTimeout(150000);const store=state(),trips=seed(store);await backend(context,store);await login(page);await page.goto('/explore');
  const screen=page.getByTestId('discovery-screen');await expectLoaded(screen,5);
  await loadAll(screen,'Pokaż więcej wyjazdów');await expectLoaded(screen,50);
  const last=screen.getByTestId('discovery-trip-'+trips[49].id);await scrollToRow(screen,last);
  const bottomMounted=await bounded(screen,'discovery-trip-',50);
  await last.getByRole('button',{name:'Dodaj wyjazd do ulubionych',exact:true}).click();
  await expect(last.getByRole('button',{name:'Usuń wyjazd z ulubionych',exact:true})).toBeVisible();
  const open=last.getByRole('button',{name:'Zobacz wyjazd',exact:true});await open.scrollIntoViewIfNeeded();const offset=await screen.evaluate(el=>el.scrollTop);
  await open.click();await page.getByRole('button',{name:'Wróć do listy wyjazdów',exact:true}).click();
  await expectLoaded(screen,50);await expect.poll(async()=>Math.abs(await screen.evaluate(el=>el.scrollTop)-offset)).toBeLessThan(4);
  await expect(last).toBeInViewport();
  await screen.evaluate(el=>{el.scrollTop=0;});
  const first=screen.getByTestId('discovery-trip-'+trips[0].id);await scrollToRow(screen,first);
  await expect.poll(()=>last.count()).toBe(0);const topMounted=await bounded(screen,'discovery-trip-',50);
  await scrollToRow(screen,last);await expect(last.getByRole('button',{name:'Usuń wyjazd z ulubionych',exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'Start',exact:true}).click();await page.getByRole('tab',{name:'Odkrywaj',exact:true}).click();await expectLoaded(screen,5);
  await expect.poll(()=>screen.evaluate(el=>el.scrollTop)).toBe(0);
  await page.getByRole('tab',{name:'Profil',exact:true}).click();await page.getByRole('button',{name:'Ustawienia aplikacji',exact:true}).click();
  await page.getByRole('button',{name:'Wyloguj się',exact:true}).click();await login(page,'b@example.com');await page.goto('/explore');
  await expectLoaded(screen,0);await expect(screen.getByRole('heading',{name:'Jeszcze się mijamy',exact:true})).toBeVisible();
  await writeFile('.expo/collection-trip-window.local.json',JSON.stringify({loaded:50,bottomMounted,topMounted,accountIsolation:true}));
});

test('50 crew profiles, 50 crew listings and 50 own trips each keep a bounded render window',async({page,context})=>{
  test.setTimeout(150000);const store=state(),trips=seed(store),own=seed(store,A,50,11000);await backend(context,store);
  const rows=Array.from({length:50},(_,i)=>({crew:{...profile(B).group,id:i===49?groupId(B):uuid(12000+i),name:'Ekipa '+String(i).padStart(2,'0')},
    about:'Kawa, rowery i odpoczynek w trasie.',active_trip_count:i===49?50:0,
    compatibility:{score:90,reasons:['Wspólne zainteresowania'],limited_data:false,evaluated_weight:100}}));
  await page.route('**/rest/v1/rpc/list_ranked_public_groups',async route=>{
    if(route.request().method()==='OPTIONS')return route.fallback();const body=route.request().postDataJSON();
    const offset=body.after_cursor?rows.findIndex(row=>row.crew.id===body.after_cursor.id)+1:0,items=rows.slice(offset,offset+body.page_size),last=items.at(-1);
    return route.fulfill({json:{items,total_count:50,has_more:offset+items.length<50,cursor:last?{id:last.crew.id,name:last.crew.name,score:90,sort:body.sort_mode}:null},headers:{'access-control-allow-origin':'http://localhost:8085'}});
  });
  await page.route('**/rest/v1/rpc/get_public_group',async route=>{
    if(route.request().method()==='OPTIONS')return route.fallback();const body=route.request().postDataJSON();
    const offset=body.after_cursor?trips.findIndex(trip=>trip.id===body.after_cursor.id)+1:0,items=trips.slice(offset,offset+body.page_size),last=items.at(-1);
    return route.fulfill({json:{...rows[49],trips:items.map(trip=>({trip,crew:profile(B).group})),has_more:offset+items.length<50,cursor:last?{id:last.id,published_at:last.published_at,query_key:'crew'}:null},headers:{'access-control-allow-origin':'http://localhost:8085'}});
  });
  await login(page);await page.goto('/explore');await page.getByRole('tab',{name:'Ekipy',exact:true}).click();
  const screen=page.getByTestId('discovery-screen');await expectLoaded(screen,5);await loadAll(screen,'Pokaż więcej ekip');
  const last=screen.getByTestId('public-group-'+groupId(B));await scrollToRow(screen,last);const crewMounted=await bounded(screen,'public-group-',50);
  const offset=await screen.evaluate(el=>el.scrollTop);await last.click();const detail=page.getByTestId('crew-profile-screen');await expectLoaded(detail,5);
  await loadAll(detail,'Pokaż więcej wyjazdów');const lastTrip=detail.getByTestId('discovery-trip-'+trips[49].id);
  await scrollToRow(detail,lastTrip);const listingMounted=await bounded(detail,'discovery-trip-',50);
  const open=lastTrip.getByRole('button',{name:'Zobacz wyjazd',exact:true});await open.scrollIntoViewIfNeeded();const tripOffset=await detail.evaluate(el=>el.scrollTop);
  await open.click();await page.getByRole('button',{name:'Wróć do listy wyjazdów',exact:true}).click();await expectLoaded(detail,50);
  await expect.poll(async()=>Math.abs(await detail.evaluate(el=>el.scrollTop)-tripOffset)).toBeLessThan(4);
  await page.getByRole('button',{name:'Wróć',exact:true}).click();await expectLoaded(screen,50);
  await expect.poll(async()=>Math.abs(await screen.evaluate(el=>el.scrollTop)-offset)).toBeLessThan(4);
  await page.goto('/trips');const ownScreen=page.getByTestId('own-trips-screen');await expectLoaded(ownScreen,50);
  const lastOwn=ownScreen.getByTestId('own-trip-'+own[49].id);await scrollToRow(ownScreen,lastOwn);const ownMounted=await bounded(ownScreen,'own-trip-',50);
  await writeFile('.expo/collection-group-window.local.json',JSON.stringify({loaded:50,crewMounted,listingMounted,ownMounted}));
});

test('delayed or failed images keep card geometry and a failed next page keeps the current list',async({page,context})=>{
  const store=state();seed(store);await backend(context,store);await login(page);
  let release,intercepted=0,failed=0;const images=new Promise(resolve=>{release=resolve;});
  page.on('requestfailed',request=>{if(request.url().includes('landscapes'))failed++;});
  await page.route(/landscapes/,async route=>{intercepted++;await images;await route.abort();});
  await page.setViewportSize({width:320,height:800});await page.goto('/explore',{waitUntil:'domcontentloaded'});
  const screen=page.getByTestId('discovery-screen'),card=screen.getByTestId('discovery-trip-'+uuid(10000));await card.scrollIntoViewIfNeeded();
  await expect.poll(()=>intercepted).toBeGreaterThan(0);
  // Wait for the narrow timeline's measured legend before comparing geometry;
  // its first onLayout is independent of the intentionally blocked image.
  await expect(card.getByTestId('trip-timeline').getByText(/^Start\n/)).toBeVisible();
  const before=await card.boundingBox();release();
  await expect.poll(()=>failed).toBeGreaterThan(0);
  await expect(card.locator('img[src*="landscapes"]')).toHaveCount(0);
  await expect.poll(async()=>Math.abs((await card.boundingBox()).height-before.height)).toBeLessThan(1);
  expect(await card.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(2);
  await card.screenshot({path:'.expo/collection-card-320.png'});
  store.failMore=true;const more=screen.getByRole('button',{name:'Pokaż więcej wyjazdów',exact:true});await scrollToRow(screen,more);await more.click();
  await expect(screen.getByRole('alert')).toContainText('Nie udało się pobrać ogłoszeń');await expectLoaded(screen,5);
  store.failMore=false;await screen.getByRole('button',{name:'Spróbuj ponownie',exact:true}).click();await expectLoaded(screen,10);
});
