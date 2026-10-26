import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createGroupProfileStore} from '../src/features/groups/group-profile-store.ts';

const rows=Array.from({length:13},(_,i)=>({trip:{id:String(i)}}));
const response=(offset=0)=>({group:{id:'crew'},about:'Opis',activeTripCount:13,trips:rows.slice(offset,offset+5),
  hasMore:offset+5<13,cursor:{id:String(Math.min(offset+5,13)-1),published_at:'2099-01-01',query_key:'crew'}});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

test('crew listings fetch five at a time, keep the total and stop at the end',async()=>{
  const calls=[];
  const store=createGroupProfileStore(async cursor=>{calls.push(cursor);return response(cursor?Number(cursor.id)+1:0);});
  await store.restart();assert.equal(store.getSnapshot().data.trips.length,5);assert.equal(store.getSnapshot().data.activeTripCount,13);
  await store.more();assert.equal(store.getSnapshot().data.trips.length,10);
  await store.more();assert.equal(store.getSnapshot().data.trips.length,13);assert.equal(store.getSnapshot().data.hasMore,false);
  await store.more();assert.equal(calls.length,3);
});

test('a failed next page keeps cards, retries the same cursor and prevents simultaneous loads',async()=>{
  let fail=true;const waiting=deferred(),calls=[];
  const store=createGroupProfileStore(async cursor=>{
    calls.push(cursor);if(cursor){await waiting.promise;if(fail)throw new Error('Offline');}return response(cursor?Number(cursor.id)+1:0);
  });
  await store.restart();const more=store.more();await store.more();assert.equal(calls.length,2);
  assert.equal(store.getSnapshot().loadingMore,true);assert.equal(store.getSnapshot().data.trips.length,5);
  waiting.resolve();await more;assert.equal(store.getSnapshot().status,'error');assert.equal(store.getSnapshot().data.trips.length,5);
  fail=false;await store.retry();assert.deepEqual(calls[1],calls[2]);assert.equal(store.getSnapshot().data.trips.length,10);
});

test('refresh restores viewed pages without clearing cards; restart resets to five',async()=>{
  const calls=[];let fail=false;
  const store=createGroupProfileStore(async cursor=>{calls.push(cursor);if(fail)throw new Error('Offline');return response(cursor?Number(cursor.id)+1:0);});
  await store.restart();await store.more();const old=store.getSnapshot().data;
  fail=true;await store.refresh();assert.equal(store.getSnapshot().data,old);
  fail=false;const retry=store.retry();assert.equal(store.getSnapshot().data,old);await retry;
  assert.equal(store.getSnapshot().data.trips.length,10);assert.equal(calls.at(-2),undefined);assert.equal(calls.at(-1).id,'4');
  await store.restart();assert.equal(store.getSnapshot().data.trips.length,5);
});

test('late pages cannot cross focus, profile or account boundaries; unavailability clears cards',async()=>{
  const waiting=deferred();let delayed=false,available=true;
  const store=createGroupProfileStore(async cursor=>cursor&&delayed?waiting.promise:available?response(cursor?Number(cursor.id)+1:0):null);
  await store.restart();delayed=true;const pending=store.more();store.stop();available=false;await store.restart();
  waiting.resolve(response(5));await pending;assert.equal(store.getSnapshot().data,null);assert.equal(store.getSnapshot().status,'ready');
});

test('repeated cursors cannot loop and repeated trip ids never create duplicate cards',async()=>{
  let duplicate=false;
  const store=createGroupProfileStore(async cursor=>{
    if(!cursor)return response();
    return duplicate?{...response(5),trips:[rows[4],...rows.slice(5,9)]}:{...response(5),cursor};
  });
  await store.restart();await store.more();assert.equal(store.getSnapshot().status,'error');assert.equal(store.getSnapshot().data.trips.length,5);
  duplicate=true;await store.retry();assert.equal(store.getSnapshot().data.trips.length,9);
});
