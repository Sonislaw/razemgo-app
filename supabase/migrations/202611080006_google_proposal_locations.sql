-- Proposal notifications use the same verified geometry as discovery. An area
-- can contain the other destination regardless of which crew published first.
-- Keep the previous text rules for publications without modern place metadata.
create or replace function notifications_private.proposal_matches(o public.trip_plans,p public.trip_plans) returns boolean
language sql stable security definer set search_path='' as $$
  select o.group_id<>p.group_id and o.status='published' and o.visibility='public' and o.end_date>current_date
    and p.status='published' and p.visibility='public' and p.end_date>current_date
    and greatest(o.start_date,p.start_date)<least(o.end_date,p.end_date)
    and favorites_private.can_view_trip(o.group_id,p.id) and favorites_private.can_view_trip(p.group_id,o.id)
    and case when o.place_data is not null or p.place_data is not null then
      o.location_id=p.location_id or (
        -- Unknown/expired Google coordinates cannot establish that two different
        -- places are nearby merely because their user-written labels coincide.
        ((og.latitude is not null and pg.latitude is not null)
          or coalesce(o.place_data->>'scope'='area',false) or coalesce(p.place_data->>'scope'='area',false))
        and (
          (o.place_data is not null and coalesce(places_private.location_matches(p,jsonb_build_object('id',o.location_id,'name',o.location_name,'place',o.place_data)),false))
          or (p.place_data is not null and coalesce(places_private.location_matches(o,jsonb_build_object('id',p.location_id,'name',p.location_name,'place',p.place_data)),false))
        )
      )
    else case
      when o.location_kind='country' and o.location_id='country:PL' then p.location_id like 'pl-%' or p.location_id='country:PL'
        or discovery_private.region_text(p.location_region) in('dolnoslaskie','kujawsko-pomorskie','lubelskie','lubuskie','lodzkie','malopolskie',
          'mazowieckie','opolskie','podkarpackie','podlaskie','pomorskie','slaskie','swietokrzyskie','warminsko-mazurskie','wielkopolskie','zachodniopomorskie')
      when o.location_kind='country' then o.location_id=p.location_id
      when coalesce(o.location_region,'')<>'' then discovery_private.region_text(o.location_region)=discovery_private.region_text(p.location_region)
      when o.location_kind='region' then discovery_private.region_text(o.location_name)=discovery_private.region_text(p.location_region) or o.location_id=p.location_id
      else o.location_id=p.location_id or messaging_private.search_text(o.location_name)=messaging_private.search_text(p.location_name) end end
  from places_private.trip_geometry(o) og cross join places_private.trip_geometry(p) pg;
$$;
revoke all on function notifications_private.proposal_matches(public.trip_plans,public.trip_plans) from public,anon,authenticated;

-- Include manual pin/address changes even when the destination ID stays the same.
drop trigger proposal_trip_changed on public.trip_plans;
create trigger proposal_trip_changed after insert or update of status,visibility,start_date,end_date,
  location_id,location_name,location_region,location_kind,mode,place_data
  on public.trip_plans for each row execute function notifications_private.queue_proposal_trip();

create index trip_plans_proposal_google_place on public.trip_plans((place_data->>'googlePlaceId'))
  where status='published' and visibility='public';

-- A place can acquire geometry after its publication, or recover after expiry.
-- Reconsider just its active trips; the existing seen-pair keys prevent replay.
create function notifications_private.queue_proposal_geometry() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if old.expires_at>now() and old.latitude=new.latitude and old.longitude=new.longitude and old.bounds is not distinct from new.bounds
      then return new;end if;
  end if;
  insert into notifications_private.proposal_jobs(trip_id)
    select t.id from public.trip_plans t where t.place_data->>'googlePlaceId'=new.place_id
      and t.status='published' and t.visibility='public' and t.end_date>current_date
    on conflict(trip_id) do update set queued_at=now();
  return new;
end $$;
revoke all on function notifications_private.queue_proposal_geometry() from public,anon,authenticated;
create trigger proposal_geometry_changed after insert or update on places_private.geometry
  for each row execute function notifications_private.queue_proposal_geometry();

-- No bulk requeue or reset of history, seen pairs, preferences or deliveries.
notify pgrst,'reload schema';
