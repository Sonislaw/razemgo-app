import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {geoapifyAreas,validGeoapifyArea} from '../shared/geoapify-area-data.ts';
import {storePlace} from '../src/lib/place-format.ts';
import {getTripMapTarget,googleMapsSearchUrl} from '../src/features/trips/trip-map-data.ts';
import {tripFromForm,newTripForm,validateTripForm,toTripForm} from '../src/features/trips/own-trips-state.ts';
import {tripToPayload,tripFromRow} from '../src/features/trips/trip-mapper.ts';
import {MY_GROUP} from '../src/data/mocks/travel.ts';
import {testDatabase,asUser,profile,trip} from './support/database.mjs';

const raw={place_id:'51abcdef1234',result_type:'city',city:'Kozienice',name:'Kozienice',country:'Polska',state:'województwo mazowieckie',lat:51.585,lon:21.55,
  bbox:{lon1:21.48,lat1:51.54,lon2:21.61,lat2:51.63}};
const area=geoapifyAreas({results:[raw]})[0];
test('Geoapify parses full area names and geometry; villages, regions and countries are allowed, streets/POIs/postcodes are excluded',()=>{
  const rows=geoapifyAreas({results:[raw,{...raw,place_id:'village123',city:undefined,name:'Nowa Wieś'},
    {...raw,place_id:'country123',result_type:'country'}, {...raw,place_id:'state123',result_type:'state'},
    ...['street','building','amenity','postcode','unknown'].map(result_type=>({...raw,result_type})),raw]});
  assert.deepEqual(rows.map(p=>p.name),['Kozienice','Nowa Wieś','Polska','województwo mazowieckie']);
  assert(rows.every(validGeoapifyArea));assert.deepEqual(area.bounds,{south:51.54,north:51.63,west:21.48,east:21.61});
  for(const bad of [{latitude:91},{longitude:181},{geoapifyPlaceId:'../secret'},{scope:undefined},{name:''},{googlePlaceId:'ChIJ_bad'}]) {
    assert.equal(validGeoapifyArea({...area,...bad}),false);
    assert.throws(()=>storePlace({...area,...bad}));
  }
  assert.throws(()=>geoapifyAreas({error:'bad response'}));
  assert.deepEqual(geoapifyAreas({results:[{...raw,lat:91},{...raw,place_id:'invalid!'}]}),[]);
});
test('Geoapify areas round-trip with names and bounds; Google map targets use stored coordinates without Google place IDs',()=>{
  const form={...newTripForm({group:MY_GROUP}),mode:'flexible',place:area,locationId:area.id,startDate:trip.start_date,endDate:trip.end_date,description:trip.description};
  assert.deepEqual(validateTripForm(form),[]);assert.deepEqual(storePlace(area),area);
  const saved=tripFromForm(form,randomUUID(),MY_GROUP.id,'published');
  assert.deepEqual(toTripForm(saved).place,area);assert.deepEqual(tripToPayload(form).place_data,area);
  const row=tripFromRow({...trip,...tripToPayload(form),id:randomUUID(),group_id:MY_GROUP.id,status:'published',published_at:new Date().toISOString()});
  assert.deepEqual(row.travelArea.place,area);
  const target=getTripMapTarget(saved);assert.equal(target.source,'geoapify');assert.equal(target.kind,'area');
  assert.equal(target.googlePlaceId,undefined);assert(target.area.radiusMeters>=3000);
  assert.equal(new URL(googleMapsSearchUrl(target)).searchParams.get('map_action'),'map');
});
test('server catalogue keeps Geoapify snapshots canonical, private, durable and compatible with filtering, chat and matching',async()=>{
  const db=await testDatabase(),users=[randomUUID(),randomUUID()];
  const rpc=async(name,args=[]) => (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
  const key='geoapify:autocomplete:pl:v1:'+'a'.repeat(64),refresh=randomUUID();
  try {
    await db.exec('set role service_role');
    assert.equal((await rpc('claim_api_cache_refresh',[key,refresh])).state,'acquired');
    assert.equal(await rpc('commit_api_cache_refresh',[key,refresh,{areas:[area]}]),true);
    assert.deepEqual(await rpc('get_geoapify_search_cache',[key]),{areas:[area]});
    for(let i=0;i<2;i++){
      await db.exec('reset role');await db.query('insert into auth.users(id) values($1)',[users[i]]);await asUser(db,users[i]);
      await rpc('save_my_profile',[profile('Obszar '+i)]);
    }
    const data={...trip,mode:'flexible',place_data:{...area,name:'Tampered label',latitude:1}};
    await asUser(db,users[0]);const saved=await rpc('save_my_trip',[data,null,false,randomUUID()]);
    assert.deepEqual(saved.place_data,area);assert.equal(saved.location_name,'Kozienice');
    assert.deepEqual((await rpc('duplicate_my_trip',[saved.id])).place_data,area);
    assert.equal((await rpc('get_my_trip_weather_context',[saved.id])).latitude,area.latitude);
    await assert.rejects(rpc('save_my_trip',[{...data,mode:'planned'},null,false,randomUUID()]),{code:'22023'});
    await assert.rejects(rpc('save_my_trip',[{...data,place_data:{...area,id:'geoapify:unknown123',geoapifyPlaceId:'unknown123'}},null,false,randomUUID()]),{code:'22023'});
    await asUser(db,users[1]);
    const criteria={trip_modes:['flexible'],location:{id:area.id,name:area.name,region:area.region,country:area.country,kind:area.kind,place:area}};
    assert.equal((await rpc('search_public_trips',[criteria])).items[0].trip.id,saved.id);
    assert.equal((await rpc('save_my_filter_set',[randomUUID(),'trips','Obszar z wyjazdu',criteria])).filters.location.place.name,'Kozienice');
    // A concrete trip inside the area must match in both publication directions.
    const concrete=await rpc('save_my_trip',[{...trip,place_data:{id:'manual:'+randomUUID(),source:'manual',kind:'place',name:'Nad wodą',address:'',region:'',country:'',latitude:51.586,longitude:21.551}},null,false,randomUUID()]);
    await db.exec('reset role');
    const matches=(await db.query('select notifications_private.proposal_matches(a,b) forward,notifications_private.proposal_matches(b,a) reverse from public.trip_plans a,public.trip_plans b where a.id=$1 and b.id=$2',[saved.id,concrete.id])).rows[0];
    assert.deepEqual(matches,{forward:true,reverse:true});
    assert.equal((await db.query('select messaging_private.trip_snapshot(t)->\'place_data\' p from public.trip_plans t where id=$1',[saved.id])).rows[0].p.name,'Kozienice');
    await db.query("update geoapify_private.search_cache set expires_at=now()-interval '1 second'");
    await db.exec('select weather_private.expire_cache();set role service_role');assert.equal(await rpc('get_geoapify_search_cache',[key]),null);
    await asUser(db,users[0]);assert.equal((await rpc('get_my_trip_weather_context',[saved.id])).latitude,area.latitude);
    for(const role of ['anon','authenticated']){
      await db.exec('reset role;set role '+role);
      await assert.rejects(db.query('select * from geoapify_private.areas'),{code:'42501'});
      await assert.rejects(rpc('get_geoapify_search_cache',[key]),{code:'42501'});
      await assert.rejects(rpc('claim_geoapify_provider_request'),{code:'42501'});
    }
  }finally{await db.close();}
});
