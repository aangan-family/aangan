-- 0039: who has actually signed in (first_signin_at, 0037), for the "who's on the site" view of the Family tree.
-- Person ids only, members only, like joined_people().
create function public.signed_in_people() returns setof text
language sql stable security definer set search_path = public as $$
  select person_id from members
   where status = 'active' and person_id is not null and first_signin_at is not null and is_member()
$$;
revoke all on function public.signed_in_people() from public, anon;
grant execute on function public.signed_in_people() to authenticated;
