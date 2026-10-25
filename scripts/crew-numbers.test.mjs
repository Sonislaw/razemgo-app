import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crewNumberText, matchesCrewSearch } from '../src/features/profile/crew-number.ts';
import { filterPublicGroups, INITIAL_GROUP_FILTERS, publicGroupFromRow } from '../src/features/groups/group-data.ts';
import { profileFromRows, profileToPayload } from '../src/features/profile/profile-mapper.ts';
import { cloneProfile } from '../src/features/profile/profile-data.ts';
import { mailboxFromRow } from '../src/features/messaging/messaging-mapper.ts';

test('crew numbers are displayed only when assigned, with exact numeric search and normalized names',()=>{
  assert.equal(crewNumberText(104827),'Ekipa #104827');assert.equal(crewNumberText(1000000),'Ekipa #1000000');
  for(const invalid of [undefined,null,0,123,-1,NaN,Infinity,104827.5,'104827',Number.MAX_SAFE_INTEGER])assert.equal(crewNumberText(invalid),null);
  for(const query of ['104827','#104827',' # 104827 ','000104827','#000104827'])assert.equal(matchesCrewSearch('Łąkowa ekipa',104827,query),true);
  for(const query of ['1048','#1048','#abc','104828','999999999999999999999999999999999999'])assert.equal(matchesCrewSearch('Łąkowa ekipa',104827,query),false);
  assert.equal(matchesCrewSearch('Łąkowa ekipa',104827,' LAKOWA '),true);assert.equal(matchesCrewSearch('Łąkowa ekipa',undefined,'#104827'),false);
});
test('number survives profile load and editing but never enters the write payload; public and chat adapters carry it',()=>{
  const group={id:'a',crew_number:104827,owner_user_id:'user',name:'Ekipa',avatar_id:'camp-bear',kind:'couple',adult_count:2,child_count:0,
    child_age_bands:[],travel_mode:'Kamper',interests:[],animal_kinds:[]};
  const profile=profileFromRows(group,{group_id:'a',group_kinds:[],child_age_bands:[],description:''});
  assert.equal(profile.group.crewNumber,104827);assert.equal(cloneProfile(profile).group.crewNumber,104827);
  assert.equal('crew_number' in profileToPayload(profile),false);assert.equal('crewNumber' in profileToPayload(profile),false);
  const publicProfile=publicGroupFromRow({crew:group,about:'',active_trip_count:0});assert.equal(publicProfile.group.crewNumber,104827);
  const mailbox=mailboxFromRow({contacts:[group],invitations:[],conversations:[],blocked_group_ids:[],reports:[]},'b');
  assert.equal(mailbox.contacts.a.crewNumber,104827);
});
test('identical names and avatars remain separate, and exact number filters combine with existing criteria',()=>{
  const group={id:'a',name:'Ta sama ekipa',crewNumber:104827,avatarId:'camp-bear',kind:'couple',adultCount:2,childCount:0,
    childAgeBands:[],travelModes:['Kamper'],interests:['Rowery'],animals:{animals:[]}};
  const items=[{group,about:'',activeTripCount:0},{group:{...group,id:'b',crewNumber:104828},about:'',activeTripCount:1}];
  assert.equal(filterPublicGroups(items,{...INITIAL_GROUP_FILTERS,name:'ta sama'}).length,2);
  assert.deepEqual(filterPublicGroups(items,{...INITIAL_GROUP_FILTERS,name:'#104828'}).map(p=>p.group.id),['b']);
  assert.equal(filterPublicGroups(items,{...INITIAL_GROUP_FILTERS,name:'#104827',hasTrips:true}).length,0);
  assert.equal(filterPublicGroups(items,{...INITIAL_GROUP_FILTERS,name:'#104828',onlineOnly:true}).length,0);
  assert.equal(filterPublicGroups(items,{...INITIAL_GROUP_FILTERS,name:'#104828',favoritesOnly:true},new Set(),new Set(['b'])).length,1);
});
