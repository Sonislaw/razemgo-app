-- A single marker uses the organizing crew's transport, independently of trip criteria.
-- Existing clients ignore the added field; clusters retain only their count.
create or replace function public.search_trip_map(filters jsonb default '{}',viewport jsonb default '{"south":48,"north":56,"west":13,"east":25}',map_zoom integer default 5)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id();f jsonb:=discovery_private.validate_filters(filters)||'{"trip_modes":["planned"]}'::jsonb;
  bounds jsonb:=discovery_private.map_bounds(viewport);step float8;result jsonb;
begin
  if map_zoom is null or map_zoom<2 or map_zoom>18 then raise exception 'Invalid map zoom' using errcode='22023';end if;
  step:=discovery_private.map_step(bounds,map_zoom);
  with eligible as materialized(select * from discovery_private.map_candidates(f,me)),
  visible as materialized(select * from eligible t where discovery_private.map_intersects(t.mode,t.latitude,t.longitude,t.radius_m,bounds,t.extent)),
  clusters as (
    select discovery_private.map_cell(t.latitude,t.longitude,step) as key,count(*)::integer as count,
      avg(t.latitude) as latitude,avg(t.longitude) as longitude,min(t.latitude) as south,max(t.latitude) as north,
      min(t.longitude) as west,max(t.longitude) as east,case when count(*)=1 then min(t.location_name) else 'Wyjazdy: '||count(*) end as label,
      case when count(*)=1 then min(g.travel_mode) end as travel_mode
    from visible t
    join public.trip_plans p on p.id=t.id
    join public.travel_groups g on g.id=p.group_id
    where t.mode='planned' group by 1
  ) select jsonb_build_object(
    'points',coalesce((select jsonb_agg(to_jsonb(c) order by c.key) from clusters c),'[]'::jsonb),
    'areas','[]'::jsonb,
    'planned_count',(select count(*) from visible where mode='planned'),
    'flexible_count',(select count(*) from visible where mode='flexible'),
    'unmapped_count',(select count(*) from eligible where latitude is null),
    'total_count',(select count(*) from eligible),'viewport',bounds,'zoom',map_zoom) into result;
  return result;
end $$;

notify pgrst,'reload schema';
