-- Traveler passport: server-owned, monotonic achievements. Deploy to Dev first.
create schema passport_private;
revoke all on schema passport_private from public,anon,authenticated;

create table passport_private.categories (
  id text primary key,
  thresholds integer[] not null,
  position integer not null unique
);
-- Catalog snapshot, checked against shared/passport-catalog.json by tests.
insert into passport_private.categories(id,thresholds,position) values
('profile',array[1],1),
('plans',array[1,5,15,40],2),
('ideas',array[1,3,10,25],3),
('messages',array[10,50,200,500],4),
('contacts',array[1,5,15,40],5),
('trip_favorites',array[1,10,30,75],6),
('group_favorites',array[1,5,15,40],7),
('trip_reactions',array[1,10,30,100],8),
('message_reactions',array[1,10,50,150],9),
('saved_filters',array[1,3,5,10],10),
('active_days',array[1,7,30,100],11),
('destinations',array[1,5,15,30],12),
('campgrounds',array[1,3,10,25],13),
('landscapes',array[1,2,3,4],14);
create table passport_private.levels (
  level integer primary key,
  points integer not null unique,
  title text not null
);
insert into passport_private.levels(level,points,title) values
(1,0,'Początek drogi'),
(2,30,'W drodze'),
(3,100,'Odkrywcy'),
(4,250,'Podróżnicy'),
(5,500,'Doświadczona ekipa'),
(6,800,'Przewodnicy'),
(7,1150,'Legenda szlaku'),
(8,1500,'Dookoła świata');

create table passport_private.events (
  group_id uuid not null references public.travel_groups(id) on delete cascade,
  category text not null references passport_private.categories(id),
  event_key text not null check(char_length(event_key) between 1 and 200),
  created_at timestamptz not null default now(),
  primary key(group_id,category,event_key)
);
create table passport_private.progress (
  group_id uuid not null references public.travel_groups(id) on delete cascade,
  category text not null references passport_private.categories(id),
  amount integer not null check(amount>0),
  primary key(group_id,category)
);
create table passport_private.awards (
  group_id uuid not null references public.travel_groups(id) on delete cascade,
  category text not null references passport_private.categories(id),
  tier integer not null check(tier between 1 and 4),
  points integer not null check(points>0),
  earned_at timestamptz not null default now(),
  primary key(group_id,category,tier)
);
create table passport_private.summaries (
  group_id uuid primary key references public.travel_groups(id) on delete cascade,
  points integer not null default 0 check(points>=0),
  badge_count integer not null default 0 check(badge_count>=0)
);
create table passport_private.trip_publications (
  trip_id uuid primary key,
  group_id uuid not null references public.travel_groups(id) on delete cascade
);
alter table passport_private.categories enable row level security;
alter table passport_private.levels enable row level security;
alter table passport_private.events enable row level security;
alter table passport_private.progress enable row level security;
alter table passport_private.awards enable row level security;
alter table passport_private.summaries enable row level security;
alter table passport_private.trip_publications enable row level security;
revoke all on all tables in schema passport_private from public,anon,authenticated;

alter table messaging_private.sync_revisions add column passport bigint not null default 0;

create function passport_private.record_event(crew uuid,kind text,source text) returns void
language plpgsql volatile security definer set search_path='' as $$
declare inserted integer; amount integer; limits integer[]; ceiling integer;
  gained_points integer; gained_badges integer;
begin
  -- Deleted accounts must not be recreated by a cascading operation.
  if not exists(select 1 from public.travel_groups where id=crew) then return; end if;
  select c.thresholds into limits from passport_private.categories c where c.id=kind;
  ceiling:=limits[cardinality(limits)];
  -- After the last milestone there is no reason to retain more activity IDs.
  if exists(select 1 from passport_private.progress p where p.group_id=crew and p.category=kind and p.amount>=ceiling) then return; end if;
  insert into passport_private.events(group_id,category,event_key) values(crew,kind,source)
    on conflict do nothing;
  get diagnostics inserted=row_count;
  if inserted=0 then return; end if;
  insert into passport_private.progress(group_id,category,amount) values(crew,kind,1)
    on conflict(group_id,category) do update set amount=least(passport_private.progress.amount+1,ceiling)
    returning progress.amount into amount;
  with earned as (
    insert into passport_private.awards(group_id,category,tier,points)
    select crew,kind,n,(array[10,20,35,60])[n]
      from generate_subscripts(limits,1) n where amount>=limits[n]
    on conflict do nothing returning points
  ) select coalesce(sum(points),0)::integer,count(*)::integer into gained_points,gained_badges from earned;
  if gained_badges>0 then
    insert into passport_private.summaries(group_id,points,badge_count) values(crew,gained_points,gained_badges)
      on conflict(group_id) do update set points=passport_private.summaries.points+excluded.points,
        badge_count=passport_private.summaries.badge_count+excluded.badge_count;
  end if;
  insert into messaging_private.sync_revisions(group_id,passport) values(crew,1)
    on conflict(group_id) do update set passport=messaging_private.sync_revisions.passport+1;
  insert into public.mailbox_updates(group_id) values(crew)
    on conflict(group_id) do update set revision=public.mailbox_updates.revision+1;
end $$;

create function passport_private.summary(crew uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('level',l.level,'title',l.title,'points',coalesce(s.points,0),
    'badge_count',coalesce(s.badge_count,0))
  from (select 1) one left join passport_private.summaries s on s.group_id=crew
  cross join lateral(select * from passport_private.levels where points<=coalesce(s.points,0) order by level desc limit 1) l;
$$;

create function passport_private.payload(crew uuid,own boolean) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('version',1,'group_id',crew,'own',own,'summary',passport_private.summary(crew),
    'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,
      'count',case when own then coalesce(p.amount,0) else null end,
      'tier',coalesce((select max(a.tier) from passport_private.awards a where a.group_id=crew and a.category=c.id),0),
      'awards',coalesce((select jsonb_agg(jsonb_build_object('tier',a.tier,'earned_at',a.earned_at) order by a.tier)
        from passport_private.awards a where a.group_id=crew and a.category=c.id),'[]'::jsonb)) order by c.position)
      from passport_private.categories c left join passport_private.progress p on p.category=c.id and p.group_id=crew),'[]'::jsonb));
$$;

create function passport_private.profile_completed(crew uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.travel_groups g join public.group_public_profiles p on p.group_id=g.id
    where g.id=crew and cardinality(g.interests)>0 and char_length(btrim(p.about))>=20) then
    perform passport_private.record_event(crew,'profile','completed');
  end if;
end $$;

create function passport_private.trip_published(t public.trip_plans) returns void
language plpgsql security definer set search_path='' as $$
declare first_publication integer;
begin
  if t.published_at is null or t.visibility<>'public' or t.status='draft' then return; end if;
  insert into passport_private.trip_publications(trip_id,group_id) values(t.id,t.group_id) on conflict do nothing;
  get diagnostics first_publication=row_count;
  if first_publication>0 then
    perform passport_private.record_event(t.group_id,case when t.mode='planned' then 'plans' else 'ideas' end,t.id::text);
    if t.mode='planned' then
      perform passport_private.record_event(t.group_id,'destinations',t.location_id);
      perform passport_private.record_event(t.group_id,'landscapes',t.landscape);
    end if;
  end if;
  if t.mode='planned' and btrim(t.campground_name)<>'' then
    perform passport_private.record_event(t.group_id,'campgrounds',t.id::text);
  end if;
end $$;

create function passport_private.activity_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  case tg_table_name
    when 'travel_groups' then perform passport_private.profile_completed(new.id);
    when 'group_public_profiles' then perform passport_private.profile_completed(new.group_id);
    when 'trip_plans' then perform passport_private.trip_published(new);
    when 'chat_messages' then perform passport_private.record_event(new.sender_group_id,'messages',new.id::text);
    when 'conversations' then
      perform passport_private.record_event(new.sender_group_id,'contacts',new.recipient_group_id::text);
      perform passport_private.record_event(new.recipient_group_id,'contacts',new.sender_group_id::text);
    when 'group_favorites' then perform passport_private.record_event(new.owner_group_id,'group_favorites',new.target_group_id::text);
    when 'trip_favorites' then perform passport_private.record_event(new.owner_group_id,'trip_favorites',new.target_trip_id::text);
    when 'trip_reactions' then
      if new.kind is not null then perform passport_private.record_event(new.actor_group_id,'trip_reactions',new.trip_id::text); end if;
    when 'message_reactions' then perform passport_private.record_event(new.group_id,'message_reactions',new.message_id::text);
    when 'saved_filter_sets' then perform passport_private.record_event(new.owner_group_id,'saved_filters',md5(new.kind||':'||new.filters::text));
  end case;
  return null;
end $$;

create trigger passport_profile after insert or update of interests on public.travel_groups
  for each row execute function passport_private.activity_changed();
create trigger passport_about after insert or update of about on public.group_public_profiles
  for each row execute function passport_private.activity_changed();
create trigger passport_trip after insert or update of status,visibility,mode,location_id,landscape,campground_name on public.trip_plans
  for each row execute function passport_private.activity_changed();
create trigger passport_message after insert on public.chat_messages for each row execute function passport_private.activity_changed();
create trigger passport_contact after insert on public.conversations for each row execute function passport_private.activity_changed();
create trigger passport_favorite_group after insert on favorites_private.group_favorites for each row execute function passport_private.activity_changed();
create trigger passport_favorite_trip after insert on favorites_private.trip_favorites for each row execute function passport_private.activity_changed();
create trigger passport_trip_reaction after insert or update of kind on reactions_private.trip_reactions for each row execute function passport_private.activity_changed();
create trigger passport_message_reaction after insert on messaging_private.message_reactions for each row execute function passport_private.activity_changed();
create trigger passport_saved_filters after insert on discovery_private.saved_filter_sets for each row execute function passport_private.activity_changed();

-- Backfill only evidence that is still present. Deleted history and past active
-- days cannot be reconstructed and are deliberately not invented.
do $$
declare r record;
begin
  for r in select id from public.travel_groups loop perform passport_private.profile_completed(r.id); end loop;
  for r in select t as trip from public.trip_plans t where published_at is not null and visibility='public' and status<>'draft'
    order by published_at,id loop perform passport_private.trip_published(r.trip); end loop;
  for r in select sender_group_id,id from public.chat_messages loop
    perform passport_private.record_event(r.sender_group_id,'messages',r.id::text); end loop;
  for r in select sender_group_id,recipient_group_id from public.conversations order by sender_group_id,recipient_group_id loop
    perform passport_private.record_event(r.sender_group_id,'contacts',r.recipient_group_id::text);
    perform passport_private.record_event(r.recipient_group_id,'contacts',r.sender_group_id::text); end loop;
  for r in select * from favorites_private.group_favorites loop
    perform passport_private.record_event(r.owner_group_id,'group_favorites',r.target_group_id::text); end loop;
  for r in select * from favorites_private.trip_favorites loop
    perform passport_private.record_event(r.owner_group_id,'trip_favorites',r.target_trip_id::text); end loop;
  for r in select * from reactions_private.trip_reactions where kind is not null loop
    perform passport_private.record_event(r.actor_group_id,'trip_reactions',r.trip_id::text); end loop;
  for r in select * from messaging_private.message_reactions loop
    perform passport_private.record_event(r.group_id,'message_reactions',r.message_id::text); end loop;
  for r in select * from discovery_private.saved_filter_sets loop
    perform passport_private.record_event(r.owner_group_id,'saved_filters',md5(r.kind||':'||r.filters::text)); end loop;
end $$;

create function public.get_my_traveler_passport() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id();
begin
  perform passport_private.record_event(me,'active_days',(clock_timestamp() at time zone 'Europe/Warsaw')::date::text);
  return passport_private.payload(me,true);
end $$;
create function public.get_public_traveler_passport(target_group_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id();
begin
  if target_group_id is null then raise exception 'Group required' using errcode='22023'; end if;
  if target_group_id=me then return passport_private.payload(me,true); end if;
  if not favorites_private.can_view_group(me,target_group_id)
    or exists(select 1 from public.travel_groups g join moderation_private.suspended_accounts s on s.user_id=g.owner_user_id where g.id=target_group_id)
    then return null; end if;
  return passport_private.payload(target_group_id,false);
end $$;
revoke all on all functions in schema passport_private from public,anon,authenticated;
revoke all on function public.get_my_traveler_passport(),public.get_public_traveler_passport(uuid) from public,anon,authenticated;
grant execute on function public.get_my_traveler_passport(),public.get_public_traveler_passport(uuid) to authenticated;

-- Existing directory/details RPCs include one small aggregate, never private
-- message counts or a second request per card. The identity contract is additive.
create or replace function messaging_private.public_crew(g public.travel_groups) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',g.id,'crew_number',g.crew_number,'name',g.name,'avatar_id',g.avatar_id,'kind',g.kind,
    'adult_count',g.adult_count,'child_count',g.child_count,'child_age_bands',g.child_age_bands,
    'travel_mode',g.travel_mode,'interests',g.interests,'animal_kinds',g.animal_kinds,'passport',passport_private.summary(g.id));
$$;
revoke all on function messaging_private.public_crew(public.travel_groups) from public,anon,authenticated;

create or replace function public.list_public_trips(requested_trip_id uuid default null)
returns table(trip jsonb,crew jsonb) language sql stable security definer set search_path='' as $$
  with me as materialized(select messaging_private.my_group_id() as id)
  select result.trip,result.crew from (
    select jsonb_build_object('id',t.id,'group_id',t.group_id,'mode',t.mode,'status',t.status,'visibility',t.visibility,
    'start_date',t.start_date,'end_date',t.end_date,'location_id',t.location_id,'location_name',t.location_name,'location_region',t.location_region,
    'location_kind',t.location_kind,'campground_name',t.campground_name,'campground_address',t.campground_address,'travel_mode',t.travel_mode,
    'description',t.description,'landscape',t.landscape,'interests',t.interests,'animal_kinds',t.animal_kinds,
    'adult_count',t.adult_count,'child_count',t.child_count,'child_age_bands',t.child_age_bands,
    'matching_group_kinds',t.matching_group_kinds,'matching_child_age_bands',t.matching_child_age_bands,'published_at',t.published_at) as trip,
    messaging_private.public_crew(g) as crew,t.published_at,t.id
      from me cross join lateral discovery_private.candidates('{}',me.id) t
      join public.travel_groups g on g.id=t.group_id
      where me.id is not null and requested_trip_id is not null and t.id=requested_trip_id
    union all
    select jsonb_build_object('id',t.id,'group_id',t.group_id,'mode',t.mode,'status',t.status,'visibility',t.visibility,
    'start_date',t.start_date,'end_date',t.end_date,'location_id',t.location_id,'location_name',t.location_name,'location_region',t.location_region,
    'location_kind',t.location_kind,'campground_name',t.campground_name,'campground_address',t.campground_address,'travel_mode',t.travel_mode,
    'description',t.description,'landscape',t.landscape,'interests',t.interests,'animal_kinds',t.animal_kinds,
    'adult_count',t.adult_count,'child_count',t.child_count,'child_age_bands',t.child_age_bands,
    'matching_group_kinds',t.matching_group_kinds,'matching_child_age_bands',t.matching_child_age_bands,'published_at',t.published_at) as trip,
    messaging_private.public_crew(g) as crew,t.published_at,t.id
      from me cross join lateral discovery_private.candidates('{}',me.id) t
      join public.travel_groups g on g.id=t.group_id
      where me.id is not null and requested_trip_id is null
  ) result order by result.published_at desc,result.id;
$$;

alter function public.get_my_sync_state() rename to get_my_sync_state_before_passport;
revoke all on function public.get_my_sync_state_before_passport() from public,anon,authenticated;
create function public.get_my_sync_state() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); result jsonb:=public.get_my_sync_state_before_passport();
begin
  return jsonb_set(result,'{domains}',result->'domains'||jsonb_build_object('passport',coalesce(
    (select s.passport::text from messaging_private.sync_revisions s where s.group_id=me),'0')));
end $$;
revoke all on function public.get_my_sync_state() from public,anon,authenticated;
grant execute on function public.get_my_sync_state() to authenticated;
notify pgrst,'reload schema';
