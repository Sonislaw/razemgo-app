-- Private, account-scoped search criteria. Saving never changes profile or push criteria.
create table discovery_private.saved_filter_sets (
  id uuid primary key,
  owner_group_id uuid not null references public.travel_groups(id) on delete cascade,
  kind text not null check (kind in ('trips','groups')),
  name text not null check (char_length(name) between 1 and 40 and name=btrim(name)),
  filters jsonb not null check (jsonb_typeof(filters)='object'),
  schema_version integer not null default 1 check (schema_version=1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index saved_filter_set_name on discovery_private.saved_filter_sets(owner_group_id,kind,lower(name));
alter table discovery_private.saved_filter_sets enable row level security;
revoke all on discovery_private.saved_filter_sets from public,anon,authenticated;

create function discovery_private.filter_set_payload(filter_kind text,payload jsonb,me uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare f jsonb; keys text[]; array_keys text[]; key text;
begin
  if filter_kind not in ('trips','groups') or filter_kind is null
    or jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>16000 then
    raise exception 'Invalid filter set' using errcode='22023';
  end if;
  if filter_kind='trips' then
    keys:=array['trip_modes','landscapes','group_kinds','child_age_bands','animal_kinds','favorites_only',
      'location_query','location','start_date','end_date','tolerance_days'];
    array_keys:=array['trip_modes','landscapes','group_kinds','child_age_bands','animal_kinds'];
    f:='{"trip_modes":["planned","flexible"],"landscapes":[],"group_kinds":[],"child_age_bands":[],"animal_kinds":[],
      "favorites_only":false,"location_query":"","location":null,"start_date":null,"end_date":null,"tolerance_days":0}'::jsonb||payload;
    perform discovery_private.validate_filters(f);
    f:=jsonb_set(f,'{location_query}',to_jsonb(btrim(f->>'location_query')));
    if f->>'start_date' is null then f:=jsonb_set(f,'{tolerance_days}','0'); end if;
  else
    keys:=array['name','group_kinds','child_age_bands','travel_modes','interests','animal_kinds','has_trips','online_only','favorites_only'];
    array_keys:=array['group_kinds','child_age_bands','travel_modes','interests','animal_kinds'];
    f:='{"name":"","group_kinds":[],"child_age_bands":[],"travel_modes":[],"interests":[],"animal_kinds":[],
      "has_trips":false,"online_only":false,"favorites_only":false}'::jsonb||payload;
    -- Existing directory validation, with no candidate rows or result snapshots.
    perform discovery_private.directory_candidates(f,me,'{}'::uuid[]);
    f:=jsonb_set(f,'{name}',to_jsonb(btrim(f->>'name')));
  end if;
  for key in select jsonb_object_keys(f) loop
    if not key=any(keys) then raise exception 'Unknown filter' using errcode='22023'; end if;
  end loop;
  foreach key in array array_keys loop
    if jsonb_typeof(f->key) is distinct from 'array' or jsonb_array_length(f->key)>20
      or exists(select 1 from jsonb_array_elements(f->key) v where jsonb_typeof(v)<>'string')
      or jsonb_array_length(f->key)<>(select count(distinct v) from jsonb_array_elements(f->key) v) then
      raise exception 'Invalid filter values' using errcode='22023';
    end if;
    f:=jsonb_set(f,array[key],coalesce((select jsonb_agg(v order by v) from jsonb_array_elements(f->key) v),'[]'::jsonb));
  end loop;
  return f;
end $$;
revoke all on function discovery_private.filter_set_payload(text,jsonb,uuid) from public,anon,authenticated;

create function public.list_my_filter_sets() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); result jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(s)-'owner_group_id' order by lower(s.name),s.id),'[]'::jsonb)
    into result from discovery_private.saved_filter_sets s where s.owner_group_id=me;
  return result;
end $$;

-- A caller-generated ID makes create retries idempotent. Null payload is rename-only.
create function public.save_my_filter_set(target_id uuid,filter_kind text,set_name text,filter_payload jsonb default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); current_row discovery_private.saved_filter_sets;
  result discovery_private.saved_filter_sets; normalized_name text; normalized_filters jsonb;
begin
  if target_id is null or filter_kind is null or filter_kind not in ('trips','groups')
    or set_name is null or octet_length(set_name)>1000 then
    raise exception 'Invalid filter set' using errcode='22023';
  end if;
  normalized_name:=btrim(regexp_replace(set_name,'\s+',' ','g'));
  if char_length(normalized_name) not between 1 and 40 then raise exception 'Invalid filter set name' using errcode='22023'; end if;
  -- Serialize only this owner's mutations, including limit checks and retries.
  perform 1 from public.travel_groups where id=me for update;
  select * into current_row from discovery_private.saved_filter_sets where id=target_id;
  if found and (current_row.owner_group_id<>me or current_row.kind<>filter_kind) then
    raise exception 'Filter set unavailable' using errcode='P0002';
  end if;
  if filter_payload is null then
    if current_row.id is null then raise exception 'Filter set unavailable' using errcode='P0002'; end if;
    normalized_filters:=current_row.filters;
  else
    normalized_filters:=discovery_private.filter_set_payload(filter_kind,filter_payload,me);
  end if;
  if current_row.id is null and (select count(*) from discovery_private.saved_filter_sets where owner_group_id=me and kind=filter_kind)>=10 then
    raise exception 'Filter set limit reached' using errcode='54000';
  end if;
  if current_row.id is not null and current_row.name=normalized_name and current_row.filters=normalized_filters then
    return to_jsonb(current_row)-'owner_group_id';
  end if;
  insert into discovery_private.saved_filter_sets(id,owner_group_id,kind,name,filters)
    values(target_id,me,filter_kind,normalized_name,normalized_filters)
    on conflict(id) do update set name=excluded.name,filters=excluded.filters,updated_at=now()
    where discovery_private.saved_filter_sets.owner_group_id=me and discovery_private.saved_filter_sets.kind=filter_kind
    returning * into result;
  if result.id is null then raise exception 'Filter set unavailable' using errcode='P0002'; end if;
  return to_jsonb(result)-'owner_group_id';
end $$;

create function public.delete_my_filter_set(target_id uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id();
begin
  if target_id is null then raise exception 'Invalid filter set' using errcode='22023'; end if;
  perform 1 from public.travel_groups where id=me for update;
  delete from discovery_private.saved_filter_sets where id=target_id and owner_group_id=me;
  return true;
end $$;
revoke all on function public.list_my_filter_sets(),public.save_my_filter_set(uuid,text,text,jsonb),public.delete_my_filter_set(uuid) from public,anon,authenticated;
grant execute on function public.list_my_filter_sets(),public.save_my_filter_set(uuid,text,text,jsonb),public.delete_my_filter_set(uuid) to authenticated;

alter table messaging_private.sync_revisions add column saved_filters bigint not null default 0;
create function discovery_private.filter_sets_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
  recipient:=case when tg_op='DELETE' then old.owner_group_id else new.owner_group_id end;
  if not exists(select 1 from public.travel_groups where id=recipient) then return null; end if;
  insert into messaging_private.sync_revisions(group_id,saved_filters) values(recipient,1)
    on conflict(group_id) do update set saved_filters=messaging_private.sync_revisions.saved_filters+1;
  insert into public.mailbox_updates(group_id) values(recipient)
    on conflict(group_id) do update set revision=public.mailbox_updates.revision+1;
  return null;
end $$;
revoke all on function discovery_private.filter_sets_changed() from public,anon,authenticated;
create trigger sync_saved_filter_sets after insert or update or delete on discovery_private.saved_filter_sets
  for each row execute function discovery_private.filter_sets_changed();

create or replace function public.get_my_sync_state() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); result jsonb;
begin
  select jsonb_build_object(
    'domains',coalesce((select jsonb_build_object('mailbox',s.mailbox::text,'notifications',s.notifications::text,
      'favorites',s.favorites::text,'trips',s.trips::text,'saved_filters',s.saved_filters::text) from messaging_private.sync_revisions s where s.group_id=me),
      '{"mailbox":"0","notifications":"0","favorites":"0","trips":"0","saved_filters":"0"}'::jsonb),
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
notify pgrst,'reload schema';
