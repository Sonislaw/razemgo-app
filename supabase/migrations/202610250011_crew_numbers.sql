-- Public crew numbers identify a profile without imposing unique display names.
-- Identity assigns existing rows and future profiles; numbers are never recycled.
alter table public.travel_groups add column crew_number integer generated always as identity (start with 100000) unique;
alter table public.travel_groups add constraint crew_number_range check(crew_number>=100000);
revoke all on sequence public.travel_groups_crew_number_seq from public,anon,authenticated;

-- The original profile RPC uses invoker rights and explicit writable columns.
-- Excluding crew_number also rejects INSERT ... OVERRIDING SYSTEM VALUE by a client.
revoke insert,update on public.travel_groups from authenticated;
grant insert(id,owner_user_id,name,avatar_id,kind,adult_count,child_count,child_age_bands,travel_mode,interests,animal_kinds,created_at,updated_at),
  update(id,owner_user_id,name,avatar_id,kind,adult_count,child_count,child_age_bands,travel_mode,interests,animal_kinds,created_at,updated_at)
  on public.travel_groups to authenticated;

create function public.guard_crew_number() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.crew_number is distinct from old.crew_number then raise exception 'Crew number cannot be changed' using errcode='42501'; end if;
  return new;
end $$;
revoke all on function public.guard_crew_number() from public,anon,authenticated;
create trigger crew_number_immutable before update on public.travel_groups
  for each row execute function public.guard_crew_number();

-- Numeric queries are exact identifiers; ordinary name searches keep accent normalization.
create function messaging_private.group_search_matches(g public.travel_groups,query text) returns boolean
language sql immutable set search_path='' as $$
  select case when btrim(coalesce(query,'')) ~ '^#?[[:space:]]*[0-9]+$'
    then g.crew_number::text=ltrim(regexp_replace(btrim(query),'^#?[[:space:]]*',''),'0')
    when left(btrim(coalesce(query,'')),1)='#' then false
    else position(messaging_private.search_text(btrim(coalesce(query,''))) in messaging_private.search_text(g.name))>0 end;
$$;
revoke all on function messaging_private.group_search_matches(public.travel_groups,text) from public,anon,authenticated;

create or replace function messaging_private.public_crew(g public.travel_groups) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object('id',g.id,'crew_number',g.crew_number,'name',g.name,'avatar_id',g.avatar_id,'kind',g.kind,
    'adult_count',g.adult_count,'child_count',g.child_count,'child_age_bands',g.child_age_bands,
    'travel_mode',g.travel_mode,'interests',g.interests,'animal_kinds',g.animal_kinds);
$$;

create or replace function public.get_my_mailbox() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); result jsonb;
begin
  if me is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select jsonb_build_object(
    'invitations',coalesce((select jsonb_agg(to_jsonb(i)-'request_key' order by i.created_at desc,i.id)
      from public.contact_invitations i where me in(i.sender_group_id,i.recipient_group_id)),'[]'::jsonb),
    'conversations',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'invitation_id',c.invitation_id,'sender_group_id',c.sender_group_id,'recipient_group_id',c.recipient_group_id,
      'updated_at',c.updated_at,'blocked',messaging_private.pair_blocked(c.sender_group_id,c.recipient_group_id),
      'self_read_sequence',coalesce((select r.last_read_sequence from public.conversation_reads r where r.conversation_id=c.id and r.group_id=me),0),
      'other_read_sequence',coalesce((select r.last_read_sequence from public.conversation_reads r where r.conversation_id=c.id and r.group_id<>me),0),
      'unread_count',(select count(*) from public.chat_messages m where m.conversation_id=c.id and m.sender_group_id<>me
        and m.sequence>coalesce((select r.last_read_sequence from public.conversation_reads r where r.conversation_id=c.id and r.group_id=me),0)),
      'last_message',(select to_jsonb(m) from public.chat_messages m where m.conversation_id=c.id order by m.sequence desc limit 1)
    ) order by c.updated_at desc,c.id) from public.conversations c where me in(c.sender_group_id,c.recipient_group_id)),'[]'::jsonb),
    'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'crew_number',g.crew_number,'name',g.name,'avatar_id',g.avatar_id,'adult_count',g.adult_count))
      from public.travel_groups g where g.id<>me and (
        exists(select 1 from public.contact_invitations i where me in(i.sender_group_id,i.recipient_group_id) and g.id in(i.sender_group_id,i.recipient_group_id))
        or exists(select 1 from public.group_blocks b where b.blocker_group_id=me and b.blocked_group_id=g.id))),'[]'::jsonb),
    'blocked_group_ids',coalesce((select jsonb_agg(b.blocked_group_id) from public.group_blocks b where b.blocker_group_id=me),'[]'::jsonb),
    'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'group_id',r.reported_group_id,'conversation_id',r.conversation_id,'reason',r.reason))
      from public.account_reports r where r.reporter_group_id=me),'[]'::jsonb)
  ) into result;
  return result;
end $$;

create or replace function public.list_public_trips(requested_trip_id uuid default null)
returns table(trip jsonb,crew jsonb) language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',t.id,'group_id',t.group_id,'mode',t.mode,'status',t.status,'visibility',t.visibility,
    'start_date',t.start_date,'end_date',t.end_date,'location_id',t.location_id,'location_name',t.location_name,'location_region',t.location_region,
    'location_kind',t.location_kind,'campground_name',t.campground_name,'campground_address',t.campground_address,'travel_mode',t.travel_mode,
    'description',t.description,'landscape',t.landscape,'interests',t.interests,'animal_kinds',t.animal_kinds,
    'matching_group_kinds',t.matching_group_kinds,'matching_child_age_bands',t.matching_child_age_bands,'published_at',t.published_at),
    jsonb_build_object('id',g.id,'crew_number',g.crew_number,'name',g.name,'avatar_id',g.avatar_id,'kind',g.kind,'adult_count',g.adult_count,'child_count',g.child_count,
      'child_age_bands',g.child_age_bands,'travel_mode',g.travel_mode,'interests',g.interests,'animal_kinds',g.animal_kinds)
  from public.trip_plans t join public.travel_groups g on g.id=t.group_id
  where messaging_private.my_group_id() is not null and g.owner_user_id<>auth.uid()
    and not messaging_private.pair_blocked(messaging_private.my_group_id(),g.id)
    and not exists(select 1 from moderation_private.hidden_trips h where h.trip_id=t.id)
    and t.status='published' and t.visibility='public' and t.end_date>current_date
    and (requested_trip_id is null or t.id=requested_trip_id) order by t.published_at desc,t.id;
$$;

create or replace function public.get_my_trip_reactors(target_trip_id uuid,after_at timestamptz default null,after_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); result jsonb;
begin
  if target_trip_id is null or (after_at is null)<>(after_id is null) then raise exception 'Invalid cursor' using errcode='22023'; end if;
  if not exists(select 1 from public.trip_plans t where t.id=target_trip_id and t.group_id=me)
    then raise exception 'Trip unavailable' using errcode='P0002'; end if;
  with page as (
    select r.* from reactions_private.trip_reactions r where r.trip_id=target_trip_id and r.kind is not null
      and not messaging_private.pair_blocked(me,r.actor_group_id)
      and (after_at is null or (r.updated_at,r.id)<(after_at,after_id))
      order by r.updated_at desc,r.id desc limit 31
  ), entries as (
    select r.id,r.actor_group_id as group_id,g.name,g.avatar_id,g.crew_number,r.kind,r.updated_at,
      favorites_private.can_view_group(me,g.id) as profile_available
      from page r join public.travel_groups g on g.id=r.actor_group_id order by r.updated_at desc,r.id desc limit 30
  ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(e) order by e.updated_at desc,e.id desc) from entries e),'[]'::jsonb),
    'has_more',(select count(*)>30 from page)) into result;
  return result;
end $$;

create or replace function public.get_my_notifications(before_at timestamptz default null,before_id uuid default null,
  page_size integer default 30,only_unread boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); result jsonb; take integer:=greatest(1,least(coalesce(page_size,30),50));
begin
  if me is null then raise exception 'Profile required' using errcode='42501'; end if;
  if (before_at is null)<>(before_id is null) then raise exception 'Invalid cursor' using errcode='22023'; end if;
  if before_at is null then perform notifications_private.refresh_proposals(me); end if;
  with page as (
    select n.* from public.notifications n where n.recipient_group_id=me
      and not messaging_private.pair_blocked(me,n.actor_group_id)
      and (not coalesce(only_unread,false) or n.read_at is null)
      and (before_at is null or (n.created_at,n.id)<(before_at,before_id))
      order by n.created_at desc,n.id desc limit take+1
  ), entries as (
    select n.id,n.kind,n.created_at,n.read_at,n.actor_group_id,g.name as actor_name,g.avatar_id as actor_avatar_id,g.crew_number as actor_crew_number,
      n.trip_label,n.own_trip_id,n.proposed_trip_id,n.invitation_id,n.reaction_kind,
      case when n.kind='trip_reaction' then exists(select 1 from reactions_private.trip_reactions r where r.id=n.source_id and r.kind is not null)
        else true end as reaction_active,
      coalesce(n.conversation_id,(select c.id from public.conversations c where c.invitation_id=n.invitation_id)) as conversation_id,
      case when n.kind='trip_reaction' then exists(select 1 from reactions_private.trip_reactions r join public.trip_plans t on t.id=r.trip_id
        where r.id=n.source_id and r.kind is not null and t.group_id=me)
      when n.kind='favorite_trip' then favorites_private.can_view_trip(me,n.proposed_trip_id)
      when n.kind='proposal' then exists(select 1 from public.trip_plans p join public.trip_plans o on o.id=n.own_trip_id
        where p.id=n.proposed_trip_id and p.status='published' and p.visibility='public' and p.end_date>current_date
          and o.group_id=me and o.status='published' and o.visibility='public' and o.end_date>current_date)
      when n.kind='invitation_received' then n.invitation_id is not null
      else n.conversation_id is not null end as available
      from page n join public.travel_groups g on g.id=n.actor_group_id
      order by n.created_at desc,n.id desc limit take
  ) select jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id desc) from entries e),'[]'::jsonb),
    'has_more',(select count(*)>take from page),
    'unread_count',(select count(*) from public.notifications n where n.recipient_group_id=me and n.read_at is null
      and not messaging_private.pair_blocked(me,n.actor_group_id)),
    'preferences',coalesce((select to_jsonb(p)-'group_id' from public.notification_preferences p where p.group_id=me),
      jsonb_build_object('push_messages',true,'push_invitations',true,'push_favorite_trips',true,'push_reactions',true,'updated_at',null)),
    'fetched_at',now()) into result;
  return result;
end $$;

create or replace function public.list_public_groups(filters jsonb default '{}'::jsonb, after_name text default null, after_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); result jsonb; kinds text[]; ages text[]; modes text[]; hobbies text[]; animals text[];
begin
  if me is null then raise exception 'Profile required' using errcode='42501'; end if;
  if jsonb_typeof(filters) is distinct from 'object' or (after_name is null)<>(after_id is null)
    or char_length(coalesce(filters->>'name',''))>80 or char_length(coalesce(after_name,''))>40 then
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
    or (filters ? 'has_trips' and jsonb_typeof(filters->'has_trips')<>'boolean')
    or (filters ? 'online_only' and jsonb_typeof(filters->'online_only')<>'boolean')
    or (filters ? 'favorites_only' and jsonb_typeof(filters->'favorites_only')<>'boolean') then
    raise exception 'Invalid filters' using errcode='22023'; end if;
  if coalesce((filters->>'online_only')::boolean,false) and not exists (
    select 1 from auth.sessions s where s.id=nullif(auth.jwt()->>'session_id','')::uuid
      and s.user_id=auth.uid() and (s.not_after is null or s.not_after>now())
  ) then raise exception 'Active session required' using errcode='42501'; end if;
  if coalesce((filters->>'favorites_only')::boolean,false) then perform favorites_private.my_group_id(); end if;

  with matched as (
    select g.*,p.about,messaging_private.public_trip_count(g.id) as active_trip_count,
      messaging_private.search_text(g.name) as sort_name
    from public.travel_groups g join public.group_public_profiles p on p.group_id=g.id and p.discoverable
    where g.id<>me and not messaging_private.pair_blocked(me,g.id)
      and messaging_private.group_search_matches(g,filters->>'name')
      and (cardinality(kinds)=0 or g.kind=any(kinds))
      and (cardinality(ages)=0 or g.child_age_bands && ages)
      and (cardinality(modes)=0 or g.travel_mode=any(modes))
      and (cardinality(hobbies)=0 or g.interests && hobbies)
      and (cardinality(animals)=0 or g.animal_kinds && animals)
      and (not coalesce((filters->>'has_trips')::boolean,false) or messaging_private.public_trip_count(g.id)>0)
      and (not coalesce((filters->>'online_only')::boolean,false) or presence_private.group_is_online(g.id))
      and (not coalesce((filters->>'favorites_only')::boolean,false) or exists (
        select 1 from favorites_private.group_favorites f where f.owner_group_id=me and f.target_group_id=g.id
      ))
      and (after_id is null or (messaging_private.search_text(g.name),g.id)>(messaging_private.search_text(after_name),after_id))
    order by sort_name,g.id limit 21
  ), page as (select * from matched order by sort_name,id limit 20)
  select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
      'crew',messaging_private.public_crew(g),'about',p.about,'active_trip_count',p.active_trip_count) order by p.sort_name,p.id)
      from page p join public.travel_groups g on g.id=p.id),'[]'::jsonb),
    'has_more',(select count(*)>20 from matched),
    'cursor',(select jsonb_build_object('name',name,'id',id) from page order by sort_name desc,id desc limit 1)) into result;
  return result;
end $$;

create or replace function public.list_ranked_public_groups(filters jsonb default '{}'::jsonb,sort_mode text default 'compatibility',after_cursor jsonb default null)
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
    order by sort_score desc,sort_name,id limit 21
  ), page as (select * from matched order by sort_score desc,sort_name,id limit 20)
  select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('crew',crew,'about',about,
      'active_trip_count',active_trip_count,'compatibility',compatibility) order by sort_score desc,sort_name,id) from page),'[]'::jsonb),
    'has_more',(select count(*)>20 from matched),
    'cursor',(select jsonb_build_object('name',name,'id',id,'score',compatibility->'score','sort',sort_mode)
      from page order by sort_score,sort_name desc,id desc limit 1)) into result;
  return result;
end $$;

create or replace function public.count_public_groups(filters jsonb default '{}'::jsonb) returns integer
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
    or (filters ? 'has_trips' and jsonb_typeof(filters->'has_trips')<>'boolean')
    or (filters ? 'online_only' and jsonb_typeof(filters->'online_only')<>'boolean')
    or (filters ? 'favorites_only' and jsonb_typeof(filters->'favorites_only')<>'boolean') then
    raise exception 'Invalid filters' using errcode='22023'; end if;
  if coalesce((filters->>'online_only')::boolean,false) and not exists (
    select 1 from auth.sessions s where s.id=nullif(auth.jwt()->>'session_id','')::uuid
      and s.user_id=auth.uid() and (s.not_after is null or s.not_after>now())
  ) then raise exception 'Active session required' using errcode='42501'; end if;
  if coalesce((filters->>'favorites_only')::boolean,false) then perform favorites_private.my_group_id(); end if;

  select count(*)::integer into result
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
      ));
  return result;
end $$;

notify pgrst,'reload schema';

