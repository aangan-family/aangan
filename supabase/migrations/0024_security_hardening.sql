-- 0024: fixes from the security review (handbook → Security review (VAPT)). Re-runnable.
--
--   M1  helper functions no longer answer signed-out visitors or sign-ins without an invitation
--   H2  invitations sent by members wait for a steward or admin to approve them
--   L1  at most 20 new requests to join per day (stops stewards being spammed)
--   L2  invitation links carry a random code; a signed-out visitor only sees a masked email hint

-- ---------------------------------------------------------------------------
-- M1: helpers that reveal facts about a person answer only members (or the server, where auth.uid() is null)
-- ---------------------------------------------------------------------------
create or replace function public.has_consent(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select (auth.uid() is null or is_member())
     and exists (select 1 from consents where person_id = p and withdrawn_at is null)
$$;

create or replace function public.household(p text) returns setof text
language sql stable security definer set search_path = public as $$
  select p where auth.uid() is null or is_member()
  union
  select case when person_a = p then person_b else person_a end
  from partnerships
  where (person_a = p or person_b = p) and is_current and kind in ('married', 'partner', 'engaged')
    and (auth.uid() is null or is_member())
$$;

create or replace function public.is_minor(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select (auth.uid() is null or is_member())
     and coalesce((select is_living and birth_year is not null
                     and birth_year > extract(year from now())::int - 18
                   from persons where id = p), false)
$$;

create or replace function public.is_close(a text, b text) returns boolean
language sql stable security definer set search_path = public as $$
  with ha as (select household(a) as x), hb as (select household(b) as y)
  select (auth.uid() is null or is_member()) and a is not null and b is not null and exists (
    select 1 from ha, hb
    where ha.x = hb.y
       or exists (select 1 from parent_links l where (l.child_id = ha.x and l.parent_id = hb.y)
                                                 or (l.child_id = hb.y and l.parent_id = ha.x))
       or exists (select 1 from parent_links l1 join parent_links l2 on l1.parent_id = l2.parent_id
                  where l1.child_id = ha.x and l2.child_id = hb.y)
  )
$$;

create or replace function public.has_joined(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select (auth.uid() is null or is_member())
     and exists (select 1 from members where person_id = p and status = 'active')
$$;

create or replace function public.photo_allowed(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select (auth.uid() is null or is_member()) and (
         can_manage(p)
      or exists (select 1 from persons where id = p and not is_living)
      or exists (select 1 from consents where person_id = p and withdrawn_at is null and show_photo))
$$;

create or replace function public.photo_declined(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (auth.uid() is null or is_member())
     and exists (select 1 from photo_tags where photo_id = pid and status = 'declined')
$$;

create or replace function public.photo_uploader(pid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select uploaded_by from photos where id = pid and (auth.uid() is null or is_member())
$$;

create or replace function public.tags_refused(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select (auth.uid() is null or is_member())
     and exists (select 1 from consents where person_id = p and withdrawn_at is null and not allow_tags)
$$;

-- No security-definer function in public is callable by signed-out visitors (anon) unless granted on purpose.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute') loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;
-- functions created later start without signed-out access
do $$ begin
  alter default privileges in schema public revoke execute on functions from public, anon;
exception when others then raise notice 'default privileges unchanged: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- H2 + L2: invitations need approval when a member sends them, and carry a random code
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'invitations' and column_name = 'approved_at') then
    alter table public.invitations add column approved_at timestamptz, add column approved_by uuid, add column notified_at timestamptz;
    update public.invitations set approved_at = created_at;   -- invitations sent before today stay valid
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'invitations' and column_name = 'code') then
    alter table public.invitations add column code text;
    update public.invitations set code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) where code is null;
  end if;
end $$;
create unique index if not exists invitations_code on public.invitations(code);

create or replace function public.invitations_new() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.invited_by := auth.uid();
  new.created_at := now();
  new.accepted_at := null;
  new.notified_at := null;
  new.code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  -- stewards and admins vouch for the email themselves; a member's invitation waits for one of them
  if is_steward() then new.approved_at := now(); new.approved_by := auth.uid();
  else new.approved_at := null; new.approved_by := null; end if;
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

-- Only an approved invitation links a login to a person.
create or replace function public.accept_invitation(uid uuid, addr text) returns void
language plpgsql security definer set search_path = public as $$
declare
  inv invitations%rowtype;
begin
  select * into inv from invitations where email = lower(addr) and accepted_at is null and approved_at is not null limit 1;
  if not found then return; end if;
  insert into members(user_id, person_id, role, invited_by)
  values (uid, inv.person_id, inv.role, inv.invited_by)
  on conflict (user_id) do update set person_id = coalesce(members.person_id, excluded.person_id),
                                       role = case when members.role = 'admin' or excluded.role = 'admin'
                                                   then 'admin'::member_role else 'member'::member_role end;
  update invitations set accepted_at = now() where id = inv.id;
end $$;
revoke all on function public.accept_invitation(uuid, text) from public, anon, authenticated;

-- Stewards and admins: invitations from members waiting for a decision (they see the email, to check it is really that relative's).
create or replace function public.invitations_to_approve()
returns table (id uuid, person_id text, email text, invited_by_person text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.person_id, i.email, (select m.person_id from members m where m.user_id = i.invited_by), i.created_at
    from invitations i
   where is_steward() and i.approved_at is null and i.accepted_at is null
   order by i.created_at
$$;

create or replace function public.approve_invitation(inv uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
declare i invitations%rowtype; uid uuid;
begin
  if not is_steward() then raise exception 'Only a family steward or admin can approve invitations.'; end if;
  select * into i from invitations where id = inv for update;
  if not found or i.accepted_at is not null then raise exception 'This invitation no longer exists.'; end if;
  if i.approved_at is not null then return; end if;
  if exists (select 1 from members where person_id = i.person_id) then raise exception 'They have already joined.'; end if;
  update invitations set approved_at = now(), approved_by = auth.uid() where id = inv;
  -- already signed in with that email? link them now
  select id into uid from auth.users where lower(email) = i.email limit 1;
  if uid is not null then perform accept_invitation(uid, i.email); end if;
end $$;

create or replace function public.decline_invitation(inv uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_steward() then raise exception 'Only a family steward or admin can decline invitations.'; end if;
  delete from invitations where id = inv and approved_at is null and accepted_at is null;
  if not found then raise exception 'This invitation no longer exists.'; end if;
end $$;

revoke all on function public.invitations_to_approve(), public.approve_invitation(uuid), public.decline_invitation(uuid) from public, anon;
grant execute on function public.invitations_to_approve(), public.approve_invitation(uuid), public.decline_invitation(uuid) to authenticated;

-- Server only: tell stewards and admins about invitations waiting for them (names only, no email).
create or replace function public.invites_due()
returns table (id uuid, person_name text, inviter_name text, approvers text)
language sql stable security definer set search_path = public, auth as $$
  select i.id,
         (select trim(p.given_name || ' ' || coalesce(p.surname, '')) from persons p where p.id = i.person_id),
         (select trim(p.given_name || ' ' || coalesce(p.surname, '')) from members m join persons p on p.id = m.person_id where m.user_id = i.invited_by),
         (select string_agg(distinct lower(u.email), ',') from members m join auth.users u on u.id = m.user_id
           where m.status = 'active' and m.role in ('admin', 'steward') and u.email is not null)
    from invitations i
   where i.approved_at is null and i.accepted_at is null and i.notified_at is null and i.created_at > now() - interval '30 days'
   order by i.created_at limit 20
$$;
create or replace function public.invite_notified(inv uuid) returns void
language sql security definer set search_path = public as $$
  update invitations set notified_at = now() where id = inv and notified_at is null
$$;
revoke all on function public.invites_due(), public.invite_notified(uuid) from public, anon, authenticated;
grant execute on function public.invites_due(), public.invite_notified(uuid) to service_role;

-- L2: a signed-out visitor holding an invitation link learns only a masked email ("ra•••@gmail.com").
create or replace function public.invite_hint(c text) returns text
language sql stable security definer set search_path = public as $$
  select left(split_part(email, '@', 1), 2) || '•••@' || split_part(email, '@', 2)
    from invitations
   where code = c and length(c) = 12 and accepted_at is null and approved_at is not null
$$;
revoke all on function public.invite_hint(text) from public;
grant execute on function public.invite_hint(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- L1: no more than 20 new requests to join a day
-- ---------------------------------------------------------------------------
create or replace function public.join_requests_new() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  if is_member() then raise exception 'You''re already a member of the family website.'; end if;
  if (select count(*) from join_requests where user_id = auth.uid()) >= 5 then
    raise exception 'You''ve sent several requests already. Please contact the family admin.'; end if;
  if (select count(*) from join_requests where created_at > now() - interval '24 hours') >= 20 then
    raise exception 'Many people have asked to join today. Please try again tomorrow, or ask a relative to invite you.'; end if;
  new.user_id := auth.uid();
  new.email := coalesce((select lower(email) from auth.users where id = auth.uid()), '');
  new.full_name := trim(new.full_name);
  new.father_name := trim(coalesce(new.father_name, ''));
  new.mother_name := trim(coalesce(new.mother_name, ''));
  new.spouse_name := trim(coalesce(new.spouse_name, ''));
  new.city := trim(coalesce(new.city, ''));
  new.phone := nullif(trim(coalesce(new.phone, '')), '');
  new.note := trim(coalesce(new.note, ''));
  new.status := 'pending';
  new.person_id := null; new.decided_by := null; new.decided_at := null; new.decline_note := null; new.notified_at := null;
  new.created_at := now();
  return new;
end $$;
revoke all on function public.join_requests_new() from public, anon, authenticated;
