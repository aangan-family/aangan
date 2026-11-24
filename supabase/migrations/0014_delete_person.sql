-- 0014: admins remove a person from the tree.
-- Deletes the person and, through the existing cascades, their parent links, partnerships, details,
-- consents, manager links, photo tags and open invitations. Everything is written to audit_log by the
-- existing triggers. Only admins (tree_delete_admin_only from 0013 still applies underneath).
-- Refused for someone who has joined (their login would be left without a place; suspend them instead)
-- and for the admin's own profile. Returns the storage paths of their profile photos so the app can
-- remove the files too.

create function public.delete_person(person text) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  paths text[];
  who text;
begin
  if not is_admin() then
    raise exception 'Only a family admin can remove people from the tree.';
  end if;
  select trim(given_name || ' ' || coalesce(surname, '')) into who from persons where id = person;
  if who is null then
    raise exception 'This person is no longer in the tree.';
  end if;
  if exists (select 1 from members m where m.person_id = person and m.user_id = auth.uid()) then
    raise exception 'You can’t remove your own profile.';
  end if;
  if exists (select 1 from members m where m.person_id = person) then
    raise exception '% has joined the site, so they can’t be removed from the tree. To stop their access, suspend their account in Admin → Members & roles.', who;
  end if;
  select coalesce(array_agg(value), '{}') into paths
    from profile_fields where person_id = person and field = 'photo' and value like person || '/%';
  delete from persons where id = person;
  return paths;
end $$;
revoke all on function public.delete_person(text) from public, anon;
grant execute on function public.delete_person(text) to authenticated;
