-- Synthetic, disposable LOCAL data only. Callers enforce loopback/PGlite.
-- Direct bulk inserts intentionally do not send Auth mail, generate proposals,
-- or enqueue push; business write paths have separate integration tests.
begin;
insert into auth.users(id) select md5('synthetic-user-'||n)::uuid from generate_series(1,10000) n;
insert into auth.sessions(id,user_id) select md5('synthetic-session-'||n)::uuid,md5('synthetic-user-'||n)::uuid from generate_series(1,200) n;
insert into public.travel_groups(id,owner_user_id,name,avatar_id,kind,adult_count,child_count,child_age_bands,travel_mode,interests,animal_kinds)
select md5('synthetic-group-'||n)::uuid,md5('synthetic-user-'||n)::uuid,'Ekipa '||lpad(n::text,5,'0'),'camp-bear',
  case when n%3=0 then 'couple' else 'family' end,2,case when n%3=0 then 0 else 1 end,
  case when n%3=0 then '{}'::text[] else array['4–6'] end,
  case when n%2=0 then 'Kamper' else 'Przyczepa' end,array['Rowery','Przyroda'],case when n%4=0 then array['dog'] else '{}'::text[] end
from generate_series(1,10000) n;
insert into public.group_preferences(group_id,group_kinds,child_age_bands,description)
select md5('synthetic-group-'||n)::uuid,array['family'],array['4–6'],'' from generate_series(1,10000) n;
insert into public.group_public_profiles(group_id,discoverable,about)
select md5('synthetic-group-'||n)::uuid,true,'Syntetyczny profil do pomiarów.' from generate_series(1,10000) n
on conflict(group_id) do update set discoverable=true,about=excluded.about;
alter table public.trip_plans disable trigger user;
insert into public.trip_plans(id,group_id,mode,status,visibility,start_date,end_date,location_id,location_name,location_region,location_kind,
  campground_name,description,travel_mode,landscape,interests,animal_kinds,matching_group_kinds,matching_child_age_bands,published_at,adult_count,child_count,child_age_bands)
select md5('synthetic-trip-'||n)::uuid,md5('synthetic-group-'||((n-1)/5+1))::uuid,'planned','published','public',
  current_date+7+n%120,current_date+10+n%120,'pl-locality:4259','Chłapowo','pomorskie','village','Kemping testowy',
  'Syntetyczny wyjazd nad morze, rowery i odpoczynek. '||n,'Kamper',
  (array['coast','lake','mountain','forest'])[1+n%4],array['Rowery'],case when n%4=0 then array['dog'] else '{}'::text[] end,'{}','{}',now()-n*interval '1 minute',2,1,array['4–6']
from generate_series(1,50000) n;
alter table public.trip_plans enable trigger user;
alter table public.contact_invitations disable trigger user;
alter table public.conversations disable trigger user;
insert into public.contact_invitations(id,sender_group_id,recipient_group_id,context_kind,trip_id,trip_reference,trip_snapshot,text,status,request_key)
select md5('synthetic-invitation-'||n)::uuid,md5('synthetic-group-'||((n-1)%10000+1))::uuid,md5('synthetic-group-'||(n%10000+1))::uuid,
 'trip',md5('synthetic-trip-'||n)::uuid,md5('synthetic-trip-'||n)::uuid,
 jsonb_build_object('id',md5('synthetic-trip-'||n)::uuid,'group_id',md5('synthetic-group-'||(n%10000+1))::uuid,
 'mode','planned','location_name','Chłapowo','location_region','pomorskie','campground_name','Kemping testowy',
 'start_date',current_date+7,'end_date',current_date+10,'description','Syntetyczny wyjazd do pomiarów.','landscape','coast'),
 'Syntetyczne zaproszenie.','accepted',md5('synthetic-invitation-key-'||n)::uuid from generate_series(1,20000) n;
insert into public.conversations(id,invitation_id,sender_group_id,recipient_group_id)
select md5('synthetic-conversation-'||n)::uuid,md5('synthetic-invitation-'||n)::uuid,
md5('synthetic-group-'||((n-1)%10000+1))::uuid,md5('synthetic-group-'||(n%10000+1))::uuid from generate_series(1,20000) n;
alter table public.contact_invitations enable trigger user;
alter table public.conversations enable trigger user;
alter table public.chat_messages disable trigger user;
insert into public.chat_messages(conversation_id,sender_group_id,text,request_key)
select md5('synthetic-conversation-'||((n-1)/25+1))::uuid,
md5('synthetic-group-'||(((n-1)/25)%10000+1))::uuid,'Syntetyczna wiadomość do pomiarów. '||n,md5('synthetic-message-'||n)::uuid
from generate_series(1,500000) n;
alter table public.chat_messages enable trigger user;
commit;
analyze;
