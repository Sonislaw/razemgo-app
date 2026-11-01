-- Every crew profile is available to authenticated travelers. Keep the legacy
-- column/signatures only for installed clients; they can no longer hide a crew.
insert into public.group_public_profiles(group_id)
  select id from public.travel_groups on conflict(group_id) do nothing;
update public.group_public_profiles set discoverable=true,updated_at=now()
  where not discoverable;
alter table public.group_public_profiles alter column discoverable set default true;
alter table public.group_public_profiles add constraint group_profiles_always_discoverable check (discoverable);

create or replace function public.get_my_group_visibility() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id();
begin
  if me is null then raise exception 'Profile required' using errcode='42501'; end if;
  return jsonb_build_object('discoverable',true,'about',coalesce(
    (select p.about from public.group_public_profiles p where p.group_id=me),''));
end $$;

-- Legacy callers may still update their description. A false visibility input
-- is intentionally ignored, including from older APKs and direct RPC requests.
-- save_my_profile uses this helper for its transactional description update.
create or replace function public.save_my_group_visibility(is_discoverable boolean,about_text text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); saved public.group_public_profiles;
begin
  if me is null then raise exception 'Profile required' using errcode='42501'; end if;
  if (is_discoverable is null and about_text is null) or char_length(btrim(about_text))>600 then
    raise exception 'Invalid public profile' using errcode='22023'; end if;
  insert into public.group_public_profiles(group_id,about)
    values(me,coalesce(btrim(about_text),'')) on conflict(group_id) do update set
      about=coalesce(btrim(about_text),public.group_public_profiles.about),updated_at=now()
    returning * into saved;
  return jsonb_build_object('discoverable',true,'about',saved.about);
end $$;

revoke all on function public.get_my_group_visibility(),public.save_my_group_visibility(boolean,text) from public,anon;
grant execute on function public.get_my_group_visibility(),public.save_my_group_visibility(boolean,text) to authenticated;
notify pgrst,'reload schema';
