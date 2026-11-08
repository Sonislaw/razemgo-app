-- Dev only. Disposable accounts, geometry, inbox entries and push jobs roll back.
-- pg_net wakes run only after commit, so this check never contacts a push provider.
begin;
set local statement_timeout='30s';
do $$
declare u uuid; s uuid; saved jsonb;
begin
  for i in 1..2 loop
    u:=gen_random_uuid();s:=gen_random_uuid();
    insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values(u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',u::text||'@google-proposal-check.invalid',now(),'{}','{}',now(),now());
    insert into auth.sessions(id,user_id,created_at,updated_at) values(s,u,now(),now());
    perform set_config('qa.proposal_user_'||i,u::text,true);
    perform set_config('request.jwt.claim.sub',u::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'session_id',s,'role','authenticated')::text,true);
    saved:=public.save_my_profile(jsonb_build_object('name','Kontrola mapy '||i,'avatar_id','trail-fox','kind','couple',
      'adult_count',2,'child_count',0,'child_age_bands','[]'::jsonb,'travel_mode','Kamper','interests','[]'::jsonb,
      'animal_kinds','[]'::jsonb,'matching',jsonb_build_object('group_kinds','[]'::jsonb,'child_age_bands','[]'::jsonb,'description','')));
    perform set_config('qa.proposal_group_'||i,saved->'group'->>'id',true);
    if i=1 then perform public.register_my_push_device(gen_random_uuid(),gen_random_uuid(),
      'ExponentPushToken['||replace(gen_random_uuid()::text,'-','')||']','android','b7305e7b-7e1c-4b12-9123-caa0587f49b0');end if;
  end loop;
end $$;
do $$
declare place jsonb; payload jsonb; saved jsonb; session_id uuid;
begin
  perform public.record_google_place_geometry('ChIJ_QA_proposal_region',54,18,'{"south":53,"north":55,"west":16,"east":20}'::jsonb);
  perform public.record_google_place_geometry('ChIJ_QA_proposal_town',54.01,18.01);
  for i in 1..4 loop
    perform set_config('request.jwt.claim.sub',current_setting('qa.proposal_user_'||case when i=1 then 1 else 2 end),true);
    select id into session_id from auth.sessions where user_id=auth.uid() limit 1;
    perform set_config('request.jwt.claims',jsonb_build_object('sub',auth.uid(),'session_id',session_id,'role','authenticated')::text,true);
    place:=case i
      when 1 then jsonb_build_object('id','google:ChIJ_QA_proposal_region','source','google','kind','region','googlePlaceId','ChIJ_QA_proposal_region','userLabel','Obszar kontrolny','name','Obszar kontrolny','address','','region','','country','')
      when 2 then jsonb_build_object('id','manual:'||gen_random_uuid(),'source','manual','kind','place','name','Punkt kontrolny','address','','region','','country','','latitude',54,'longitude',18)
      when 3 then jsonb_build_object('id','google:ChIJ_QA_proposal_town','source','google','kind','locality','googlePlaceId','ChIJ_QA_proposal_town','userLabel','Miejscowość kontrolna','name','Miejscowość kontrolna','address','','region','','country','')
      else jsonb_build_object('id','google:ChIJ_QA_proposal_late','source','google','kind','campground','googlePlaceId','ChIJ_QA_proposal_late','userLabel','Brak geometrii','name','Brak geometrii','address','','region','','country','') end;
    payload:=jsonb_build_object('adult_count',2,'child_count',0,'child_age_bands','[]'::jsonb,
      'mode',case when i in(1,3) then 'flexible' else 'planned' end,'visibility','public','start_date','2099-05-21','end_date','2099-05-25',
      'location_id',place->>'id','place_data',place,'travel_mode','Kamper','description','Kontrola dopasowania lokalizacji i propozycji wyjazdu.',
      'landscape','forest','interests','[]'::jsonb,'animal_kinds','[]'::jsonb,'matching_group_kinds','[]'::jsonb,'matching_child_age_bands','[]'::jsonb);
    saved:=public.save_my_trip(payload,null,false,gen_random_uuid());
    perform set_config('qa.proposal_trip_'||i,saved->>'id',true);
  end loop;
  -- The worker sees only these disposable jobs. All queue changes roll back.
  delete from notifications_private.proposal_jobs where trip_id not in(select id from public.trip_plans
    where group_id in(current_setting('qa.proposal_group_1')::uuid,current_setting('qa.proposal_group_2')::uuid));
end $$;
set local role service_role;
do $$ declare result jsonb;begin
  result:=public.process_proposal_notifications(20);
  if (result->>'created')::int<>3 then raise exception 'Google area/manual point matching failed';end if;
  result:=public.process_proposal_notifications(20);
  if (result->>'created')::int<>0 then raise exception 'Repeated processing duplicated proposals';end if;
end $$;
reset role;
do $$ begin
  if exists(select 1 from public.notifications where recipient_group_id=current_setting('qa.proposal_group_1')::uuid
    and proposed_trip_id=current_setting('qa.proposal_trip_4')::uuid) then raise exception 'Unknown geometry fabricated a match';end if;
  perform public.record_google_place_geometry('ChIJ_QA_proposal_late',54,18);
  if not exists(select 1 from notifications_private.proposal_jobs where trip_id=current_setting('qa.proposal_trip_4')::uuid)
    then raise exception 'Late geometry did not enqueue matching';end if;
end $$;
set local role service_role;
do $$ declare result jsonb;begin
  result:=public.process_proposal_notifications(20);
  if (result->>'created')::int<>1 then raise exception 'Late geometry did not create its first proposal';end if;
end $$;
reset role;
do $$ begin
  perform public.record_google_place_geometry('ChIJ_QA_proposal_late',54,18);
  if exists(select 1 from notifications_private.proposal_jobs where trip_id=current_setting('qa.proposal_trip_4')::uuid)
    then raise exception 'Fresh unchanged coordinates repeated proposal work';end if;
  update push_private.deliveries d set due_at=now()-interval '1 second' where d.event_id in(
    select id from push_private.events where recipient_group_id=current_setting('qa.proposal_group_1')::uuid);
end $$;
set local role service_role;
do $$ declare jobs jsonb;begin
  select jsonb_agg(to_jsonb(j)) into jobs from public.claim_push_deliveries(100) j;
  if (select count(*) from jsonb_array_elements(jobs) j where j->>'recipient_group_id'=current_setting('qa.proposal_group_1')
    and j->>'kind'='proposal' and (j->>'proposal_count')::int=3)<>1 then raise exception 'Google proposals failed digest preparation';end if;
end $$;
reset role;
rollback;
select true google_proposals_verified,true manual_map_point_verified,true late_geometry_verified,true deduplication_verified,true digest_prepared_without_sending,true fixtures_rolled_back;
