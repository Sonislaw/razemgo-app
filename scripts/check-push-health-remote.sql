-- No device notifications, no Sentry calls. All diagnostic mutations roll back.
begin;
set local role authenticated;
do $$ begin
  begin perform public.get_push_health();raise exception 'Authenticated health access';exception when insufficient_privilege then null;end;
  begin perform public.claim_push_health_alerts('{}');raise exception 'Authenticated alert write';exception when insufficient_privilege then null;end;
  begin perform 1 from push_private.health_state;raise exception 'Authenticated private access';exception when insufficient_privilege then null;end;
end $$;
set local role anon;
do $$ begin
  begin perform public.get_push_health();raise exception 'Anonymous health access';exception when insufficient_privilege then null;end;
  begin perform public.finish_push_health_alert('PUSH_RETRIES',gen_random_uuid(),true);raise exception 'Anonymous alert completion';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Independent fixture state, held only within this brief transaction.
update push_private.health_alerts set active=false,lease=null,lease_until=null,last_attempted_at=null,last_reported_at=null;
set local role service_role;
do $$ declare health jsonb; first_claim record; count_claims integer; begin
  health:=public.get_push_health();
  if not (health->>'dispatcher_schedule_ok')::boolean or not (health->>'monitor_schedule_ok')::boolean then raise exception 'Missing health schedule';end if;
  if health ? 'push_token' or health ? 'message' or health ? 'command' then raise exception 'Unsafe health payload';end if;
  select * into first_claim from public.claim_push_health_alerts(array['PUSH_RETRIES']);
  if first_claim.lease is null then raise exception 'Missing health lease';end if;
  select count(*) into count_claims from public.claim_push_health_alerts(array['PUSH_RETRIES']);
  if count_claims<>0 then raise exception 'Duplicate health lease';end if;
  perform public.finish_push_health_alert(first_claim.code,first_claim.lease,true);
  select count(*) into count_claims from public.claim_push_health_alerts(array['PUSH_RETRIES']);
  if count_claims<>0 then raise exception 'Missing durable cooldown';end if;
end $$;
rollback;
select true as push_health_permissions_and_leases_verified,true as fixtures_rolled_back;
