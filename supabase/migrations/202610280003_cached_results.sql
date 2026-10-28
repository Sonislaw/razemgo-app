-- Refresh known visible rows in one bounded request instead of rerunning every
-- previously loaded search page. Every item is authorized again on the server.
create function public.refresh_public_trip_results(trip_ids uuid[],filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); f jsonb:=discovery_private.validate_filters(filters); ctx discovery_private.match_context;
begin
  if trip_ids is null or cardinality(trip_ids)>100 then raise exception 'Invalid ids' using errcode='22023'; end if;
  ctx:=discovery_private.matching_context(me,f);
  return coalesce((select jsonb_agg(jsonb_build_object('trip',p.trip,'crew',p.crew,'compatibility',discovery_private.score(t,g,ctx,f)))
    from discovery_private.candidates(f,me) t join public.travel_groups g on g.id=t.group_id
    cross join lateral public.list_public_trips(t.id) p where t.id=any(trip_ids)),'[]');
end $$;

create function public.refresh_public_group_results(group_ids uuid[],filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); viewer public.travel_groups; preferences public.group_preferences;
  kinds text[]; ages text[]; modes text[]; hobbies text[]; animals text[];
begin
  if group_ids is null or cardinality(group_ids)>100 or jsonb_typeof(filters) is distinct from 'object'
    or char_length(coalesce(filters->>'name',''))>80 then raise exception 'Invalid ids or filters' using errcode='22023'; end if;
  kinds:=array(select jsonb_array_elements_text(coalesce(filters->'group_kinds','[]')));
  ages:=array(select jsonb_array_elements_text(coalesce(filters->'child_age_bands','[]')));
  modes:=array(select jsonb_array_elements_text(coalesce(filters->'travel_modes','[]')));
  hobbies:=array(select jsonb_array_elements_text(coalesce(filters->'interests','[]')));
  animals:=array(select jsonb_array_elements_text(coalesce(filters->'animal_kinds','[]')));
  if not public.profile_array_valid(kinds,array['family','couple','solo','friends'],4)
    or not public.profile_array_valid(ages,array['0–3','4–6','7–9','10–12','13–17'],5)
    or not public.profile_array_valid(modes,array['Przyczepa','Kamper','Namiot','Van','Samochód'],5)
    or not public.profile_array_valid(hobbies,array['Rowery','Spokojny wypoczynek','Ognisko','Plaża','Przyroda','Wędrówki','Kajaki','Fotografia','Gry planszowe','Zwiedzanie'],10)
    or not public.profile_array_valid(animals,array['dog','cat'],2) then raise exception 'Invalid filters' using errcode='22023'; end if;
  select * into viewer from public.travel_groups where id=me;
  select * into preferences from public.group_preferences where group_id=me;
  return coalesce((select jsonb_agg(jsonb_build_object('crew',messaging_private.public_crew(g),'about',p.about,
      'active_trip_count',messaging_private.public_trip_count(g.id),
      'compatibility',messaging_private.group_compatibility_values(viewer,g,preferences,gp)))
    from public.travel_groups g join public.group_public_profiles p on p.group_id=g.id and p.discoverable
      left join public.group_preferences gp on gp.group_id=g.id
    where g.id=any(group_ids) and g.id<>me and not messaging_private.pair_blocked(me,g.id)
      and messaging_private.group_search_matches(g,filters->>'name')
      and (cardinality(kinds)=0 or g.kind=any(kinds)) and (cardinality(ages)=0 or g.child_age_bands && ages)
      and (cardinality(modes)=0 or g.travel_mode=any(modes)) and (cardinality(hobbies)=0 or g.interests && hobbies)
      and (cardinality(animals)=0 or g.animal_kinds && animals)
      and (not coalesce((filters->>'has_trips')::boolean,false) or messaging_private.public_trip_count(g.id)>0)
      and (not coalesce((filters->>'online_only')::boolean,false) or presence_private.group_is_online(g.id))
      and (not coalesce((filters->>'favorites_only')::boolean,false) or exists(select 1 from favorites_private.group_favorites f where f.owner_group_id=me and f.target_group_id=g.id))),'[]');
end $$;

revoke all on function public.refresh_public_trip_results(uuid[],jsonb),public.refresh_public_group_results(uuid[],jsonb) from public,anon,authenticated;
grant execute on function public.refresh_public_trip_results(uuid[],jsonb),public.refresh_public_group_results(uuid[],jsonb) to authenticated;
notify pgrst,'reload schema';
