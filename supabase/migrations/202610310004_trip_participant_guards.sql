-- Keep legacy unknown compositions readable and permit pausing/archiving,
-- while requiring participants for content edits through direct REST too.
create or replace function public.guard_trip_write() returns trigger
language plpgsql set search_path = '' as $$
declare previous_status text;
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.group_id <> old.group_id or new.created_at <> old.created_at
      or new.create_key is distinct from old.create_key then
      raise exception 'Trip identity cannot be changed' using errcode = '42501';
    end if;
    previous_status := case when old.status in ('published','paused') and old.end_date <= current_date
      then 'completed' else old.status end;
    if previous_status in ('completed','cancelled') and new.status <> previous_status
      or previous_status <> 'draft' and new.status = 'draft'
      or previous_status = 'draft' and new.status in ('completed','cancelled') then
      raise exception 'Invalid trip status transition' using errcode = '22023';
    end if;
    new.published_at := coalesce(old.published_at, case when new.status = 'published' then now() end);
  else
    if new.status in ('completed','cancelled') then
      raise exception 'Invalid initial trip status' using errcode = '22023';
    end if;
    new.created_at := now();
    new.published_at := case when new.status = 'published' then now() end;
  end if;
  if new.status in ('published','paused') and new.end_date <= current_date then
    raise exception 'Trip must end in the future' using errcode = '22023';
  end if;
  if new.status<>'draft' and (new.adult_count is null or new.child_count is null) then
    if tg_op='INSERT' then
      raise exception 'Trip participants required' using errcode='23514';
    elsif old.adult_count is not null or (new.status='published' and old.status<>'published')
      or (to_jsonb(new)-array['updated_at','published_at','status','visibility'])
        is distinct from (to_jsonb(old)-array['updated_at','published_at','status','visibility']) then
      raise exception 'Trip participants required' using errcode='23514';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

notify pgrst,'reload schema';
