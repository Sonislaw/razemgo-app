-- Favorites belong to the saving account. They never grant access to a target.
create schema favorites_private;
revoke all on schema favorites_private from public,anon,authenticated;
create table favorites_private.group_favorites (
  owner_group_id uuid not null references public.travel_groups(id) on delete cascade,
  target_group_id uuid not null references public.travel_groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(owner_group_id,target_group_id),
  check(owner_group_id<>target_group_id)
);
create table favorites_private.trip_favorites (
  owner_group_id uuid not null references public.travel_groups(id) on delete cascade,
  target_trip_id uuid not null references public.trip_plans(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(owner_group_id,target_trip_id)
);
create index favorite_group_target on favorites_private.group_favorites(target_group_id);
create index favorite_trip_target on favorites_private.trip_favorites(target_trip_id);
alter table favorites_private.group_favorites enable row level security;
alter table favorites_private.trip_favorites enable row level security;
revoke all on all tables in schema favorites_private from public,anon,authenticated;

create function favorites_private.my_group_id() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id();
begin
  if me is null or not exists (
    select 1 from auth.sessions s where s.id=nullif(auth.jwt()->>'session_id','')::uuid
      and s.user_id=auth.uid() and (s.not_after is null or s.not_after>now())
  ) then raise exception 'Active profile and session required' using errcode='42501'; end if;
  return me;
end $$;
create function favorites_private.can_view_group(me uuid,target uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.travel_groups g where g.id=target and g.id<>me
    and not messaging_private.pair_blocked(me,g.id) and (
      exists(select 1 from public.group_public_profiles p where p.group_id=g.id and p.discoverable)
      or messaging_private.public_trip_count(g.id)>0
      or exists(select 1 from public.contact_invitations i where i.status in('pending','accepted')
        and me in(i.sender_group_id,i.recipient_group_id) and g.id in(i.sender_group_id,i.recipient_group_id))
    ));
$$;
create function favorites_private.can_view_trip(me uuid,target uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.trip_plans t where t.id=target and t.group_id<>me
    and not messaging_private.pair_blocked(me,t.group_id)
    and not exists(select 1 from moderation_private.hidden_trips h where h.trip_id=t.id)
    and t.status='published' and t.visibility='public' and t.end_date>current_date);
$$;
revoke all on all functions in schema favorites_private from public,anon,authenticated;

create function public.get_my_favorites() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id();
begin
  return jsonb_build_object(
    'group_ids',coalesce((select jsonb_agg(f.target_group_id order by f.target_group_id)
      from favorites_private.group_favorites f where f.owner_group_id=me
        and favorites_private.can_view_group(me,f.target_group_id)),'[]'::jsonb),
    'trip_ids',coalesce((select jsonb_agg(f.target_trip_id order by f.target_trip_id)
      from favorites_private.trip_favorites f where f.owner_group_id=me
        and favorites_private.can_view_trip(me,f.target_trip_id)),'[]'::jsonb));
end $$;
create function public.set_my_group_favorite(target_group_id uuid,is_favorite boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id();
begin
  if target_group_id is null or is_favorite is null then raise exception 'Invalid favorite' using errcode='22023'; end if;
  if is_favorite then
    if not favorites_private.can_view_group(me,target_group_id) then raise exception 'Profile unavailable' using errcode='P0002'; end if;
    insert into favorites_private.group_favorites(owner_group_id,target_group_id) values(me,target_group_id) on conflict do nothing;
  else
    delete from favorites_private.group_favorites f where f.owner_group_id=me and f.target_group_id=set_my_group_favorite.target_group_id;
  end if;
  return is_favorite;
end $$;
create function public.set_my_trip_favorite(target_trip_id uuid,is_favorite boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id();
begin
  if target_trip_id is null or is_favorite is null then raise exception 'Invalid favorite' using errcode='22023'; end if;
  if is_favorite then
    if not favorites_private.can_view_trip(me,target_trip_id) then raise exception 'Trip unavailable' using errcode='P0002'; end if;
    insert into favorites_private.trip_favorites(owner_group_id,target_trip_id) values(me,target_trip_id) on conflict do nothing;
  else
    delete from favorites_private.trip_favorites f where f.owner_group_id=me and f.target_trip_id=set_my_trip_favorite.target_trip_id;
  end if;
  return is_favorite;
end $$;
revoke all on function public.get_my_favorites(),public.set_my_group_favorite(uuid,boolean),public.set_my_trip_favorite(uuid,boolean) from public,anon;
grant execute on function public.get_my_favorites(),public.set_my_group_favorite(uuid,boolean),public.set_my_trip_favorite(uuid,boolean) to authenticated;


create or replace function public.list_public_groups(filters jsonb default '{}'::jsonb, after_name text default null, after_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); result jsonb; kinds text[]; ages text[]; modes text[]; hobbies text[]; animals text[];
begin
  if me is null then raise exception 'Profile required' using errcode='42501'; end if;
  if jsonb_typeof(filters) is distinct from 'object' or (after_name is null)<>(after_id is null)
    or char_length(coalesce(filters->>'name',''))>80 or char_length(coalesce(after_name,''))>40 then
    raise exception 'Invalid filters' using errcode='22023'; end if;
  kinds:=array(select jsonb_array_elements_text(coalesce(filters->'group_kinds','[]')));
  ages:=array(select jsonb_array_elements_text(coalesce(filters->'child_age_bands','[]')));
  modes:=array(select jsonb_array_elements_text(coalesce(filters->'travel_modes','[]')));
  hobbies:=array(select jsonb_array_elements_text(coalesce(filters->'interests','[]')));
  animals:=array(select jsonb_array_elements_text(coalesce(filters->'animal_kinds','[]')));
  if not public.profile_array_valid(kinds,array['family','couple','solo','friends'],4)
    or not public.profile_array_valid(ages,array['0–3','4–6','7–9','10–12','13–17'],5)
    or not public.profile_array_valid(modes,array['Przyczepa','Kamper','Namiot','Van','Samochód'],5)
    or not public.profile_array_valid(hobbies,array['Rowery','Spokojny wypoczynek','Ognisko','Plaża','Przyroda','Wędrówki','Kajaki','Fotografia','Gry planszowe','Zwiedzanie'],10)
    or not public.profile_array_valid(animals,array['dog','cat'],2)
    or (filters ? 'has_trips' and jsonb_typeof(filters->'has_trips')<>'boolean')
    or (filters ? 'online_only' and jsonb_typeof(filters->'online_only')<>'boolean')
    or (filters ? 'favorites_only' and jsonb_typeof(filters->'favorites_only')<>'boolean') then
    raise exception 'Invalid filters' using errcode='22023'; end if;
  if coalesce((filters->>'online_only')::boolean,false) and not exists (
    select 1 from auth.sessions s where s.id=nullif(auth.jwt()->>'session_id','')::uuid
      and s.user_id=auth.uid() and (s.not_after is null or s.not_after>now())
  ) then raise exception 'Active session required' using errcode='42501'; end if;
  if coalesce((filters->>'favorites_only')::boolean,false) then perform favorites_private.my_group_id(); end if;

  with matched as (
    select g.*,p.about,messaging_private.public_trip_count(g.id) as active_trip_count,
      messaging_private.search_text(g.name) as sort_name
    from public.travel_groups g join public.group_public_profiles p on p.group_id=g.id and p.discoverable
    where g.id<>me and not messaging_private.pair_blocked(me,g.id)
      and position(messaging_private.search_text(btrim(coalesce(filters->>'name',''))) in messaging_private.search_text(g.name))>0
      and (cardinality(kinds)=0 or g.kind=any(kinds))
      and (cardinality(ages)=0 or g.child_age_bands && ages)
      and (cardinality(modes)=0 or g.travel_mode=any(modes))
      and (cardinality(hobbies)=0 or g.interests && hobbies)
      and (cardinality(animals)=0 or g.animal_kinds && animals)
      and (not coalesce((filters->>'has_trips')::boolean,false) or messaging_private.public_trip_count(g.id)>0)
      and (not coalesce((filters->>'online_only')::boolean,false) or presence_private.group_is_online(g.id))
      and (not coalesce((filters->>'favorites_only')::boolean,false) or exists (
        select 1 from favorites_private.group_favorites f where f.owner_group_id=me and f.target_group_id=g.id
      ))
      and (after_id is null or (messaging_private.search_text(g.name),g.id)>(messaging_private.search_text(after_name),after_id))
    order by sort_name,g.id limit 21
  ), page as (select * from matched order by sort_name,id limit 20)
  select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
      'crew',messaging_private.public_crew(g),'about',p.about,'active_trip_count',p.active_trip_count) order by p.sort_name,p.id)
      from page p join public.travel_groups g on g.id=p.id),'[]'::jsonb),
    'has_more',(select count(*)>20 from matched),
    'cursor',(select jsonb_build_object('name',name,'id',id) from page order by sort_name desc,id desc limit 1)) into result;
  return result;
end $$;

create or replace function public.list_ranked_public_groups(filters jsonb default '{}'::jsonb,sort_mode text default 'compatibility',after_cursor jsonb default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); viewer public.travel_groups; result jsonb;
  kinds text[]; ages text[]; modes text[]; hobbies text[]; animals text[];
  cursor_name text; cursor_id uuid; cursor_score integer;
begin
  if me is null then raise exception 'Profile required' using errcode='42501'; end if;
  if sort_mode is null or sort_mode not in('compatibility','alphabetical') or jsonb_typeof(filters) is distinct from 'object'
    or char_length(coalesce(filters->>'name',''))>80 then raise exception 'Invalid filters' using errcode='22023'; end if;
  if after_cursor is not null then
    if jsonb_typeof(after_cursor) is distinct from 'object' or not after_cursor ?& array['name','id','score','sort']
      or jsonb_typeof(after_cursor->'name') is distinct from 'string' or char_length(after_cursor->>'name')>40
      or after_cursor->>'sort' is distinct from sort_mode
      or coalesce(after_cursor->>'id','') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      or jsonb_typeof(after_cursor->'score') not in('null','number') then raise exception 'Invalid cursor' using errcode='22023'; end if;
    if jsonb_typeof(after_cursor->'score')='number' and after_cursor->>'score' !~ '^(100|[1-9]?[0-9])$' then
      raise exception 'Invalid cursor score' using errcode='22023'; end if;
    cursor_name:=messaging_private.search_text(after_cursor->>'name'); cursor_id:=(after_cursor->>'id')::uuid;
    cursor_score:=case when sort_mode='compatibility' then coalesce((after_cursor->>'score')::integer,-1) else 0 end;
  end if;
  kinds:=array(select jsonb_array_elements_text(coalesce(filters->'group_kinds','[]')));
  ages:=array(select jsonb_array_elements_text(coalesce(filters->'child_age_bands','[]')));
  modes:=array(select jsonb_array_elements_text(coalesce(filters->'travel_modes','[]')));
  hobbies:=array(select jsonb_array_elements_text(coalesce(filters->'interests','[]')));
  animals:=array(select jsonb_array_elements_text(coalesce(filters->'animal_kinds','[]')));
  if not public.profile_array_valid(kinds,array['family','couple','solo','friends'],4)
    or not public.profile_array_valid(ages,array['0–3','4–6','7–9','10–12','13–17'],5)
    or not public.profile_array_valid(modes,array['Przyczepa','Kamper','Namiot','Van','Samochód'],5)
    or not public.profile_array_valid(hobbies,array['Rowery','Spokojny wypoczynek','Ognisko','Plaża','Przyroda','Wędrówki','Kajaki','Fotografia','Gry planszowe','Zwiedzanie'],10)
    or not public.profile_array_valid(animals,array['dog','cat'],2)
    or (filters ? 'has_trips' and jsonb_typeof(filters->'has_trips')<>'boolean')
    or (filters ? 'online_only' and jsonb_typeof(filters->'online_only')<>'boolean')
    or (filters ? 'favorites_only' and jsonb_typeof(filters->'favorites_only')<>'boolean') then raise exception 'Invalid filters' using errcode='22023'; end if;
  if coalesce((filters->>'online_only')::boolean,false) and not exists (
    select 1 from auth.sessions s where s.id=nullif(auth.jwt()->>'session_id','')::uuid
      and s.user_id=auth.uid() and (s.not_after is null or s.not_after>now())
  ) then raise exception 'Active session required' using errcode='42501'; end if;
  if coalesce((filters->>'favorites_only')::boolean,false) then perform favorites_private.my_group_id(); end if;

  select * into viewer from public.travel_groups where id=me;
  with eligible as materialized (
    select g.id,g.name,messaging_private.search_text(g.name) as sort_name,messaging_private.public_crew(g) as crew,
      p.about,messaging_private.public_trip_count(g.id) as active_trip_count,messaging_private.group_compatibility(viewer,g) as compatibility
    from public.travel_groups g join public.group_public_profiles p on p.group_id=g.id and p.discoverable
    where g.id<>me and not messaging_private.pair_blocked(me,g.id)
      and position(messaging_private.search_text(btrim(coalesce(filters->>'name',''))) in messaging_private.search_text(g.name))>0
      and (cardinality(kinds)=0 or g.kind=any(kinds)) and (cardinality(ages)=0 or g.child_age_bands && ages)
      and (cardinality(modes)=0 or g.travel_mode=any(modes)) and (cardinality(hobbies)=0 or g.interests && hobbies)
      and (cardinality(animals)=0 or g.animal_kinds && animals)
      and (not coalesce((filters->>'has_trips')::boolean,false) or messaging_private.public_trip_count(g.id)>0)
      and (not coalesce((filters->>'online_only')::boolean,false) or presence_private.group_is_online(g.id))
      and (not coalesce((filters->>'favorites_only')::boolean,false) or exists (
        select 1 from favorites_private.group_favorites f where f.owner_group_id=me and f.target_group_id=g.id
      ))
  ), ranked as (
    select e.*,case when sort_mode='compatibility' then coalesce((e.compatibility->>'score')::integer,-1) else 0 end as sort_score from eligible e
  ), matched as (
    select * from ranked where cursor_id is null or sort_score<cursor_score
      or sort_score=cursor_score and (sort_name,id)>(cursor_name,cursor_id)
    order by sort_score desc,sort_name,id limit 21
  ), page as (select * from matched order by sort_score desc,sort_name,id limit 20)
  select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('crew',crew,'about',about,
      'active_trip_count',active_trip_count,'compatibility',compatibility) order by sort_score desc,sort_name,id) from page),'[]'::jsonb),
    'has_more',(select count(*)>20 from matched),
    'cursor',(select jsonb_build_object('name',name,'id',id,'score',compatibility->'score','sort',sort_mode)
      from page order by sort_score,sort_name desc,id desc limit 1)) into result;
  return result;
end $$;

create or replace function public.count_public_groups(filters jsonb default '{}'::jsonb) returns integer
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); result integer;
  kinds text[]; ages text[]; modes text[]; hobbies text[]; animals text[];
begin
  if me is null then raise exception 'Profile required' using errcode='42501'; end if;
  if jsonb_typeof(filters) is distinct from 'object' or char_length(coalesce(filters->>'name',''))>80 then
    raise exception 'Invalid filters' using errcode='22023'; end if;
  kinds:=array(select jsonb_array_elements_text(coalesce(filters->'group_kinds','[]')));
  ages:=array(select jsonb_array_elements_text(coalesce(filters->'child_age_bands','[]')));
  modes:=array(select jsonb_array_elements_text(coalesce(filters->'travel_modes','[]')));
  hobbies:=array(select jsonb_array_elements_text(coalesce(filters->'interests','[]')));
  animals:=array(select jsonb_array_elements_text(coalesce(filters->'animal_kinds','[]')));
  if not public.profile_array_valid(kinds,array['family','couple','solo','friends'],4)
    or not public.profile_array_valid(ages,array['0–3','4–6','7–9','10–12','13–17'],5)
    or not public.profile_array_valid(modes,array['Przyczepa','Kamper','Namiot','Van','Samochód'],5)
    or not public.profile_array_valid(hobbies,array['Rowery','Spokojny wypoczynek','Ognisko','Plaża','Przyroda','Wędrówki','Kajaki','Fotografia','Gry planszowe','Zwiedzanie'],10)
    or not public.profile_array_valid(animals,array['dog','cat'],2)
    or (filters ? 'has_trips' and jsonb_typeof(filters->'has_trips')<>'boolean')
    or (filters ? 'online_only' and jsonb_typeof(filters->'online_only')<>'boolean')
    or (filters ? 'favorites_only' and jsonb_typeof(filters->'favorites_only')<>'boolean') then
    raise exception 'Invalid filters' using errcode='22023'; end if;
  if coalesce((filters->>'online_only')::boolean,false) and not exists (
    select 1 from auth.sessions s where s.id=nullif(auth.jwt()->>'session_id','')::uuid
      and s.user_id=auth.uid() and (s.not_after is null or s.not_after>now())
  ) then raise exception 'Active session required' using errcode='42501'; end if;
  if coalesce((filters->>'favorites_only')::boolean,false) then perform favorites_private.my_group_id(); end if;

  select count(*)::integer into result
  from public.travel_groups g join public.group_public_profiles p on p.group_id=g.id and p.discoverable
  where g.id<>me and not messaging_private.pair_blocked(me,g.id)
    and position(messaging_private.search_text(btrim(coalesce(filters->>'name',''))) in messaging_private.search_text(g.name))>0
    and (cardinality(kinds)=0 or g.kind=any(kinds)) and (cardinality(ages)=0 or g.child_age_bands && ages)
    and (cardinality(modes)=0 or g.travel_mode=any(modes)) and (cardinality(hobbies)=0 or g.interests && hobbies)
    and (cardinality(animals)=0 or g.animal_kinds && animals)
    and (not coalesce((filters->>'has_trips')::boolean,false) or messaging_private.public_trip_count(g.id)>0)
      and (not coalesce((filters->>'online_only')::boolean,false) or presence_private.group_is_online(g.id))
      and (not coalesce((filters->>'favorites_only')::boolean,false) or exists (
        select 1 from favorites_private.group_favorites f where f.owner_group_id=me and f.target_group_id=g.id
      ));
  return result;
end $$;

notify pgrst,'reload schema';
