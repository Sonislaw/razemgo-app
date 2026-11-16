import {test,expect} from '@playwright/test';
import {A,B,groupId,profile,state,backend,login,resultRevision} from './trip-fixtures.mjs';
import {mockSearchAreas} from './places-fixtures.mjs';
import {mockMapTiles} from './map-fixtures.mjs';

const area=mockSearchAreas({query:'Koz'}).areas[0];
const id=n=>'00000000-0000-4000-8000-'+String(860000+n).padStart(12,'0');
function trip(n,owner=B,place=area){
  return {id:id(n),group_id:groupId(owner),mode:'flexible',status:'published',visibility:'public',start_date:'2099-05-21',end_date:'2099-05-24',
    place_data:place,location_id:place.id,location_name:place.name,location_region:place.region,location_kind:'locality',
    campground_name:'',campground_address:'',travel_mode:'Kamper',description:'Wspólne spacery i spokojny wypoczynek. Pomysł na wyjazd numer '+n+'.',landscape:'forest',
    interests:[],animal_kinds:[],matching_group_kinds:[],matching_child_age_bands:[],adult_count:2,child_count:0,child_age_bands:[],
    published_at:'2026-10-24T12:00:'+String(40-n).padStart(2,'0')+'Z'};
}
const bar=page=>page.getByTestId('trip-list-attribution').filter({visible:true});
const credits=page=>page.getByTestId('geoapify-attribution').filter({visible:true});

for(const width of [320,390])test(`shared location credits stay visible without duplicating cards; details, crew, manual locations and sources at ${width}px`,async({page,context})=>{
  test.setTimeout(120000);await page.setViewportSize({width,height:844});
  const store=state();for(let n=1;n<=8;n++)store.trips.set(id(n),trip(n));
  const google={id:'google:qa_camp_morski',source:'google',googlePlaceId:'qa_camp_morski',kind:'campground',name:'Camp',userLabel:'Camp',address:'',region:'',country:''};
  store.trips.set(id(9),{...trip(9),mode:'planned',search_area_data:area,place_data:google,location_id:google.id,location_name:'Camp'});
  store.trips.set(id(20),trip(20,A));
  const manual={id:'manual:00000000-0000-4000-8000-000000000099',source:'manual',scope:'area',kind:'locality',name:'Moja wieś',address:'',region:'mazowieckie',country:'Polska'};
  store.trips.set(id(21),trip(21,A,manual));
  await backend(context,store);await mockMapTiles(context);
  await page.route('**/rest/v1/rpc/get_public_group_v3',async route=>{
    if(route.request().method()==='OPTIONS')return route.fallback();
    const body=route.request().postDataJSON(),rows=[...store.trips.values()].filter(t=>t.group_id===groupId(B));
    const offset=body.after_cursor?rows.findIndex(t=>t.id===body.after_cursor.id)+1:0;
    const items=rows.slice(offset,offset+body.page_size),last=items.at(-1);
    return route.fulfill({json:{crew:profile(B).group,about:'Wspólne wyjazdy bez pośpiechu.',active_trip_count:rows.length,
      result_revision:resultRevision(rows),trips:items.map(trip=>({trip,crew:profile(B).group})),has_more:offset+items.length<rows.length,
      cursor:last?{id:last.id,published_at:last.published_at,query_key:'attribution-crew'}:null},headers:{'access-control-allow-origin':'http://localhost:8085'}});
  });
  await login(page);await page.goto('/explore');
  const list=page.getByTestId('discovery-screen');
  await expect(page.getByTestId('discovery-trip-'+id(1))).toBeAttached();
  await expect(credits(page)).toHaveCount(1);await expect(bar(page)).toBeInViewport();
  await expect(list.getByTestId('geoapify-attribution')).toHaveCount(0);
  await page.getByTestId('discovery-trip-'+id(5)).scrollIntoViewIfNeeded();
  await expect(page.getByTestId('discovery-trip-'+id(8))).toBeAttached();
  await expect(credits(page)).toHaveCount(1);await expect(bar(page)).toBeInViewport();
  await page.getByTestId('discovery-trip-'+id(8)).scrollIntoViewIfNeeded();
  await page.screenshot({path:'.expo/location-attribution-list-'+width+'.png'});
  expect(store.placeCalls??[]).toHaveLength(0);expect(store.areaCalls??[]).toHaveLength(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('radio',{name:'Mam plan',exact:true}).click();
  await expect(page.getByTestId('discovery-trip-'+id(9))).toContainText(area.name);
  await expect(page.getByTestId('discovery-trip-'+id(9)).getByTestId('geoapify-attribution')).toHaveCount(0);
  await expect(credits(page)).toHaveCount(1);await expect(bar(page)).toBeInViewport();expect(store.placeCalls??[]).toHaveLength(0);

  await page.goto('/trip/'+id(1));
  await expect(page.getByTestId('trip-map-card')).toBeAttached();await expect(credits(page)).toHaveCount(1);
  await expect(page.getByTestId('trip-map-card').getByTestId('geoapify-attribution')).toHaveCount(0);
  await expect(page.getByTestId('trip-google-map').frameLocator('iframe').locator('.google-map-canvas')).toBeAttached();

  await page.goto('/crew/'+groupId(B));
  await expect(page.getByTestId('discovery-trip-'+id(1))).toBeAttached();await expect(credits(page)).toHaveCount(1);await expect(bar(page)).toBeInViewport();
  await expect(page.getByTestId('crew-profile-screen').getByTestId('geoapify-attribution')).toHaveCount(0);
  await page.goto('/trips');await expect(page.getByTestId('own-trip-'+id(20))).toBeAttached();
  await expect(credits(page)).toHaveCount(1);await expect(bar(page)).toBeInViewport();
  await expect(page.getByTestId('own-trips-screen').getByTestId('geoapify-attribution')).toHaveCount(0);
  store.trips.delete(id(20));await page.reload();await expect(page.getByTestId('own-trip-'+id(21))).toBeAttached();
  await expect(bar(page)).toHaveCount(0);

  await page.goto('/settings');await page.getByRole('button',{name:'Źródła danych',exact:true}).click();
  await expect(page).toHaveURL('http://localhost:8085/data-sources');
  const sources=page.getByTestId('data-sources-screen');
  for(const name of ['Geoapify','OpenStreetMap','Google Maps'])await expect(sources.getByRole('heading',{name,exact:true})).toBeAttached();
  for(const name of ['O Geoapify','Licencja OpenStreetMap','Warunki Google Maps','Prywatność Google'])await expect(sources.getByRole('button',{name,exact:true})).toBeAttached();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'.expo/data-sources-'+width+'.png'});
  await page.getByRole('button',{name:'Wróć do ustawień',exact:true}).click();await expect(page).toHaveURL('http://localhost:8085/settings');
});

test('a legacy Google result keeps its own credit while Geoapify is credited once for the list',async({page,context})=>{
  const store=state();store.trips.set(id(1),trip(1));
  const google={id:'google:qa_camp_morski',source:'google',googlePlaceId:'qa_camp_morski',kind:'campground',name:'Camp',userLabel:'Camp',address:'',region:'',country:''};
  store.trips.set(id(2),trip(2,B,google));
  await backend(context,store);await login(page);await page.goto('/explore');
  const card=page.getByTestId('discovery-trip-'+id(2));await expect(card).toContainText('Camping Morski');
  await expect(card.getByTestId('google-maps-attribution')).toHaveCount(1);
  await expect(credits(page)).toHaveCount(1);await expect(bar(page)).toBeInViewport();
  await expect(bar(page).getByTestId('google-maps-attribution')).toHaveCount(0);
});
