-- Make open-ended trips visible on the map before selecting an individual result.
-- The marker belongs to the visible part of an approximate area, not a destination.
create function discovery_private.map_area_marker(lat float8,lng float8,radius float8,extent jsonb,viewport jsonb,step float8)
returns table(key text,latitude float8,longitude float8,south float8,north float8,west float8,east float8)
language sql immutable set search_path='' as $$
  with box as (
    select coalesce(extent,jsonb_build_object(
      'south',greatest(-85,lat-radius/111320),'north',least(85,lat+radius/111320),
      'west',greatest(-180,lng-radius/(111320*cos(radians(lat)))),'east',least(180,lng+radius/(111320*cos(radians(lat)))))) b
    where lat is not null
  ), coordinates as (
    select (b->>'south')::float8 s,(b->>'north')::float8 n,(b->>'west')::float8 w,(b->>'east')::float8 e from box
  ), anchored as (
    select *, (greatest(s,(viewport->>'south')::float8)+least(n,(viewport->>'north')::float8))/2 a_lat,
      (greatest(w,(viewport->>'west')::float8)+least(e,(viewport->>'east')::float8))/2 a_lng from coordinates
  )
  select 'a:'||substr(discovery_private.map_cell(a_lat,a_lng,step),3),a_lat,a_lng,s,n,w,e from anchored;
$$;
revoke all on function discovery_private.map_area_marker(float8,float8,float8,jsonb,jsonb,float8) from public,anon,authenticated;

create or replace function public.search_trip_map(filters jsonb default '{}',viewport jsonb default '{"south":48,"north":56,"west":13,"east":25}',map_zoom integer default 5)
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
  ), area_members as materialized (
    select t.location_name,m.* from visible t
      cross join lateral discovery_private.map_area_marker(t.latitude,t.longitude,t.radius_m,t.extent,bounds,step) m
    where t.mode='flexible'
  ), area_clusters as (
    select key,count(*)::integer as count,avg(latitude) as latitude,avg(longitude) as longitude,
      min(south) as south,max(north) as north,min(west) as west,max(east) as east,
      case when count(*)=1 then min(location_name) else 'Szukają pomysłu: '||count(*) end as label
    from area_members group by key
  ) select jsonb_build_object(
    'points',coalesce((select jsonb_agg(to_jsonb(c) order by c.key) from clusters c),'[]'::jsonb),
    'areas',coalesce((select jsonb_agg(to_jsonb(c) order by c.key) from area_clusters c),'[]'::jsonb),
    'planned_count',(select count(*) from visible where mode='planned'),
    'flexible_count',(select count(*) from visible where mode='flexible'),
    'unmapped_count',(select count(*) from eligible where latitude is null),
    'total_count',(select count(*) from eligible),'viewport',bounds,'zoom',map_zoom) into result;
  return result;
end $$;

create or replace function public.get_trip_map_items(filters jsonb default '{}',viewport jsonb default '{"south":48,"north":56,"west":13,"east":25}',
  map_zoom integer default 5,cluster_key text default 'areas',after_cursor jsonb default null,page_size integer default 5)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id();f jsonb:=discovery_private.validate_filters(filters);
  bounds jsonb:=discovery_private.map_bounds(viewport);step float8;query_key text;after_id uuid;after_at timestamptz;result jsonb;
begin
  if map_zoom is null or map_zoom<2 or map_zoom>18 or page_size is null or page_size<1 or page_size>10
    or cluster_key is null or not(cluster_key='areas' or cluster_key~'^[pa]:[0-9]{1,12}:[0-9]{1,12}$'
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
        when left(cluster_key,2)='a:' then t.mode='flexible' and cluster_key=(
          select m.key from discovery_private.map_area_marker(t.latitude,t.longitude,t.radius_m,t.extent,bounds,step) m)
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


notify pgrst,'reload schema';
