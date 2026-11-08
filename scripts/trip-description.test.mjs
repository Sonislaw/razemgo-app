import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DESCRIPTION_ACTIVITIES, DESCRIPTION_COMPANIES, DESCRIPTION_PACES, initialDescriptionAnswers, suggestTripDescription} from '../src/features/trips/trip-description.ts';
import {MAX_TRIP_DESCRIPTION_LENGTH, MIN_TRIP_DESCRIPTION_LENGTH, tripDescriptionLength} from '../src/features/trips/own-trips-state.ts';
const base={mode:'planned',participants:{adultCount:2,childCount:1,childAgeBands:['4–6']},place:{kind:'campground',source:'google',userLabel:'Camping na',name:'Camping nad Wodą',resolvedAt:'2026-11-08T12:00:00Z'}};
const answers={company:'family',pace:'relaxed',activities:['Rowery','Gry planszowe']};

test('description helper initializes only from explicit activities, and does not restore retired companion preferences',()=>{
 const form={interests:['Rowery','Spokojny wypoczynek','Dowolny nieznany wpis']};const before=JSON.stringify(form);
 assert.deepEqual(initialDescriptionAnswers(form),{company:null,pace:'relaxed',activities:['Rowery']});assert.equal(JSON.stringify(form),before);
 assert.deepEqual(initialDescriptionAnswers({interests:[]}),{company:null,pace:null,activities:[]});
 assert.equal(suggestTripDescription(base,{...answers,company:null}), '');assert.equal(suggestTripDescription(base,{...answers,pace:null}), '');
});

test('planned text uses the selected API name rather than a truncated query, works without optional activities and never changes the form',()=>{
 const before=JSON.stringify(base);const text=suggestTripDescription(base,answers);
 for(const value of ['Camping nad Wodą','rodziny z dziećmi','spokojny wypoczynek','jeździć na rowerach i grać w planszówki'])assert(text.includes(value));
 for(const value of ['„Camping na”','zarezerw','plac zabaw','2026','2099'])assert(!text.includes(value));
 assert.equal(JSON.stringify(base),before);assert(!suggestTripDescription(base,{...answers,activities:[]}).includes('Mam ochotę'));
 assert.notEqual(suggestTripDescription(base,answers,0),suggestTripDescription(base,answers,1));
 assert.equal(suggestTripDescription(base,answers,0),suggestTripDescription(base,answers,2));
 const solo=suggestTripDescription({...base,participants:{adultCount:1,childCount:0,childAgeBands:[]}},answers);
 assert(solo.includes('Szukam towarzystwa'));assert(solo.includes('Chętnie poznam'));assert(solo.includes('Mam ochotę'));
});

test('flexible descriptions always keep the exact destination open and tolerate missing or legacy precise locations',()=>{
 for(const variant of [0,1]){
  const flexible={...base,mode:'flexible',place:{...base.place,kind:'region',userLabel:'Pomor',name:'Województwo pomorskie'}};
  const text=suggestTripDescription(flexible,answers,variant);assert(text.includes('„Województwo pomorskie”'));assert(!text.includes('„Pomor”'));assert(text.includes('wybrać'));
  assert(!text.includes('Celem wyjazdu jest'));assert(!text.includes('Cel wyjazdu to'));
  const legacy=suggestTripDescription({...base,mode:'flexible'},answers,variant);assert(!legacy.includes('Camping nad Wodą'));
  const incomplete=suggestTripDescription({...flexible,place:undefined,participants:null},answers,variant);assert(incomplete.length>=MIN_TRIP_DESCRIPTION_LENGTH);
 }
});

test('every company/pace/variant stays within publication limits even with all activities and a maximum-length place name',()=>{
 for(const mode of ['planned','flexible'])for(const company of DESCRIPTION_COMPANIES)for(const pace of DESCRIPTION_PACES)for(const variant of [0,1]){
  const text=suggestTripDescription({...base,mode,place:{...base.place,kind:'locality',name:'Ż'.repeat(160)}},
   {company:company.id,pace:pace.id,activities:DESCRIPTION_ACTIVITIES.map(a=>a.id)},variant);
  assert(tripDescriptionLength(text)>=MIN_TRIP_DESCRIPTION_LENGTH);assert(text.length<=MAX_TRIP_DESCRIPTION_LENGTH,'Generated text exceeds editor limit');
  for(const a of DESCRIPTION_ACTIVITIES)assert(text.includes(a.phrase));
 }
});

test('manually added places retain the entered place name even when they reference a Google address',()=>{
 const place={...base.place,source:'manual',name:'Nasza leśna polana',userLabel:'Nieaktualny wpis',googlePlaceId:'ChIJ_address'};
 const text=suggestTripDescription({...base,place},answers);assert(text.includes('„Nasza leśna polana”'));assert(!text.includes('Nieaktualny wpis'));
});
