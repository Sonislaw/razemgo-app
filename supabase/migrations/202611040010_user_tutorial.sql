-- Account-scoped tutorial decisions. No public table or arbitrary owner parameter.
create schema if not exists onboarding_private;
revoke all on schema onboarding_private from public, anon, authenticated;

create table onboarding_private.tutorial_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null check (status in ('skipped', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table onboarding_private.tutorial_states enable row level security;
revoke all on onboarding_private.tutorial_states from public, anon, authenticated;

create function public.get_my_tutorial_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare decision text;
begin
  perform favorites_private.my_group_id();
  select status into decision from onboarding_private.tutorial_states where user_id = auth.uid();
  return jsonb_build_object('version', 1, 'status', decision);
end;
$$;

create function public.finish_my_tutorial(tutorial_status text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare decision text;
begin
  perform favorites_private.my_group_id();
  if tutorial_status is null or tutorial_status not in ('skipped', 'completed') then
    raise exception 'Invalid tutorial status' using errcode = '22023';
  end if;
  insert into onboarding_private.tutorial_states as existing (user_id, status)
  values (auth.uid(), tutorial_status)
  on conflict (user_id) do update set
    status = case when existing.status = 'completed' then 'completed' else excluded.status end,
    updated_at = case when existing.status = 'completed' or existing.status = excluded.status
      then existing.updated_at else now() end
  returning status into decision;
  return jsonb_build_object('version', 1, 'status', decision);
end;
$$;
revoke all on function public.get_my_tutorial_state(), public.finish_my_tutorial(text) from public, anon;
grant execute on function public.get_my_tutorial_state(), public.finish_my_tutorial(text) to authenticated;
