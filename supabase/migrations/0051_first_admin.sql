-- 0051: the very first admin of a new family website.
-- A brand-new site has no members, so nobody could invite the first admin (invitations_new() requires a
-- member). This lets the setup script do it once: run in the Supabase SQL editor (no signed-in user,
-- auth.uid() is null), while the site has no admin and no admin invitation yet, an admin invitation is
-- accepted and approved at once. After that, invitations work exactly as before.
create or replace function public.invitations_new() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.invited_by := auth.uid();
  new.created_at := now();
  new.accepted_at := null;
  new.notified_at := null;
  new.code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  -- setup only (0051): the first admin, added from the SQL editor before anyone has joined
  if auth.uid() is null and new.role = 'admin'
     and not exists (select 1 from members where role = 'admin')
     and not exists (select 1 from invitations where role = 'admin' and accepted_at is null) then
    new.approved_at := now(); new.approved_by := null;
    return new;
  end if;
  -- stewards and admins vouch for the email themselves; a member's invitation waits for one of them
  if is_steward() then new.approved_at := now(); new.approved_by := auth.uid();
  else new.approved_at := null; new.approved_by := null; end if;
  -- everyone, admins too: no second invitation for someone who has joined or already has one waiting (0035)
  if new.person_id is not null and exists (select 1 from members where person_id = new.person_id) then
    raise exception 'They have already joined.'; end if;
  if new.person_id is not null and exists (select 1 from invitations where person_id = new.person_id and accepted_at is null) then
    raise exception 'They already have an invitation waiting. Use Share or Resend on it instead.'; end if;
  if is_admin() then return new; end if;
  if not is_member() then raise exception 'Only family members can invite.'; end if;
  if new.role <> 'member' then raise exception 'Only a family admin can invite another admin.'; end if;
  if new.person_id is null then raise exception 'Choose who you are inviting from the family tree.'; end if;
  if not exists (select 1 from persons where id = new.person_id and is_living) then
    raise exception 'You can only invite living relatives.'; end if;
  if exists (select 1 from members where person_id = new.person_id) then raise exception 'They have already joined.'; end if;
  if exists (select 1 from invitations where person_id = new.person_id and accepted_at is null) then
    raise exception 'Someone has already invited them.'; end if;
  if (select count(*) from invitations where invited_by = auth.uid() and accepted_at is null) >= 25 then
    raise exception 'You have 25 invitations waiting. Please wait for some to be accepted first.'; end if;
  return new;
end $$;

