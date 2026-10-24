import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MY_GROUP, MY_TRIPS, DEMO_PROPOSALS } from '../src/data/mocks/travel.ts';
import { toTripForm } from '../src/features/trips/own-trips-state.ts';
import { tripToPayload, tripFromRow, proposalFromRow } from '../src/features/trips/trip-mapper.ts';
import { tripCompatibility } from '../src/features/discovery/compatibility.ts';
import { INITIAL_FILTERS } from '../src/features/discovery/filter-trips.ts';

const form = { ...toTripForm({
  ...MY_TRIPS[0], status:'published', visibility:'public',travelModes:['Przyczepa'],
  matching:{groupKinds:['family'],childAgeBands:['4–6']},
}), campgroundName:'  Pod Wydmami  ' };
const row = {
  ...tripToPayload(form), id:'trip-uuid',group_id:'group-uuid',status:'published',
  published_at:'2026-10-24T12:00:00Z',
};
const emptyProfile = {
  group:{...MY_GROUP,travelModes:[],interests:[],animals:{animals:[]}},
  matching:{groupKinds:[],childAgeBands:[],description:''},
};
test('trip mapper preserves identity, exact dates, selected location, travel mode and campground',()=>{
  const payload=tripToPayload(form);
  assert.equal(payload.campground_name,'Pod Wydmami');
  assert.equal(payload.travel_mode,'Przyczepa');
  assert.equal(payload.group_id,undefined);
  assert.equal(payload.owner_user_id,undefined);
  assert.equal(payload.date_flexibility_days,undefined);
  const restored=tripFromRow(row);
  assert.equal(restored.id,row.id);assert.equal(restored.groupId,row.group_id);
  assert.equal(restored.destination.locationId,form.locationId);
  assert.equal(toTripForm(restored).locationId,form.locationId);
  assert.equal(restored.startDate,form.startDate);
  restored.interests.push('New');
  assert.equal(row.interests.includes('New'),false);
});
test('incomplete draft dates remain empty strings and flexible plans strip hidden campground data',()=>{
  const draft=tripFromRow({...row,status:'draft',start_date:null,end_date:null,travel_mode:null,location_id:'',location_name:'',location_region:''});
  assert.equal(draft.startDate,'');assert.equal(draft.endDate,'');assert.deepEqual(draft.travelModes,[]);
  const flexible=tripToPayload({...form,mode:'flexible'});
  assert.equal(flexible.campground_name,'');assert.equal(flexible.campground_address,'');
});
test('public crew projection maps avatars and age bands without requiring private preferences',()=>{
  const crew={id:'crew',name:'Test',avatar_id:'camp-bear',kind:'family',adult_count:2,child_count:1,child_age_bands:['4–6'],travel_mode:'Kamper',interests:[],animal_kinds:[]};
  const proposal=proposalFromRow({trip:row,crew});
  assert.equal(proposal.group.avatarId,'camp-bear');
  assert.equal(proposal.group.owner_user_id,undefined);
  assert.deepEqual(proposal.group.childAgeBands,['4–6']);
  assert.equal(proposal.trip.travelModes[0],'Przyczepa');
});
test('compatibility uses actual dates and tolerance moves the whole stay rather than extending it',()=>{
  const proposal=structuredClone(DEMO_PROPOSALS[0]);
  proposal.trip.travelModes=[];proposal.trip.matching=undefined;proposal.group.travelModes=[];
  const filters={...INITIAL_FILTERS,dateRangeId:'custom',customDateRange:{startDate:'2027-05-21',endDate:'2027-05-24'}};
  const exact=tripCompatibility(proposal,emptyProfile,[],filters,'2026-10-24');
  const flexible=tripCompatibility(proposal,emptyProfile,[],{...filters,dateFlexibilityDays:1},'2026-10-24');
  assert.equal(exact.score,67);assert.equal(flexible.score,100);
  assert.deepEqual(exact.reasons,['Pasujące terminy']);
});
test('explicit age preferences override profile preferences; bilateral trip preferences affect score',()=>{
  const proposal=structuredClone(DEMO_PROPOSALS[0]);
  proposal.group.childAgeBands=['7–9'];proposal.trip.travelModes=[];proposal.trip.matching=undefined;
  const profile={...emptyProfile,matching:{...emptyProfile.matching,childAgeBands:['4–6']}};
  assert.equal(tripCompatibility(proposal,profile,[],INITIAL_FILTERS,'2026-10-24').score,0);
  assert.equal(tripCompatibility(proposal,profile,[],{...INITIAL_FILTERS,childAgeBands:['7–9']},'2026-10-24').score,100);
  proposal.trip.matching={groupKinds:['couple'],childAgeBands:[]};
  assert.equal(tripCompatibility(proposal,emptyProfile,[],INITIAL_FILTERS,'2026-10-24').score,0);
  proposal.trip.matching.groupKinds=['family'];
  assert.equal(tripCompatibility(proposal,emptyProfile,[],INITIAL_FILTERS,'2026-10-24').score,100);
});
test('scores are bounded, deterministic and never mutate source plans or invent date agreement',()=>{
  const before=JSON.stringify(DEMO_PROPOSALS);
  for(const proposal of DEMO_PROPOSALS){
    const value=tripCompatibility(proposal,{...emptyProfile,group:MY_GROUP},[],INITIAL_FILTERS,'2026-10-24');
    assert.ok(Number.isFinite(value.score)&&value.score>=0&&value.score<=100);
    assert.equal(value.reasons.includes('Pasujące terminy'),false);
    assert.deepEqual(value,tripCompatibility(proposal,{...emptyProfile,group:MY_GROUP},[],INITIAL_FILTERS,'2026-10-24'));
  }
  assert.equal(JSON.stringify(DEMO_PROPOSALS),before);
});
test('same-name localities with different ids never count as the same destination',()=>{
  const own=tripFromRow(row);
  const proposal=structuredClone(DEMO_PROPOSALS[0]);
  proposal.trip={...own,id:'other',destination:{...own.destination,locationId:'different-locality'}};
  const result=tripCompatibility(proposal,emptyProfile,[own],{...INITIAL_FILTERS,sourceTripId:own.id},'2026-10-24');
  assert.equal(result.reasons.includes('Wspólny kierunek'),false);
});
test('malformed legacy filter dates and non-finite tolerance never crash or invent agreement',()=>{
  const proposal=structuredClone(DEMO_PROPOSALS[0]);proposal.trip.travelModes=[];
  const result=tripCompatibility(proposal,emptyProfile,[],{...INITIAL_FILTERS,dateRangeId:'custom',customDateRange:{startDate:'invalid',endDate:'invalid'},dateFlexibilityDays:NaN},'2026-10-24');
  assert.equal(Number.isFinite(result.score),true);
  assert.equal(result.reasons.includes('Pasujące terminy'),false);
});
