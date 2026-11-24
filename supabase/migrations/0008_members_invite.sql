-- Any family member can invite a relative by email, within limits:
--  - always as a member (only admins can make admins);
--  - only for a living adult already in the tree who hasn't joined and has no open invitation;
--  - members see and cancel only the invitations they sent; admins see all;
--  - at most 25 open invitations per member.

create or replace function public.invitations_new() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.invited_by := auth.uid();
  new.created_at := now();
  new.accepted_at := null;
  if is_admin() then return new; end if;
  if not is_member() then raise exception 'Only family members can invite.'; end if;
  if new.role <> 'member' then raise exception 'Only a family admin can invite another admin.'; end if;
  if new.person_id is null then raise exception 'Choose who you are inviting from the family tree.'; end if;
  if not exists (select 1 from persons where id = new.person_id and is_living) then
    raise exception 'You can only invite living relatives.'; end if;
  if is_minor(new.person_id) then raise exception 'Children under 18 can''t be invited. Their parents look after their profile.'; end if;
  if exists (select 1 from members where person_id = new.person_id) then raise exception 'They have already joined.'; end if;
  if exists (select 1 from invitations where person_id = new.person_id and accepted_at is null) then
    raise exception 'Someone has already invited them.'; end if;
  if (select count(*) from invitations where invited_by = auth.uid() and accepted_at is null) >= 25 then
    raise exception 'You have 25 invitations waiting. Please wait for some to be accepted first.'; end if;
  return new;
end $$;
create trigger invitations_new before insert on public.invitations for each row execute function public.invitations_new();

-- (invites_admin from 0001 still lets admins do everything)
create policy invites_read   on public.invitations for select to authenticated using (is_member() and invited_by = auth.uid());
create policy invites_insert on public.invitations for insert to authenticated with check (is_member() and role = 'member');
create policy invites_cancel on public.invitations for delete to authenticated
  using (is_member() and invited_by = auth.uid() and accepted_at is null);

-- Who already has an invitation waiting (person only, never the email), so nobody is invited twice.
create function public.invited_people() returns setof text
language sql stable security definer set search_path = public as $$
  select person_id from invitations where accepted_at is null and person_id is not null and is_member()
$$;
revoke all on function public.invited_people() from public, anon;
grant execute on function public.invited_people() to authenticated;
