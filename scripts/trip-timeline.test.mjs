import assert from 'node:assert/strict';
import {test} from 'node:test';
import {getTripTimeline} from '../src/features/trips/trip-timeline-model.ts';

const range=(startDate,endDate,status)=>({startDate,endDate,status});

test('upcoming timelines show real calendar days, today and both dates without modifying the trip',()=>{
  const trip=range('2027-05-07','2027-05-10');const before=structuredClone(trip);
  const t=getTripTimeline(trip,'2026-10-26');
  assert.equal(t.caption,'Za 193 dni');assert.equal(t.daysUntilStart,193);assert.equal(t.phase,'upcoming');assert.equal(t.muted,false);
  assert.deepEqual(t.markers.map(m=>m.label),['Dziś','7 maj','10 maj']);
  assert.ok(t.todayPosition<t.startPosition&&t.startPosition<t.endPosition);
  assert.match(t.accessibilityLabel,/26 października 2026/);assert.match(t.accessibilityLabel,/7 maja 2027/);
  assert.deepEqual(trip,before);
});
test('near and distant plans use a shared reference and retain visible, ordered markers',()=>{
  const positions=[];
  for(const start of ['2026-10-27','2026-11-26','2027-04-26','2027-10-26','2099-10-26']){
    const end=new Date(Date.parse(start)+3*86400000).toISOString().slice(0,10);
    const t=getTripTimeline(range(start,end),'2026-10-26');positions.push(t.startPosition);
    assert.ok(t.markers.every(m=>m.position>=8&&m.position<=92));
    assert.ok(t.endPosition-t.startPosition>=19.99);
  }
  assert.ok(positions[0]<positions[1]&&positions[1]<positions[2]&&positions[2]<positions[3]);
  assert.equal(positions[3],positions[4]);
});
test('starting today combines coincident markers and an ongoing trip puts today inside the stay',()=>{
  const starts=getTripTimeline(range('2026-10-26','2026-10-30'),'2026-10-26');
  assert.equal(starts.caption,'Start dziś');assert.equal(starts.phase,'ongoing');assert.equal(starts.markers.length,2);
  assert.equal(starts.markers[0].label,'Dziś · start');assert.equal(starts.markers.filter(m=>m.isToday).length,1);
  const active=getTripTimeline(range('2026-10-24','2026-10-30'),'2026-10-26');
  assert.equal(active.caption,'Trwa · jeszcze 4 dni');assert.ok(active.todayPosition>active.startPosition&&active.todayPosition<active.endPosition);
  assert.equal(getTripTimeline(range('2026-10-24','2026-10-27'),'2026-10-26').caption,'Trwa · jeszcze 1 dzień');
});
test('checkout is exclusive and completed trips show elapsed days rather than future countdowns',()=>{
  const end=getTripTimeline(range('2026-10-23','2026-10-26'),'2026-10-26');
  assert.equal(end.phase,'past');assert.equal(end.caption,'Zakończony dziś');assert.equal(end.muted,true);
  assert.equal(end.markers.at(-1).label,'Dziś · koniec');assert.equal(end.markers.length,2);
  assert.equal(getTripTimeline(range('2026-10-23','2026-10-25'),'2026-10-26').caption,'Zakończony wczoraj');
  const old=getTripTimeline(range('2026-10-01','2026-10-10'),'2026-10-26');
  assert.equal(old.caption,'Zakończony 16 dni temu');assert.ok(old.endPosition<old.todayPosition);
});
test('cancelled and manually completed plans are muted without suggesting a coming departure',()=>{
  const cancelled=getTripTimeline(range('2027-05-07','2027-05-10','cancelled'),'2026-10-26');
  assert.equal(cancelled.caption,'Wyjazd anulowany');assert.equal(cancelled.muted,true);
  const completed=getTripTimeline(range('2027-05-07','2027-05-10','completed'),'2026-10-26');
  assert.equal(completed.caption,'Wyjazd zakończony');assert.equal(completed.muted,true);
});
test('empty, incomplete, impossible or reversed draft dates have no invented timeline',()=>{
  for(const trip of [range('',''),range('2027-05-07',''),range('2027-02-29','2027-03-03'),range('2027-05-07','2027-05-07'),range('2027-05-10','2027-05-07')])
    assert.equal(getTripTimeline(trip,'2026-10-26'),null);
  assert.equal(getTripTimeline(range('2027-05-07','2027-05-10'),''),null);
});
test('day counts ignore daylight saving hours and support leap years and year boundaries',()=>{
  for(const [today,start,end] of [['2027-03-27','2027-03-29','2027-03-31'],['2026-10-24','2026-10-26','2026-10-28'],['2028-02-28','2028-03-01','2028-03-03']])
    assert.equal(getTripTimeline(range(start,end),today).daysUntilStart,2);
  const year=getTripTimeline(range('2026-12-30','2027-01-03'),'2026-10-26');
  assert.deepEqual(year.markers.map(m=>m.label),['Dziś','30 gru ’26','3 sty ’27']);
  assert.equal(getTripTimeline(range('2027-05-07','2027-05-10'),'2026-10-27').daysUntilStart,192);
});
