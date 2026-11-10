-- Reuse the existing 28-day geometry cache before making another provider call.
-- Display names and addresses remain transient view data.
create function public.get_google_place_geometry(place_id text) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('latitude',g.latitude,'longitude',g.longitude,'bounds',g.bounds,'geometryExpiresAt',g.expires_at)
  from places_private.geometry g where g.place_id=$1 and g.expires_at>now();
$$;
revoke all on function public.get_google_place_geometry(text) from public,anon,authenticated;
grant execute on function public.get_google_place_geometry(text) to service_role;
notify pgrst,'reload schema';
