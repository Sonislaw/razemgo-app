-- One adult account owns one travel group. No Auth metadata is trusted for ownership.
create or replace function public.profile_array_valid(items text[], allowed text[], maximum integer)
returns boolean language sql immutable set search_path = '' as $$
  select items is not null and cardinality(items) <= maximum
    and array_position(items, null) is null and items <@ allowed
    and cardinality(items) = (select count(distinct item) from unnest(items) item);
$$;
revoke all on function public.profile_array_valid(text[], text[], integer) from public;
grant execute on function public.profile_array_valid(text[], text[], integer) to authenticated;

create table public.travel_groups (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 2 and 40),
  avatar_id text not null check (avatar_id in ('trail-fox','camp-bear','star-owl','paddle-beaver','summit-chamois','meadow-hedgehog','road-wolf','cycling-hare','campfire-squirrel','happy-dog')),
  kind text not null check (kind in ('family','couple','solo','friends')),
  adult_count integer not null check (adult_count between 1 and 8),
  child_count integer not null check (child_count between 0 and 6),
  child_age_bands text[] not null default '{}' check (public.profile_array_valid(child_age_bands, array['0–3','4–6','7–9','10–12','13–17'], child_count)),
  travel_mode text not null check (travel_mode in ('Przyczepa','Kamper','Namiot','Van','Samochód')),
  interests text[] not null default '{}' check (public.profile_array_valid(interests, array['Rowery','Spokojny wypoczynek','Ognisko','Plaża','Przyroda','Wędrówki','Kajaki','Fotografia','Gry planszowe','Zwiedzanie'], 10)),
  animal_kinds text[] not null default '{}' check (public.profile_array_valid(animal_kinds, array['dog','cat'], 2)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.group_preferences (
  group_id uuid primary key references public.travel_groups(id) on delete cascade,
  group_kinds text[] not null default '{}' check (public.profile_array_valid(group_kinds, array['family','couple','solo','friends'], 4)),
  child_age_bands text[] not null default '{}' check (public.profile_array_valid(child_age_bands, array['0–3','4–6','7–9','10–12','13–17'], 5)),
  description text not null default '' check (description = btrim(description) and char_length(description) <= 240)
);
alter table public.travel_groups enable row level security;
alter table public.group_preferences enable row level security;
revoke all on public.travel_groups, public.group_preferences from anon, authenticated;
grant select, insert, update, delete on public.travel_groups, public.group_preferences to authenticated;

create policy group_owner_select on public.travel_groups for select to authenticated
  using (owner_user_id = (select auth.uid()));
create policy group_owner_insert on public.travel_groups for insert to authenticated
  with check (owner_user_id = (select auth.uid()));
create policy group_owner_update on public.travel_groups for update to authenticated
  using (owner_user_id = (select auth.uid())) with check (owner_user_id = (select auth.uid()));
create policy group_owner_delete on public.travel_groups for delete to authenticated
  using (owner_user_id = (select auth.uid()));

create policy preferences_owner_select on public.group_preferences for select to authenticated
  using (exists (select 1 from public.travel_groups g where g.id = group_id and g.owner_user_id = (select auth.uid())));
create policy preferences_owner_insert on public.group_preferences for insert to authenticated
  with check (exists (select 1 from public.travel_groups g where g.id = group_id and g.owner_user_id = (select auth.uid())));
create policy preferences_owner_update on public.group_preferences for update to authenticated
  using (exists (select 1 from public.travel_groups g where g.id = group_id and g.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from public.travel_groups g where g.id = group_id and g.owner_user_id = (select auth.uid())));
create policy preferences_owner_delete on public.group_preferences for delete to authenticated
  using (exists (select 1 from public.travel_groups g where g.id = group_id and g.owner_user_id = (select auth.uid())));

-- Invoker rights retain RLS. The complete profile update is one transaction.
create or replace function public.save_my_profile(profile_data jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  saved_group public.travel_groups;
  saved_preferences public.group_preferences;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(profile_data) is distinct from 'object' then
    raise exception 'Invalid profile' using errcode = '22023';
  end if;
  insert into public.travel_groups (owner_user_id, name, avatar_id, kind, adult_count, child_count, child_age_bands, travel_mode, interests, animal_kinds)
  values (
    owner_id, btrim(profile_data->>'name'), profile_data->>'avatar_id', profile_data->>'kind',
    (profile_data->>'adult_count')::integer, (profile_data->>'child_count')::integer,
    array(select jsonb_array_elements_text(coalesce(profile_data->'child_age_bands', '[]'::jsonb))),
    profile_data->>'travel_mode',
    array(select jsonb_array_elements_text(coalesce(profile_data->'interests', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(profile_data->'animal_kinds', '[]'::jsonb)))
  ) on conflict (owner_user_id) do update set
    name = excluded.name, avatar_id = excluded.avatar_id, kind = excluded.kind,
    adult_count = excluded.adult_count, child_count = excluded.child_count,
    child_age_bands = excluded.child_age_bands, travel_mode = excluded.travel_mode,
    interests = excluded.interests, animal_kinds = excluded.animal_kinds, updated_at = now()
  returning * into saved_group;
  insert into public.group_preferences (group_id, group_kinds, child_age_bands, description)
  values (
    saved_group.id,
    array(select jsonb_array_elements_text(coalesce(profile_data->'matching'->'group_kinds', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(profile_data->'matching'->'child_age_bands', '[]'::jsonb))),
    btrim(coalesce(profile_data->'matching'->>'description', ''))
  ) on conflict (group_id) do update set
    group_kinds = excluded.group_kinds, child_age_bands = excluded.child_age_bands, description = excluded.description
  returning * into saved_preferences;
  return jsonb_build_object('group', to_jsonb(saved_group), 'preferences', to_jsonb(saved_preferences));
end;
$$;
revoke all on function public.save_my_profile(jsonb) from public, anon;
grant execute on function public.save_my_profile(jsonb) to authenticated;
