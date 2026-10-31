-- Dev first. Retire profile-level companion preferences. Keep the legacy table
-- and RPC response shape so installed clients can still read/save their profile.
-- Explicit discovery filters and independently saved trip criteria are unchanged.
create function messaging_private.discard_legacy_group_preferences() returns trigger
language plpgsql set search_path='' as $$
begin
  new.group_kinds:='{}'; new.child_age_bands:='{}'; new.description:='';
  return new;
end $$;
revoke all on function messaging_private.discard_legacy_group_preferences() from public,anon,authenticated;
create trigger discard_legacy_group_preferences before insert or update on public.group_preferences
for each row execute function messaging_private.discard_legacy_group_preferences();
update public.group_preferences set group_kinds='{}',child_age_bands='{}',description=''
where group_kinds<>'{}' or child_age_bands<>'{}' or description<>'';

-- Arguments pa/pb remain for old contracts; their values never affect ranking.
create or replace function messaging_private.group_compatibility_values(a public.travel_groups,b public.travel_groups,pa public.group_preferences,pb public.group_preferences) returns jsonb
language plpgsql immutable set search_path='' as $$
declare points numeric:=0; weight integer:=35; reasons text[]:='{}'; common text[];
  age_requested boolean:=a.child_count>0 and b.child_count>0;
begin
  if a.kind=b.kind then points:=35; reasons:=array_append(reasons,'Podobny rodzaj ekipy'); end if;
  if age_requested and cardinality(a.child_age_bands)>0 and cardinality(b.child_age_bands)>0 then
    weight:=weight+30;
    if a.child_age_bands && b.child_age_bands then
      points:=points+30; reasons:=array_append(reasons,'Podobny wiek dzieci');
    end if;
  end if;
  if cardinality(a.interests)>0 and cardinality(b.interests)>0 then
    common:=array(select i from unnest(a.interests) i where i=any(b.interests) order by i collate "C");
    points:=points+25.0*2*cardinality(common)/(cardinality(a.interests)+cardinality(b.interests)); weight:=weight+25;
    reasons:=reasons||common[1:2];
  end if;
  if a.travel_mode is not null and b.travel_mode is not null then
    weight:=weight+10;
    if a.travel_mode=b.travel_mode then points:=points+10; reasons:=array_append(reasons,'Podobny sposób podróżowania'); end if;
  end if;
  return jsonb_build_object('score',case when weight>=60 then round(points/weight*100)::integer end,
    'reasons',to_jsonb(reasons),'evaluated_weight',weight,'limited_data',weight<case when age_requested then 100 else 70 end);
end $$;
create or replace function messaging_private.group_compatibility(a public.travel_groups,b public.travel_groups) returns jsonb
language sql stable security definer set search_path='' as $$
  select messaging_private.group_compatibility_values(a,b,null::public.group_preferences,null::public.group_preferences);
$$;

create or replace function discovery_private.matching_context(me uuid,f jsonb) returns discovery_private.match_context
language plpgsql stable set search_path='' as $$
declare result discovery_private.match_context; selected public.trip_plans;
begin
  select g into result.crew from public.travel_groups g where g.id=me;
  -- Retain the legacy composite shape without reading retired preferences.
  result.preferences:=row(me,'{}'::text[],'{}'::text[],'')::public.group_preferences;
  select t.* into selected from public.trip_plans t where t.id=(f->>'source_trip_id')::uuid and t.group_id=me
    and t.status='published' and t.visibility='public' and t.end_date>current_date;
  if selected.id is not null then result.trips:=array[selected];
  else select array_agg(t order by t.created_at desc,t.id) into result.trips from public.trip_plans t
    where t.group_id=me and t.status='published' and t.visibility='public' and t.end_date>current_date; end if;
  if result.trips is null then result.trips:=array[null::public.trip_plans]; end if;
  return result;
end $$;

create or replace function public.list_ranked_public_groups(filters jsonb default '{}'::jsonb,sort_mode text default 'compatibility',after_cursor jsonb default null,page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' set plan_cache_mode=force_custom_plan as $$
declare me uuid:=messaging_private.my_group_id(); viewer public.travel_groups; result jsonb;
  kinds text[]; ages text[]; modes text[]; hobbies text[]; animals text[];
  viewer_hobby_mask integer;
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
  viewer_hobby_mask:=discovery_private.tag_mask(viewer.interests,'interest');
  -- Carry only factual keys through candidates; project full rows for the page.
  -- Alphabetical
  -- reads never build compatibility JSON for the other candidates.
  with eligible as materialized (
    select g.id,messaging_private.search_text(g.name) as sort_name
    from public.travel_groups g join public.group_public_profiles p on p.group_id=g.id and p.discoverable
    where g.id<>me
      and g.id not in(select x.blocked_group_id from public.group_blocks x where x.blocker_group_id=me
        union all select x.blocker_group_id from public.group_blocks x where x.blocked_group_id=me)
      and g.owner_user_id not in(select s.user_id from moderation_private.suspended_accounts s)
      and (btrim(coalesce(filters->>'name',''))='' or messaging_private.group_search_matches(g,filters->>'name'))
      and (cardinality(kinds)=0 or g.kind=any(kinds)) and (cardinality(ages)=0 or g.child_age_bands && ages)
      and (cardinality(modes)=0 or g.travel_mode=any(modes)) and (cardinality(hobbies)=0 or g.interests && hobbies)
      and (cardinality(animals)=0 or g.animal_kinds && animals)
      and (not coalesce((filters->>'has_trips')::boolean,false) or messaging_private.public_trip_count(g.id)>0)
      and (not coalesce((filters->>'online_only')::boolean,false) or presence_private.group_is_online(g.id))
      and (not coalesce((filters->>'favorites_only')::boolean,false) or exists (
        select 1 from favorites_private.group_favorites f where f.owner_group_id=me and f.target_group_id=g.id
      ))
  ), terms as not materialized (
    select e.id,e.sort_name,
      true as kind_requested, viewer.kind=g.kind as kind_first, viewer.kind=g.kind as kind_second,
      viewer.child_count>0 and g.child_count>0 as age_requested,
      case when cardinality(viewer.child_age_bands)=0 or cardinality(g.child_age_bands)=0 then null
        else viewer.child_age_bands && g.child_age_bands end as age_first,
      case when cardinality(viewer.child_age_bands)=0 or cardinality(g.child_age_bands)=0 then null
        else viewer.child_age_bands && g.child_age_bands end as age_second,
      cardinality(viewer.interests)>0 and cardinality(g.interests)>0 as hobby_requested,
      cardinality(viewer.interests)+cardinality(g.interests) as hobby_total,
      bit_count((viewer_hobby_mask & discovery_private.tag_mask(g.interests,'interest'))::bit(32)) as hobby_common,
      viewer.travel_mode is not null and g.travel_mode is not null as mode_requested,
      viewer.travel_mode=g.travel_mode as same_mode
    from eligible e join public.travel_groups g on g.id=e.id
  ), weights as not materialized (
    select t.*,
      (case when kind_requested then 35 else 0 end)
        +(case when age_requested and age_first is not null and age_second is not null then 30 else 0 end)
        +(case when hobby_requested then 25 else 0 end)+(case when mode_requested then 10 else 0 end) as weight,
      (case when kind_requested then (kind_first::int+kind_second::int)*35.0/2 else 0 end)
        +(case when age_requested and age_first is not null and age_second is not null then (age_first::int+age_second::int)*30.0/2 else 0 end)
        +(case when hobby_requested then 25.0*2*hobby_common/hobby_total else 0 end)
        +(case when mode_requested and same_mode then 10 else 0 end) as points
    from terms t
  ), ordered as materialized (
    -- Keep only the exact numeric score through the full set. Reasons and
    -- limited-data flags are computed by the original scorer for the page.
    -- CASE avoids evaluating matching for the alphabetical list.
    select id,sort_name,case when sort_mode='compatibility' then
      case when weight>=60 then round(points/weight*100)::integer else -1 end else 0 end as sort_score from weights
  ), matched as materialized (
    select * from ordered where cursor_id is null or sort_score<cursor_score
      or sort_score=cursor_score and (sort_name,id)>(cursor_name,cursor_id)
    order by sort_score desc,sort_name,id limit page_size+1
  ), page as materialized (
    select * from matched order by sort_score desc,sort_name,id limit page_size
  ), projected as materialized (
    select p.*,g.name,details.about,
      messaging_private.group_compatibility_values(viewer,g,null::public.group_preferences,null::public.group_preferences) as matching,
      messaging_private.public_crew(g) as crew,messaging_private.public_trip_count(g.id) as active_trip_count
    from page p join public.travel_groups g on g.id=p.id
      join public.group_public_profiles details on details.group_id=p.id
  ) select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('crew',crew,'about',about,
      'active_trip_count',active_trip_count,'compatibility',matching) order by sort_score desc,sort_name,id) from projected),'[]'::jsonb),
    'total_count',(select count(*) from eligible),
    'has_more',(select count(*)>page_size from matched),
    'cursor',(select jsonb_build_object('name',name,'id',id,'score',matching->'score','sort',sort_mode)
      from projected order by sort_score,sort_name desc,id desc limit 1)) into result;
  return result;
end $$;

create or replace function public.list_ranked_public_groups_v2(filters jsonb default '{}'::jsonb,sort_mode text default 'compatibility',after_cursor jsonb default null,page_size integer default 5)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); result jsonb; old_cursor jsonb; query_key text;
begin
  query_key:=md5('recommendations:2:profile-facts:'||me::text||filters::text||sort_mode||
    coalesce((select to_jsonb(g)::text from public.travel_groups g where g.id=me),''));
  if after_cursor is not null then
    if after_cursor->>'version' is distinct from '2' or after_cursor->>'query_key' is distinct from query_key then raise exception 'Invalid cursor' using errcode='22023'; end if;
    old_cursor:=after_cursor-'version'-'query_key';
  end if;
  result:=discovery_private.recommend_group_page(public.list_ranked_public_groups(filters,sort_mode,old_cursor,page_size),me);
  if result->'cursor'<>'null'::jsonb then result:=jsonb_set(result,'{cursor}',result->'cursor'||jsonb_build_object('version',2,'query_key',query_key)); end if;
  return result;
end $$;

notify pgrst,'reload schema';
