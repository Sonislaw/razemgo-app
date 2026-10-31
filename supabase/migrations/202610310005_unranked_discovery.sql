-- Current clients use plain chronological/alphabetical discovery. Keep V1/V2
-- contracts for installed clients; proposal notifications are independent.
create function public.search_public_trips_v3(filters jsonb default '{}',after_cursor jsonb default null,page_size integer default 5)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); f jsonb:=discovery_private.validate_filters(filters);
  query_key text; after_id uuid; after_at timestamptz; result jsonb;
begin
  if page_size is null or page_size<1 or page_size>20 then
    raise exception 'Invalid page size' using errcode='22023'; end if;
  query_key:=md5('discovery:3:'||me::text||f::text);
  if after_cursor is not null then
    begin
      if jsonb_typeof(after_cursor) is distinct from 'object'
        or after_cursor->>'version' is distinct from '3'
        or after_cursor->>'query_key' is distinct from query_key
        or after_cursor->>'id' is null or after_cursor->>'published_at' is null then
        raise exception 'Invalid cursor'; end if;
      after_id:=(after_cursor->>'id')::uuid;
      after_at:=(after_cursor->>'published_at')::timestamptz;
      if not isfinite(after_at) then raise exception 'Invalid cursor'; end if;
    exception when others then raise exception 'Invalid cursor' using errcode='22023'; end;
  end if;
  with eligible as materialized (
    select t.id,t.published_at from discovery_private.candidates(f,me) t
  ), matched as materialized (
    select * from eligible where after_id is null or published_at<after_at
      or published_at=after_at and id>after_id
    order by published_at desc,id limit page_size+1
  ), page as materialized (
    select * from matched order by published_at desc,id limit page_size
  ) select jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(p) order by t.published_at desc,t.id)
      from page t cross join lateral public.list_public_trips(t.id) p),'[]'),
    'total_count',(select count(*) from eligible),
    'has_more',(select count(*)>page_size from matched),
    'cursor',(select jsonb_build_object('id',id,'published_at',published_at,'version',3,'query_key',query_key)
      from page order by published_at,id desc limit 1)) into result;
  return result;
end $$;

create function public.get_discovery_trip_v3(target_trip_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform favorites_private.my_group_id();
  if target_trip_id is null then return null; end if;
  return (select to_jsonb(p) from public.list_public_trips(target_trip_id) p);
end $$;

create function public.refresh_public_trip_results_v3(trip_ids uuid[],filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); f jsonb:=discovery_private.validate_filters(filters);
begin
  if trip_ids is null or cardinality(trip_ids)>100 then
    raise exception 'Invalid trip IDs' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(to_jsonb(p) order by t.published_at desc,t.id)
    from discovery_private.candidates(f,me) t cross join lateral public.list_public_trips(t.id) p
    where t.id=any(trip_ids)),'[]');
end $$;

-- Shared authorization/filter predicate for the directory and bounded refresh.
-- This function never reads viewer preferences or computes similarity.
create function discovery_private.directory_candidates(f jsonb,me uuid,ids uuid[] default null)
returns setof public.travel_groups language plpgsql stable set search_path='' as $$
declare kinds text[]; ages text[]; modes text[]; hobbies text[]; animals text[];
begin
  if jsonb_typeof(f) is distinct from 'object'
    or char_length(coalesce(f->>'name',''))>80
    or (f ? 'name' and jsonb_typeof(f->'name') is distinct from 'string') then
    raise exception 'Invalid group filters' using errcode='22023'; end if;
  kinds:=array(select jsonb_array_elements_text(coalesce(f->'group_kinds','[]')));
  ages:=array(select jsonb_array_elements_text(coalesce(f->'child_age_bands','[]')));
  modes:=array(select jsonb_array_elements_text(coalesce(f->'travel_modes','[]')));
  hobbies:=array(select jsonb_array_elements_text(coalesce(f->'interests','[]')));
  animals:=array(select jsonb_array_elements_text(coalesce(f->'animal_kinds','[]')));
  if not public.profile_array_valid(kinds,array['family','couple','solo','friends'],4)
    or not public.profile_array_valid(ages,array['0–3','4–6','7–9','10–12','13–17'],5)
    or not public.profile_array_valid(modes,array['Przyczepa','Kamper','Namiot','Van','Samochód'],5)
    or not public.profile_array_valid(hobbies,array['Rowery','Spokojny wypoczynek','Ognisko','Plaża','Przyroda','Wędrówki','Kajaki','Fotografia','Gry planszowe','Zwiedzanie'],10)
    or not public.profile_array_valid(animals,array['dog','cat'],2)
    or (f ? 'has_trips' and jsonb_typeof(f->'has_trips') is distinct from 'boolean')
    or (f ? 'online_only' and jsonb_typeof(f->'online_only') is distinct from 'boolean')
    or (f ? 'favorites_only' and jsonb_typeof(f->'favorites_only') is distinct from 'boolean') then
    raise exception 'Invalid group filters' using errcode='22023'; end if;
  if coalesce((f->>'online_only')::boolean,false) and not exists (
    select 1 from auth.sessions s where s.id=nullif(auth.jwt()->>'session_id','')::uuid
      and s.user_id=auth.uid() and (s.not_after is null or s.not_after>now())
  ) then raise exception 'Active session required' using errcode='42501'; end if;
  return query select g.* from public.travel_groups g
    join public.group_public_profiles p on p.group_id=g.id and p.discoverable
    where (ids is null or g.id=any(ids)) and g.id<>me
      and g.id not in(select x.blocked_group_id from public.group_blocks x where x.blocker_group_id=me
        union all select x.blocker_group_id from public.group_blocks x where x.blocked_group_id=me)
      and g.owner_user_id not in(select s.user_id from moderation_private.suspended_accounts s)
      and messaging_private.group_search_matches(g,f->>'name')
      and (cardinality(kinds)=0 or g.kind=any(kinds))
      and (cardinality(ages)=0 or g.child_count>0 and g.child_age_bands && ages)
      and (cardinality(modes)=0 or g.travel_mode=any(modes))
      and (cardinality(hobbies)=0 or g.interests && hobbies)
      and (cardinality(animals)=0 or g.animal_kinds && animals)
      and (not coalesce((f->>'has_trips')::boolean,false) or messaging_private.public_trip_count(g.id)>0)
      and (not coalesce((f->>'online_only')::boolean,false) or presence_private.group_is_online(g.id))
      and (not coalesce((f->>'favorites_only')::boolean,false) or exists (
        select 1 from favorites_private.group_favorites x where x.owner_group_id=me and x.target_group_id=g.id));
end $$;

create function public.list_public_groups_v3(filters jsonb default '{}',after_cursor jsonb default null,page_size integer default 5)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); query_key text; after_id uuid; after_name text; result jsonb;
begin
  if page_size is null or page_size<1 or page_size>20 then
    raise exception 'Invalid page size' using errcode='22023'; end if;
  query_key:=md5('directory:3:'||me::text||filters::text);
  if after_cursor is not null then
    begin
      if jsonb_typeof(after_cursor) is distinct from 'object'
        or after_cursor->>'version' is distinct from '3'
        or after_cursor->>'query_key' is distinct from query_key
        or after_cursor->>'id' is null
        or jsonb_typeof(after_cursor->'name') is distinct from 'string'
        or char_length(after_cursor->>'name')>40 then raise exception 'Invalid cursor'; end if;
      after_id:=(after_cursor->>'id')::uuid;
      after_name:=messaging_private.search_text(after_cursor->>'name');
    exception when others then raise exception 'Invalid cursor' using errcode='22023'; end;
  end if;
  with eligible as materialized (
    select g.id,g.name,messaging_private.search_text(g.name) collate "C" as sort_name
      from discovery_private.directory_candidates(filters,me) g
  ), matched as materialized (
    select * from eligible where after_id is null or (sort_name,id)>(after_name collate "C",after_id)
    order by sort_name,id limit page_size+1
  ), page as materialized (
    select * from matched order by sort_name,id limit page_size
  ) select jsonb_build_object(
    'items',coalesce((select jsonb_agg(jsonb_build_object('crew',messaging_private.public_crew(g),'about',d.about,
      'active_trip_count',messaging_private.public_trip_count(g.id)) order by p.sort_name,p.id)
      from page p join public.travel_groups g on g.id=p.id join public.group_public_profiles d on d.group_id=p.id),'[]'),
    'total_count',(select count(*) from eligible),
    'has_more',(select count(*)>page_size from matched),
    'cursor',(select jsonb_build_object('name',name,'id',id,'version',3,'query_key',query_key)
      from page order by sort_name desc,id desc limit 1)) into result;
  return result;
end $$;

create function public.refresh_public_group_results_v3(group_ids uuid[],filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id();
begin
  if group_ids is null or cardinality(group_ids)>100 then
    raise exception 'Invalid group IDs' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('crew',messaging_private.public_crew(g),'about',p.about,
    'active_trip_count',messaging_private.public_trip_count(g.id)) order by messaging_private.search_text(g.name) collate "C",g.id)
    from discovery_private.directory_candidates(filters,me,group_ids) g
    join public.group_public_profiles p on p.group_id=g.id),'[]');
end $$;

create function public.get_public_group_v3(target_group_id uuid,after_cursor jsonb default null,page_size integer default 5)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); target public.travel_groups; details public.group_public_profiles;
  query_key text; after_id uuid; after_at timestamptz; result jsonb;
begin
  if target_group_id is null or page_size is null or page_size<1 or page_size>20 then
    raise exception 'Invalid group or page size' using errcode='22023'; end if;
  query_key:=md5('crew-trips:3:'||me::text||target_group_id::text);
  if after_cursor is not null then
    begin
      if jsonb_typeof(after_cursor) is distinct from 'object'
        or after_cursor->>'version' is distinct from '3'
        or after_cursor->>'query_key' is distinct from query_key
        or after_cursor->>'id' is null or after_cursor->>'published_at' is null then raise exception 'Invalid cursor'; end if;
      after_id:=(after_cursor->>'id')::uuid;
      after_at:=(after_cursor->>'published_at')::timestamptz;
      if not isfinite(after_at) then raise exception 'Invalid cursor'; end if;
    exception when others then raise exception 'Invalid cursor' using errcode='22023'; end;
  end if;
  select * into target from public.travel_groups g where g.id=target_group_id
    and not exists(select 1 from moderation_private.suspended_accounts s where s.user_id=g.owner_user_id);
  if not found or target.id=me or messaging_private.pair_blocked(me,target.id) then return null; end if;
  select * into details from public.group_public_profiles where group_id=target.id;
  if not coalesce(details.discoverable,false) and messaging_private.public_trip_count(target.id)=0
    and not exists(select 1 from public.contact_invitations i where me in(i.sender_group_id,i.recipient_group_id)
      and target.id in(i.sender_group_id,i.recipient_group_id) and i.status in('pending','accepted')) then return null; end if;
  with matched as materialized (
    select t.id,t.published_at from public.trip_plans t where t.group_id=target.id
      and t.status='published' and t.visibility='public' and t.end_date>current_date
      and not exists(select 1 from moderation_private.hidden_trips h where h.trip_id=t.id)
      and (after_id is null or t.published_at<after_at or t.published_at=after_at and t.id>after_id)
    order by t.published_at desc,t.id limit page_size+1
  ), page as materialized (select * from matched order by published_at desc,id limit page_size)
  select jsonb_build_object('crew',messaging_private.public_crew(target),'about',coalesce(details.about,''),
    'active_trip_count',messaging_private.public_trip_count(target.id),
    'trips',coalesce((select jsonb_agg(to_jsonb(p) order by t.published_at desc,t.id)
      from page t cross join lateral public.list_public_trips(t.id) p),'[]'),
    'has_more',(select count(*)>page_size from matched),
    'cursor',(select jsonb_build_object('id',id,'published_at',published_at,'version',3,'query_key',query_key)
      from page order by published_at,id desc limit 1)) into result;
  return result;
end $$;

revoke all on function discovery_private.directory_candidates(jsonb,uuid,uuid[]) from public,anon,authenticated;
revoke all on function public.search_public_trips_v3(jsonb,jsonb,integer),public.get_discovery_trip_v3(uuid),
  public.refresh_public_trip_results_v3(uuid[],jsonb),public.list_public_groups_v3(jsonb,jsonb,integer),
  public.refresh_public_group_results_v3(uuid[],jsonb),public.get_public_group_v3(uuid,jsonb,integer)
  from public,anon,authenticated;
grant execute on function public.search_public_trips_v3(jsonb,jsonb,integer),public.get_discovery_trip_v3(uuid),
  public.refresh_public_trip_results_v3(uuid[],jsonb),public.list_public_groups_v3(jsonb,jsonb,integer),
  public.refresh_public_group_results_v3(uuid[],jsonb),public.get_public_group_v3(uuid,jsonb,integer) to authenticated;
notify pgrst,'reload schema';
