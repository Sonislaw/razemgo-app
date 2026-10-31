-- Additive fingerprints include only authorized IDs and ordering keys. Existing
-- clients ignore this field; no cursor or legacy contract is removed.
create or replace function public.search_public_trips_v3(filters jsonb default '{}',after_cursor jsonb default null,page_size integer default 5)
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
    'result_revision',(select md5(coalesce(string_agg(id::text||published_at::text,',' order by id),'')) from eligible),
    'total_count',(select count(*) from eligible),
    'has_more',(select count(*)>page_size from matched),
    'cursor',(select jsonb_build_object('id',id,'published_at',published_at,'version',3,'query_key',query_key)
      from page order by published_at,id desc limit 1)) into result;
  return result;
end $$;

create or replace function public.list_public_groups_v3(filters jsonb default '{}',after_cursor jsonb default null,page_size integer default 5)
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
    'result_revision',(select md5(coalesce(string_agg(id::text||sort_name,',' order by id),'')) from eligible),
    'total_count',(select count(*) from eligible),
    'has_more',(select count(*)>page_size from matched),
    'cursor',(select jsonb_build_object('name',name,'id',id,'version',3,'query_key',query_key)
      from page order by sort_name desc,id desc limit 1)) into result;
  return result;
end $$;

create or replace function public.get_public_group_v3(target_group_id uuid,after_cursor jsonb default null,page_size integer default 5)
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
    'result_revision',(select md5(coalesce(string_agg(t.id::text||t.published_at::text,',' order by t.id),'')) from public.trip_plans t
      where t.group_id=target.id and t.status='published' and t.visibility='public' and t.end_date>current_date
        and not exists(select 1 from moderation_private.hidden_trips h where h.trip_id=t.id)),
    'has_more',(select count(*)>page_size from matched),
    'cursor',(select jsonb_build_object('id',id,'published_at',published_at,'version',3,'query_key',query_key)
      from page order by published_at,id desc limit 1)) into result;
  return result;
end $$;

create or replace function public.list_my_trip_page(archived boolean default false,filters jsonb default '{}',after_cursor jsonb default null,page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); today date:=current_date; cursor_date date; cursor_id uuid;
  query text; key text; result jsonb;
begin
  if archived is null or page_size is null or page_size<1 or page_size>50 or jsonb_typeof(filters) is distinct from 'object'
    or char_length(coalesce(filters->>'query',''))>2000 then raise exception 'Invalid filters' using errcode='22023'; end if;
  begin
    today:=coalesce((filters->>'today')::date,current_date);
    if filters->>'start_date' is not null then perform (filters->>'start_date')::date; end if;
    if filters->>'end_date' is not null then perform (filters->>'end_date')::date; end if;
  exception when others then raise exception 'Invalid dates' using errcode='22023'; end;
  query:=messaging_private.search_text(btrim(coalesce(filters->>'query','')));
  key:=md5(me::text||archived::text||filters::text);
  if after_cursor is not null then
    begin
      if after_cursor->>'query_key' is distinct from key or after_cursor->>'id' is null or after_cursor->>'sort_date' is null then raise exception 'Invalid cursor'; end if;
      cursor_id:=(after_cursor->>'id')::uuid; cursor_date:=(after_cursor->>'sort_date')::date;
      if not isfinite(cursor_date) then raise exception 'Invalid cursor'; end if;
    exception when others then raise exception 'Invalid cursor' using errcode='22023'; end;
  end if;
  with eligible as materialized (
    select t,coalesce(t.start_date,date '9999-12-31') as sort_date from public.trip_plans t where t.group_id=me
      and (t.status in('completed','cancelled') or t.status in('published','paused') and t.end_date<=today)=archived
      and strpos(messaging_private.search_text(t.description||' '||t.location_name||' '||t.location_region||
        case when messaging_private.search_text(t.location_region) in('pomorze','pomorskie') then ' Pomorze Pomorskie' else '' end),query)>0
      and (filters->>'start_date' is null or t.end_date>(filters->>'start_date')::date)
      and (filters->>'end_date' is null or t.start_date<(filters->>'end_date')::date)
  ), matched as materialized (
    select * from eligible where cursor_id is null or sort_date=cursor_date and (t).id>cursor_id
      or case when archived then sort_date<cursor_date else sort_date>cursor_date end
    order by case when archived then sort_date end desc,case when not archived then sort_date end,(t).id limit page_size+1
  ), page as materialized (
    select * from matched order by case when archived then sort_date end desc,case when not archived then sort_date end,(t).id limit page_size
  ) select jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(t) order by case when archived then sort_date end desc,case when not archived then sort_date end,(t).id) from page),'[]'),
    'result_revision',(select md5(coalesce(string_agg((t).id::text||sort_date::text,',' order by (t).id),'')) from eligible),
    'total_count',(select count(*) from eligible),'has_more',(select count(*)>page_size from matched),
    'cursor',(select jsonb_build_object('id',(t).id,'sort_date',sort_date,'query_key',key) from page
      order by case when archived then sort_date end,case when not archived then sort_date end desc,(t).id desc limit 1),
    'active_count',(select count(*) from public.trip_plans t where t.group_id=me and not(t.status in('completed','cancelled') or t.status in('published','paused') and t.end_date<=today)),
    'archived_count',(select count(*) from public.trip_plans t where t.group_id=me and (t.status in('completed','cancelled') or t.status in('published','paused') and t.end_date<=today)),
    'latest_trip',(select to_jsonb(t) from public.trip_plans t where t.group_id=me and t.status='published' and t.visibility='public' and t.end_date>today order by t.published_at desc,t.id limit 1)
  ) into result;
  return result;
end $$;

-- Keep the live filter count and directory on the same validation/access predicate.
create or replace function public.count_public_groups(filters jsonb default '{}') returns integer
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id();
begin
  return (select count(*)::integer from discovery_private.directory_candidates(filters,me));
end $$;
notify pgrst,'reload schema';
