-- Avoid per-candidate SQL lookups and JSON term construction; exact weights and tie order stay unchanged.
create or replace function discovery_private.candidates(f jsonb,me uuid) returns setof public.trip_plans
language sql stable set search_path='' as $$
  select t.* from public.trip_plans t join public.travel_groups g on g.id=t.group_id
  where t.group_id<>me and t.status='published' and t.visibility='public' and t.end_date>current_date
    and not exists(select 1 from public.group_blocks x where (x.blocker_group_id=me and x.blocked_group_id=g.id) or (x.blocker_group_id=g.id and x.blocked_group_id=me))
    and not exists(select 1 from moderation_private.suspended_accounts s where s.user_id=g.owner_user_id or s.user_id=(select owner_user_id from public.travel_groups where id=me))
    and not exists(select 1 from moderation_private.hidden_trips h where h.trip_id=t.id)
    and (not (f ? 'trip_modes') or t.mode in(select jsonb_array_elements_text(f->'trip_modes')))
    and (coalesce(jsonb_array_length(f->'landscapes'),0)=0 or t.landscape in(select jsonb_array_elements_text(f->'landscapes')))
    and (coalesce(jsonb_array_length(f->'group_kinds'),0)=0 or g.kind in(select jsonb_array_elements_text(f->'group_kinds')))
    and (coalesce(jsonb_array_length(f->'child_age_bands'),0)=0 or g.child_age_bands && array(select jsonb_array_elements_text(f->'child_age_bands')))
    and (coalesce(jsonb_array_length(f->'animal_kinds'),0)=0 or t.animal_kinds && array(select jsonb_array_elements_text(f->'animal_kinds')))
    and (not coalesce((f->>'favorites_only')::boolean,false) or exists(select 1 from favorites_private.trip_favorites x where x.owner_group_id=me and x.target_trip_id=t.id))
    and (f->>'start_date' is null or (t.start_date<(f->>'end_date')::date+coalesce((f->>'tolerance_days')::int,0)
      and t.end_date>(f->>'start_date')::date-coalesce((f->>'tolerance_days')::int,0)))
    and case when f->'location'->>'id' is null and btrim(coalesce(f->>'location_query',''))='' then true
      when f->'location'->>'id' is not null then
      case f->'location'->>'kind'
        when 'country' then case
          when f->'location'->>'id'='country:PL' then t.location_id like 'pl-%' or t.location_id='country:PL'
            or t.location_id in('demo-location-chlapowo','demo-location-gdansk','demo-location-kaszuby','demo-location-polska')
            or discovery_private.region_text(t.location_region) in('dolnoslaskie','kujawsko-pomorskie','lubelskie','lubuskie','lodzkie','malopolskie','mazowieckie','opolskie','podkarpackie','podlaskie','pomorskie','slaskie','swietokrzyskie','warminsko-mazurskie','wielkopolskie','zachodniopomorskie')
          else t.location_id=f->'location'->>'id' end
        when 'region' then t.location_id=f->'location'->>'id' or discovery_private.region_text(t.location_region)=discovery_private.region_text(f->'location'->>'name')
        else t.location_id=f->'location'->>'id' end
      else strpos(messaging_private.search_text(t.location_name||', '||t.location_region||case when discovery_private.region_text(t.location_region)='pomorskie' then ' Pomorze Pomorskie' else '' end),
        messaging_private.search_text(btrim(coalesce(f->>'location_query',''))))>0 end;
$$;

