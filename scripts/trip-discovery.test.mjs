import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTripSearchStore} from '../src/features/discovery/discovery-store.ts';
import {discoveryFiltersPayload} from '../src/features/discovery/discovery-data.ts';
import {INITIAL_FILTERS} from '../src/features/discovery/filter-trips.ts';
const item=id=>({trip:{id},group:{id:'crew'},compatibility:{score:50,reasons:[]}});
const cursor=id=>({id,published_at:'2026-10-26T10:00:00Z',score:50,sort:'default',query_key:'test'});
const page=(ids,total=ids.length,more=false)=>({items:ids.map(item),totalCount:total,hasMore:more,cursor:ids.length?cursor(ids.at(-1)):null});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};

test('a trip list initially requests one page and loads additional results only on demand',async()=>{
  const calls=[];const store=createTripSearchStore(async c=>{calls.push(c);return c?page(['b','c'],65):page(['a','b'],65,true);},2);
  await store.refresh();assert.equal(calls.length,1);assert.equal(store.getSnapshot().totalCount,65);assert.equal(store.getSnapshot().items.length,2);
  await store.more();assert.equal(calls.length,2);assert.equal(calls[1].id,'b');assert.deepEqual(store.getSnapshot().items.map(p=>p.trip.id),['a','b','c']);
  await store.more();assert.equal(calls.length,2);
});
test('failed load-more keeps confirmed rows, count and cursor and retries that page exactly once',async()=>{
  let fail=true,requests=0;const gate=deferred();
  const store=createTripSearchStore(async c=>{if(!c)return page(['a','b'],5,true);requests++;if(fail)throw new Error('offline');return gate.promise;},2);
  await store.refresh();await store.more();assert.equal(store.getSnapshot().status,'error');assert.equal(store.getSnapshot().cursor.id,'b');assert.equal(store.getSnapshot().totalCount,5);
  fail=false;const pending=store.retry();await store.more();assert.equal(requests,2);gate.resolve(page(['c','d'],5,true));await pending;
  assert.deepEqual(store.getSnapshot().items.map(p=>p.trip.id),['a','b','c','d']);assert.equal(store.getSnapshot().status,'ready');
});
test('a refresh supersedes a delayed next page and stopping a list rejects late old-account replies',async()=>{
  const more=deferred();let version=0;
  const store=createTripSearchStore(async c=>c?more.promise:page([version?'fresh':'old'],3,true),1);
  await store.refresh();const pending=store.more();version++;await store.refresh();more.resolve(page(['stale'],3));await pending;
  assert.deepEqual(store.getSnapshot().items.map(p=>p.trip.id),['fresh']);
  const late=deferred(),previous=createTripSearchStore(()=>late.promise),next=createTripSearchStore(async()=>page(['other-account']));
  const load=previous.refresh();previous.stop();await next.refresh();late.resolve(page(['private-old-data']));await load;
  assert.equal(previous.getSnapshot().items.length,0);assert.equal(next.getSnapshot().items[0].trip.id,'other-account');
});
test('foreground refresh restores only previously viewed pages and a failed refresh retains confirmed data',async()=>{
  let calls=0,fail=false;
  const store=createTripSearchStore(async c=>{calls++;if(fail)throw new Error();return c?page(['c','d'],100,true):page(['a','b'],100,true);},2);
  await store.refresh();await store.more();calls=0;await store.refresh();assert.equal(calls,2);assert.equal(store.getSnapshot().items.length,4);
  fail=true;await store.refresh();assert.equal(store.getSnapshot().items.length,4);assert.equal(store.getSnapshot().hasLoaded,true);assert.equal(store.getSnapshot().status,'error');
});
test('query payload preserves selected location identity, date tolerance and source and canonicalizes equivalent choices',()=>{
  const filters={...INITIAL_FILTERS,tripModes:['flexible','planned'],locationId:'pl-locality:4259',location:'Chłapowo',dateRangeId:'custom',customDateRange:{startDate:'2099-05-21',endDate:'2099-05-24'},dateFlexibilityDays:2,sourceTripId:'source',landscapeKinds:['forest','coast']};
  const f=discoveryFiltersPayload(filters);assert.equal(f.location.id,'pl-locality:4259');assert.equal(f.location.country,'Polska');assert.equal(f.start_date,'2099-05-21');assert.equal(f.tolerance_days,2);assert.equal(f.source_trip_id,'source');
  assert.deepEqual(f,discoveryFiltersPayload({...filters,tripModes:['planned','flexible'],landscapeKinds:['coast','forest']}));
  const cleared=discoveryFiltersPayload({...filters,dateRangeId:'all',locationId:undefined,location:''});assert.equal(cleared.start_date,null);assert.equal(cleared.tolerance_days,0);assert.equal(cleared.location,null);
});
