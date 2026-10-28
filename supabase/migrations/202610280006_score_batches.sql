-- A SQL table function lets PostgreSQL plan all pair arithmetic as part of the
-- ranking query. It uses no tables or elevated privileges. The caller's empty
-- search_path remains in force; application relations/functions are qualified.
create function discovery_private.score_rows(t public.trip_plans,g public.travel_groups,ctx discovery_private.match_context,f jsonb)
returns table(score integer,reasons text[],pair_order bigint) language sql stable as $$
  with parameters as (
    select o.id as own_id,o.ordinality as pair_order,o.location_id as own_location_id,o.location_name as own_location_name,
      o.location_region as own_location_region,o.landscape as own_landscape,
      coalesce((f->>'start_date')::date,o.start_date) as d1,coalesce((f->>'end_date')::date,o.end_date) as d2,
      case when f->>'start_date' is not null then coalesce((f->>'tolerance_days')::int,0) else 0 end as tolerance,
      case when cardinality(o.interests)>0 then o.interests else (ctx.crew).interests end as hobbies,
      case when coalesce(jsonb_array_length(f->'child_age_bands'),0)>0 then array(select jsonb_array_elements_text(f->'child_age_bands'))
        when o.id is not null then o.matching_child_age_bands else (ctx.preferences).child_age_bands end as ages,
      case when coalesce(jsonb_array_length(f->'group_kinds'),0)>0 then array(select jsonb_array_elements_text(f->'group_kinds'))
        when o.id is not null then o.matching_group_kinds else (ctx.preferences).group_kinds end as kinds,
      coalesce(o.travel_mode,(ctx.crew).travel_mode) as travel_mode,
      case when o.id is not null then o.animal_kinds else (ctx.crew).animal_kinds end as animals
    from unnest(ctx.trips) with ordinality o
  ), ratios as (
    select p.*,
      case when d1 is not null and d2>d1 then greatest(0,least(t.end_date-t.start_date,d2-d1,t.end_date-(d1-tolerance),(d2+tolerance)-t.start_date))::numeric/(d2-d1) end as dates,
      case when own_id is not null then case when own_location_id<>'' and t.location_id<>'' then own_location_id=t.location_id else
        own_location_name<>'' and t.location_name<>'' and messaging_private.search_text(own_location_name)=messaging_private.search_text(t.location_name)
        and messaging_private.search_text(own_location_region)=messaging_private.search_text(t.location_region) end else false end as same_place,
      case when cardinality(hobbies)>0 then (select count(*)::numeric/cardinality(hobbies) from unnest(hobbies) x where x=any(t.interests)) end as hobby,
      case when cardinality(ages)>0 then (select count(*)::numeric/cardinality(ages) from unnest(ages) x where x=any(g.child_age_bands)) end as age,
      case when cardinality(kinds)>0 then (g.kind=any(kinds))::int end as kind,
      case when cardinality(t.matching_group_kinds)>0 then ((ctx.crew).kind=any(t.matching_group_kinds))::int end as other_kind,
      case when cardinality(t.matching_child_age_bands)>0 then (select count(*)::numeric/cardinality(t.matching_child_age_bands) from unnest(t.matching_child_age_bands) x where x=any((ctx.crew).child_age_bands)) end as other_age,
      (coalesce(t.travel_mode,g.travel_mode)=travel_mode)::int as travel,
      case when cardinality(animals)>0 then (select count(*)::numeric/cardinality(animals) from unnest(animals) x where x=any(t.animal_kinds)) end as animal
    from parameters p
  ), terms as (
    select r.*,
      case when own_id is not null then case when same_place then 1
        when own_location_region<>'' and t.location_region<>'' and messaging_private.search_text(own_location_region)=messaging_private.search_text(t.location_region) then 0.7 else 0 end end as place,
      case when own_id is not null then (own_landscape=t.landscape)::int end as landscape
    from ratios r
  ) select coalesce(round(100*(coalesce(dates*30,0)+coalesce(place*20,0)+coalesce(landscape*10,0)+coalesce(hobby*20,0)+coalesce(age*15,0)+coalesce(kind*10,0)
      +coalesce(other_kind*10,0)+coalesce(other_age*10,0)+coalesce(travel*5,0)+coalesce(animal*5,0)) /
      nullif((case when dates is not null then 30 else 0 end)+(case when own_id is not null then 30 else 0 end)
        +(case when cardinality(hobbies)>0 then 20 else 0 end)+(case when cardinality(ages)>0 then 15 else 0 end)+(case when cardinality(kinds)>0 then 10 else 0 end)
        +(case when cardinality(t.matching_group_kinds)>0 then 10 else 0 end)+(case when cardinality(t.matching_child_age_bands)>0 then 10 else 0 end)+5
        +(case when cardinality(animals)>0 then 5 else 0 end),0)),0)::integer,
      array_remove(array[
        case when dates>0 then 'Pasujące terminy' end,
        case when place>0 then case when same_place then 'Wspólny kierunek' else 'Podobny region' end end,
        case when landscape>0 then 'Podobny klimat wyjazdu' end,
        case when hobby>0 then 'Wspólne zainteresowania' end,
        case when age>0 then 'Pasujący wiek dzieci' end,
        case when kind>0 then 'Preferowany rodzaj ekipy' end,
        case when other_kind>0 then 'Wasze ekipy pasują do swoich preferencji' end,
        case when other_age>0 then 'Twoja ekipa pasuje wiekiem dzieci' end,
        case when travel>0 then 'Podobny sposób podróżowania' end,
        case when animal>0 then 'Podróż ze zwierzętami' end],null),pair_order
    from terms;
$$;
revoke all on function discovery_private.score_rows(public.trip_plans,public.travel_groups,discovery_private.match_context,jsonb) from public,anon,authenticated;
create or replace function public.search_public_trips(filters jsonb default '{}'::jsonb,sort_mode text default 'default',after_cursor jsonb default null,page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); f jsonb:=discovery_private.validate_filters(filters); ctx discovery_private.match_context;
  result jsonb; after_at timestamptz; after_id uuid; after_score integer; query_key text:=md5(me::text||f::text||sort_mode);
begin
  if sort_mode is null or sort_mode not in('default','compatibility') or page_size is null or page_size<1 or page_size>20 then raise exception 'Invalid sorting or page size' using errcode='22023'; end if;
  if after_cursor is not null then
    begin
      if jsonb_typeof(after_cursor) is distinct from 'object' or after_cursor->>'query_key' is distinct from query_key
        or after_cursor->>'sort' is distinct from sort_mode or after_cursor->>'id' is null or after_cursor->>'published_at' is null then raise exception 'Invalid cursor'; end if;
      after_id:=(after_cursor->>'id')::uuid;after_at:=(after_cursor->>'published_at')::timestamptz;
      after_score:=(after_cursor->>'score')::int;
      if not isfinite(after_at) or after_score is null or after_score<0 or after_score>100 then raise exception 'Invalid cursor'; end if;
    exception when others then raise exception 'Invalid cursor' using errcode='22023'; end;
  end if;
  ctx:=discovery_private.matching_context(me,f);
  with eligible as materialized(select t from discovery_private.candidates(f,me) t),
  -- Default ordering limits before scoring; compatibility ranks the entire
  -- filtered set before applying a cursor or page limit.
  preliminary as materialized(
    select e.t from eligible e where sort_mode='compatibility' or after_id is null or (e.t).published_at<after_at or ((e.t).published_at=after_at and (e.t).id>after_id)
    order by (e.t).published_at desc,(e.t).id limit case when sort_mode='default' then page_size+1 else null end
  ), scored as materialized(
    select p.t,g,jsonb_build_object('score',v.score,'reasons',v.reasons) as compatibility from preliminary p join public.travel_groups g on g.id=(p.t).group_id
    cross join lateral(select * from discovery_private.score_rows(p.t,g,ctx,f) order by score desc,pair_order limit 1) v
  ), page as materialized(
    select s.* from scored s where sort_mode='default' or after_id is null
      or (s.compatibility->>'score')::int<after_score
      or ((s.compatibility->>'score')::int=after_score and ((s.t).published_at<after_at or ((s.t).published_at=after_at and (s.t).id>after_id)))
    order by case when sort_mode='compatibility' then (s.compatibility->>'score')::int end desc,(s.t).published_at desc,(s.t).id limit page_size+1
  ), visible as materialized(
    select p.*,row_number() over(order by case when sort_mode='compatibility' then (p.compatibility->>'score')::int end desc,(p.t).published_at desc,(p.t).id) as pair_order
    from page p order by case when sort_mode='compatibility' then (p.compatibility->>'score')::int end desc,(p.t).published_at desc,(p.t).id limit page_size
  ) select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('trip',projection.trip,'crew',projection.crew,'compatibility',v.compatibility) order by v.pair_order)
      from visible v cross join lateral public.list_public_trips((v.t).id) projection),'[]'),
    'total_count',(select count(*) from eligible),'has_more',(select count(*)>page_size from page),
    'cursor',(select jsonb_build_object('id',(v.t).id,'published_at',(v.t).published_at,'score',(v.compatibility->>'score')::int,'sort',sort_mode,'query_key',query_key) from visible v order by v.pair_order desc limit 1)) into result;
  return result;
end $$;

create or replace function discovery_private.score(t public.trip_plans,g public.travel_groups,ctx discovery_private.match_context,f jsonb) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('score',s.score,'reasons',s.reasons)
 from discovery_private.score_rows(t,g,ctx,f) s order by s.score desc,s.pair_order limit 1;
$$;
