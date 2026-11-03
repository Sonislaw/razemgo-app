-- Bounded geographic discovery. Existing criteria and access rules remain authoritative.
create index trip_map_location on public.trip_plans(location_id) where status='published' and visibility='public';
create function discovery_private.map_bounds(value jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare s double precision; n double precision; w double precision; e double precision;
begin
  if jsonb_typeof(value) is distinct from 'object' or (select count(*) from jsonb_object_keys(value))<>4
    or jsonb_typeof(value->'south') is distinct from 'number' or jsonb_typeof(value->'north') is distinct from 'number'
    or jsonb_typeof(value->'west') is distinct from 'number' or jsonb_typeof(value->'east') is distinct from 'number' then
    raise exception 'Invalid map bounds' using errcode='22023'; end if;
  s:=(value->>'south')::double precision; n:=(value->>'north')::double precision;
  w:=(value->>'west')::double precision; e:=(value->>'east')::double precision;
  if not(s>=-85 and n<=85 and w>=-180 and e<=180 and s<n and w<e) then
    raise exception 'Invalid map bounds' using errcode='22023'; end if;
  return value;
end $$;
create function discovery_private.map_y(latitude double precision) returns double precision
language sql immutable set search_path='' as $$
  select (1-ln(tan(pi()/4+radians(latitude)/2))/pi())/2;
$$;
create function discovery_private.map_step(bounds jsonb,zoom integer) returns double precision
language sql immutable set search_path='' as $$
  -- At most 17 x 17 occupied cells, including unusually wide viewport requests.
  select greatest(64.0/(256*power(2,zoom)),((bounds->>'east')::float8-(bounds->>'west')::float8)/360/16,
    (discovery_private.map_y((bounds->>'south')::float8)-discovery_private.map_y((bounds->>'north')::float8))/16);
$$;
create function discovery_private.map_cell(lat double precision,lng double precision,step double precision) returns text
language sql immutable set search_path='' as $$
  select 'p:'||floor((lng+180)/360/step)::bigint||':'||floor(discovery_private.map_y(lat)/step)::bigint;
$$;
create function discovery_private.map_candidates(f jsonb,me uuid)
returns table(id uuid,mode text,published_at timestamptz,location_name text,latitude float8,longitude float8,radius_m float8,extent jsonb)
language sql stable set search_path='' as $$
  select t.id,t.mode,t.published_at,t.location_name,g.latitude,g.longitude,g.radius_m,g.bounds
  from discovery_private.candidates(f,me) t left join discovery_private.map_locations g on g.id=t.location_id;
$$;
create function discovery_private.map_intersects(mode text,lat float8,lng float8,radius float8,bounds jsonb,extent jsonb) returns boolean
language sql immutable set search_path='' as $$
  select lat is not null and case when mode='planned' then
    lat between (bounds->>'south')::float8 and (bounds->>'north')::float8
      and lng between (bounds->>'west')::float8 and (bounds->>'east')::float8
  when extent is not null then
    (extent->>'north')::float8>=(bounds->>'south')::float8 and (extent->>'south')::float8<=(bounds->>'north')::float8
      and (extent->>'east')::float8>=(bounds->>'west')::float8 and (extent->>'west')::float8<=(bounds->>'east')::float8
  else lat+radius/111320>=(bounds->>'south')::float8 and lat-radius/111320<=(bounds->>'north')::float8
    and lng+radius/(111320*cos(radians(lat)))>=(bounds->>'west')::float8
    and lng-radius/(111320*cos(radians(lat)))<=(bounds->>'east')::float8 end;
$$;

create function public.search_trip_map(filters jsonb default '{}',viewport jsonb default '{"south":48,"north":56,"west":13,"east":25}',map_zoom integer default 5)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id();f jsonb:=discovery_private.validate_filters(filters);
  bounds jsonb:=discovery_private.map_bounds(viewport);step float8;result jsonb;
begin
  if map_zoom is null or map_zoom<2 or map_zoom>18 then raise exception 'Invalid map zoom' using errcode='22023';end if;
  step:=discovery_private.map_step(bounds,map_zoom);
  with eligible as materialized(select * from discovery_private.map_candidates(f,me)),
  visible as materialized(select * from eligible t where discovery_private.map_intersects(t.mode,t.latitude,t.longitude,t.radius_m,bounds,t.extent)),
  clusters as (
    select discovery_private.map_cell(t.latitude,t.longitude,step) as key,count(*)::integer as count,
      avg(t.latitude) as latitude,avg(t.longitude) as longitude,min(t.latitude) as south,max(t.latitude) as north,
      min(t.longitude) as west,max(t.longitude) as east,case when count(*)=1 then min(t.location_name) else 'Wyjazdy: '||count(*) end as label
    from visible t where t.mode='planned' group by 1
  ) select jsonb_build_object(
    'points',coalesce((select jsonb_agg(to_jsonb(c) order by c.key) from clusters c),'[]'::jsonb),
    'planned_count',(select count(*) from visible where mode='planned'),
    'flexible_count',(select count(*) from visible where mode='flexible'),
    'unmapped_count',(select count(*) from eligible where latitude is null),
    'total_count',(select count(*) from eligible),'viewport',bounds,'zoom',map_zoom) into result;
  return result;
end $$;

create function public.get_trip_map_items(filters jsonb default '{}',viewport jsonb default '{"south":48,"north":56,"west":13,"east":25}',
  map_zoom integer default 5,cluster_key text default 'areas',after_cursor jsonb default null,page_size integer default 5)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id();f jsonb:=discovery_private.validate_filters(filters);
  bounds jsonb:=discovery_private.map_bounds(viewport);step float8;query_key text;after_id uuid;after_at timestamptz;result jsonb;
begin
  if map_zoom is null or map_zoom<2 or map_zoom>18 or page_size is null or page_size<1 or page_size>10
    or cluster_key is null or not(cluster_key='areas' or cluster_key~'^p:[0-9]{1,12}:[0-9]{1,12}$'
      or cluster_key~'^trip:[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$') then
    raise exception 'Invalid map selection' using errcode='22023';end if;
  step:=discovery_private.map_step(bounds,map_zoom);
  query_key:=md5('map:1:'||me::text||f::text||bounds::text||map_zoom||cluster_key);
  if after_cursor is not null then
    begin
      if jsonb_typeof(after_cursor) is distinct from 'object' or after_cursor->>'version' is distinct from '1'
        or after_cursor->>'query_key' is distinct from query_key or after_cursor->>'id' is null
        or after_cursor->>'published_at' is null then raise exception 'Invalid cursor';end if;
      after_id:=(after_cursor->>'id')::uuid;after_at:=(after_cursor->>'published_at')::timestamptz;
      if not isfinite(after_at) then raise exception 'Invalid cursor';end if;
    exception when others then raise exception 'Invalid cursor' using errcode='22023';end;
  end if;
  with eligible as materialized (
    select t.* from discovery_private.map_candidates(f,me) t
    where discovery_private.map_intersects(t.mode,t.latitude,t.longitude,t.radius_m,bounds,t.extent)
      and case when cluster_key='areas' then t.mode='flexible'
        when left(cluster_key,5)='trip:' then t.id=substr(cluster_key,6)::uuid
        else t.mode='planned' and discovery_private.map_cell(t.latitude,t.longitude,step)=cluster_key end
  ), matched as materialized (
    select * from eligible where after_id is null or published_at<after_at or published_at=after_at and id>after_id
    order by published_at desc,id limit page_size+1
  ), page as materialized(select * from matched order by published_at desc,id limit page_size)
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('map_area',jsonb_build_object('latitude',t.latitude,'longitude',t.longitude,
      'radius_m',case when t.mode='flexible' then t.radius_m else 0 end,'bounds',case when t.mode='flexible' then t.extent end)) order by t.published_at desc,t.id)
      from page t cross join lateral public.list_public_trips(t.id) p),'[]'::jsonb),
    'total_count',(select count(*) from eligible),'has_more',(select count(*)>page_size from matched),
    'cursor',(select jsonb_build_object('id',id,'published_at',published_at,'query_key',query_key,'version',1)
      from page order by published_at,id desc limit 1)) into result;
  return result;
end $$;

revoke all on function discovery_private.map_bounds(jsonb),discovery_private.map_y(float8),discovery_private.map_step(jsonb,integer),
  discovery_private.map_cell(float8,float8,float8),discovery_private.map_candidates(jsonb,uuid),
  discovery_private.map_intersects(text,float8,float8,float8,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.search_trip_map(jsonb,jsonb,integer),public.get_trip_map_items(jsonb,jsonb,integer,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.search_trip_map(jsonb,jsonb,integer),public.get_trip_map_items(jsonb,jsonb,integer,text,jsonb,integer) to authenticated;
notify pgrst,'reload schema';
