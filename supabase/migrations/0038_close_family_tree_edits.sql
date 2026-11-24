-- 0038: every member can correct the tree details (name, gender, birth year, passing) of themselves and their
-- close family (household, parents, children, brothers and sisters: is_close). Stewards and admins still edit anyone.
-- Members only change those fields; adding or removing people and relationships stays with stewards/admins.

create function public.can_edit_tree(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_steward()
      or (is_member() and not am_minor() and my_person_id() is not null and is_close(my_person_id(), p))
$$;
revoke all on function public.can_edit_tree(text) from public, anon;
grant execute on function public.can_edit_tree(text) to authenticated;

create policy persons_close_update on public.persons for update to authenticated
  using (can_edit_tree(id)) with check (can_edit_tree(id));

-- what a member (not a steward) may change, and what they may not
create function public.persons_member_edit_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or is_steward() then return new; end if;
  if new.id is distinct from old.id or new.sort_key is distinct from old.sort_key
     or new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by then
    raise exception 'You can change names, birth year and passing. Ask a steward to change anything else.';
  end if;
  if old.is_living and not new.is_living and has_joined(old.id) then
    raise exception 'Someone who has joined the site can only be marked as passed away by a steward or admin. Please let one of them know.';
  end if;
  return new;
end $$;
revoke all on function public.persons_member_edit_guard() from public, anon, authenticated;
create trigger persons_member_edit_guard before update on public.persons
  for each row execute function public.persons_member_edit_guard();
