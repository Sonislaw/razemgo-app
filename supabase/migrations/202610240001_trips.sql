-- Trips are private rows. Discovery exposes an explicit, authenticated projection.
create table public.trip_plans (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.travel_groups(id) on delete cascade,
  create_key uuid,
  mode text not null check (mode in ('planned','flexible')),
  status text not null default 'draft' check (status in ('draft','published','paused','completed','cancelled')),
  visibility text not null default 'private' check (visibility in ('public','private')),
  start_date date check (isfinite(start_date)),
  end_date date check (isfinite(end_date)),
  location_id text not null default '' check (char_length(location_id) <= 120),
  location_name text not null default '' check (char_length(location_name) <= 160),
  location_region text not null default '' check (char_length(location_region) <= 160),
  location_kind text check (location_kind in ('city','village','locality','region','country')),
  campground_name text not null default '' check (char_length(campground_name) <= 120),
  campground_address text not null default '' check (char_length(campground_address) <= 200),
  travel_mode text check (travel_mode in ('Przyczepa','Kamper','Namiot','Van','Samochód')),
  description text not null default '' check (description = btrim(description) and char_length(description) <= 1000),
  landscape text not null check (landscape in ('coast','lake','mountain','forest')),
  interests text[] not null default '{}' check (public.profile_array_valid(interests, array['Rowery','Spokojny wypoczynek','Ognisko','Plaża','Przyroda','Wędrówki','Kajaki','Fotografia','Gry planszowe','Zwiedzanie','Las'], 11)),
  animal_kinds text[] not null default '{}' check (public.profile_array_valid(animal_kinds, array['dog','cat'], 2)),
  matching_group_kinds text[] not null default '{}' check (public.profile_array_valid(matching_group_kinds, array['family','couple','solo','friends'], 4)),
  matching_child_age_bands text[] not null default '{}' check (public.profile_array_valid(matching_child_age_bands, array['0–3','4–6','7–9','10–12','13–17'], 5)),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, create_key),
  check (status <> 'published' or visibility = 'public'),
  check (mode = 'planned' or (campground_name = '' and campground_address = '')),
  check (status = 'draft' or (
    start_date is not null and end_date is not null and end_date > start_date
    and btrim(location_id) <> '' and btrim(location_name) <> ''
    and location_kind is not null
    and (mode <> 'planned' or location_kind in ('city','village','locality'))
    and travel_mode is not null
    and char_length(regexp_replace(description, '\s+', ' ', 'g')) >= 20
  ))
);
create index trip_plans_group_idx on public.trip_plans(group_id);
create index trip_plans_discovery_idx on public.trip_plans(published_at desc, id)
  where status = 'published' and visibility = 'public';
alter table public.trip_plans enable row level security;
revoke all on public.trip_plans from anon, authenticated;
grant select, insert, update, delete on public.trip_plans to authenticated;
create policy trips_owner on public.trip_plans for all to authenticated
  using (exists (select 1 from public.travel_groups g where g.id = group_id and g.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from public.travel_groups g where g.id = group_id and g.owner_user_id = (select auth.uid())));

-- Enforce lifecycle and immutable ownership even for direct REST writes.
create function public.guard_trip_write() returns trigger
language plpgsql set search_path = '' as $$
declare previous_status text;
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.group_id <> old.group_id or new.created_at <> old.created_at
      or new.create_key is distinct from old.create_key then
      raise exception 'Trip identity cannot be changed' using errcode = '42501';
    end if;
    previous_status := case when old.status in ('published','paused') and old.end_date <= current_date
      then 'completed' else old.status end;
    if previous_status in ('completed','cancelled') and new.status <> previous_status
      or previous_status <> 'draft' and new.status = 'draft'
      or previous_status = 'draft' and new.status in ('completed','cancelled') then
      raise exception 'Invalid trip status transition' using errcode = '22023';
    end if;
    new.published_at := coalesce(old.published_at, case when new.status = 'published' then now() end);
  else
    if new.status in ('completed','cancelled') then
      raise exception 'Invalid initial trip status' using errcode = '22023';
    end if;
    new.created_at := now();
    new.published_at := case when new.status = 'published' then now() end;
  end if;
  if new.status in ('published','paused') and new.end_date <= current_date then
    raise exception 'Trip must end in the future' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.guard_trip_write() from public;
create trigger trip_write_guard before insert or update on public.trip_plans
  for each row execute function public.guard_trip_write();

create function public.save_my_trip(trip_data jsonb, trip_id uuid default null, as_draft boolean default false, request_key uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  own_group uuid;
  previous public.trip_plans;
  saved public.trip_plans;
  next_status text;
begin
  select id into own_group from public.travel_groups where owner_user_id = (select auth.uid());
  if own_group is null then raise exception 'Profile required' using errcode = '42501'; end if;
  if jsonb_typeof(trip_data) is distinct from 'object' or as_draft is null then
    raise exception 'Invalid trip' using errcode = '22023';
  end if;
  if trip_id is not null then
    select * into previous from public.trip_plans t where t.id = trip_id for update;
    if not found then raise exception 'Trip unavailable' using errcode = 'P0002'; end if;
  end if;
  if previous.id is null then
    -- Retrying a creation after a lost response must return the same plan.
    insert into public.trip_plans(group_id, create_key, mode, status, visibility, landscape)
      values (own_group, request_key, trip_data->>'mode', 'draft', trip_data->>'visibility', trip_data->>'landscape')
      on conflict (group_id, create_key) do nothing
      returning * into previous;
    if previous.id is null then
      select * into previous from public.trip_plans t
        where t.group_id = own_group and t.create_key = request_key for update;
    end if;
  end if;
  next_status := case
    when previous.id is null or previous.status = 'draft' then case when as_draft then 'draft' else 'published' end
    when previous.status in ('published','paused') and previous.end_date <= current_date then 'completed'
    else previous.status end;
  if as_draft and previous.id is not null and previous.status <> 'draft' then
    raise exception 'Published trip cannot become a draft' using errcode = '22023';
  end if;
  if next_status = 'published' and trip_data->>'visibility' = 'private' then next_status := 'paused'; end if;
  update public.trip_plans set
    mode = trip_data->>'mode', status = next_status, visibility = trip_data->>'visibility',
    start_date = nullif(trip_data->>'start_date','')::date,
    end_date = nullif(trip_data->>'end_date','')::date,
    location_id = coalesce(trip_data->>'location_id',''),
    location_name = btrim(coalesce(trip_data->>'location_name','')),
    location_region = btrim(coalesce(trip_data->>'location_region','')),
    location_kind = nullif(trip_data->>'location_kind',''),
    campground_name = case when trip_data->>'mode' = 'planned' then btrim(coalesce(trip_data->>'campground_name','')) else '' end,
    campground_address = case when trip_data->>'mode' = 'planned' then btrim(coalesce(trip_data->>'campground_address','')) else '' end,
    travel_mode = nullif(trip_data->>'travel_mode',''),
    description = btrim(coalesce(trip_data->>'description','')),
    landscape = trip_data->>'landscape',
    interests = array(select jsonb_array_elements_text(coalesce(trip_data->'interests','[]'::jsonb))),
    animal_kinds = array(select jsonb_array_elements_text(coalesce(trip_data->'animal_kinds','[]'::jsonb))),
    matching_group_kinds = array(select jsonb_array_elements_text(coalesce(trip_data->'matching_group_kinds','[]'::jsonb))),
    matching_child_age_bands = array(select jsonb_array_elements_text(coalesce(trip_data->'matching_child_age_bands','[]'::jsonb)))
  where id = previous.id returning * into saved;
  return to_jsonb(saved);
end;
$$;

create function public.change_my_trip_status(trip_id uuid, new_status text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare saved public.trip_plans; current_status text;
begin
  select * into saved from public.trip_plans t where t.id = trip_id for update;
  if not found then raise exception 'Trip unavailable' using errcode = 'P0002'; end if;
  current_status := case when saved.status in ('published','paused') and saved.end_date <= current_date
    then 'completed' else saved.status end;
  if not (
    new_status = 'published' and current_status = 'paused'
    or new_status = 'paused' and current_status = 'published'
    or new_status in ('completed','cancelled') and current_status in ('published','paused')
  ) then raise exception 'Invalid trip status transition' using errcode = '22023'; end if;
  update public.trip_plans set status = new_status,
    visibility = case when new_status = 'published' then 'public' else visibility end
    where id = trip_id returning * into saved;
  return to_jsonb(saved);
end;
$$;

create function public.duplicate_my_trip(trip_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare saved public.trip_plans;
begin
  insert into public.trip_plans (
    group_id, mode, status, visibility, start_date, end_date, location_id, location_name, location_region,
    location_kind, campground_name, campground_address, travel_mode, description, landscape,
    interests, animal_kinds, matching_group_kinds, matching_child_age_bands
  ) select group_id, mode, 'draft', 'private', start_date, end_date, location_id, location_name, location_region,
    location_kind, campground_name, campground_address, travel_mode, description, landscape,
    interests, animal_kinds, matching_group_kinds, matching_child_age_bands
    from public.trip_plans t where t.id = trip_id returning * into saved;
  if not found then raise exception 'Trip unavailable' using errcode = 'P0002'; end if;
  return to_jsonb(saved);
end;
$$;
create function public.delete_my_trip(trip_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare removed uuid;
begin
  delete from public.trip_plans t where t.id = trip_id returning id into removed;
  if not found then raise exception 'Trip unavailable' using errcode = 'P0002'; end if;
  return removed;
end;
$$;
revoke all on function public.save_my_trip(jsonb, uuid, boolean, uuid),
  public.change_my_trip_status(uuid, text), public.duplicate_my_trip(uuid), public.delete_my_trip(uuid) from public;
grant execute on function public.save_my_trip(jsonb, uuid, boolean, uuid),
  public.change_my_trip_status(uuid, text), public.duplicate_my_trip(uuid), public.delete_my_trip(uuid) to authenticated;

-- Never return travel_groups.* or group_preferences; these remain owner-only.
create function public.list_public_trips(requested_trip_id uuid default null)
returns table(trip jsonb, crew jsonb)
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', t.id, 'group_id', t.group_id, 'mode', t.mode, 'status', t.status, 'visibility', t.visibility,
    'start_date', t.start_date, 'end_date', t.end_date,
    'location_id', t.location_id, 'location_name', t.location_name, 'location_region', t.location_region,
    'location_kind', t.location_kind, 'campground_name', t.campground_name, 'campground_address', t.campground_address,
    'travel_mode', t.travel_mode, 'description', t.description, 'landscape', t.landscape,
    'interests', t.interests, 'animal_kinds', t.animal_kinds,
    'matching_group_kinds', t.matching_group_kinds, 'matching_child_age_bands', t.matching_child_age_bands,
    'published_at', t.published_at
  ), jsonb_build_object(
    'id', g.id, 'name', g.name, 'avatar_id', g.avatar_id, 'kind', g.kind,
    'adult_count', g.adult_count, 'child_count', g.child_count, 'child_age_bands', g.child_age_bands,
    'travel_mode', g.travel_mode, 'interests', g.interests, 'animal_kinds', g.animal_kinds
  )
  from public.trip_plans t join public.travel_groups g on g.id = t.group_id
  where auth.uid() is not null
    and exists (select 1 from public.travel_groups me where me.owner_user_id = auth.uid())
    and g.owner_user_id <> auth.uid()
    and t.status = 'published' and t.visibility = 'public' and t.end_date > current_date
    and (requested_trip_id is null or t.id = requested_trip_id)
  order by t.published_at desc, t.id;
$$;
revoke all on function public.list_public_trips(uuid) from public;
grant execute on function public.list_public_trips(uuid) to authenticated;
