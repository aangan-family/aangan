-- 0042: relationship status.
-- 1. Personal status: profile field marital_status, its own visibility (default family), shown only while consent is active.
--    single | alliance (looking for an alliance) | engaged | married | separated | divorced | widowed.
--    Under-18s can only be 'single' (nobody marks a child as engaged or looking for an alliance).
-- 2. Couple status: set_couple() now also takes separated / divorced (partnerships.kind already allowed them).
alter table public.profile_fields drop constraint if exists profile_fields_field_check;
alter table public.profile_fields add constraint profile_fields_field_check check (field in (
  'known_as', 'birth_date', 'birth_place', 'city', 'work', 'organisation',
  'interests', 'about', 'photo', 'phone', 'email', 'address',
  'gothram', 'sutram', 'vedam', 'native_place', 'kuladeivam',
  'janma_nakshatram', 'horoscope', 'shraddha_tithi',
  'upanayanam', 'sashtiabdapoorthi', 'bhimaratha_shanti', 'sathabhishekam',
  'engagement', 'engaged_to', 'marital_status'));
alter table public.profile_fields drop constraint if exists profile_fields_marital_status;
alter table public.profile_fields add constraint profile_fields_marital_status check (
  field <> 'marital_status' or value in ('single', 'alliance', 'engaged', 'married', 'separated', 'divorced', 'widowed'));

create function public.marital_status_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.field = 'marital_status' and new.value <> 'single'
     and exists (select 1 from persons p where p.id = new.person_id and p.is_living
                 and p.birth_year is not null and p.birth_year > extract(year from now())::int - 18) then
    raise exception 'Under-18s can only be shown as single.';
  end if;
  return new;
end $$;
revoke all on function public.marital_status_guard() from public, anon, authenticated;
create trigger profile_fields_marital_status_guard before insert or update on public.profile_fields
  for each row when (new.field = 'marital_status') execute function public.marital_status_guard();

create or replace function public.set_couple(a text, b text, status text, on_date text, at_place text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_member() or not (can_manage(a) or can_manage(b) or is_steward()) then
    raise exception 'Only the couple (or someone who looks after their profile) can change this.';
  end if;
  if status not in ('married', 'engaged', 'separated', 'divorced') then raise exception 'Choose married, engaged, separated or divorced.'; end if;
  if on_date is not null and on_date !~ '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$' then
    raise exception 'Please give the date as a full date.';
  end if;
  update partnerships set kind = status,
    -- separating or divorcing keeps the wedding date and place
    start_date = case when status in ('separated', 'divorced') then start_date else on_date end,
    place = case when status in ('separated', 'divorced') then place else nullif(btrim(left(at_place, 120)), '') end
  where least(person_a, person_b) = least(a, b) and greatest(person_a, person_b) = greatest(a, b)
    and kind in ('married', 'engaged', 'separated', 'divorced');
  if not found then raise exception 'They aren’t linked as a couple in the tree. Ask a steward to add them first.'; end if;
end $$;
