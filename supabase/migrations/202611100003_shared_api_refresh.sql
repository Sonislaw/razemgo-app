-- Cross-isolate leases: a single provider refresh per geometry/weather key.
create schema api_cache_private;
revoke all on schema api_cache_private from public,anon,authenticated;
create table api_cache_private.refresh_leases (
  key text primary key check(char_length(key) between 5 and 400),
  request_id uuid not null,
  expires_at timestamptz not null,
  retry_after timestamptz not null default '-infinity'
);
alter table api_cache_private.refresh_leases enable row level security;
revoke all on api_cache_private.refresh_leases from public,anon,authenticated;

create table weather_private.components (
  key text not null, component text not null check(component in('forecast','alerts')),
  payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=500000),
  expires_at timestamptz not null, primary key(key,component)
);
alter table weather_private.components enable row level security;
revoke all on weather_private.components from public,anon,authenticated;

create function public.get_weather_component(cache_key text, component text) returns jsonb
language sql stable security definer set search_path='' as $$
  select c.payload from weather_private.components c where c.key=$1 and c.component=$2 and c.expires_at>now();
$$;
create function public.claim_api_cache_refresh(cache_key text, refresh_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare acquired uuid; held api_cache_private.refresh_leases;
begin
  if cache_key is null or cache_key !~ '^(places:geometry:|weather:forecast:|weather:alerts:).+'
    or char_length(cache_key)>400 or refresh_id is null then raise exception 'Invalid refresh' using errcode='22023'; end if;
  insert into api_cache_private.refresh_leases as l(key,request_id,expires_at)
  values(cache_key,refresh_id,clock_timestamp()+interval '60 seconds')
  on conflict(key) do update set request_id=excluded.request_id,expires_at=excluded.expires_at,retry_after='-infinity'
    where l.expires_at<=clock_timestamp() and l.retry_after<=clock_timestamp()
  returning request_id into acquired;
  if acquired is not null then return jsonb_build_object('state','acquired'); end if;
  select * into held from api_cache_private.refresh_leases where key=cache_key;
  return jsonb_build_object('state',case when held.retry_after>clock_timestamp() then 'cooldown' else 'busy' end);
end $$;

create function public.release_api_cache_refresh(cache_key text, refresh_id uuid, failed boolean default false) returns void
language plpgsql security definer set search_path='' as $$
begin
  if failed then
    update api_cache_private.refresh_leases set expires_at=clock_timestamp(),retry_after=clock_timestamp()+interval '10 seconds'
      where key=cache_key and request_id=refresh_id;
  else delete from api_cache_private.refresh_leases where key=cache_key and request_id=refresh_id;
  end if;
end $$;

create function public.commit_api_cache_refresh(cache_key text, refresh_id uuid, payload jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare held api_cache_private.refresh_leases; identifier text; kind text;
begin
  select * into held from api_cache_private.refresh_leases where key=cache_key and request_id=refresh_id
    and expires_at>clock_timestamp() for update;
  if not found then return false; end if;
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'Invalid cache payload' using errcode='22023'; end if;
  if starts_with(cache_key,'places:geometry:') then
    identifier:=substr(cache_key,17);
    if char_length(identifier) not between 5 and 256 or identifier !~ '^[A-Za-z0-9_-]+$' or payload->>'placeId' is distinct from identifier then
      raise exception 'Invalid geometry key' using errcode='22023'; end if;
    perform public.record_google_place_geometry(identifier,(payload->>'latitude')::float8,(payload->>'longitude')::float8,nullif(payload->'bounds','null'::jsonb));
  else
    kind:=case when starts_with(cache_key,'weather:forecast:') then 'forecast' when starts_with(cache_key,'weather:alerts:') then 'alerts' end;
    if kind is null or jsonb_typeof(payload->case kind when 'forecast' then 'days' else 'alerts' end) is distinct from 'array'
      then raise exception 'Invalid weather payload' using errcode='22023'; end if;
    identifier:=substr(cache_key,length('weather:'||kind||':')+1);
    insert into weather_private.components(key,component,payload,expires_at)
    values(identifier,kind,payload,clock_timestamp()+case kind when 'forecast' then interval '60 minutes' else interval '10 minutes' end)
    on conflict(key,component) do update set payload=excluded.payload,expires_at=excluded.expires_at;
  end if;
  delete from api_cache_private.refresh_leases where key=cache_key and request_id=refresh_id;
  return true;
end $$;
revoke all on function public.get_weather_component(text,text),public.claim_api_cache_refresh(text,uuid),
  public.release_api_cache_refresh(text,uuid,boolean),public.commit_api_cache_refresh(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.get_weather_component(text,text),public.claim_api_cache_refresh(text,uuid),
  public.release_api_cache_refresh(text,uuid,boolean),public.commit_api_cache_refresh(text,uuid,jsonb) to service_role;

create or replace function weather_private.expire_cache() returns void
language plpgsql security definer set search_path='' as $$ begin
  delete from weather_private.cache where expires_at<=now();
  delete from weather_private.components where expires_at<=now();
  delete from api_cache_private.refresh_leases where expires_at<now()-interval '5 minutes' and retry_after<=now();
end $$;
notify pgrst,'reload schema';
