import assert from 'node:assert/strict';
import { test } from 'node:test';
import catalog from '../shared/passport-catalog.json' with { type: 'json' };
import { badgeProgress, emptyPassport, levelProgress, parseTravelerPassport, passportLevel, PASSPORT_BADGE_COUNT, PASSPORT_CATEGORIES, PASSPORT_TIER_POINTS } from '../src/features/passport/passport-data.ts';
import { demoPassport } from '../src/features/passport/passport-demo.ts';
import { createPassportStore } from '../src/features/passport/passport-store.ts';

const deferred = () => { let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject}; };
test('passport level and badge boundaries use cumulative tier points and every level is reachable',()=>{
  for(const l of catalog.levels){
    assert.equal(passportLevel(l.points).level,l.level);
    if(l.points)assert.equal(passportLevel(l.points-1).level,l.level-1);
  }
  assert.equal(PASSPORT_BADGE_COUNT,53);
  const maximum=PASSPORT_CATEGORIES.reduce((sum,c)=>sum+PASSPORT_TIER_POINTS.slice(0,c.thresholds.length).reduce((a,b)=>a+b,0),0);
  assert.ok(maximum>=catalog.levels.at(-1).points);
  const messages=PASSPORT_CATEGORIES.find(c=>c.id==='messages');
  assert.deepEqual(badgeProgress(messages,0,9),{target:10,remaining:1,fraction:0.9});
  assert.deepEqual(badgeProgress(messages,1,10),{target:50,remaining:40,fraction:0});
  assert.deepEqual(badgeProgress(messages,1,30),{target:50,remaining:20,fraction:0.5});
  assert.equal(badgeProgress(messages,4,500).fraction,1);
  assert.equal(levelProgress({...passportLevel(maximum),points:maximum,badge_count:53}).next,undefined);
});
test('runtime passport contracts reject leaked counters, impossible totals, missing/duplicate categories and malformed awards',()=>{
  for(const own of [true,false])assert.deepEqual(parseTravelerPassport(demoPassport('crew',own)),demoPassport('crew',own));
  const cases=[
    p=>{p.version=2;},p=>{p.summary.points++;},p=>{p.summary.badge_count++;},p=>{p.summary.level++;},
    p=>{p.categories.pop();},p=>{p.categories[0]=p.categories[1];},p=>{p.categories[0].awards[0].earned_at='bad';},
    p=>{p.categories[0].awards[0].tier=4;},p=>{p.categories[0].count=0;},
  ];
  for(const mutate of cases){const p=demoPassport('crew');mutate(p);assert.throws(()=>parseTravelerPassport(p));}
  const publicData=demoPassport('crew',false);publicData.categories[0].count=1;
  assert.throws(()=>parseTravelerPassport(publicData));
  assert.deepEqual(parseTravelerPassport(emptyPassport('new')),emptyPassport('new'));
});
test('store deduplicates loads and celebrates only new achievements after the initial snapshot',async()=>{
  const requests=[];
  const store=createPassportStore(()=>{const d=deferred();requests.push(d);return d.promise;});
  const first=store.refresh();assert.equal(first,store.refresh());await Promise.resolve();assert.equal(requests.length,1);
  requests[0].resolve(emptyPassport('crew'));await first;assert.equal(store.getSnapshot().newAward,null);
  const second=store.refresh();await Promise.resolve();requests[1].resolve(demoPassport('crew'));await second;
  assert.equal(store.getSnapshot().newAward.count,demoPassport('crew').summary.badge_count);
  assert.equal(store.getSnapshot().newAward.levelUp,true);
  store.dismissAward();assert.equal(store.getSnapshot().newAward,null);
  const third=store.refresh();await Promise.resolve();requests[2].resolve(demoPassport('crew'));await third;
  assert.equal(store.getSnapshot().newAward,null);
  store.stop();
});
test('connection failures keep the last passport and retry; stopped account requests cannot publish stale data',async()=>{
  let fail=false;
  const store=createPassportStore(async()=>{if(fail)throw Error('offline');return demoPassport('crew');});
  await store.refresh();fail=true;assert.equal(await store.refresh(),false);
  assert.equal(store.getSnapshot().status,'error');assert.equal(store.getSnapshot().data.group_id,'crew');
  fail=false;assert.equal(await store.refresh(),true);assert.equal(store.getSnapshot().error,null);store.stop();
  const d=deferred();let signal;
  const stopped=createPassportStore(s=>{signal=s;return d.promise;});
  const load=stopped.refresh();await Promise.resolve();stopped.stop();assert.equal(signal.aborted,true);
  d.resolve(demoPassport('old-account'));await load;assert.equal(stopped.getSnapshot().data,null);
  assert.equal(await stopped.refresh(),false);
});
