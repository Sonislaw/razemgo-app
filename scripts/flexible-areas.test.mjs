import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {testDatabase,asUser,profile,trip} from './support/database.mjs';
import {validPlace,storePlace,manualPlaceError,manualAreaError,isPlaceAllowedForTrip,areaPlaceLabel} from '../src/features/trips/place-data.ts';
import {changeTripMode,newTripForm,validateTripForm} from '../src/features/trips/own-trips-state.ts';
import {MY_GROUP} from '../src/data/mocks/travel.ts';
import {getTripLocation} from '../src/features/discovery/filter-trips.ts';
const area={id:'manual:'+randomUUID(),source:'manual',scope:'area',kind:'locality',name:'Nowa Wieś',address:'',region:'pomorskie',country:'Polska'};
const camp={id:'google:ChIJ_camp',source:'google',kind:'campground',googlePlaceId:'ChIJ_camp',userLabel:'Camping',name:'Camping',address:'',region:'',country:''};
test('flexible areas exclude campsites and precise pins; mode switches clear incompatible destinations without changing dates',()=>{
 assert(validPlace(area));assert.deepEqual(storePlace(area),area);assert.equal(manualPlaceError(area),'');
 assert(manualAreaError({...area,region:''}));assert(manualAreaError({...area,country:''}));
 assert.equal(manualAreaError({...area,kind:'country',region:'',country:''}),'');
 assert.equal(validPlace({...area,latitude:54,longitude:18}),false);assert.equal(validPlace({...area,kind:'campground'}),false);
 assert.equal(isPlaceAllowedForTrip(camp,'flexible'),false);assert.equal(isPlaceAllowedForTrip(area,'flexible'),true);
 assert.equal(isPlaceAllowedForTrip({...area,scope:undefined,latitude:54,longitude:18},'flexible'),false);
 assert.equal(isPlaceAllowedForTrip(area,'planned'),false);
 const form={...newTripForm({group:MY_GROUP}),mode:'planned',startDate:'2099-05-21',endDate:'2099-05-24',place:camp,locationId:camp.id,description:'Chcemy poznać okolicę i wspólnie wybrać ciekawe miejsce.'};
 const switched=changeTripMode(form,'flexible');assert.equal(switched.locationId,'');assert.equal(switched.place,undefined);assert.equal(switched.startDate,form.startDate);
 assert(validateTripForm({...form,mode:'flexible'}).some(m=>m.includes('Szukam pomysłu')));
 assert.deepEqual(validateTripForm({...form,mode:'flexible',place:area,locationId:area.id}),[]);
 assert.equal(changeTripMode({...form,mode:'flexible',place:area,locationId:area.id},'planned').place,undefined);
 assert.equal(areaPlaceLabel('Giżycko','locality'),'Giżycko i okolice');assert.equal(areaPlaceLabel('Polska','country'),'Polska');
 assert.equal(getTripLocation({mode:'flexible',travelArea:{name:'Giżycko',region:'',place:{...area,name:'Giżycko'}}}),'Giżycko i okolice');
});
test('server accepts manual areas without street or pin, rejects precise flexible destinations and preserves old publications',async()=>{
 const migration='202611080005_flexible_search_areas.sql';const db=await testDatabase({before:migration}),owner=randomUUID();
 const call=async(name,args=[]) => (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
 try{
  await db.query('insert into auth.users(id) values($1)',[owner]);await asUser(db,owner);await call('save_my_profile',[profile('Obszary')]);
  const legacy=await call('save_my_trip',[{...trip,mode:'flexible',location_id:camp.id,place_data:camp},null,false,randomUUID()]);
  await db.exec('reset role');await db.exec(await readFile(new URL('../supabase/migrations/'+migration,import.meta.url),'utf8'));await asUser(db,owner);
  const save=(p,mode='flexible')=>call('save_my_trip',[{...trip,mode,location_id:p.id,place_data:p},null,false,randomUUID()]);
  const saved=await save(area);assert.deepEqual(saved.place_data,area);assert.equal(saved.location_kind,'locality');
  const filters={location:{id:area.id,name:area.name,region:area.region,country:area.country,kind:'locality',place:area}};
  const set=await call('save_my_filter_set',[randomUUID(),'trips','Obszar poszukiwań',filters]);assert.equal(set.filters.location.place.scope,'area');
  const copy=await call('duplicate_my_trip',[saved.id]);assert.deepEqual(copy.place_data,area);
  const country={...area,id:'manual:'+randomUUID(),kind:'country',name:'Chorwacja',region:'',country:''};
  assert.equal((await save(country)).place_data.country,'Chorwacja');
  const region={...area,id:'manual:'+randomUUID(),kind:'region',name:'Mazury'};
  assert.equal((await save(region)).place_data.region,'Mazury');
  for(const p of [camp,{...camp,kind:'place'},{...area,latitude:54,longitude:18},{...area,kind:'campground'},{...area,scope:undefined,address:'Leśna 4',latitude:54,longitude:18}])
   await assert.rejects(save(p),{code:'22023'});
  await assert.rejects(save(area,'planned'),{code:'22023'});
  assert.equal((await save({...camp,kind:'locality',userLabel:'Giżycko'})).place_data.kind,'locality');
  await call('save_my_trip',[{...trip,mode:'flexible',location_id:camp.id,place_data:legacy.place_data},legacy.id,false,randomUUID()]);
  await assert.rejects(call('save_my_trip',[{...trip,mode:'flexible',location_id:'google:ChIJ_other',place_data:{...camp,id:'google:ChIJ_other',googlePlaceId:'ChIJ_other'}},legacy.id,false,randomUUID()]),{code:'22023'});
  assert.equal((await call('search_trip_map')).planned_count,0);
 }finally{await db.close();}
});
