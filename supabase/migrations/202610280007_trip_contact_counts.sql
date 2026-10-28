-- Contact counters must not depend on how many mailbox rows are cached.
create function public.get_my_trip_contact_counts(target_trip_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=favorites_private.my_group_id(); result jsonb;
begin
  if not exists(select 1 from public.trip_plans where id=target_trip_id and group_id=me) then
    raise exception 'Trip unavailable' using errcode='42501';end if;
  with relevant as (
    select i.*,case when i.sender_group_id=me then i.recipient_group_id else i.sender_group_id end as peer
    from public.contact_invitations i where
      ((i.recipient_group_id=me and i.trip_reference=target_trip_id)
        or (i.sender_group_id=me and i.source_trip_snapshot->>'id'=target_trip_id::text))
      and not messaging_private.pair_blocked(i.sender_group_id,i.recipient_group_id)
  ) select jsonb_build_object('contacts',(select count(distinct peer) from relevant i where status='accepted'
      and exists(select 1 from public.conversations c where c.invitation_id=i.id)),
    'pending',(select count(*) from relevant where status='pending')) into result;
  return result;
end $$;
revoke all on function public.get_my_trip_contact_counts(uuid) from public,anon,authenticated;
grant execute on function public.get_my_trip_contact_counts(uuid) to authenticated;
notify pgrst,'reload schema';
