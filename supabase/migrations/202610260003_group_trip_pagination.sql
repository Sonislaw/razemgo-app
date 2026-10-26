-- Bounded crew-profile listings. Keep the one-argument RPC for older clients.
create function public.get_public_group(target_group_id uuid,after_cursor jsonb,page_size integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); target public.travel_groups; viewer public.travel_groups;
  details public.group_public_profiles; result jsonb; after_at timestamptz; after_id uuid;
  query_key text:=md5(me::text||':'||target_group_id::text);
begin
  if target_group_id is null or page_size is null or page_size<1 or page_size>20 then
    raise exception 'Invalid page size or group' using errcode='22023'; end if;
  if after_cursor is not null then
    begin
      if jsonb_typeof(after_cursor) is distinct from 'object' or after_cursor->>'query_key' is distinct from query_key
        or after_cursor->>'id' is null or after_cursor->>'published_at' is null then raise exception 'Invalid cursor'; end if;
      after_id:=(after_cursor->>'id')::uuid; after_at:=(after_cursor->>'published_at')::timestamptz;
      if not isfinite(after_at) then raise exception 'Invalid cursor'; end if;
    exception when others then raise exception 'Invalid cursor' using errcode='22023'; end;
  end if;
  select * into target from public.travel_groups g where g.id=target_group_id;
  if not found or target.id=me or messaging_private.pair_blocked(me,target.id) then return null; end if;
  select * into details from public.group_public_profiles where group_id=target.id;
  if not coalesce(details.discoverable,false) and messaging_private.public_trip_count(target.id)=0
    and not exists(select 1 from public.contact_invitations i where me in(i.sender_group_id,i.recipient_group_id)
      and target.id in(i.sender_group_id,i.recipient_group_id) and i.status in('pending','accepted')) then return null; end if;
  select * into viewer from public.travel_groups where id=me;
  with matched as materialized (
    select t.id,t.published_at from public.trip_plans t where t.group_id=target.id
      and t.status='published' and t.visibility='public' and t.end_date>current_date
      and not exists(select 1 from moderation_private.hidden_trips h where h.trip_id=t.id)
      and (after_id is null or t.published_at<after_at or (t.published_at=after_at and t.id>after_id))
    order by t.published_at desc,t.id limit page_size+1
  ), page as materialized (select * from matched order by published_at desc,id limit page_size)
  select jsonb_build_object('crew',messaging_private.public_crew(target),'about',coalesce(details.about,''),
    'active_trip_count',messaging_private.public_trip_count(target.id),
    'compatibility',messaging_private.group_compatibility(viewer,target),
    'trips',coalesce((select jsonb_agg(to_jsonb(p) order by t.published_at desc,t.id)
      from page t cross join lateral public.list_public_trips(t.id) p),'[]'::jsonb),
    'has_more',(select count(*)>page_size from matched),
    'cursor',(select jsonb_build_object('id',id,'published_at',published_at,'query_key',query_key)
      from page order by published_at,id desc limit 1)) into result;
  return result;
end $$;
create index trip_group_recent on public.trip_plans(group_id,published_at desc,id)
  where status='published' and visibility='public';
revoke all on function public.get_public_group(uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.get_public_group(uuid,jsonb,integer) to authenticated;
notify pgrst,'reload schema';
