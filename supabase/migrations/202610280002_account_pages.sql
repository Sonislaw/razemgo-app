-- Additive, owner-only, bounded read contracts. No existing RPC is removed.
create function public.get_my_sync_state() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); result jsonb;
begin
  select jsonb_build_object(
    'revision',coalesce((select revision from public.mailbox_updates where group_id=me),0),
    'unread_messages',coalesce((select count(*) from public.chat_messages m join public.conversations c on c.id=m.conversation_id
      left join public.conversation_reads r on r.conversation_id=c.id and r.group_id=me
      where me in(c.sender_group_id,c.recipient_group_id) and m.sender_group_id<>me and m.sequence>coalesce(r.last_read_sequence,0)
        and not messaging_private.pair_blocked(c.sender_group_id,c.recipient_group_id)),0),
    'pending_invitations',(select count(*) from public.contact_invitations i where i.recipient_group_id=me and i.status='pending'
      and not messaging_private.pair_blocked(me,i.sender_group_id)),
    'unread_notifications',(select count(*) from public.notifications n where n.recipient_group_id=me and n.read_at is null
      and not messaging_private.pair_blocked(me,n.actor_group_id)),
    'active_trips',(select count(*) from public.trip_plans t where t.group_id=me and not(t.status in('completed','cancelled') or t.status in('published','paused') and t.end_date<=current_date)),
    'archived_trips',(select count(*) from public.trip_plans t where t.group_id=me and (t.status in('completed','cancelled') or t.status in('published','paused') and t.end_date<=current_date))
  ) into result;
  return result;
end $$;

create function public.get_my_notification_states(notification_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id();
begin
  if notification_ids is null or cardinality(notification_ids)>100 then raise exception 'Invalid notification ids' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'read_at',n.read_at)) from public.notifications n
    where n.recipient_group_id=me and n.id=any(notification_ids) and not messaging_private.pair_blocked(me,n.actor_group_id)),'[]');
end $$;

create function public.get_my_mailbox_states(conversation_ids uuid[],invitation_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id();
begin
  if conversation_ids is null or invitation_ids is null or cardinality(conversation_ids)>100 or cardinality(invitation_ids)>100 then
    raise exception 'Invalid ids' using errcode='22023'; end if;
  return jsonb_build_object('conversations',coalesce((select jsonb_agg(jsonb_build_object(
    'id',c.id,'blocked',messaging_private.pair_blocked(c.sender_group_id,c.recipient_group_id),'updated_at',c.updated_at,
    'self_read_sequence',coalesce((select last_read_sequence from public.conversation_reads where conversation_id=c.id and group_id=me),0),
    'other_read_sequence',coalesce((select last_read_sequence from public.conversation_reads where conversation_id=c.id and group_id<>me),0),
    'unread_count',(select count(*) from public.chat_messages m where m.conversation_id=c.id and m.sender_group_id<>me
      and m.sequence>coalesce((select last_read_sequence from public.conversation_reads where conversation_id=c.id and group_id=me),0))))
    from public.conversations c where c.id=any(conversation_ids) and me in(c.sender_group_id,c.recipient_group_id)),'[]'),
    'invitations',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'status',i.status)) from public.contact_invitations i
      where i.id=any(invitation_ids) and me in(i.sender_group_id,i.recipient_group_id)),'[]'));
end $$;

create function public.list_my_trip_page(archived boolean default false,filters jsonb default '{}',after_cursor jsonb default null,page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); today date:=current_date; cursor_date date; cursor_id uuid;
  query text; key text; result jsonb;
begin
  if archived is null or page_size is null or page_size<1 or page_size>50 or jsonb_typeof(filters) is distinct from 'object'
    or char_length(coalesce(filters->>'query',''))>2000 then raise exception 'Invalid filters' using errcode='22023'; end if;
  begin
    today:=coalesce((filters->>'today')::date,current_date);
    if filters->>'start_date' is not null then perform (filters->>'start_date')::date; end if;
    if filters->>'end_date' is not null then perform (filters->>'end_date')::date; end if;
  exception when others then raise exception 'Invalid dates' using errcode='22023'; end;
  query:=messaging_private.search_text(btrim(coalesce(filters->>'query','')));
  key:=md5(me::text||archived::text||filters::text);
  if after_cursor is not null then
    begin
      if after_cursor->>'query_key' is distinct from key or after_cursor->>'id' is null or after_cursor->>'sort_date' is null then raise exception 'Invalid cursor'; end if;
      cursor_id:=(after_cursor->>'id')::uuid; cursor_date:=(after_cursor->>'sort_date')::date;
      if not isfinite(cursor_date) then raise exception 'Invalid cursor'; end if;
    exception when others then raise exception 'Invalid cursor' using errcode='22023'; end;
  end if;
  with eligible as materialized (
    select t,coalesce(t.start_date,date '9999-12-31') as sort_date from public.trip_plans t where t.group_id=me
      and (t.status in('completed','cancelled') or t.status in('published','paused') and t.end_date<=today)=archived
      and strpos(messaging_private.search_text(t.description||' '||t.location_name||' '||t.location_region||
        case when messaging_private.search_text(t.location_region) in('pomorze','pomorskie') then ' Pomorze Pomorskie' else '' end),query)>0
      and (filters->>'start_date' is null or t.end_date>(filters->>'start_date')::date)
      and (filters->>'end_date' is null or t.start_date<(filters->>'end_date')::date)
  ), matched as materialized (
    select * from eligible where cursor_id is null or sort_date=cursor_date and (t).id>cursor_id
      or case when archived then sort_date<cursor_date else sort_date>cursor_date end
    order by case when archived then sort_date end desc,case when not archived then sort_date end,(t).id limit page_size+1
  ), page as materialized (
    select * from matched order by case when archived then sort_date end desc,case when not archived then sort_date end,(t).id limit page_size
  ) select jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(t) order by case when archived then sort_date end desc,case when not archived then sort_date end,(t).id) from page),'[]'),
    'total_count',(select count(*) from eligible),'has_more',(select count(*)>page_size from matched),
    'cursor',(select jsonb_build_object('id',(t).id,'sort_date',sort_date,'query_key',key) from page
      order by case when archived then sort_date end,case when not archived then sort_date end desc,(t).id desc limit 1),
    'active_count',(select count(*) from public.trip_plans t where t.group_id=me and not(t.status in('completed','cancelled') or t.status in('published','paused') and t.end_date<=today)),
    'archived_count',(select count(*) from public.trip_plans t where t.group_id=me and (t.status in('completed','cancelled') or t.status in('published','paused') and t.end_date<=today)),
    'latest_trip',(select to_jsonb(t) from public.trip_plans t where t.group_id=me and t.status='published' and t.visibility='public' and t.end_date>today order by t.published_at desc,t.id limit 1)
  ) into result;
  return result;
end $$;

create function public.get_my_trip(target_trip_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select to_jsonb(t) from public.trip_plans t where t.id=target_trip_id;
$$;

-- A page carries the invitations needed to authorize its conversations. Private
-- snapshots/contact text never enter the lightweight polling endpoint above.
create function public.get_my_mailbox_page(page_kind text default 'all',before_at timestamptz default null,before_id uuid default null,
  page_size integer default 20,target_conversation_id uuid default null,target_group_id uuid default null,target_trip_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); result jsonb; convs uuid[]; invites uuid[]; pages jsonb;
begin
  if page_kind is null or page_kind not in('all','conversations','received','sent') or page_size is null or page_size<1 or page_size>50
    or (before_at is null)<>(before_id is null) or before_at is not null and not isfinite(before_at)
    then raise exception 'Invalid page' using errcode='22023'; end if;
  with conversations as materialized (
    select c.* from public.conversations c join public.contact_invitations i on i.id=c.invitation_id
    where me in(c.sender_group_id,c.recipient_group_id) and page_kind in('all','conversations')
      and (target_conversation_id is null or c.id=target_conversation_id)
      and (target_group_id is null or target_group_id in(c.sender_group_id,c.recipient_group_id))
      and (target_trip_id is null or target_trip_id in(i.trip_reference,i.source_trip_id))
      and (before_at is null or (c.updated_at,c.id)<(before_at,before_id))
    order by c.updated_at desc,c.id desc limit page_size+1
  ), received as materialized (
    select i.* from public.contact_invitations i where i.recipient_group_id=me and page_kind in('all','received')
      and target_conversation_id is null and (target_group_id is null or i.sender_group_id=target_group_id)
      and (target_trip_id is null or target_trip_id in(i.trip_reference,i.source_trip_id))
      and (before_at is null or (i.created_at,i.id)<(before_at,before_id))
    order by i.created_at desc,i.id desc limit page_size+1
  ), sent as materialized (
    select i.* from public.contact_invitations i where i.sender_group_id=me and page_kind in('all','sent')
      and target_conversation_id is null and (target_group_id is null or i.recipient_group_id=target_group_id)
      and (target_trip_id is null or target_trip_id in(i.trip_reference,i.source_trip_id))
      and (before_at is null or (i.created_at,i.id)<(before_at,before_id))
    order by i.created_at desc,i.id desc limit page_size+1
  ), initial_invites as materialized (
    (select id from received order by created_at desc,id desc limit page_size)
    union (select id from sent order by created_at desc,id desc limit page_size)
  ), selected_convs as materialized (
    (select id from conversations order by updated_at desc,id desc limit page_size)
    union select c.id from public.conversations c where me in(c.sender_group_id,c.recipient_group_id) and c.invitation_id in(select id from initial_invites)
  ), selected_invites as (
    select id from initial_invites union select invitation_id from public.conversations where id in(select id from selected_convs)
  ) select
    coalesce((select array_agg(id) from selected_convs),'{}'::uuid[]),coalesce((select array_agg(id) from selected_invites),'{}'::uuid[]),
    jsonb_build_object(
      'conversations',jsonb_build_object('has_more',(select count(*)>page_size from conversations),
        'cursor',(select jsonb_build_object('id',c.id,'at',c.updated_at) from (select * from conversations order by updated_at desc,id desc limit page_size) c order by updated_at,id limit 1)),
      'received',jsonb_build_object('has_more',(select count(*)>page_size from received),
        'cursor',(select jsonb_build_object('id',i.id,'at',i.created_at) from (select * from received order by created_at desc,id desc limit page_size) i order by created_at,id limit 1)),
      'sent',jsonb_build_object('has_more',(select count(*)>page_size from sent),
        'cursor',(select jsonb_build_object('id',i.id,'at',i.created_at) from (select * from sent order by created_at desc,id desc limit page_size) i order by created_at,id limit 1))
    ) into convs,invites,pages;
  select jsonb_build_object(
    'invitations',coalesce((select jsonb_agg(to_jsonb(i)-'request_key' order by i.created_at desc,i.id) from public.contact_invitations i where i.id=any(invites)),'[]'),
    'conversations',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'invitation_id',c.invitation_id,'sender_group_id',c.sender_group_id,'recipient_group_id',c.recipient_group_id,
      'updated_at',c.updated_at,'blocked',messaging_private.pair_blocked(c.sender_group_id,c.recipient_group_id),
      'self_read_sequence',coalesce((select r.last_read_sequence from public.conversation_reads r where r.conversation_id=c.id and r.group_id=me),0),
      'other_read_sequence',coalesce((select r.last_read_sequence from public.conversation_reads r where r.conversation_id=c.id and r.group_id<>me),0),
      'unread_count',(select count(*) from public.chat_messages m where m.conversation_id=c.id and m.sender_group_id<>me
        and m.sequence>coalesce((select r.last_read_sequence from public.conversation_reads r where r.conversation_id=c.id and r.group_id=me),0)),
      'last_message',(select to_jsonb(m) from public.chat_messages m where m.conversation_id=c.id order by m.sequence desc limit 1)
    ) order by c.updated_at desc,c.id) from public.conversations c where c.id=any(convs)),'[]'),
    'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'crew_number',g.crew_number,'name',g.name,'avatar_id',g.avatar_id,'adult_count',g.adult_count))
      from public.travel_groups g where g.id<>me and (exists(select 1 from public.contact_invitations i where i.id=any(invites) and g.id in(i.sender_group_id,i.recipient_group_id))
        or exists(select 1 from public.group_blocks b where b.blocker_group_id=me and b.blocked_group_id=g.id))),'[]'),
    'blocked_group_ids',coalesce((select jsonb_agg(b.blocked_group_id) from public.group_blocks b where b.blocker_group_id=me),'[]'),
    'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'group_id',r.reported_group_id,'conversation_id',r.conversation_id,'reason',r.reason))
      from public.account_reports r where r.reporter_group_id=me),'[]'),
    'pages',pages
  ) into result;
  return result;
end $$;

create index own_trip_order on public.trip_plans(group_id,start_date,id);
create index mailbox_conversation_sender_recent on public.conversations(sender_group_id,updated_at desc,id desc);
create index mailbox_conversation_recipient_recent on public.conversations(recipient_group_id,updated_at desc,id desc);
create index mailbox_invitation_sender_recent on public.contact_invitations(sender_group_id,created_at desc,id desc);
create index mailbox_invitation_recipient_recent on public.contact_invitations(recipient_group_id,created_at desc,id desc);

revoke all on function public.get_my_sync_state(),public.get_my_notification_states(uuid[]),
  public.get_my_mailbox_states(uuid[],uuid[]),
  public.list_my_trip_page(boolean,jsonb,jsonb,integer),public.get_my_trip(uuid),
  public.get_my_mailbox_page(text,timestamptz,uuid,integer,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_my_sync_state(),public.get_my_notification_states(uuid[]),
  public.get_my_mailbox_states(uuid[],uuid[]),
  public.list_my_trip_page(boolean,jsonb,jsonb,integer),public.get_my_trip(uuid),
  public.get_my_mailbox_page(text,timestamptz,uuid,integer,uuid,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
