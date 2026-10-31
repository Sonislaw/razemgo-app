import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mailboxFromRow, messageFromRow, mergeMessages } from '../src/features/messaging/messaging-mapper.ts';
import { createMessagingState, messagingReducer, unreadCount, notificationCount, canSendToConversation } from '../src/features/messaging/messaging-state.ts';
import { selectHomeNotifications } from '../src/features/notifications/notification-state.ts';

const seed={invitations:[],acceptedInvitations:[],conversations:[],messages:[]};
const snapshot={id:'trip',group_id:'a',adult_count:2,child_count:1,child_age_bands:['4–6'],mode:'planned',description:'Spokojny wyjazd nad morze.',start_date:'2027-05-21',end_date:'2027-05-24',location_name:'Chłapowo',location_region:'Pomorskie',campground_name:'Pod Wydmami',landscape:'coast'};
const row={contacts:[{id:'b',name:'Ekipa B',avatar_id:'camp-bear',adult_count:2}],
  invitations:[{id:'inv',sender_group_id:'b',recipient_group_id:'a',trip_id:null,source_trip_id:null,trip_reference:'trip',trip_snapshot:snapshot,source_trip_snapshot:null,text:'Cześć!',status:'accepted',created_at:'2026-10-24T12:00:00Z'}],
  conversations:[{id:'chat',invitation_id:'inv',sender_group_id:'b',recipient_group_id:'a',updated_at:'2026-10-24T12:00:00Z',blocked:false,unread_count:77,self_read_sequence:0,other_read_sequence:0,
    last_message:{id:'m77',sequence:77,conversation_id:'chat',sender_group_id:'b',text:'Ostatnia',created_at:'2026-10-24T12:00:00Z'}}],blocked_group_ids:[],reports:[]};
const mapped=()=>mailboxFromRow(structuredClone(row),'a');
const state=()=>messagingReducer(createMessagingState(seed,'empty'),{type:'hydrate',data:mapped()});

test('mailbox mapping keeps the peer separate from the trip organizer and preserves deleted-trip context',()=>{
  const result=mapped();assert.equal(result.contacts.b.name,'Ekipa B');assert.equal(result.trips.trip.groupId,'a');
  assert.equal(result.invitations[0].groupId,'b');assert.equal(result.invitations[0].ownTripId,'trip');
  assert.equal(result.conversations[0].groupId,'b');assert.equal(result.trips.trip.campgroundName,'Pod Wydmami');
  assert.equal(result.contacts.b.childAgeBands,undefined);
  assert.equal(result.trips.trip.matching,undefined);
});
test('exact unread counts do not depend on how many history pages are loaded',()=>{
  const s=state();assert.equal(s.messages.length,1);assert.equal(unreadCount(s,'chat'),77);assert.equal(notificationCount(s),77);
  const summary=selectHomeNotifications([],[],s,[],'2026-10-24');assert.equal(summary.messages.count,77);assert.equal(summary.messages.conversation.id,'chat');
});
test('read receipts update both directions while old history fetches cannot unread a message',()=>{
  let s=state();s=messagingReducer(s,{type:'read-confirmed',conversationId:'chat',sequence:77});
  assert.equal(unreadCount(s,'chat'),0);assert.equal(s.messages[0].read,true);
  const old={...s.messages[0],read:false};s=messagingReducer(s,{type:'history',messages:[old]});assert.equal(s.messages[0].read,true);
  const self=messageFromRow({...row.conversations[0].last_message,sender_group_id:'a',sequence:76},'a',{...s.conversations[0],otherReadSequence:76});assert.equal(self.read,true);
});
test('a committed response or mailbox update replaces an outbox entry with the same request key',()=>{
  const draft={id:'outbox-key',requestKey:'key',conversationId:'chat',sender:'self',text:'Wysyłana',createdAt:'2026-10-24T12:00:00Z',status:'failed',read:false};
  const sent={...draft,id:'real',sequence:78,status:'sent'};
  const merged=mergeMessages([draft],[sent],state().conversations);assert.equal(merged.length,1);assert.equal(merged[0].id,'real');
  let s=messagingReducer(state(),{type:'outbox',message:draft});s=messagingReducer(s,{type:'message-saved',message:sent,requestKey:'key'});
  s=messagingReducer(s,{type:'message-failed',requestKey:'key'});assert.equal(s.messages.find(m=>m.id==='real').status,'sent');
});
test('server blocks stop both sending and counters while retained history stays available',()=>{
  const s=state();s.conversations[0].blocked=true;assert.equal(canSendToConversation(s,'chat'),false);assert.equal(unreadCount(s,'chat'),0);
  assert.equal(s.messages.length,1);assert.equal(notificationCount(s),0);
});
test('merging mailbox refreshes keeps opened history, de-duplicates messages and drops revoked conversations',()=>{
  const s=state();const older={...s.messages[0],id:'older',sequence:1};
  const withHistory=messagingReducer(s,{type:'history',messages:[older,s.messages[0]]});
  const refreshed=messagingReducer(withHistory,{type:'hydrate',data:mapped()});assert.deepEqual(refreshed.messages.map(m=>m.id),['older','m77']);
  const revoked=messagingReducer(refreshed,{type:'hydrate',data:{...mapped(),conversations:[],messages:[]}});assert.equal(revoked.messages.length,0);
});
