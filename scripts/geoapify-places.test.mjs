import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {getTripLocation} from '../src/features/discovery/filter-trips.ts';
import {geoapifyPlaces,validGeoapifyPlace,geoapifyAddressPoint} from '../shared/geoapify-place-data.ts';
import {newTripForm,tripFromForm,toTripForm,validateTripForm,changeTripMode,changeTripSearchArea} from '../src/features/trips/own-trips-state.ts';
import {tripToPayload,tripFromRow} from '../src/features/trips/trip-mapper.ts';
import {storePlace,validPlace} from '../src/lib/place-format.ts';
import {getTripMapTarget} from '../src/features/trips/trip-map-data.ts';
import {MY_GROUP} from '../src/data/mocks/travel.ts';
import {testDatabase,asUser,profile,trip} from './support/database.mjs';

const area={id:'geoapify:area_ustka',geoapifyPlaceId:'area_ustka',source:'geoapify',scope:'area',kind:'locality',name:'Ustka',address:'',region:'pomorskie',country:'Polska',latitude:54.58,longitude:16.86};
const raw={features:[{properties:{place_id:'camp_morski',name:'Camping Morski',formatted:'Armii Krajowej 4, Ustka',state:'pomorskie',country:'Polska',lat:54.579,lon:16.862,categories:['camping.camp_site']}}]};
const place=geoapifyPlaces(raw,area)[0];
test('places retain full provider names, addresses and points; unrelated areas and malformed results are rejected',()=>{
  assert.equal(place.name,'Camping Morski');assert.equal(place.areaId,area.id);assert.equal(place.kind,'campground');assert(validPlace(place));
  assert.deepEqual(storePlace(place),place);assert.equal(validGeoapifyPlace(area),false);
  for(const invalid of [{latitude:91},{googlePlaceId:'ChIJ_invalid'},{areaId:'../other'},{scope:'area'},{name:''}])assert.equal(validGeoapifyPlace({...place,...invalid}),false);
  assert.deepEqual(geoapifyPlaces({features:[{properties:{...raw.features[0].properties,lat:91}}]},area),[]);
  assert.deepEqual(geoapifyAddressPoint({results:[{state:'województwo pomorskie',country:'Polska',lat:54.579,lon:16.862}]},'pomorskie','PL'),{latitude:54.579,longitude:16.862});
  assert.equal(geoapifyAddressPoint({results:[{state:'mazowieckie',country:'Polska',lat:52,lon:21}]},'pomorskie','Polska'),undefined);
});

test('planned Google destinations expose their saved Geoapify town and stay filterable without Google geometry',async()=>{
  const db=await testDatabase(),owner=randomUUID(),viewer=randomUUID();
  const rpc=async(name,args=[]) => (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
  const near={...area,id:'geoapify:area_nearby',geoapifyPlaceId:'area_nearby',name:'Inna wieś',latitude:54.59};
  const far={...area,id:'geoapify:area_faraway',geoapifyPlaceId:'area_faraway',name:'Odległa wieś',latitude:51};
  try {
    await db.exec('set role service_role');
    const key='geoapify:autocomplete:pl:v1:'+'f'.repeat(64),lease=randomUUID();
    await rpc('claim_api_cache_refresh',[key,lease]);await rpc('commit_api_cache_refresh',[key,lease,{areas:[area,near,far]}]);
    for(const user of [owner,viewer]){await db.exec('reset role');await db.query('insert into auth.users(id) values($1)',[user]);await asUser(db,user);await rpc('save_my_profile',[profile('Mieszana '+user.slice(0,5))]);}
    await asUser(db,owner);
    const google={id:'google:ChIJ_camping',googlePlaceId:'ChIJ_camping',source:'google',kind:'campground',userLabel:'Camp',name:'Camp',address:'',region:'',country:''};
    const saved=await rpc('save_my_trip',[{...trip,search_area_data:area,place_data:google},null,false,randomUUID()]);
    await asUser(db,viewer);
    const publicRow=(await db.query('select * from public.list_public_trips($1)',[saved.id])).rows[0];
    assert.deepEqual(publicRow.trip.search_area_data,area);
    assert.equal(getTripLocation(tripFromRow(publicRow.trip)),'Ustka, pomorskie');
    for(const selected of [area,near,far]) {
      const results=await rpc('search_public_trips_v3',[{trip_modes:['planned'],location:{id:selected.id,place:selected}}]);
      assert.equal(results.items.some(row=>row.trip.id===saved.id),selected!==far);
    }
    await db.exec('reset role');await db.exec("delete from places_private.geometry;update geoapify_private.search_cache set expires_at=now()-interval '1 day';select weather_private.expire_cache();");
    await asUser(db,viewer);
    const after=await rpc('search_public_trips_v3',[{trip_modes:['planned'],location:{id:area.id,place:area}}]);
    assert.equal(after.items[0].trip.search_area_data.name,'Ustka');
  }finally{await db.close();}
});
test('both required fields survive trip forms and map targets without a provider lookup',()=>{
  const form={...newTripForm({group:MY_GROUP}),mode:'planned',searchArea:area,place,locationId:place.id,startDate:trip.start_date,endDate:trip.end_date,description:trip.description};
  assert.deepEqual(validateTripForm(form),[]);
  assert.equal(changeTripSearchArea(form,{...area}),form);
  assert.equal(changeTripSearchArea(form,undefined).place,undefined);
  assert.equal(changeTripSearchArea(form,{...area,name:'Inny obszar'}).locationId,'');
  assert(validateTripForm({...form,searchArea:undefined}).some(m=>m.includes('miejscowość')));
  for(const kind of ['region','country']) {
    assert(validateTripForm({...form,searchArea:{...area,kind}}).some(m=>m.includes('miejscowość')));
    const flexible={...form,mode:'flexible',searchArea:undefined,place:{...area,kind},locationId:area.id};
    assert.deepEqual(validateTripForm(flexible),[]);
    assert.equal(changeTripMode(flexible,'planned').searchArea,undefined);
  }
  assert(validateTripForm({...form,searchArea:{...area,id:'geoapify:other_area',geoapifyPlaceId:'other_area'}}).some(m=>m.includes('konkretne miejsce')));
  const saved=tripFromForm(form,randomUUID(),MY_GROUP.id,'published'),payload=tripToPayload(form);
  assert.deepEqual(toTripForm(saved).searchArea,area);assert.deepEqual(payload.search_area_data,area);
  const parsed=tripFromRow({...trip,...payload,id:saved.id,group_id:MY_GROUP.id,status:'published',published_at:new Date().toISOString()});
  assert.deepEqual(parsed.searchArea,area);assert.deepEqual(parsed.destination.place,place);
  const target=getTripMapTarget(parsed);assert.equal(target.kind,'place');assert.equal(target.googlePlaceId,undefined);assert.equal(target.area.latitude,place.latitude);
  assert.equal(changeTripMode(form,'flexible').searchArea,undefined);assert.equal(changeTripMode(form,'flexible').place,undefined);
});
test('canonical places are private and tied to their area; drafts, copying, weather and expired searches keep database snapshots',async()=>{
  const db=await testDatabase(),owner=randomUUID(),viewer=randomUUID();
  const rpc=async(name,args=[]) => (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
  const cache=async(key,payload)=>{const id=randomUUID();assert.equal((await rpc('claim_api_cache_refresh',[key,id])).state,'acquired');assert.equal(await rpc('commit_api_cache_refresh',[key,id,payload]),true);};
  try {
    await db.exec('set role service_role');
    await cache('geoapify:autocomplete:pl:v1:'+'d'.repeat(64),{areas:[area]});
    await cache('geoapify:places:v1:'+'e'.repeat(64),{areaId:area.id,places:[place]});
    assert.deepEqual(await rpc('get_geoapify_area',[area.id]),area);
    for(const user of [owner,viewer]){await db.exec('reset role');await db.query('insert into auth.users(id) values($1)',[user]);await asUser(db,user);await rpc('save_my_profile',[profile('Miejsca '+user.slice(0,5))]);}
    await asUser(db,owner);
    const data={...trip,place_data:{...place,name:'Forged',latitude:1},search_area_data:{...area,name:'Forged'}};
    const saved=await rpc('save_my_trip',[data,null,false,randomUUID()]);
    assert.deepEqual(saved.place_data,place);assert.deepEqual(saved.search_area_data,area);
    const manualPoint={id:'manual:'+randomUUID(),source:'manual',kind:'place',name:'Polana',address:'Leśna 1',region:'pomorskie',country:'Polska',latitude:54.58,longitude:16.86,coordinateSource:'address'};
    const manual=await rpc('save_my_trip',[{...trip,search_area_data:area,place_data:manualPoint},null,true,randomUUID()]);
    assert.equal(manual.place_data.coordinateSource,'address');
    for(const kind of ['region','country']) {
      const broad={id:'manual:'+randomUUID(),source:'manual',scope:'area',kind,name:'Polska',address:'',region:kind==='region'?'Polska':'',country:'Polska'};
      for(const draft of [true,false])await assert.rejects(rpc('save_my_trip',[{...trip,search_area_data:broad,place_data:manualPoint},null,draft,randomUUID()]),{code:'23514'});
      const flexible=await rpc('save_my_trip',[{...trip,mode:'flexible',search_area_data:null,place_data:broad},null,true,randomUUID()]);
      assert.equal(flexible.place_data.kind,kind);
    }
    assert.deepEqual((await rpc('duplicate_my_trip',[saved.id])).search_area_data,area);
    const draft=await rpc('save_my_trip',[{...trip,search_area_data:area,place_data:null,location_id:'',location_name:'',location_region:'',location_kind:null},null,true,randomUUID()]);
    assert.deepEqual(draft.search_area_data,area);
    await assert.rejects(rpc('save_my_trip',[{...data,search_area_data:null},null,false,randomUUID()]),{code:'23514'});
    await assert.rejects(rpc('save_my_trip',[{...data,place_data:null},null,false,randomUUID()]),{code:'23514'});
    await assert.rejects(rpc('save_my_trip',[{...data,search_area_data:{...area,geoapifyPlaceId:'unknown_area',id:'geoapify:unknown_area'}},null,false,randomUUID()]),{code:'22023'});
    assert.equal((await rpc('get_my_trip_weather_context',[saved.id])).latitude,place.latitude);
    await assert.rejects(rpc('get_geoapify_area',[area.id]),{code:'42501'});
    await assert.rejects(db.query('select * from geoapify_private.places'),{code:'42501'});
    await db.exec('reset role');await db.exec("update geoapify_private.search_cache set expires_at=now()-interval '1 day';select weather_private.expire_cache();");
    await asUser(db,owner);const updated=await rpc('save_my_trip',[{...data,description:'Zmieniony opis ze wszystkimi danymi miejsca z bazy.'},saved.id,false,randomUUID()]);
    assert.deepEqual(updated.place_data,place);assert.deepEqual(updated.search_area_data,area);
    await asUser(db,viewer);const results=await rpc('search_public_trips_v3',[{trip_modes:['planned']}]);
    assert(results.items.some(item=>item.trip.id===saved.id&&item.trip.place_data.name==='Camping Morski'));
  }finally{await db.close();}
});
