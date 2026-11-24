-- Family website: core schema, privacy rules and audit trail.
-- Every table has row-level security. The website never decides who sees what:
-- these policies do, so a bug in the website cannot leak private details.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.visibility as enum ('family', 'close', 'private');
create type public.member_role as enum ('admin', 'member');
create type public.member_status as enum ('active', 'suspended');
create type public.manage_kind as enum ('guardian', 'steward');

-- ---------------------------------------------------------------------------
-- The tree: people and how they connect (visible to every signed-in member)
-- ---------------------------------------------------------------------------
create table public.persons (
  id            text primary key default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  given_name    text not null check (length(given_name) between 1 and 120),
  surname       text not null default '' check (length(surname) <= 120),
  birth_surname text not null default '' check (length(birth_surname) <= 120),
  gender        text not null default '' check (gender in ('m', 'f', 'o', '')),
  birth_year    int check (birth_year between 1000 and 2200),
  is_living     boolean not null default true,
  death_date    text check (death_date ~ '^[0-9]{8}$'),   -- YYYYMMDD, 00 for unknown parts
  death_place   text check (length(death_place) <= 200),
  sort_key      text,                                    -- birth order among siblings
  created_at    timestamptz not null default now(),
  created_by    uuid
);
comment on table public.persons is 'One row per individual. Only name, relationships and birth year live here; everything personal is in profile_fields with its own visibility.';

create table public.parent_links (
  child_id  text not null references public.persons(id) on delete cascade,
  parent_id text not null references public.persons(id) on delete cascade,
  kind      text not null default 'biological' check (kind in ('biological', 'adopted', 'step', 'guardian', 'foster', 'other')),
  primary key (child_id, parent_id),
  check (child_id <> parent_id)
);
create index on public.parent_links(parent_id);

create table public.partnerships (
  id         bigint generated always as identity primary key,
  person_a   text not null references public.persons(id) on delete cascade,
  person_b   text not null references public.persons(id) on delete cascade,
  kind       text not null default 'married' check (kind in ('married', 'partner', 'engaged', 'separated', 'divorced', 'other')),
  is_current boolean not null default true,
  start_date text check (start_date ~ '^[0-9]{8}$'),
  place      text check (length(place) <= 200),
  check (person_a <> person_b)
);
create unique index partnerships_pair on public.partnerships (least(person_a, person_b), greatest(person_a, person_b));

-- ---------------------------------------------------------------------------
-- Personal details, each with its own visibility
-- ---------------------------------------------------------------------------
create table public.profile_fields (
  person_id  text not null references public.persons(id) on delete cascade,
  field      text not null check (field in (
               'known_as', 'birth_date', 'birth_place', 'city', 'work', 'organisation',
               'interests', 'about', 'photo', 'phone', 'email', 'address')),
  value      text not null check (length(value) between 1 and 4000),
  visibility public.visibility not null,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (person_id, field)
);
comment on column public.profile_fields.value is 'For photo: the storage path inside the private "photos" bucket.';

-- Contact fields are the sensitive ones: never shown for children, default to close family.
create function public.is_contact_field(f text) returns boolean
language sql immutable as $$ select f in ('phone', 'email', 'address') $$;

create function public.default_visibility(f text) returns public.visibility
language sql immutable as $$
  select case
    when f = 'address' then 'private'::public.visibility
    when f in ('phone', 'email', 'birth_date') then 'close'::public.visibility
    else 'family'::public.visibility end
$$;

-- ---------------------------------------------------------------------------
-- Accounts, invitations, consent, stewardship
-- ---------------------------------------------------------------------------
create table public.members (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  person_id  text unique references public.persons(id) on delete set null,
  role       public.member_role not null default 'member',
  status     public.member_status not null default 'active',
  invited_by uuid,
  created_at timestamptz not null default now()
);

create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (email = lower(email) and email like '%@%'),
  person_id   text references public.persons(id) on delete cascade,
  role        public.member_role not null default 'member',
  invited_by  uuid,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz
);
create unique index invitations_open_email on public.invitations(email) where accepted_at is null;

create table public.policy_versions (
  version        int primary key,
  body           text not null,
  effective_from timestamptz not null default now()
);

create table public.consents (
  id                 uuid primary key default gen_random_uuid(),
  person_id          text not null references public.persons(id) on delete cascade,
  given_by           uuid not null,
  relation           text not null check (relation in ('self', 'guardian', 'steward')),
  policy_version     int not null references public.policy_versions(version),
  show_photo         boolean not null default true,
  allow_tags         boolean not null default true,
  include_in_exports boolean not null default true,
  granted_at         timestamptz not null default now(),
  withdrawn_at       timestamptz,
  user_agent         text check (length(user_agent) <= 400)
);
create index on public.consents(person_id) where withdrawn_at is null;

create table public.managers (
  manager_person_id text not null references public.persons(id) on delete cascade,
  person_id         text not null references public.persons(id) on delete cascade,
  kind              public.manage_kind not null,
  primary key (manager_person_id, person_id)
);

create table public.deletion_requests (
  id           uuid primary key default gen_random_uuid(),
  person_id    text not null references public.persons(id) on delete cascade,
  requested_by uuid not null,
  reason       text check (length(reason) <= 1000),
  status       text not null default 'open' check (status in ('open', 'done', 'declined')),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor      uuid,
  action     text not null,
  table_name text not null,
  record_key text,
  before     jsonb,
  after      jsonb,
  at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helper functions used by the policies. SECURITY DEFINER so they can look
-- across tables without recursive policy checks; each returns only a yes/no
-- or ids, never private values.
-- ---------------------------------------------------------------------------
create function public.my_person_id() returns text
language sql stable security definer set search_path = public as $$
  select person_id from members where user_id = auth.uid() and status = 'active'
$$;

create function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where user_id = auth.uid() and status = 'active')
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where user_id = auth.uid() and status = 'active' and role = 'admin')
$$;

-- Under 18, judged by birth year (the tree rarely has full dates for everyone).
-- Someone with no birth year is treated as an adult only if they have a member account.
create function public.is_minor(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_living and birth_year is not null
                     and birth_year > extract(year from now())::int - 18
                   from persons where id = p), false)
$$;

create function public.has_consent(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from consents where person_id = p and withdrawn_at is null)
$$;

-- A person plus their current partners.
create function public.household(p text) returns setof text
language sql stable security definer set search_path = public as $$
  select p
  union
  select case when person_a = p then person_b else person_a end
  from partnerships
  where (person_a = p or person_b = p) and is_current and kind in ('married', 'partner', 'engaged')
$$;

-- Close family = parents, children, siblings and spouse, and their households.
-- Two people are close if anyone in one's household is the same as, a parent or
-- child of, or a sibling of anyone in the other's household.
create function public.is_close(a text, b text) returns boolean
language sql stable security definer set search_path = public as $$
  with ha as (select household(a) as x), hb as (select household(b) as y)
  select a is not null and b is not null and exists (
    select 1 from ha, hb
    where ha.x = hb.y
       or exists (select 1 from parent_links l where (l.child_id = ha.x and l.parent_id = hb.y)
                                                 or (l.child_id = hb.y and l.parent_id = ha.x))
       or exists (select 1 from parent_links l1 join parent_links l2 on l1.parent_id = l2.parent_id
                  where l1.child_id = ha.x and l2.child_id = hb.y)
  )
$$;

-- Who may edit a person's profile: themselves; a parent while they are a minor;
-- a child (or named steward) once they have passed away; a named guardian; an admin.
create function public.can_manage(p text) returns boolean
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

-- Whether the viewer may see a detail of person p at the given visibility.
-- Living people's details are shown to others only after they (or a guardian) consent.
create function public.can_see(p text, vis public.visibility) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when can_manage(p) then true
    when not is_member() then false
    when exists (select 1 from persons where id = p and is_living) and not has_consent(p) then false
    when vis = 'family' then true
    when vis = 'close' then is_close(my_person_id(), p)
    else false
  end
$$;

-- A photo is shown only if its consent allows photos (guardians switch this on for children).
create function public.photo_allowed(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select can_manage(p)
      or exists (select 1 from persons where id = p and not is_living)
      or exists (select 1 from consents where person_id = p and withdrawn_at is null and show_photo)
$$;

-- Which people have joined (a yes/no per person, for the "invite" buttons).
create function public.joined_people() returns setof text
language sql stable security definer set search_path = public as $$
  select person_id from members where status = 'active' and person_id is not null and is_member()
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.persons           enable row level security;
alter table public.parent_links      enable row level security;
alter table public.partnerships      enable row level security;
alter table public.profile_fields    enable row level security;
alter table public.members           enable row level security;
alter table public.invitations       enable row level security;
alter table public.policy_versions   enable row level security;
alter table public.consents          enable row level security;
alter table public.managers          enable row level security;
alter table public.deletion_requests enable row level security;
alter table public.audit_log         enable row level security;

-- Signed-out visitors get nothing at all.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

-- The tree: every member reads; only admins change its structure.
create policy persons_read  on public.persons for select to authenticated using (is_member());
create policy persons_admin on public.persons for all    to authenticated using (is_admin()) with check (is_admin());
create policy links_read    on public.parent_links for select to authenticated using (is_member());
create policy links_admin   on public.parent_links for all    to authenticated using (is_admin()) with check (is_admin());
create policy partners_read on public.partnerships for select to authenticated using (is_member());
create policy partners_admin on public.partnerships for all   to authenticated using (is_admin()) with check (is_admin());

-- Personal details.
create policy fields_read on public.profile_fields for select to authenticated
  using (can_see(person_id, visibility) and (field <> 'photo' or photo_allowed(person_id)));
create policy fields_insert on public.profile_fields for insert to authenticated
  with check (can_manage(person_id) and not (is_contact_field(field) and is_minor(person_id)));
create policy fields_update on public.profile_fields for update to authenticated
  using (can_manage(person_id))
  with check (can_manage(person_id) and not (is_contact_field(field) and is_minor(person_id)));
create policy fields_delete on public.profile_fields for delete to authenticated using (can_manage(person_id));

-- Accounts: you see your own; admins see and manage all.
create policy members_self  on public.members for select to authenticated using (user_id = auth.uid() or is_admin());
create policy members_admin on public.members for all    to authenticated using (is_admin()) with check (is_admin());
create policy invites_admin on public.invitations for all to authenticated using (is_admin()) with check (is_admin());

-- Consent wording is readable by anyone signed in (they must read it before agreeing).
create policy policy_read  on public.policy_versions for select to authenticated using (true);
create policy policy_admin on public.policy_versions for all to authenticated using (is_admin()) with check (is_admin());

-- Consent: given and withdrawn by the person (or their guardian/steward); never deleted.
create policy consents_read   on public.consents for select to authenticated using (can_manage(person_id));
create policy consents_insert on public.consents for insert to authenticated
  with check (can_manage(person_id) and given_by = auth.uid() and withdrawn_at is null);
create policy consents_withdraw on public.consents for update to authenticated
  using (can_manage(person_id)) with check (can_manage(person_id));
revoke delete on public.consents from authenticated;

create policy managers_read  on public.managers for select to authenticated using (is_member());
create policy managers_admin on public.managers for all    to authenticated using (is_admin()) with check (is_admin());

create policy deletions_insert on public.deletion_requests for insert to authenticated
  with check (can_manage(person_id) and requested_by = auth.uid() and status = 'open');
create policy deletions_read   on public.deletion_requests for select to authenticated using (can_manage(person_id));
create policy deletions_admin  on public.deletion_requests for update to authenticated using (is_admin()) with check (is_admin());

create policy audit_read on public.audit_log for select to authenticated using (is_admin());
revoke insert, update, delete on public.audit_log from authenticated;

-- Consent rows can only be withdrawn, never rewritten: lock every column except withdrawn_at.
create function public.consents_guard() returns trigger
language plpgsql as $$
begin
  if new.person_id is distinct from old.person_id or new.given_by is distinct from old.given_by
     or new.relation is distinct from old.relation or new.policy_version is distinct from old.policy_version
     or new.show_photo is distinct from old.show_photo or new.allow_tags is distinct from old.allow_tags
     or new.include_in_exports is distinct from old.include_in_exports or new.granted_at is distinct from old.granted_at
     or old.withdrawn_at is not null then
    raise exception 'A consent can only be withdrawn. Give a new consent to change your choices.';
  end if;
  return new;
end $$;
create trigger consents_guard before update on public.consents for each row execute function public.consents_guard();

-- Stamp who changed a detail and when.
create function public.stamp_field() returns trigger
language plpgsql as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;
create trigger profile_fields_stamp before insert or update on public.profile_fields
  for each row execute function public.stamp_field();

-- ---------------------------------------------------------------------------
-- Audit trail: every change to these tables is recorded
-- ---------------------------------------------------------------------------
create function public.audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  k text;
begin
  r := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  k := case tg_table_name
         when 'profile_fields' then (r->>'person_id') || '/' || (r->>'field')
         when 'persons' then r->>'id'
         when 'parent_links' then (r->>'child_id') || '<' || (r->>'parent_id')
         when 'consents' then r->>'person_id'
         when 'members' then r->>'person_id'
         when 'invitations' then r->>'email'
         when 'deletion_requests' then r->>'person_id'
         else r->>'id' end;
  insert into audit_log(actor, action, table_name, record_key, before, after)
  values (auth.uid(), lower(tg_op), tg_table_name, k,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger audit_persons        after insert or update or delete on public.persons        for each row execute function public.audit();
create trigger audit_parent_links   after insert or update or delete on public.parent_links   for each row execute function public.audit();
create trigger audit_partnerships   after insert or update or delete on public.partnerships   for each row execute function public.audit();
create trigger audit_profile_fields after insert or update or delete on public.profile_fields for each row execute function public.audit();
create trigger audit_consents       after insert or update           on public.consents       for each row execute function public.audit();
create trigger audit_members        after insert or update or delete on public.members        for each row execute function public.audit();
create trigger audit_invitations    after insert or update or delete on public.invitations    for each row execute function public.audit();
create trigger audit_deletions      after insert or update           on public.deletion_requests for each row execute function public.audit();

-- ---------------------------------------------------------------------------
-- Invitations become accounts automatically
-- ---------------------------------------------------------------------------
-- Anyone can create a login, but a login with no invitation sees nothing.
-- When an invited email signs in (or is invited after signing in), the account
-- is linked to the person chosen by the admin.
create function public.accept_invitation(uid uuid, addr text) returns void
language plpgsql security definer set search_path = public as $$
declare
  inv invitations%rowtype;
begin
  select * into inv from invitations where email = lower(addr) and accepted_at is null limit 1;
  if not found then return; end if;
  insert into members(user_id, person_id, role, invited_by)
  values (uid, inv.person_id, inv.role, inv.invited_by)
  on conflict (user_id) do update set person_id = coalesce(members.person_id, excluded.person_id),
                                       role = case when members.role = 'admin' or excluded.role = 'admin'
                                                   then 'admin'::member_role else 'member'::member_role end;
  update invitations set accepted_at = now() where id = inv.id;
end $$;
revoke all on function public.accept_invitation(uuid, text) from public, anon, authenticated;

create function public.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform accept_invitation(new.id, new.email);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.on_auth_user_created();

create function public.on_invitation_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
begin
  select id into uid from auth.users where lower(email) = new.email limit 1;
  if uid is not null then perform accept_invitation(uid, new.email); end if;
  return new;
end $$;
create trigger on_invitation_created after insert on public.invitations
  for each row execute function public.on_invitation_created();

-- ---------------------------------------------------------------------------
-- Withdrawing everything at once (used by "Delete my information")
-- ---------------------------------------------------------------------------
-- Hides the person immediately: consent withdrawn and personal details removed.
-- An admin later completes the request (and removes photos from storage).
create function public.request_deletion(p text, why text default null) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  rid uuid;
begin
  if not can_manage(p) then raise exception 'You can only request deletion for your own profile or one you manage.'; end if;
  update consents set withdrawn_at = now() where person_id = p and withdrawn_at is null;
  delete from profile_fields where person_id = p and field <> 'photo';
  insert into deletion_requests(person_id, requested_by, reason) values (p, auth.uid(), why) returning id into rid;
  return rid;
end $$;
grant execute on function public.request_deletion(text, text) to authenticated;

grant execute on function public.my_person_id(), public.is_member(), public.is_admin(), public.is_minor(text),
  public.has_consent(text), public.is_close(text, text), public.can_manage(text), public.can_see(text, public.visibility),
  public.photo_allowed(text), public.joined_people(), public.default_visibility(text), public.is_contact_field(text)
  to authenticated;
