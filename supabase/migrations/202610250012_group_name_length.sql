-- Keep the same crew identity and ownership rules; tighten display name validation.
alter table public.travel_groups
  drop constraint travel_groups_name_check,
  add constraint travel_groups_name_check
    check (name = btrim(name) and char_length(name) between 2 and 20);
