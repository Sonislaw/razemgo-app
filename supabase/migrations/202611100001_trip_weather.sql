-- Weather requests accept only a trip ID. Access, dates and geometry come from
-- the stored trip; clients cannot turn the service into an arbitrary proxy.
create schema weather_private;
revoke all on schema weather_private from public,anon,authenticated;
create table weather_private.request_budgets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  minute_started timestamptz not null, minute_count integer not null,
  day_started date not null, day_count integer not null
);
create table weather_private.cache (
  key text primary key check(char_length(key) between 3 and 100),
  payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=150000),
  expires_at timestamptz not null default now()+interval '10 minutes'
);
alter table weather_private.request_budgets enable row level security;
alter table weather_private.cache enable row level security;
revoke all on all tables in schema weather_private from public,anon,authenticated;

create function public.get_my_trip_weather_context(target_trip_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); t public.trip_plans; stamp timestamptz:=date_trunc('minute',now()); used integer; lat float8; lng float8;
begin
  select * into t from public.trip_plans p where p.id=target_trip_id and
    (p.group_id=me or exists(select 1 from discovery_private.candidates('{}',me) available where available.id=p.id));
  if t.id is null then return null; end if;
  insert into weather_private.request_budgets as b(user_id,minute_started,minute_count,day_started,day_count)
  values(auth.uid(),stamp,1,current_date,1) on conflict(user_id) do update set minute_started=stamp,
    minute_count=case when b.minute_started=stamp then b.minute_count+1 else 1 end, day_started=current_date,
    day_count=case when b.day_started=current_date then b.day_count+1 else 1 end
    where (b.minute_started<>stamp or b.minute_count<30) and (b.day_started<>current_date or b.day_count<300)
    returning minute_count into used;
  if used is null then raise exception 'Weather request limit reached' using errcode='54000'; end if;
  select g.latitude,g.longitude into lat,lng from places_private.trip_geometry(t) g;
  return jsonb_build_object('start_date',t.start_date,'end_date',t.end_date,
    'place_kind',coalesce(t.place_data->>'kind',t.location_kind),
    'google_place_id',t.place_data->>'googlePlaceId','latitude',lat,'longitude',lng);
end $$;
revoke all on function public.get_my_trip_weather_context(uuid) from public,anon,authenticated;
grant execute on function public.get_my_trip_weather_context(uuid) to authenticated;

create function public.get_trip_weather_cache(cache_key text) returns jsonb
language sql stable security definer set search_path='' as $$
  select payload from weather_private.cache where key=cache_key and expires_at>now();
$$;
create function public.put_trip_weather_cache(cache_key text,forecast jsonb) returns void
language sql security definer set search_path='' as $$
  insert into weather_private.cache(key,payload) values(cache_key,forecast)
  on conflict(key) do update set payload=excluded.payload,expires_at=now()+interval '10 minutes';
$$;
revoke all on function public.get_trip_weather_cache(text),public.put_trip_weather_cache(text,jsonb) from public,anon,authenticated;
grant execute on function public.get_trip_weather_cache(text),public.put_trip_weather_cache(text,jsonb) to service_role;
create function weather_private.expire_cache() returns void
language sql security definer set search_path='' as $$ delete from weather_private.cache where expires_at<=now(); $$;
revoke all on function weather_private.expire_cache() from public,anon,authenticated;
do $$ begin
  if exists(select 1 from pg_namespace where nspname='cron') then
    perform cron.schedule('razemgo-expire-weather','*/10 * * * *','select weather_private.expire_cache();');
  end if;
end $$;
notify pgrst,'reload schema';
