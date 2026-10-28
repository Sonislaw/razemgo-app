-- Technical hardening, Dev first. Existing signatures and access decisions are retained.
-- One of these identical indexes is sufficient for old and current RPCs.
drop index if exists public.trip_discovery_recent;

-- Private preferences are evaluated inside the DB; only a bounded summary leaves it.
create function messaging_private.group_compatibility_values(a public.travel_groups,b public.travel_groups,pa public.group_preferences,pb public.group_preferences) returns jsonb
language plpgsql immutable set search_path='' as $$
declare ak text[]; bk text[]; aa text[]; ba text[]; common text[];
  first boolean; second boolean; age_requested boolean;
  points numeric:=0; weight integer:=0; reasons text[]:='{}';
begin
  ak:=coalesce(pa.group_kinds,'{}'); bk:=coalesce(pb.group_kinds,'{}');
  aa:=coalesce(pa.child_age_bands,'{}'); ba:=coalesce(pb.child_age_bands,'{}');
  if cardinality(ak)>0 or cardinality(bk)>0 then
    first:=cardinality(ak)=0 or b.kind=any(ak); second:=cardinality(bk)=0 or a.kind=any(bk);
    points:=points+(first::integer+second::integer)*35.0/2; weight:=weight+35;
    if first and second then reasons:=array_append(reasons,'Pasujący rodzaj ekipy'); end if;
  end if;
  age_requested:=cardinality(aa)>0 or cardinality(ba)>0;
  if age_requested then
    first:=case when cardinality(aa)=0 then true when b.child_count=0 then false
      when cardinality(b.child_age_bands)=0 then null else aa && b.child_age_bands end;
    second:=case when cardinality(ba)=0 then true when a.child_count=0 then false
      when cardinality(a.child_age_bands)=0 then null else ba && a.child_age_bands end;
    if first is not null and second is not null then
      points:=points+(first::integer+second::integer)*30.0/2; weight:=weight+30;
      if first and second then reasons:=array_append(reasons,'Pasujący wiek dzieci'); end if;
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
revoke all on function messaging_private.group_compatibility_values(public.travel_groups,public.travel_groups,public.group_preferences,public.group_preferences) from public,anon,authenticated;

create or replace function messaging_private.group_compatibility(a public.travel_groups,b public.travel_groups) returns jsonb
language sql stable security definer set search_path='' as $$
  select messaging_private.group_compatibility_values(a,b,pa,pb)
  from (select 1) seed left join public.group_preferences pa on pa.group_id=a.id
  left join public.group_preferences pb on pb.group_id=b.id;
$$;

create or replace function public.list_ranked_public_groups(filters jsonb default '{}'::jsonb,sort_mode text default 'compatibility',after_cursor jsonb default null,page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); viewer public.travel_groups; viewer_preferences public.group_preferences; result jsonb;
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
  select * into viewer_preferences from public.group_preferences where group_id=me;
  with eligible as materialized (
    select g,p.about,gp as preferences,messaging_private.search_text(g.name) as sort_name
    from public.travel_groups g join public.group_public_profiles p on p.group_id=g.id and p.discoverable
      left join public.group_preferences gp on gp.group_id=g.id
    where g.id<>me
      and not exists(select 1 from public.group_blocks x where (x.blocker_group_id=me and x.blocked_group_id=g.id) or (x.blocker_group_id=g.id and x.blocked_group_id=me))
      and not exists(select 1 from moderation_private.suspended_accounts s where s.user_id=g.owner_user_id)
      and messaging_private.group_search_matches(g,filters->>'name')
      and (cardinality(kinds)=0 or g.kind=any(kinds)) and (cardinality(ages)=0 or g.child_age_bands && ages)
      and (cardinality(modes)=0 or g.travel_mode=any(modes)) and (cardinality(hobbies)=0 or g.interests && hobbies)
      and (cardinality(animals)=0 or g.animal_kinds && animals)
      and (not coalesce((filters->>'has_trips')::boolean,false) or messaging_private.public_trip_count(g.id)>0)
      and (not coalesce((filters->>'online_only')::boolean,false) or presence_private.group_is_online(g.id))
      and (not coalesce((filters->>'favorites_only')::boolean,false) or exists (
        select 1 from favorites_private.group_favorites f where f.owner_group_id=me and f.target_group_id=g.id
      ))
  ), ranked as materialized (
    select e.*,case when sort_mode='compatibility' then messaging_private.group_compatibility_values(viewer,e.g,viewer_preferences,e.preferences) end as compatibility
    from eligible e
  ), ordered as (
    select r.*,case when sort_mode='compatibility' then coalesce((r.compatibility->>'score')::integer,-1) else 0 end as sort_score from ranked r
  ), matched as materialized (
    select * from ordered where cursor_id is null or sort_score<cursor_score
      or sort_score=cursor_score and (sort_name,(g).id)>(cursor_name,cursor_id)
    order by sort_score desc,sort_name,(g).id limit page_size+1
  ), page as materialized (
    select * from matched order by sort_score desc,sort_name,(g).id limit page_size
  ), projected as (
    select p.*,coalesce(p.compatibility,messaging_private.group_compatibility_values(viewer,p.g,viewer_preferences,p.preferences)) as matching,
      messaging_private.public_crew(p.g) as crew,messaging_private.public_trip_count((p.g).id) as active_trip_count from page p
  ) select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('crew',crew,'about',about,
      'active_trip_count',active_trip_count,'compatibility',matching) order by sort_score desc,sort_name,(g).id) from projected),'[]'::jsonb),
    'total_count',(select count(*) from eligible),
    'has_more',(select count(*)>page_size from matched),
    'cursor',(select jsonb_build_object('name',(g).name,'id',(g).id,'score',matching->'score','sort',sort_mode)
      from projected order by sort_score,sort_name desc,(g).id desc limit 1)) into result;
  return result;
end $$;

notify pgrst,'reload schema';
