-- 0043: Design choice: separated, divorced and "looking for an alliance" are too sensitive for the site; removed.
-- Personal status: single | engaged | married | widowed. Couple status: married | engaged.
alter table public.profile_fields drop constraint if exists profile_fields_marital_status;
alter table public.profile_fields add constraint profile_fields_marital_status check (
  field <> 'marital_status' or value in ('single', 'engaged', 'married', 'widowed'));

create or replace function public.set_couple(a text, b text, status text, on_date text, at_place text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_member() or not (can_manage(a) or can_manage(b) or is_steward()) then
    raise exception 'Only the couple (or someone who looks after their profile) can change this.';
  end if;
  if status not in ('married', 'engaged') then raise exception 'Choose married or engaged.'; end if;
  if on_date is not null and on_date !~ '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$' then
    raise exception 'Please give the date as a full date.';
  end if;
  update partnerships set kind = status, start_date = on_date, place = nullif(btrim(left(at_place, 120)), '')
  where least(person_a, person_b) = least(a, b) and greatest(person_a, person_b) = greatest(a, b) and kind in ('married', 'engaged');
  if not found then raise exception 'They aren’t linked as a couple in the tree. Ask a steward to add them first.'; end if;
end $$;
