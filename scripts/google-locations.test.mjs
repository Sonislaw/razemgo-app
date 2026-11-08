import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { testDatabase, asUser, profile, trip } from './support/database.mjs';
import { storePlace, validPlace, manualPlaceError } from '../src/features/trips/place-data.ts';
import { newTripForm, toTripForm, tripFromForm, changeTripMode, validateTripForm } from '../src/features/trips/own-trips-state.ts';
import { tripToPayload, tripFromRow } from '../src/features/trips/trip-mapper.ts';
import { MY_GROUP } from '../src/data/mocks/travel.ts';
import { filterSetPayload, tripCriteriaFromPayload } from '../src/features/saved-filters/saved-filter-data.ts';
import { INITIAL_FILTERS } from '../src/features/discovery/filter-trips.ts';
import { getTripMapTarget, googleMapsSearchUrl } from '../src/features/trips/trip-map-data.ts';
const google={id:'google:ChIJ_selected',googlePlaceId:'ChIJ_selected',source:'google',kind:'campground',name:'Nazwa dostawcy',address:'Adres dostawcy',region:'Region dostawcy',country:'PL',userLabel:'Mój cel',latitude:54,longitude:18};
const manual={id:'manual:'+randomUUID(),source:'manual',kind:'campground',name:'Kemping poza bazą',address:'Leśna 4, Ustka',region:'pomorskie',country:'Polska',latitude:54,longitude:18};

test('manual locations require a complete address or a valid pin; address-derived points keep user labels and use expiring geometry',()=>{
  const noPoint={...manual,latitude:undefined,longitude:undefined};
  assert.equal(manualPlaceError(noPoint),'');
  for(const field of ['address','region','country'])assert(manualPlaceError({...noPoint,[field]:'  '}));
  assert.equal(manualPlaceError({...manual,address:'',region:'',country:'',latitude:0,longitude:0}),'');
  assert(manualPlaceError({...manual,address:'',latitude:91}));
  assert(manualPlaceError({...manual,name:' '}));
  const located={...manual,googlePlaceId:'ChIJ_address'};
  assert(manualPlaceError({...located,address:''}));
  assert.equal(validPlace({...located,googlePlaceId:'../bad'}),false);
  const stored=storePlace(located);assert.equal(stored.name,manual.name);assert.equal(stored.address,manual.address);
  assert.equal(stored.googlePlaceId,'ChIJ_address');assert.equal(stored.latitude,undefined);assert.equal(stored.longitude,undefined);
});

test('new place formats round-trip through forms, payloads and saved filters without persisting Google provider text or geometry',()=>{
  const expected=storePlace(google);
  assert.equal(expected.name,'Mój cel');assert.equal(expected.address,'');assert.equal(expected.latitude,undefined);
  assert.equal(validPlace({...manual,latitude:91}),false);
  for(const place of [google,manual]) {
    const form={...newTripForm({group:MY_GROUP}),locationId:place.id,place,startDate:'2099-05-21',endDate:'2099-05-24',description:'Spokojny wyjazd nad morze i rozmowy przy ognisku.'};
    assert.deepEqual(validateTripForm(form),[]);
    const saved=tripFromForm(form,randomUUID(),MY_GROUP.id,'published');
    assert.equal(toTripForm(saved).place.id,place.id);
    const payload=tripToPayload(form);assert.deepEqual(payload.place_data,storePlace(place));
    const row=tripFromRow({...trip,...payload,id:randomUUID(),group_id:MY_GROUP.id,status:'published',published_at:'2026-11-08T12:00:00Z'});
    assert.equal(row.destination.place.id,place.id);
    const filters={...INITIAL_FILTERS,locationId:place.id,place,location:place.userLabel??place.name};
    const criteria=filterSetPayload({kind:'trips',filters});
    assert.equal(tripCriteriaFromPayload(criteria).place.id,place.id);
    const target=getTripMapTarget(saved),url=new URL(googleMapsSearchUrl(target));
    if(place.source==='google')assert.equal(url.searchParams.get('query_place_id'),place.googlePlaceId);
    else assert.equal(url.searchParams.get('query'),'54,18');
  }
  const broad={...manual,id:'manual:'+randomUUID(),kind:'region'};
  const flexible={...newTripForm({group:MY_GROUP}),mode:'flexible',place:broad,locationId:broad.id};
  assert.equal(changeTripMode(flexible,'planned').place,undefined);
});

test('manual addresses appear on maps using server geometry, survive copying and filtering, and are refreshed after expiry',async()=>{
  const db=await testDatabase();const owner=randomUUID(),viewer=randomUUID();
  const call=async(name,args=[]) => (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result;
  try {
    for(const user of [owner,viewer]){await db.exec('reset role');await db.query('insert into auth.users(id) values($1)',[user]);await asUser(db,user);await call('save_my_profile',[profile('Adres '+user.slice(0,4))]);}
    await asUser(db,owner);
    const located={...manual,googlePlaceId:'ChIJ_manual_address',latitude:1,longitude:2};
    const saved=await call('save_my_trip',[{...trip,location_id:located.id,place_data:located},null,false,randomUUID()]);
    assert.deepEqual(saved.place_data,storePlace(located));
    const copy=await call('duplicate_my_trip',[saved.id]);assert.deepEqual(copy.place_data,saved.place_data);
    await assert.rejects(call('save_my_trip',[{...trip,location_id:manual.id,place_data:{...manual,latitude:undefined,longitude:undefined,address:''}},null,false,randomUUID()]),{code:'22023'});
    const pin={...manual,id:'manual:'+randomUUID(),address:'',region:'',country:''};
    const pinned=await call('save_my_trip',[{...trip,location_id:pin.id,place_data:pin},null,false,randomUUID()]);assert.equal(pinned.place_data.latitude,54);
    await asUser(db,viewer);await assert.rejects(call('record_google_place_geometry',['ChIJ_manual_address',54,18]),{code:'42501'});
    await db.exec('reset role;set role service_role');await call('record_google_place_geometry',['ChIJ_manual_address',54,18]);
    await asUser(db,viewer);assert.equal((await call('search_trip_map')).planned_count,2);
    const criteria=filterSetPayload({kind:'trips',filters:{...INITIAL_FILTERS,locationId:located.id,place:located,location:located.name}});
    assert.equal((await call('search_trip_map',[criteria])).planned_count,2);
    const set=await call('save_my_filter_set',[randomUUID(),'trips','Ręczny adres',criteria]);assert.equal(set.filters.location.place.googlePlaceId,'ChIJ_manual_address');
    assert.equal(set.filters.location.place.address,manual.address);
    await db.exec('reset role');await db.query("update places_private.geometry set expires_at=now()-interval '1 second'");
    await asUser(db,viewer);assert.equal((await call('search_trip_map')).planned_count,1);
    assert((await call('list_my_map_place_refreshes')).includes('ChIJ_manual_address'));
    await db.exec('reset role;set role service_role');assert((await db.query('select * from public.list_google_place_refreshes()')).rows.some(row=>Object.values(row).includes('ChIJ_manual_address')));
  }finally{await db.close();}
});

test('modern destinations publish, copy and filter securely; only verified Google geometry reaches map results',async()=>{
  const db=await testDatabase();const users=[randomUUID(),randomUUID()],groups=[];
  const call=async(name,args=[]) => (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result;
  try {
    for(let i=0;i<2;i++){await db.exec('reset role');await db.query('insert into auth.users(id) values($1)',[users[i]]);await asUser(db,users[i]);const saved=await call('save_my_profile',[JSON.stringify(profile('Miejsca '+i))]);groups.push(saved.group.id);}
    await asUser(db,users[0]);
    const save=place=>call('save_my_trip',[{...trip,location_id:place.id,place_data:place},null,false,randomUUID()]);
    const first=await save({...google,latitude:1,longitude:2});
    assert.deepEqual(first.place_data,storePlace(google));assert.equal(first.location_name,google.userLabel);
    const second=await save(manual);
    const missing=await save({...manual,id:'manual:'+randomUUID(),latitude:undefined,longitude:undefined});
    const copy=await call('duplicate_my_trip',[first.id]);assert.deepEqual(copy.place_data,first.place_data);assert.equal(copy.status,'draft');
    assert.equal((await call('get_my_traveler_passport')).categories.find(c=>c.id==='campgrounds').count,3);
    await assert.rejects(save({...manual,latitude:91}),{code:'22023'});
    await asUser(db,users[1]);
    const all=await call('search_trip_map');assert.equal(all.planned_count,1);assert.equal(all.unmapped_count,2);
    await assert.rejects(call('record_google_place_geometry',['ChIJ_selected',54,18]),{code:'42501'});
    await assert.rejects(call('list_google_place_refreshes'),{code:'42501'});
    await db.exec('reset role;set role service_role');await call('record_google_place_geometry',['ChIJ_selected',54,18]);
    await asUser(db,users[1]);
    const mapped=await call('search_trip_map');assert.equal(mapped.planned_count,2);assert.equal(mapped.unmapped_count,1);
    assert(mapped.points.every(p=>p.latitude===54&&p.longitude===18));
    const filter=filterSetPayload({kind:'trips',filters:{...INITIAL_FILTERS,place:google,location:google.userLabel,locationId:google.id}});
    const filtered=await call('search_trip_map',[filter]);assert.equal(filtered.planned_count,2);
    const set=await call('save_my_filter_set',[randomUUID(),'trips','Kemping',filter]);
    assert.equal(set.filters.location.place.address,'');assert.equal(set.filters.location.place.googlePlaceId,'ChIJ_selected');
    const publicRows=(await db.query('select * from public.list_public_trips($1)',[first.id])).rows;
    assert.equal(publicRows[0].trip.place_data.googlePlaceId,'ChIJ_selected');
    await assert.rejects(call('save_my_trip',[{...trip,place_data:manual},second.id,false,randomUUID()]));
    await db.exec('reset role');await db.query("update places_private.geometry set expires_at=now()-interval '1 second'");
    await asUser(db,users[1]);assert((await call('list_my_map_place_refreshes')).includes('ChIJ_selected'));
    assert.equal((await call('search_trip_map')).planned_count,1);
    assert.equal(missing.place_data.latitude,undefined);
  } finally {await db.close();}
});
