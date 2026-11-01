-- Proposal notifications follow dates and destination only. Legacy companion
-- preference columns stay intact for old contracts, but cannot exclude matches.
create or replace function notifications_private.proposal_matches(o public.trip_plans,p public.trip_plans) returns boolean
language sql stable security definer set search_path='' as $$
  select o.group_id<>p.group_id and o.status='published' and o.visibility='public' and o.end_date>current_date
    and p.status='published' and p.visibility='public' and p.end_date>current_date
    and greatest(o.start_date,p.start_date)<least(o.end_date,p.end_date)
    and favorites_private.can_view_trip(o.group_id,p.id) and favorites_private.can_view_trip(p.group_id,o.id)
    and case
      when o.location_kind='country' and o.location_id='country:PL' then p.location_id like 'pl-%' or p.location_id='country:PL'
        or discovery_private.region_text(p.location_region) in('dolnoslaskie','kujawsko-pomorskie','lubelskie','lubuskie','lodzkie','malopolskie',
          'mazowieckie','opolskie','podkarpackie','podlaskie','pomorskie','slaskie','swietokrzyskie','warminsko-mazurskie','wielkopolskie','zachodniopomorskie')
      when o.location_kind='country' then o.location_id=p.location_id
      when coalesce(o.location_region,'')<>'' then discovery_private.region_text(o.location_region)=discovery_private.region_text(p.location_region)
      when o.location_kind='region' then discovery_private.region_text(o.location_name)=discovery_private.region_text(p.location_region) or o.location_id=p.location_id
      else o.location_id=p.location_id or messaging_private.search_text(o.location_name)=messaging_private.search_text(p.location_name) end;
$$;
revoke all on function notifications_private.proposal_matches(public.trip_plans,public.trip_plans) from public,anon,authenticated;

-- Changing crew demographics or retired preference fields no longer changes
-- proposal eligibility. Keep publication/date/place events as queue inputs.
drop trigger proposal_crew_changed on public.travel_groups;
drop function notifications_private.queue_proposal_crew();
drop trigger proposal_trip_changed on public.trip_plans;
create trigger proposal_trip_changed after insert or update of status,visibility,start_date,end_date,
  location_id,location_name,location_region,location_kind
  on public.trip_plans for each row execute function notifications_private.queue_proposal_trip();

-- Preserve existing trip data, notifications, seen pairs, pending jobs and push
-- delivery states. The normal worker applies the new rule without history replay.
notify pgrst,'reload schema';
