-- Edit the crew description with the profile, preserving independent visibility.
-- Existing clients may still save both fields through the original signature.
create or replace function public.save_my_group_visibility(is_discoverable boolean, about_text text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := messaging_private.my_group_id(); saved public.group_public_profiles;
begin
  if me is null then raise exception 'Profile required' using errcode='42501'; end if;
  if (is_discoverable is null and about_text is null)
    or char_length(btrim(about_text))>600 then
    raise exception 'Invalid public profile' using errcode='22023'; end if;
  insert into public.group_public_profiles(group_id,discoverable,about)
    values(me,coalesce(is_discoverable,true),coalesce(btrim(about_text),''))
    on conflict(group_id) do update set
      discoverable=coalesce(is_discoverable,public.group_public_profiles.discoverable),
      about=coalesce(btrim(about_text),public.group_public_profiles.about),updated_at=now()
    returning * into saved;
  return jsonb_build_object('discoverable',saved.discoverable,'about',saved.about);
end $$;

-- Keep invoker rights, RLS, ownership, and the legacy preferences response.
-- The profile and its optional description commit or roll back together.
create or replace function public.save_my_profile(profile_data jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  saved_group public.travel_groups;
  saved_preferences public.group_preferences;
  saved_about text;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(profile_data) is distinct from 'object'
    or (profile_data ? 'about' and jsonb_typeof(profile_data->'about') is distinct from 'string') then
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
  if profile_data ? 'about' then
    perform public.save_my_group_visibility(null,profile_data->>'about');
  end if;
  select p.about into saved_about from public.group_public_profiles p where p.group_id=saved_group.id;
  return jsonb_build_object('group',to_jsonb(saved_group),'preferences',to_jsonb(saved_preferences),
    'about',coalesce(saved_about,''));
end $$;

revoke all on function public.save_my_profile(jsonb),public.save_my_group_visibility(boolean,text) from public,anon;
grant execute on function public.save_my_profile(jsonb),public.save_my_group_visibility(boolean,text) to authenticated;
notify pgrst,'reload schema';
