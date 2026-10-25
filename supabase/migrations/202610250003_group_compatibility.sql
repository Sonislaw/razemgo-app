-- Private preferences are evaluated inside the DB; only a bounded summary leaves it.
create function messaging_private.group_compatibility(a public.travel_groups,b public.travel_groups) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare pa public.group_preferences; pb public.group_preferences;
  ak text[]; bk text[]; aa text[]; ba text[]; common text[];
  first boolean; second boolean; age_requested boolean;
  points numeric:=0; weight integer:=0; reasons text[]:='{}';
begin
  select * into pa from public.group_preferences where group_id=a.id;
  select * into pb from public.group_preferences where group_id=b.id;
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
revoke all on function messaging_private.group_compatibility(public.travel_groups,public.travel_groups) from public,anon,authenticated;

-- A separate endpoint keeps the previous alphabetical API compatible with older clients.
create function public.list_ranked_public_groups(filters jsonb default '{}'::jsonb,sort_mode text default 'compatibility',after_cursor jsonb default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); viewer public.travel_groups; result jsonb;
  kinds text[]; ages text[]; modes text[]; hobbies text[]; animals text[];
  cursor_name text; cursor_id uuid; cursor_score integer;
begin
  if me is null then raise exception 'Profile required' using errcode='42501'; end if;
  if sort_mode is null or sort_mode not in('compatibility','alphabetical') or jsonb_typeof(filters) is distinct from 'object'
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
    or (filters ? 'has_trips' and jsonb_typeof(filters->'has_trips')<>'boolean') then raise exception 'Invalid filters' using errcode='22023'; end if;
  select * into viewer from public.travel_groups where id=me;
  with eligible as materialized (
    select g.id,g.name,messaging_private.search_text(g.name) as sort_name,messaging_private.public_crew(g) as crew,
      p.about,messaging_private.public_trip_count(g.id) as active_trip_count,messaging_private.group_compatibility(viewer,g) as compatibility
    from public.travel_groups g join public.group_public_profiles p on p.group_id=g.id and p.discoverable
    where g.id<>me and not messaging_private.pair_blocked(me,g.id)
      and position(messaging_private.search_text(btrim(coalesce(filters->>'name',''))) in messaging_private.search_text(g.name))>0
      and (cardinality(kinds)=0 or g.kind=any(kinds)) and (cardinality(ages)=0 or g.child_age_bands && ages)
      and (cardinality(modes)=0 or g.travel_mode=any(modes)) and (cardinality(hobbies)=0 or g.interests && hobbies)
      and (cardinality(animals)=0 or g.animal_kinds && animals)
      and (not coalesce((filters->>'has_trips')::boolean,false) or messaging_private.public_trip_count(g.id)>0)
  ), ranked as (
    select e.*,case when sort_mode='compatibility' then coalesce((e.compatibility->>'score')::integer,-1) else 0 end as sort_score from eligible e
  ), matched as (
    select * from ranked where cursor_id is null or sort_score<cursor_score
      or sort_score=cursor_score and (sort_name,id)>(cursor_name,cursor_id)
    order by sort_score desc,sort_name,id limit 21
  ), page as (select * from matched order by sort_score desc,sort_name,id limit 20)
  select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('crew',crew,'about',about,
      'active_trip_count',active_trip_count,'compatibility',compatibility) order by sort_score desc,sort_name,id) from page),'[]'::jsonb),
    'has_more',(select count(*)>20 from matched),
    'cursor',(select jsonb_build_object('name',name,'id',id,'score',compatibility->'score','sort',sort_mode)
      from page order by sort_score,sort_name desc,id desc limit 1)) into result;
  return result;
end $$;
revoke all on function public.list_ranked_public_groups(jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.list_ranked_public_groups(jsonb,text,jsonb) to authenticated;

create or replace function public.get_public_group(target_group_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); target public.travel_groups; viewer public.travel_groups; details public.group_public_profiles;
begin
  if me is null then raise exception 'Profile required' using errcode='42501'; end if;
  select * into target from public.travel_groups g where g.id=target_group_id;
  if not found or target.id=me or messaging_private.pair_blocked(me,target.id) then return null; end if;
  select * into details from public.group_public_profiles where group_id=target.id;
  if not coalesce(details.discoverable,false) and messaging_private.public_trip_count(target.id)=0
    and not exists(select 1 from public.contact_invitations i where me in(i.sender_group_id,i.recipient_group_id)
      and target.id in(i.sender_group_id,i.recipient_group_id) and i.status in('pending','accepted')) then return null; end if;
  select * into viewer from public.travel_groups where id=me;
  return jsonb_build_object('crew',messaging_private.public_crew(target),'about',coalesce(details.about,''),
    'active_trip_count',messaging_private.public_trip_count(target.id),'compatibility',messaging_private.group_compatibility(viewer,target),
    'trips',coalesce((select jsonb_agg(to_jsonb(t)) from public.list_public_trips() t where t.crew->>'id'=target.id::text),'[]'::jsonb));
end $$;

notify pgrst,'reload schema';
