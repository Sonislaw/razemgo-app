-- Dev: private reactions to received messages. Reactions do not create messages,
-- unread counters, push events or change the order of conversations.
create table messaging_private.message_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  group_id uuid not null references public.travel_groups(id) on delete cascade,
  kind text not null check(kind in ('love','like','laugh','wow','hug','thanks')),
  updated_at timestamptz not null default now(),
  primary key(message_id,group_id)
);
alter table messaging_private.message_reactions enable row level security;
revoke all on messaging_private.message_reactions from public,anon,authenticated;

create function public.get_message_reactions(conversation_id uuid,message_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); result jsonb;
begin
  if me is null or not messaging_private.participates(conversation_id) then
    raise exception 'Conversation unavailable' using errcode='42501'; end if;
  if message_ids is null or cardinality(message_ids)>100 or array_position(message_ids,null) is not null
    or cardinality(message_ids)<>(select count(distinct id) from unnest(message_ids) id) then
    raise exception 'Invalid message ids' using errcode='22023'; end if;
  if exists(select 1 from unnest(message_ids) wanted(id) left join public.chat_messages m
    on m.id=wanted.id and m.conversation_id=get_message_reactions.conversation_id where m.id is null) then
    raise exception 'Message unavailable' using errcode='P0002'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('message_id',wanted.id,'kind',r.kind)),'[]'::jsonb) into result
    from unnest(message_ids) wanted(id) left join messaging_private.message_reactions r on r.message_id=wanted.id;
  return result;
end $$;

create function public.set_message_reaction(target_message_id uuid,reaction_kind text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=messaging_private.my_group_id(); chat public.conversations; target public.chat_messages; changed integer;
begin
  if me is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if reaction_kind is not null and reaction_kind not in ('love','like','laugh','wow','hug','thanks') then
    raise exception 'Invalid reaction' using errcode='22023'; end if;
  select c.* into chat from public.conversations c join public.chat_messages m on m.conversation_id=c.id
    where m.id=target_message_id and me in(c.sender_group_id,c.recipient_group_id);
  if not found then raise exception 'Message unavailable' using errcode='42501'; end if;
  perform messaging_private.lock_pair(chat.sender_group_id,chat.recipient_group_id);
  if messaging_private.pair_blocked(chat.sender_group_id,chat.recipient_group_id) then
    raise exception 'Contact unavailable' using errcode='42501'; end if;
  select * into target from public.chat_messages m where m.id=target_message_id for key share;
  if not found or target.sender_group_id=me then raise exception 'Only received messages can be reacted to' using errcode='42501'; end if;
  if reaction_kind is null then
    delete from messaging_private.message_reactions r where r.message_id=target.id and r.group_id=me;
  else
    insert into messaging_private.message_reactions(message_id,group_id,kind) values(target.id,me,reaction_kind)
      on conflict(message_id,group_id) do update set kind=excluded.kind,updated_at=now()
        where messaging_private.message_reactions.kind is distinct from excluded.kind;
  end if;
  get diagnostics changed=row_count;
  if changed>0 then perform messaging_private.touch_pair(chat.sender_group_id,chat.recipient_group_id); end if;
  return jsonb_build_object('message_id',target.id,'kind',reaction_kind);
end $$;
revoke all on function public.get_message_reactions(uuid,uuid[]),public.set_message_reaction(uuid,text) from public,anon,authenticated;
grant execute on function public.get_message_reactions(uuid,uuid[]),public.set_message_reaction(uuid,text) to authenticated;
notify pgrst,'reload schema';
