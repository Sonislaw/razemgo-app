-- Hosted Supabase grants EXECUTE to anon/authenticated through default privileges.
-- Revoking PUBLIC alone does not remove those explicit grants.
revoke all on function public.save_my_trip(jsonb, uuid, boolean, uuid),
  public.change_my_trip_status(uuid, text), public.duplicate_my_trip(uuid),
  public.delete_my_trip(uuid), public.list_public_trips(uuid),
  public.save_my_profile(jsonb), public.profile_array_valid(text[], text[], integer)
  from public, anon;
grant execute on function public.save_my_trip(jsonb, uuid, boolean, uuid),
  public.change_my_trip_status(uuid, text), public.duplicate_my_trip(uuid),
  public.delete_my_trip(uuid), public.list_public_trips(uuid),
  public.save_my_profile(jsonb), public.profile_array_valid(text[], text[], integer)
  to authenticated;
revoke all on function public.guard_trip_write() from public, anon, authenticated;
notify pgrst, 'reload schema';
