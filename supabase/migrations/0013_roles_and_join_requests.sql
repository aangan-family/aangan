-- Roles and joining by request.
--
--  member   edits their own profile, and close family who haven't joined yet (or have passed away)
--  steward  edits anyone who hasn't joined yet (or has passed away), adds and corrects people and
--           relationships in the tree, and approves requests to join
--  admin    everything, plus roles, settings and removing people from the tree
--
-- Once someone has joined, their details are theirs: only they (and admins, and a parent while
-- they're under 18) edit them. Giving or withdrawing consent stays with the person themselves,
-- their guardian or an admin (can_consent), so what others edit stays hidden from the wider
-- family until the person agrees.

create function public.is_steward() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where user_id = auth.uid() and status = 'active' and role in ('steward', 'admin'))
$$;

create function public.has_joined(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where person_id = p and status = 'active')
$$;

-- The old can_manage: themselves, a parent of a minor, a child of someone who has passed away,
-- a named guardian, an admin. These people may also give or withdraw consent.
create function public.can_consent(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or (
    is_member() and (
      my_person_id() = p
      or (is_minor(p) and exists (select 1 from parent_links where child_id = p and parent_id = my_person_id()))
      or (exists (select 1 from persons where id = p and not is_living)
          and exists (select 1 from parent_links where parent_id = p and child_id = my_person_id()))
      or exists (select 1 from managers where person_id = p and manager_person_id = my_person_id())
    )
  )
$$;

-- Who may edit a person's details (and see what has been recorded for them).
create or replace function public.can_manage(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select can_consent(p) or (
    is_member() and p is not null and not has_joined(p)
    and exists (select 1 from persons where id = p)
    and (is_steward() or is_close(my_person_id(), p))
  )
$$;

revoke all on function public.is_steward(), public.has_joined(text), public.can_consent(text) from public, anon;
grant execute on function public.is_steward(), public.has_joined(text), public.can_consent(text) to authenticated;

-- Consent stays with the person, their guardian, or an admin.
alter policy consents_read on public.consents using (can_consent(person_id));
alter policy consents_insert on public.consents with check (can_consent(person_id) and given_by = auth.uid() and withdrawn_at is null);
alter policy consents_withdraw on public.consents using (can_consent(person_id)) with check (can_consent(person_id));

-- The tree: stewards add and correct; only admins remove.
alter policy persons_admin on public.persons using (is_steward()) with check (is_steward());
alter policy links_admin on public.parent_links using (is_steward()) with check (is_steward());
alter policy partners_admin on public.partnerships using (is_steward()) with check (is_steward());

create function public.tree_delete_admin_only() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'Only a family admin can remove people or relationships from the tree.';
  end if;
  return old;
end $$;
revoke all on function public.tree_delete_admin_only() from public, anon, authenticated;
create trigger persons_delete_admin before delete on public.persons for each row execute function public.tree_delete_admin_only();
create trigger links_delete_admin before delete on public.parent_links for each row execute function public.tree_delete_admin_only();
create trigger partners_delete_admin before delete on public.partnerships for each row execute function public.tree_delete_admin_only();

-- Adding relatives: stewards too.
create or replace function public.add_relative(
  anchor text,          -- the person the new relative is added to
  kind text,            -- 'parent' | 'child' | 'spouse' | 'sibling'
  given_name text,
  surname text default '',
  birth_surname text default '',
  gender text default '',
  birth_year int default null,
  is_living boolean default true,
  death_date text default null,
  other_parent text default null  -- for 'child': the anchor's partner, if they are the other parent
) returns text
language plpgsql security invoker set search_path = public as $$
declare
  new_id text;
  n int;
begin
  if not is_steward() then raise exception 'Only a family steward or admin can add people to the tree.'; end if;
  if kind not in ('parent', 'child', 'spouse', 'sibling') then raise exception 'Unknown relationship: %', kind; end if;
  if not exists (select 1 from persons where id = anchor) then raise exception 'That person is not in the tree.'; end if;
  if kind = 'parent' then
    select count(*) into n from parent_links where child_id = anchor and parent_links.kind = 'biological';
    if n >= 2 then raise exception 'Both parents are already recorded.'; end if;
  end if;
  if kind = 'sibling' and not exists (select 1 from parent_links where child_id = anchor) then
    raise exception 'Add their parents first, then add brothers and sisters to the parents.';
  end if;

  insert into persons (given_name, surname, birth_surname, gender, birth_year, is_living, death_date, sort_key)
  values (trim(add_relative.given_name), coalesce(trim(add_relative.surname), ''),
          coalesce(trim(add_relative.birth_surname), ''), coalesce(add_relative.gender, ''),
          add_relative.birth_year, add_relative.is_living,
          case when add_relative.is_living then null else add_relative.death_date end,
          case when add_relative.birth_year is null then null else add_relative.birth_year::text || '.500' end)
  returning id into new_id;

  if kind = 'parent' then
    insert into parent_links (child_id, parent_id) values (anchor, new_id);
    -- the anchor's other parent becomes this person's partner, if there is one and no partnership yet
    insert into partnerships (person_a, person_b)
      select new_id, pl.parent_id from parent_links pl
      where pl.child_id = anchor and pl.parent_id <> new_id
        and not exists (select 1 from partnerships pp where least(pp.person_a, pp.person_b) = least(new_id, pl.parent_id)
                                                        and greatest(pp.person_a, pp.person_b) = greatest(new_id, pl.parent_id))
      limit 1;
  elsif kind = 'child' then
    insert into parent_links (child_id, parent_id) values (new_id, anchor);
    if other_parent is not null and other_parent <> anchor then
      insert into parent_links (child_id, parent_id) values (new_id, other_parent);
    end if;
  elsif kind = 'spouse' then
    insert into partnerships (person_a, person_b) values (anchor, new_id);
  else -- sibling: same parents as the anchor
    insert into parent_links (child_id, parent_id, kind)
      select new_id, parent_id, parent_links.kind from parent_links where child_id = anchor;
  end if;
  return new_id;
end $$;

-- ---------------------------------------------------------------------------
-- Requests to join
-- ---------------------------------------------------------------------------
-- Anyone who signs in without an invitation can ask to join. They see nothing of the family,
-- only their own request. A steward or admin matches them to their place in the tree and
-- approves (which links their account) or declines. The phone number is deleted once decided.

create type public.request_status as enum ('pending', 'approved', 'declined');

create table public.join_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  email        text not null default '',
  full_name    text not null check (length(trim(full_name)) between 2 and 120),
  father_name  text not null default '' check (length(father_name) <= 120),
  mother_name  text not null default '' check (length(mother_name) <= 120),
  spouse_name  text not null default '' check (length(spouse_name) <= 120),
  city         text not null default '' check (length(city) <= 80),
  phone        text check (phone is null or length(phone) <= 30),
  note         text not null default '' check (length(note) <= 500),
  status       public.request_status not null default 'pending',
  person_id    text references public.persons(id) on delete set null,
  decided_by   uuid,
  decided_at   timestamptz,
  decline_note text,
  notified_at  timestamptz,
  created_at   timestamptz not null default now()
);
create unique index join_requests_one_open on public.join_requests(user_id) where status = 'pending';
alter table public.join_requests enable row level security;
revoke all on public.join_requests from anon;
revoke update, delete on public.join_requests from authenticated;
grant select, insert on public.join_requests to authenticated;

create function public.join_requests_new() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  if is_member() then raise exception 'You''re already a member of the family website.'; end if;
  if (select count(*) from join_requests where user_id = auth.uid()) >= 5 then
    raise exception 'You''ve sent several requests already. Please contact the family admin.'; end if;
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
create trigger join_requests_new before insert on public.join_requests for each row execute function public.join_requests_new();

create policy jr_read   on public.join_requests for select to authenticated using (user_id = auth.uid() or is_steward());
create policy jr_insert on public.join_requests for insert to authenticated with check (user_id = auth.uid());
-- no update or delete policies: decisions go through approve_join() / decline_join()
create trigger audit_join_requests after insert or update or delete on public.join_requests for each row execute function public.audit();

create function public.approve_join(req uuid, person text) returns void
language plpgsql security definer set search_path = public as $$
declare r join_requests%rowtype;
begin
  if not is_steward() then raise exception 'Only a family steward or admin can approve requests.'; end if;
  select * into r from join_requests where id = req for update;
  if not found or r.status <> 'pending' then raise exception 'This request has already been handled.'; end if;
  if not exists (select 1 from persons where id = person and is_living) then raise exception 'Choose a living relative from the tree.'; end if;
  if is_minor(person) then raise exception 'Children under 18 can''t have their own account. Their parents look after their profile.'; end if;
  if exists (select 1 from members where person_id = person) then raise exception 'Someone has already joined as this person.'; end if;
  if exists (select 1 from members where user_id = r.user_id) then raise exception 'They have already joined.'; end if;
  if r.email = '' then raise exception 'This request has no email address.'; end if;
  delete from invitations where accepted_at is null and (person_id = person or email = r.email);
  insert into invitations (email, person_id, role) values (r.email, person, 'member');
  perform accept_invitation(r.user_id, r.email);
  update join_requests set status = 'approved', person_id = person, decided_by = auth.uid(), decided_at = now(), phone = null where id = req;
end $$;

create function public.decline_join(req uuid, note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_steward() then raise exception 'Only a family steward or admin can decline requests.'; end if;
  update join_requests set status = 'declined', decline_note = left(nullif(trim(coalesce(decline_join.note, '')), ''), 300),
         decided_by = auth.uid(), decided_at = now(), phone = null
   where id = req and status = 'pending';
  if not found then raise exception 'This request has already been handled.'; end if;
end $$;

revoke all on function public.approve_join(uuid, text), public.decline_join(uuid, text) from public, anon;
grant execute on function public.approve_join(uuid, text), public.decline_join(uuid, text) to authenticated;

-- For the reminders Worker (server key): new requests to tell the stewards and admins about.
create function public.join_requests_due()
returns table (id uuid, full_name text, father_name text, mother_name text, spouse_name text, city text, note text, approvers text)
language sql stable security definer set search_path = public as $$
  select r.id, r.full_name, r.father_name, r.mother_name, r.spouse_name, r.city, r.note,
         (select string_agg(distinct lower(u.email), ',') from members m join auth.users u on u.id = m.user_id
           where m.status = 'active' and m.role in ('admin', 'steward') and u.email is not null)
    from join_requests r
   where r.status = 'pending' and r.notified_at is null and r.created_at > now() - interval '30 days'
   order by r.created_at limit 20
$$;
create function public.join_request_notified(rid uuid) returns void
language sql security definer set search_path = public as $$
  update join_requests set notified_at = now() where id = rid and notified_at is null
$$;
revoke all on function public.join_requests_due(), public.join_request_notified(uuid) from public, anon, authenticated;
grant execute on function public.join_requests_due(), public.join_request_notified(uuid) to service_role;
