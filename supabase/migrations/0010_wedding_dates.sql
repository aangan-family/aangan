-- Wedding dates for the family calendar. The tree stays admin-only, but either partner
-- (or whoever looks after their profile) may record when and where they married.
create function public.set_wedding(a text, b text, wedding_date text, wedding_place text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_member() or not (can_manage(a) or can_manage(b)) then
    raise exception 'Only the couple (or someone who looks after their profile) can set their wedding date.';
  end if;
  if wedding_date is not null and wedding_date !~ '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$' then
    raise exception 'Please give the wedding date as a full date.';
  end if;
  update partnerships set start_date = wedding_date, place = nullif(btrim(left(wedding_place, 120)), '')
  where least(person_a, person_b) = least(a, b) and greatest(person_a, person_b) = greatest(a, b) and kind = 'married';
  if not found then raise exception 'They aren’t recorded as married in the tree. Ask an admin to add the marriage first.'; end if;
end $$;
revoke all on function public.set_wedding(text, text, text, text) from public, anon;
grant execute on function public.set_wedding(text, text, text, text) to authenticated;
