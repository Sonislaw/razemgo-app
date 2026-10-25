-- Visible by default, while preserving every explicitly saved visibility choice.
alter table public.group_public_profiles alter column discoverable set default true;

create function messaging_private.initialize_group_visibility() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.group_public_profiles(group_id) values(new.id) on conflict(group_id) do nothing;
  return new;
end $$;
revoke all on function messaging_private.initialize_group_visibility() from public,anon,authenticated;
create trigger initialize_group_visibility after insert on public.travel_groups
  for each row execute function messaging_private.initialize_group_visibility();

-- Existing groups without settings inherit the new default. Hidden groups stay hidden.
insert into public.group_public_profiles(group_id)
  select id from public.travel_groups on conflict(group_id) do nothing;

create or replace function public.get_my_group_visibility() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id();
begin
  if me is null then raise exception 'Profile required' using errcode='42501'; end if;
  return coalesce((select jsonb_build_object('discoverable',p.discoverable,'about',p.about)
    from public.group_public_profiles p where p.group_id=me),'{"discoverable":true,"about":""}'::jsonb);
end $$;

notify pgrst,'reload schema';
