-- Google Places is called only by the authenticated server proxy.
-- Provider names and addresses are transient; cache only IDs and geometry.
create schema if not exists places_private;
revoke all on schema places_private from public, anon, authenticated;

create table places_private.request_budgets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  minute_started timestamptz not null,
  minute_count integer not null,
  day_started date not null,
  day_count integer not null
);
create table places_private.geometry (
  place_id text primary key check (char_length(place_id) between 5 and 256 and place_id ~ '^[A-Za-z0-9_-]+$'),
  latitude float8 not null check (latitude between -85 and 85),
  longitude float8 not null check (longitude between -180 and 180),
  refreshed_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '28 days',
  check (expires_at <= refreshed_at + interval '28 days')
);
alter table places_private.request_budgets enable row level security;
alter table places_private.geometry enable row level security;
revoke all on all tables in schema places_private from public, anon, authenticated;

create function public.claim_my_place_request() returns void
language plpgsql security definer set search_path='' as $$
declare me uuid := auth.uid(); stamp timestamptz := date_trunc('minute', now()); used integer;
begin
  if me is null then raise exception 'Authentication required' using errcode='42501'; end if;
  insert into places_private.request_budgets as b(user_id, minute_started, minute_count, day_started, day_count)
  values (me, stamp, 1, current_date, 1)
  on conflict (user_id) do update set
    minute_started=stamp,
    minute_count=case when b.minute_started=stamp then b.minute_count+1 else 1 end,
    day_started=current_date,
    day_count=case when b.day_started=current_date then b.day_count+1 else 1 end
  where (b.minute_started<>stamp or b.minute_count<60)
    and (b.day_started<>current_date or b.day_count<1000)
  returning minute_count into used;
  if used is null then raise exception 'Place request limit reached' using errcode='54000'; end if;
end $$;

create function public.record_google_place_geometry(place_id text, latitude float8, longitude float8) returns void
language plpgsql security definer set search_path='' as $$
begin
  insert into places_private.geometry(place_id, latitude, longitude)
  values (place_id, latitude, longitude)
  on conflict on constraint geometry_pkey do update set
    latitude=excluded.latitude, longitude=excluded.longitude,
    refreshed_at=now(), expires_at=now()+interval '28 days';
end $$;

create function public.list_my_map_place_refreshes() returns setof text
language sql stable security definer set search_path='' as $$
  select distinct substr(t.location_id,8) from public.trip_plans t
  left join places_private.geometry g on g.place_id=substr(t.location_id,8)
  where t.group_id=favorites_private.my_group_id() and char_length(t.location_id) between 12 and 263
    and t.location_id ~ '^google:[A-Za-z0-9_-]+$'
    and (g.expires_at is null or g.expires_at < now()+interval '3 days')
  order by 1 limit 4;
$$;

create function places_private.expire_geometry() returns void
language sql security definer set search_path='' as $$
  delete from places_private.geometry where expires_at<=now();
$$;

revoke all on function public.claim_my_place_request(), public.list_my_map_place_refreshes(),
  public.record_google_place_geometry(text,float8,float8), places_private.expire_geometry()
  from public, anon, authenticated;
grant execute on function public.claim_my_place_request(), public.list_my_map_place_refreshes() to authenticated;
grant execute on function public.record_google_place_geometry(text,float8,float8) to service_role;

do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('razemgo-expire-google-geometry','0 * * * *','select places_private.expire_geometry();');
  end if;
end $$;
notify pgrst, 'reload schema';
