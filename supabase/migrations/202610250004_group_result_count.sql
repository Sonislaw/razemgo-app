-- Count the whole eligible directory, without pagination or private profile data.
create function public.count_public_groups(filters jsonb default '{}'::jsonb) returns integer
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); result integer;
  kinds text[]; ages text[]; modes text[]; hobbies text[]; animals text[];
begin
  if me is null then raise exception 'Profile required' using errcode='42501'; end if;
  if jsonb_typeof(filters) is distinct from 'object' or char_length(coalesce(filters->>'name',''))>80 then
    raise exception 'Invalid filters' using errcode='22023'; end if;
  kinds:=array(select jsonb_array_elements_text(coalesce(filters->'group_kinds','[]')));
  ages:=array(select jsonb_array_elements_text(coalesce(filters->'child_age_bands','[]')));
  modes:=array(select jsonb_array_elements_text(coalesce(filters->'travel_modes','[]')));
  hobbies:=array(select jsonb_array_elements_text(coalesce(filters->'interests','[]')));
  animals:=array(select jsonb_array_elements_text(coalesce(filters->'animal_kinds','[]')));
  if not public.profile_array_valid(kinds,array['family','couple','solo','friends'],4)
    or not public.profile_array_valid(ages,array['0–3','4–6','7–9','10–12','13–17'],5)
    or not public.profile_array_valid(modes,array['Przyczepa','Kamper','Namiot','Van','Samochód'],5)
    or not public.profile_array_valid(hobbies,array['Rowery','Spokojny wypoczynek','Ognisko','Plaża','Przyroda','Wędrówki','Kajaki','Fotografia','Gry planszowe','Zwiedzanie'],10)
    or not public.profile_array_valid(animals,array['dog','cat'],2)
    or (filters ? 'has_trips' and jsonb_typeof(filters->'has_trips')<>'boolean') then
    raise exception 'Invalid filters' using errcode='22023'; end if;
  select count(*)::integer into result
  from public.travel_groups g join public.group_public_profiles p on p.group_id=g.id and p.discoverable
  where g.id<>me and not messaging_private.pair_blocked(me,g.id)
    and position(messaging_private.search_text(btrim(coalesce(filters->>'name',''))) in messaging_private.search_text(g.name))>0
    and (cardinality(kinds)=0 or g.kind=any(kinds)) and (cardinality(ages)=0 or g.child_age_bands && ages)
    and (cardinality(modes)=0 or g.travel_mode=any(modes)) and (cardinality(hobbies)=0 or g.interests && hobbies)
    and (cardinality(animals)=0 or g.animal_kinds && animals)
    and (not coalesce((filters->>'has_trips')::boolean,false) or messaging_private.public_trip_count(g.id)>0);
  return result;
end $$;
revoke all on function public.count_public_groups(jsonb) from public,anon,authenticated;
grant execute on function public.count_public_groups(jsonb) to authenticated;

notify pgrst,'reload schema';
