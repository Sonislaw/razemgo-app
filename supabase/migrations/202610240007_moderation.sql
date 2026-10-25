create schema moderation_private;
revoke all on schema moderation_private from public,anon,authenticated;
grant usage on schema moderation_private to authenticated;
create table moderation_private.administrators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table moderation_private.suspended_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table moderation_private.hidden_trips (
  trip_id uuid primary key references public.trip_plans(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.account_reports
  add column trip_id uuid references public.trip_plans(id) on delete set null,
  add column target_kind text not null default 'conversation' check(target_kind in('conversation','trip')),
  add column status text not null default 'new' check(status in('new','in_progress','closed')),
  add column updated_at timestamptz not null default now();
update public.account_reports r set trip_id=i.trip_id from public.conversations c
  join public.contact_invitations i on i.id=c.invitation_id where r.conversation_id=c.id;
create index reports_queue on public.account_reports(status,created_at desc,id);
create table moderation_private.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  report_id uuid references public.account_reports(id) on delete set null,
  action text not null check(action in('in_progress','close','reopen','hide_trip','restore_trip','suspend_account','restore_account','grant_admin','revoke_admin')),
  note text not null check(char_length(note) between 8 and 500),
  target_id uuid,
  request_key uuid,
  created_at timestamptz not null default now(),
  unique(actor_user_id,request_key)
);
create index moderation_audit_report on moderation_private.audit_log(report_id,created_at desc,id);
alter table moderation_private.administrators enable row level security;
alter table moderation_private.suspended_accounts enable row level security;
alter table moderation_private.hidden_trips enable row level security;
alter table moderation_private.audit_log enable row level security;
revoke all on all tables in schema moderation_private from public,anon,authenticated;

create function moderation_private.can_use_app() returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and not exists(select 1 from moderation_private.suspended_accounts where user_id=auth.uid());
$$;
create function moderation_private.is_admin() returns boolean
language sql stable security definer set search_path='' as $$
  select moderation_private.can_use_app() and exists(select 1 from moderation_private.administrators where user_id=auth.uid());
$$;
create function moderation_private.require_admin() returns void
language plpgsql stable security definer set search_path='' as $$ begin
  if not moderation_private.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
end $$;
create function public.get_my_account_access() returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
  return jsonb_build_object('is_admin',moderation_private.is_admin(),'suspended',not moderation_private.can_use_app(),
    'hidden_trip_ids',coalesce((select jsonb_agg(h.trip_id) from moderation_private.hidden_trips h join public.trip_plans t on t.id=h.trip_id
      join public.travel_groups g on g.id=t.group_id where g.owner_user_id=auth.uid()),'[]'::jsonb));
end $$;

-- Restrictive policies also protect direct REST access and Realtime reads.
do $$ declare item text;begin
  foreach item in array array['travel_groups','group_preferences','trip_plans','contact_invitations','conversations','chat_messages',
    'conversation_reads','group_blocks','mailbox_updates','notifications','notification_preferences'] loop
    execute format('create policy active_account on public.%I as restrictive for all to authenticated using ((select moderation_private.can_use_app())) with check ((select moderation_private.can_use_app()))',item);
  end loop;
end $$;
-- Definer RPCs share these helpers; old JWTs cannot bypass suspension.
create or replace function messaging_private.my_group_id() returns uuid
language sql stable security definer set search_path='' as $$
  select id from public.travel_groups where owner_user_id=auth.uid() and moderation_private.can_use_app();
$$;
create or replace function messaging_private.pair_blocked(a uuid,b uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.group_blocks x where (x.blocker_group_id=a and x.blocked_group_id=b) or (x.blocker_group_id=b and x.blocked_group_id=a))
    or exists(select 1 from public.travel_groups g join moderation_private.suspended_accounts s on s.user_id=g.owner_user_id where g.id in(a,b));
$$;
create or replace function public.list_public_trips(requested_trip_id uuid default null)
returns table(trip jsonb,crew jsonb) language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',t.id,'group_id',t.group_id,'mode',t.mode,'status',t.status,'visibility',t.visibility,
    'start_date',t.start_date,'end_date',t.end_date,'location_id',t.location_id,'location_name',t.location_name,'location_region',t.location_region,
    'location_kind',t.location_kind,'campground_name',t.campground_name,'campground_address',t.campground_address,'travel_mode',t.travel_mode,
    'description',t.description,'landscape',t.landscape,'interests',t.interests,'animal_kinds',t.animal_kinds,
    'matching_group_kinds',t.matching_group_kinds,'matching_child_age_bands',t.matching_child_age_bands,'published_at',t.published_at),
    jsonb_build_object('id',g.id,'name',g.name,'avatar_id',g.avatar_id,'kind',g.kind,'adult_count',g.adult_count,'child_count',g.child_count,
      'child_age_bands',g.child_age_bands,'travel_mode',g.travel_mode,'interests',g.interests,'animal_kinds',g.animal_kinds)
  from public.trip_plans t join public.travel_groups g on g.id=t.group_id
  where messaging_private.my_group_id() is not null and g.owner_user_id<>auth.uid()
    and not messaging_private.pair_blocked(messaging_private.my_group_id(),g.id)
    and not exists(select 1 from moderation_private.hidden_trips h where h.trip_id=t.id)
    and t.status='published' and t.visibility='public' and t.end_date>current_date
    and (requested_trip_id is null or t.id=requested_trip_id) order by t.published_at desc,t.id;
$$;
create function moderation_private.guard_invitation() returns trigger
language plpgsql security definer set search_path='' as $$ begin
  if exists(select 1 from moderation_private.hidden_trips h where h.trip_id in(new.trip_id,new.source_trip_id)) then
    raise exception 'Trip unavailable' using errcode='P0002';end if;
  if messaging_private.pair_blocked(new.sender_group_id,new.recipient_group_id) then
    raise exception 'Contact unavailable' using errcode='42501';end if;
  return new;
end $$;
create trigger moderation_invitation before insert on public.contact_invitations for each row execute function moderation_private.guard_invitation();
create function moderation_private.guard_proposal() returns trigger
language plpgsql security definer set search_path='' as $$ begin
  if new.kind='proposal' and exists(select 1 from moderation_private.hidden_trips h where h.trip_id in(new.own_trip_id,new.proposed_trip_id)) then return null;end if;
  return new;
end $$;
create trigger moderation_proposal before insert on public.notifications for each row execute function moderation_private.guard_proposal();

create function moderation_private.trip_evidence(t public.trip_plans) returns jsonb
language sql stable set search_path='' as $$ select jsonb_build_object('id',t.id,'description',t.description,'location_name',t.location_name,
  'location_region',t.location_region,'campground_name',t.campground_name,'start_date',t.start_date,'end_date',t.end_date,'mode',t.mode);$$;
create function public.report_trip(target_trip_id uuid,report_reason text,request_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); target public.trip_plans; previous public.account_reports; saved uuid;
begin
  if me is null then raise exception 'Profile required' using errcode='42501';end if;
  if request_key is null then raise exception 'Request key required' using errcode='22023';end if;
  select * into previous from public.account_reports r where r.reporter_group_id=me and r.request_key=report_trip.request_key;
  if found then
    if previous.target_kind<>'trip' or previous.trip_id is distinct from target_trip_id then raise exception 'Request key reused' using errcode='22023';end if;
    return previous.id;
  end if;
  select * into target from public.trip_plans t where t.id=target_trip_id for share;
  if not found or target.group_id=me or target.status<>'published' or target.visibility<>'public'
    or target.end_date<=current_date or messaging_private.pair_blocked(me,target.group_id)
    or exists(select 1 from moderation_private.hidden_trips h where h.trip_id=target.id) then raise exception 'Trip unavailable' using errcode='P0002';end if;
  if (select count(*) from public.account_reports where reporter_group_id=me and created_at>now()-interval '1 day')>=20 then
    raise exception 'Report limit reached' using errcode='54000';end if;
  insert into public.account_reports(reporter_group_id,reported_group_id,trip_id,target_kind,reason,request_key,evidence)
    values(me,target.group_id,target.id,'trip',report_reason,request_key,jsonb_build_object('trip',moderation_private.trip_evidence(target)))
    on conflict on constraint account_reports_reporter_group_id_request_key_key do update set request_key=excluded.request_key returning id into saved;
  return saved;
end $$;
create or replace function public.report_conversation(conversation_id uuid,report_reason text,request_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); chat public.conversations; previous public.account_reports; saved uuid; target public.trip_plans;
begin
  if me is null then raise exception 'Profile required' using errcode='42501';end if;
  if request_key is null then raise exception 'Request key required' using errcode='22023';end if;
  select * into previous from public.account_reports r where r.reporter_group_id=me and r.request_key=report_conversation.request_key;
  if found then
    if previous.target_kind<>'conversation' or previous.conversation_id is distinct from conversation_id then raise exception 'Request key reused' using errcode='22023';end if;
    return previous.id;
  end if;
  select * into chat from public.conversations c where c.id=conversation_id and me in(c.sender_group_id,c.recipient_group_id);
  if not found then raise exception 'Conversation unavailable' using errcode='42501';end if;
  if (select count(*) from public.account_reports where reporter_group_id=me and created_at>now()-interval '1 day')>=20 then
    raise exception 'Report limit reached' using errcode='54000';end if;
  select t.* into target from public.contact_invitations i join public.trip_plans t on t.id=i.trip_id where i.id=chat.invitation_id;
  insert into public.account_reports(reporter_group_id,reported_group_id,conversation_id,trip_id,reason,request_key,evidence)
    values(me,case when me=chat.sender_group_id then chat.recipient_group_id else chat.sender_group_id end,chat.id,target.id,report_reason,request_key,
      jsonb_build_object('trip',case when target.id is not null then moderation_private.trip_evidence(target) end,'messages',coalesce((select jsonb_agg(e) from
        (select m.id,m.sender_group_id,m.text,m.created_at from public.chat_messages m where m.conversation_id=chat.id order by m.sequence desc limit 20) e),'[]'::jsonb)))
    on conflict on constraint account_reports_reporter_group_id_request_key_key do update set request_key=excluded.request_key returning id into saved;
  return saved;
end $$;

create function moderation_private.report_summary(r public.account_reports) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',r.id,'target_kind',r.target_kind,'reason',r.reason,'status',r.status,'created_at',r.created_at,'updated_at',r.updated_at,
    'reported_group_id',r.reported_group_id,'reporter_group_id',r.reporter_group_id,
    'reported_name',coalesce((select name from public.travel_groups where id=r.reported_group_id),'Usunięta ekipa'),
    'reporter_name',coalesce((select name from public.travel_groups where id=r.reporter_group_id),'Usunięta ekipa'));
$$;
create function public.admin_list_reports(status_filter text default 'open',search_text text default '',before_at timestamptz default null,before_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform moderation_private.require_admin();
  if status_filter is null or status_filter not in('open','new','in_progress','closed','all') or length(coalesce(search_text,''))>100
    or (before_at is null)<>(before_id is null) then raise exception 'Invalid filter' using errcode='22023';end if;
  with matched as (
    select r.* from public.account_reports r left join public.travel_groups g on g.id=r.reported_group_id
    where (status_filter='all' or status_filter='open' and r.status in('new','in_progress') or r.status=status_filter)
      and (coalesce(search_text,'')='' or position(lower(search_text) in lower(coalesce(g.name,'')||' '||r.reason))>0)
      and (before_at is null or (r.created_at,r.id)<(before_at,before_id)) order by r.created_at desc,r.id desc limit 26
  ), page as(select * from matched order by created_at desc,id desc limit 25)
  select jsonb_build_object('items',coalesce((select jsonb_agg(moderation_private.report_summary(p::public.account_reports) order by p.created_at desc,p.id desc) from page p),'[]'::jsonb),
    'has_more',(select count(*)>25 from matched),'counts',jsonb_build_object('new',(select count(*) from public.account_reports where status='new'),
      'in_progress',(select count(*) from public.account_reports where status='in_progress'),'closed',(select count(*) from public.account_reports where status='closed')))
  into result;
  return result;
end $$;
create function public.admin_report_detail(report_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.account_reports; account_id uuid;
begin
  perform moderation_private.require_admin();
  select * into r from public.account_reports where id=report_id;
  if not found then raise exception 'Report unavailable' using errcode='P0002';end if;
  select owner_user_id into account_id from public.travel_groups where id=r.reported_group_id;
  return jsonb_build_object('report',moderation_private.report_summary(r),'evidence',r.evidence,'trip_id',r.trip_id,
    'trip_hidden',exists(select 1 from moderation_private.hidden_trips where trip_id=r.trip_id),
    'account_suspended',exists(select 1 from moderation_private.suspended_accounts where user_id=account_id),
    'can_suspend',account_id is not null and account_id<>auth.uid() and not exists(select 1 from moderation_private.administrators where user_id=account_id),
    'history',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc,a.id desc) from (
      select l.id,l.action,l.note,l.created_at,coalesce(g.name,'Administrator') as actor_name from moderation_private.audit_log l
      left join public.travel_groups g on g.owner_user_id=l.actor_user_id where l.report_id=r.id order by l.created_at desc,l.id desc limit 50
    ) a),'[]'::jsonb));
end $$;
create function public.admin_apply_action(report_id uuid,moderation_action text,action_note text,request_key uuid,expected_updated_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.account_reports; previous moderation_private.audit_log; account_id uuid; target uuid;
begin
  perform moderation_private.require_admin();
  if request_key is null or action_note is null or length(btrim(action_note)) not between 8 and 500
    or moderation_action is null or moderation_action not in('in_progress','close','reopen','hide_trip','restore_trip','suspend_account','restore_account') then
    raise exception 'Invalid action' using errcode='22023';end if;
  select * into r from public.account_reports where id=report_id for update;
  if not found then raise exception 'Report unavailable' using errcode='P0002';end if;
  select * into previous from moderation_private.audit_log a where a.actor_user_id=auth.uid() and a.request_key=admin_apply_action.request_key;
  if found then
    if previous.report_id is distinct from report_id or previous.action<>moderation_action then raise exception 'Request key reused' using errcode='22023';end if;
    return public.admin_report_detail(report_id);
  end if;
  if expected_updated_at is distinct from r.updated_at then raise exception 'Report changed' using errcode='40001';end if;
  if moderation_action in('in_progress','close','reopen') then
    update public.account_reports set status=case moderation_action when 'in_progress' then 'in_progress' when 'close' then 'closed' else 'new' end where id=r.id;
  elsif moderation_action in('hide_trip','restore_trip') then
    if r.trip_id is null then raise exception 'Trip unavailable' using errcode='P0002';end if;
    perform 1 from public.trip_plans where id=r.trip_id for update;
    target:=r.trip_id;
    if moderation_action='hide_trip' then
      insert into moderation_private.hidden_trips(trip_id) values(r.trip_id) on conflict do nothing;
      delete from public.notifications where kind='proposal' and (own_trip_id=r.trip_id or proposed_trip_id=r.trip_id);
    else delete from moderation_private.hidden_trips where trip_id=r.trip_id;end if;
  else
    select owner_user_id into account_id from public.travel_groups where id=r.reported_group_id for share;
    if account_id is null then raise exception 'Account unavailable' using errcode='P0002';end if;
    perform pg_advisory_xact_lock(hashtextextended(account_id::text,741));
    if account_id=auth.uid() or exists(select 1 from moderation_private.administrators where user_id=account_id) then
      raise exception 'Administrator account protected' using errcode='42501';end if;
    target:=account_id;
    if moderation_action='suspend_account' then
      insert into moderation_private.suspended_accounts(user_id) values(account_id) on conflict do nothing;
      delete from public.push_devices where group_id=r.reported_group_id;
    else delete from moderation_private.suspended_accounts where user_id=account_id;end if;
    perform messaging_private.touch_pair(r.reporter_group_id,r.reported_group_id);
  end if;
  update public.account_reports set updated_at=clock_timestamp() where id=r.id;
  insert into moderation_private.audit_log(actor_user_id,report_id,action,note,target_id,request_key)
    values(auth.uid(),r.id,moderation_action,btrim(action_note),target,request_key);
  return public.admin_report_detail(r.id);
end $$;

revoke all on all functions in schema moderation_private from public,anon,authenticated;
grant execute on function moderation_private.can_use_app(),moderation_private.is_admin() to authenticated;
revoke all on function public.get_my_account_access(),public.report_trip(uuid,text,uuid),public.admin_list_reports(text,text,timestamptz,uuid),
  public.admin_report_detail(uuid),public.admin_apply_action(uuid,text,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.get_my_account_access(),public.report_trip(uuid,text,uuid),public.admin_list_reports(text,text,timestamptz,uuid),
  public.admin_report_detail(uuid),public.admin_apply_action(uuid,text,text,uuid,timestamptz) to authenticated;
notify pgrst,'reload schema';
