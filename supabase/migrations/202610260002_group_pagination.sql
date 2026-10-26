-- Bounded profile pages; legacy callers keep their 20-row default.
-- Replacing the old signature avoids ambiguous RPC overloads with default arguments.
drop function public.list_ranked_public_groups(jsonb,text,jsonb);

create function public.list_ranked_public_groups(filters jsonb default '{}'::jsonb,sort_mode text default 'compatibility',after_cursor jsonb default null,page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); viewer public.travel_groups; result jsonb;
  kinds text[]; ages text[]; modes text[]; hobbies text[]; animals text[];
  cursor_name text; cursor_id uuid; cursor_score integer;
begin
  if me is null then raise exception 'Profile required' using errcode='42501'; end if;
  if page_size is null or page_size<1 or page_size>20 or sort_mode is null or sort_mode not in('compatibility','alphabetical') or jsonb_typeof(filters) is distinct from 'object'
    or char_length(coalesce(filters->>'name',''))>80 then raise exception 'Invalid filters' using errcode='22023'; end if;
  if after_cursor is not null then
    if jsonb_typeof(after_cursor) is distinct from 'object' or not after_cursor ?& array['name','id','score','sort']
      or jsonb_typeof(after_cursor->'name') is distinct from 'string' or char_length(after_cursor->>'name')>40
      or after_cursor->>'sort' is distinct from sort_mode
      or coalesce(after_cursor->>'id','') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      or jsonb_typeof(after_cursor->'score') not in('null','number') then raise exception 'Invalid cursor' using errcode='22023'; end if;
    if jsonb_typeof(after_cursor->'score')='number' and after_cursor->>'score' !~ '^(100|[1-9]?[0-9])$' then
      raise exception 'Invalid cursor score' using errcode='22023'; end if;
    cursor_name:=messaging_private.search_text(after_cursor->>'name'); cursor_id:=(after_cursor->>'id')::uuid;
    cursor_score:=case when sort_mode='compatibility' then coalesce((after_cursor->>'score')::integer,-1) else 0 end;
  end if;
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
    or (filters ? 'has_trips' and jsonb_typeof(filters->'has_trips')<>'boolean')
    or (filters ? 'online_only' and jsonb_typeof(filters->'online_only')<>'boolean')
    or (filters ? 'favorites_only' and jsonb_typeof(filters->'favorites_only')<>'boolean') then raise exception 'Invalid filters' using errcode='22023'; end if;
  if coalesce((filters->>'online_only')::boolean,false) and not exists (
    select 1 from auth.sessions s where s.id=nullif(auth.jwt()->>'session_id','')::uuid
      and s.user_id=auth.uid() and (s.not_after is null or s.not_after>now())
  ) then raise exception 'Active session required' using errcode='42501'; end if;
  if coalesce((filters->>'favorites_only')::boolean,false) then perform favorites_private.my_group_id(); end if;

  select * into viewer from public.travel_groups where id=me;
  with eligible as materialized (
    select g.id,g.name,messaging_private.search_text(g.name) as sort_name,messaging_private.public_crew(g) as crew,
      p.about,messaging_private.public_trip_count(g.id) as active_trip_count,messaging_private.group_compatibility(viewer,g) as compatibility
    from public.travel_groups g join public.group_public_profiles p on p.group_id=g.id and p.discoverable
    where g.id<>me and not messaging_private.pair_blocked(me,g.id)
      and messaging_private.group_search_matches(g,filters->>'name')
      and (cardinality(kinds)=0 or g.kind=any(kinds)) and (cardinality(ages)=0 or g.child_age_bands && ages)
      and (cardinality(modes)=0 or g.travel_mode=any(modes)) and (cardinality(hobbies)=0 or g.interests && hobbies)
      and (cardinality(animals)=0 or g.animal_kinds && animals)
      and (not coalesce((filters->>'has_trips')::boolean,false) or messaging_private.public_trip_count(g.id)>0)
      and (not coalesce((filters->>'online_only')::boolean,false) or presence_private.group_is_online(g.id))
      and (not coalesce((filters->>'favorites_only')::boolean,false) or exists (
        select 1 from favorites_private.group_favorites f where f.owner_group_id=me and f.target_group_id=g.id
      ))
  ), ranked as (
    select e.*,case when sort_mode='compatibility' then coalesce((e.compatibility->>'score')::integer,-1) else 0 end as sort_score from eligible e
  ), matched as (
    select * from ranked where cursor_id is null or sort_score<cursor_score
      or sort_score=cursor_score and (sort_name,id)>(cursor_name,cursor_id)
    order by sort_score desc,sort_name,id limit page_size+1
  ), page as (select * from matched order by sort_score desc,sort_name,id limit page_size)
  select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('crew',crew,'about',about,
      'active_trip_count',active_trip_count,'compatibility',compatibility) order by sort_score desc,sort_name,id) from page),'[]'::jsonb),
    'total_count',(select count(*) from eligible),
    'has_more',(select count(*)>page_size from matched),
    'cursor',(select jsonb_build_object('name',name,'id',id,'score',compatibility->'score','sort',sort_mode)
      from page order by sort_score,sort_name desc,id desc limit 1)) into result;
  return result;
end $$;

revoke all on function public.list_ranked_public_groups(jsonb,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.list_ranked_public_groups(jsonb,text,jsonb,integer) to authenticated;
notify pgrst,'reload schema';

