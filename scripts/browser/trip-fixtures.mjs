import { expect } from '@playwright/test';

const A='00000000-0000-4000-8000-000000000001';
const B='00000000-0000-4000-8000-000000000002';
const groupId=id=>id===A?'00000000-0000-4000-8000-000000000101':'00000000-0000-4000-8000-000000000102';
const user=id=>({id,aud:'authenticated',role:'authenticated',email:id===A?'a@example.com':'b@example.com',email_confirmed_at:'2026-10-24T10:00:00Z',app_metadata:{provider:'email',providers:['email']},user_metadata:{},identities:[],created_at:'2026-10-24T10:00:00Z'});
const session=id=>({
  access_token:[Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),Buffer.from(JSON.stringify({sub:id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'test-signature'].join('.'),
  refresh_token:'refresh-'+id,expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:user(id),
});
function profile(id){
  return {
    group:{id:groupId(id),owner_user_id:id,name:id===A?'Ekipa A':'Ekipa B',avatar_id:id===A?'camp-bear':'trail-fox',kind:'family',adult_count:2,child_count:1,child_age_bands:['4–6'],travel_mode:'Kamper',interests:['Rowery'],animal_kinds:[]},
    preferences:{group_id:groupId(id),group_kinds:['family'],child_age_bands:['4–6'],description:''},
  };
}
function state(){return {trips:new Map(),next:301,failSave:false,failLoad:false,failPublic:false, invitations:[], conversations:[], messages:[], reads:new Map(), blocks:new Set(), reports:[], failMailbox:false,failSend:false,failInvitation:false, failHistory:false,
  notifications:[],notificationPreferences:new Map(),failNotifications:false,failNotificationSave:false};}
async function backend(context,store){
  await context.route('https://monitoring.razemgo.invalid/**',route=>route.fulfill({status:200,body:'{}',headers:{'access-control-allow-origin':'*'}}));
  await context.route('http://127.0.0.1:54321/**',async route=>{
    const request=route.request(),url=new URL(request.url());
    const headers={'access-control-allow-origin':'http://localhost:8085','access-control-allow-headers':'*','access-control-allow-methods':'GET, POST, PUT, DELETE, OPTIONS','content-type':'application/json','x-supabase-api-version':'2024-01-01','access-control-expose-headers':'x-supabase-api-version'};
    const respond=(value,status=200)=>route.fulfill({status,headers,body:JSON.stringify(value)});
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
    const body=request.postDataJSON()??{};
    let id=A;
    try{id=JSON.parse(Buffer.from((request.headers().authorization??'').split('.')[1],'base64url').toString()).sub;}catch{}
    if(url.pathname.endsWith('/token'))return respond(session(body.email==='b@example.com'?B:A));
    if(url.pathname.endsWith('/user'))return respond(user(id));
    if(url.pathname.endsWith('/logout'))return respond({});
    if(url.pathname==='/rest/v1/rpc/get_my_account_access')return respond({is_admin:store.admin===true&&id===A,suspended:store.suspended===id,hidden_trip_ids:[]});
    if(url.pathname==='/rest/v1/travel_groups')return respond([profile(id).group]);
    if(url.pathname==='/rest/v1/group_preferences')return respond(profile(id).preferences);
    if(url.pathname==='/rest/v1/rpc/get_my_notifications'){
      if(store.failNotifications)return respond({message:'Offline'},503);
      const all=store.notifications.filter(n=>n.recipient_group_id===groupId(id));
      const entries=all.filter(n=>(!body.only_unread||!n.read_at)&&(!body.before_at||n.created_at<body.before_at||n.created_at===body.before_at&&n.id<body.before_id))
        .sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));
      return respond({items:entries.slice(0,body.page_size??30),has_more:entries.length>(body.page_size??30),unread_count:all.filter(n=>!n.read_at).length,
        preferences:store.notificationPreferences.get(groupId(id))??{push_messages:true,push_invitations:true,updated_at:null},fetched_at:new Date().toISOString()});
    }
    if(url.pathname==='/rest/v1/rpc/mark_my_notifications_read'){
      if(store.failNotificationSave)return respond({message:'Offline'},503);
      let changed=0;
      for(const n of store.notifications)if(n.recipient_group_id===groupId(id)&&!n.read_at&&(body.notification_ids?body.notification_ids.includes(n.id):n.created_at<=body.read_through)){n.read_at=new Date().toISOString();changed++;}
      return respond(changed);
    }
    if(url.pathname==='/rest/v1/rpc/save_my_notification_preference'){
      if(store.failNotificationSave)return respond({message:'Offline'},503);
      const previous=store.notificationPreferences.get(groupId(id))??{push_messages:true,push_invitations:true,updated_at:null};
      const saved={...previous,[body.preference_key==='messages'?'push_messages':'push_invitations']:body.enabled,updated_at:new Date().toISOString()};
      store.notificationPreferences.set(groupId(id),saved);return respond(saved);
    }
    if(url.pathname.startsWith('/rest/v1/rpc/')&&[
      'get_my_mailbox','send_contact_invitation','respond_contact_invitation','send_chat_message',
      'mark_conversation_read','get_conversation_messages','set_group_block','report_conversation',
    ].includes(url.pathname.split('/').at(-1)))return messagingEndpoint(url.pathname.split('/').at(-1),id,body,store,respond);
    if(url.pathname==='/rest/v1/trip_plans'){
      if(store.failLoad)return respond({message:'Temporary failure'},503);
      return respond([...store.trips.values()].filter(trip=>trip.group_id===groupId(id)));
    }
    if(url.pathname==='/rest/v1/rpc/list_public_trips'){
      if(store.failPublic)return respond({message:'Temporary failure'},503);
      return respond([...store.trips.values()].filter(trip=>trip.group_id!==groupId(id)&&trip.status==='published'&&trip.visibility==='public'&&trip.end_date>'2026-10-24').map(trip=>({trip,crew:profile(trip.group_id===groupId(A)?A:B).group})));
    }
    if(url.pathname==='/rest/v1/rpc/save_my_trip'){
      if(store.failSave===true)return respond({message:'Temporary failure'},503);
      expect(body.trip_data.group_id).toBeUndefined();expect(body.trip_data.owner_user_id).toBeUndefined();
      expect(body.request_key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      const previous=body.trip_id?store.trips.get(body.trip_id):[...store.trips.values()].find(trip=>trip.group_id===groupId(id)&&trip.create_key===body.request_key);
      if(body.trip_id&&previous?.group_id!==groupId(id))return respond({code:'P0002'},404);
      const tripId=body.trip_id??previous?.id??'00000000-0000-4000-8000-'+String(store.next++).padStart(12,'0');
      let status=previous?.status&&previous.status!=='draft'?previous.status:body.as_draft?'draft':'published';
      if(status==='published'&&body.trip_data.visibility==='private')status='paused';
      const trip={...body.trip_data,id:tripId,create_key:body.request_key,group_id:groupId(id),status,published_at:previous?.published_at??(status==='published'?'2026-10-24T12:00:00Z':null),created_at:previous?.created_at??'2026-10-24T12:00:00Z',updated_at:'2026-10-24T12:00:00Z'};
      store.trips.set(tripId,trip);
      if(store.failSave==='after-commit')return respond({message:'Lost response'},503);
      return respond(trip);
    }
    if(['/rest/v1/rpc/change_my_trip_status','/rest/v1/rpc/duplicate_my_trip','/rest/v1/rpc/delete_my_trip'].includes(url.pathname)){
      const previous=store.trips.get(body.trip_id);
      if(previous?.group_id!==groupId(id))return respond({code:'P0002'},404);
      if(url.pathname.endsWith('/delete_my_trip')){store.trips.delete(body.trip_id);return respond(body.trip_id);}
      if(url.pathname.endsWith('/duplicate_my_trip')){
        const copied={...previous,id:'00000000-0000-4000-8000-'+String(store.next++).padStart(12,'0'),status:'draft',visibility:'private',published_at:null};
        store.trips.set(copied.id,copied);return respond(copied);
      }
      const changed={...previous,status:body.new_status,visibility:body.new_status==='published'?'public':previous.visibility};
      store.trips.set(changed.id,changed);return respond(changed);
    }
    return respond({message:'Unhandled test endpoint'},400);
  });
}
async function login(page,email='a@example.com'){
  await page.clock.setFixedTime(new Date('2026-10-24T12:00:00Z'));
  await page.goto('/auth/sign-in');
  await page.getByRole('textbox',{name:'E-mail',exact:true}).fill(email);
  await page.getByLabel('Hasło',{exact:true}).fill('correct-password');
  await page.getByRole('button',{name:'Zaloguj się',exact:true}).click();
  await expect(page).toHaveURL('http://localhost:8085/');
}

export { A,B,groupId,user,session,profile,state,backend,login };

async function messagingEndpoint(name,id,body,store,respond){
  const me=groupId(id),other=groupId(id===A?B:A);
  const next=()=>`00000000-0000-4000-8000-${String(store.next++).padStart(12,'0')}`;
  const now=()=>new Date().toISOString();
  const pairBlocked=()=>store.blocks.has(me)||store.blocks.has(other);
  const owned=()=>store.conversations.find(c=>c.id===body.conversation_id&&[c.sender_group_id,c.recipient_group_id].includes(me));
  if(name==='get_my_mailbox'){
    if(store.failMailbox)return respond({message:'Offline'},503);
    const invitations=store.invitations.filter(i=>[i.sender_group_id,i.recipient_group_id].includes(me));
    const conversations=store.conversations.filter(c=>[c.sender_group_id,c.recipient_group_id].includes(me)).map(c=>{
      const messages=store.messages.filter(m=>m.conversation_id===c.id);
      const self=store.reads.get(c.id+me)??0,peer=store.reads.get(c.id+other)??0;
      return {...c,blocked:pairBlocked(),self_read_sequence:self,other_read_sequence:peer,
        unread_count:messages.filter(m=>m.sender_group_id!==me&&m.sequence>self).length,last_message:messages.at(-1)??null};
    });
    return respond({invitations,conversations,contacts:invitations.length?[profile(id===A?B:A).group]:[],blocked_group_ids:store.blocks.has(me)?[other]:[],reports:store.reports.filter(r=>r.reporter===me)});
  }
  if(name==='send_contact_invitation'){
    if(store.failInvitation===true)return respond({message:'Offline'},503);
    const target=store.trips.get(body.target_trip_id);
    if(!target||target.group_id===me||target.status!=='published')return respond({code:'P0002'},404);
    const previous=store.invitations.find(i=>i.request_key===body.request_key&&i.sender_group_id===me);
    if(previous)return respond(previous.id);
    if(pairBlocked())return respond({code:'42501'},403);
    const invitation={id:next(),sender_group_id:me,recipient_group_id:target.group_id,trip_id:target.id,
      source_trip_id:body.source_trip_id,trip_reference:target.id,trip_snapshot:target,
      source_trip_snapshot:body.source_trip_id?store.trips.get(body.source_trip_id):null,
      text:body.message_text,status:'pending',created_at:now(),request_key:body.request_key};
    store.invitations.push(invitation);
    if(store.failInvitation==='after-commit')return respond({message:'Lost response'},503);
    return respond(invitation.id);
  }
  if(name==='respond_contact_invitation'){
    const invitation=store.invitations.find(i=>i.id===body.invitation_id);
    if(!invitation)return respond({code:'P0002'},404);
    if((body.response==='withdrawn'?invitation.sender_group_id:invitation.recipient_group_id)!==me)return respond({code:'42501'},403);
    if(invitation.status!==body.response&&invitation.status!=='pending')return respond({code:'22023'},400);
    invitation.status=body.response;
    if(body.response!=='accepted')return respond(null);
    let c=store.conversations.find(c=>c.invitation_id===invitation.id);
    if(!c){c={id:next(),invitation_id:invitation.id,sender_group_id:invitation.sender_group_id,recipient_group_id:invitation.recipient_group_id,updated_at:now()};store.conversations.push(c);
      store.messages.push({id:next(),sequence:1,conversation_id:c.id,sender_group_id:invitation.sender_group_id,text:invitation.text,created_at:now()});}
    return respond(c.id);
  }
  if(name==='send_chat_message'){
    if(!owned())return respond({code:'42501'},403);
    if(store.failSend===true)return respond({message:'Offline'},503);
    const existing=store.messages.find(m=>m.request_key===body.request_key&&m.sender_group_id===me);
    if(existing)return respond(existing);
    if(pairBlocked())return respond({code:'42501'},403);
    const m={id:next(),sequence:Math.max(0,...store.messages.map(m=>m.sequence))+1,conversation_id:body.conversation_id,sender_group_id:me,text:body.message_text,request_key:body.request_key,created_at:now()};
    store.messages.push(m);owned().updated_at=now();
    if(store.failSend==='after-commit')return respond({message:'Lost response'},503);
    return respond(m);
  }
  if(name==='get_conversation_messages'){
    if(!owned())return respond({code:'42501'},403);
    if(store.failHistory)return respond({message:'Offline'},503);
    return respond(store.messages.filter(m=>m.conversation_id===body.conversation_id&&(!body.before_sequence||m.sequence<body.before_sequence)).sort((a,b)=>b.sequence-a.sequence).slice(0,body.page_size??50));
  }
  if(name==='mark_conversation_read'){
    if(!owned())return respond({code:'42501'},403);
    const m=store.messages.find(m=>m.id===body.through_message_id&&m.conversation_id===body.conversation_id);
    if(!m)return respond({code:'P0002'},404);
    const value=Math.max(store.reads.get(body.conversation_id+me)??0,m.sequence);store.reads.set(body.conversation_id+me,value);
    for(const n of store.notifications)if(n.recipient_group_id===me&&n.conversation_id===body.conversation_id&&!n.read_at)n.read_at=now();
    return respond(value);
  }
  if(name==='set_group_block'){if(body.blocked)store.blocks.add(me);else store.blocks.delete(me);return respond(null);}
  if(name==='report_conversation'){
    if(!owned())return respond({code:'42501'},403);
    let report=store.reports.find(r=>r.request_key===body.request_key&&r.reporter===me);
    if(!report){report={id:next(),reporter:me,group_id:other,conversation_id:body.conversation_id,reason:body.report_reason,request_key:body.request_key};store.reports.push(report);}
    return respond(report.id);
  }
}
