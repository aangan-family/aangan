-- The whole family website database: privacy rules, tables and functions (51 steps).
-- Paste all of this into Supabase → SQL Editor → New query, and press Run. Run it once, on a new project.
-- Made by: npm run sql (from supabase/migrations/). Don't edit this file; edit the migrations.

-- ===================================================== 0001_schema.sql
begin;
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
commit;

-- ===================================================== 0002_storage.sql
begin;
-- Private photo storage. Files live at photos/<person_id>/<random>.jpg.
-- No public URLs: the website asks for short-lived signed links, and only
-- people allowed to see that person's photo can get one.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy photos_read on storage.objects for select to authenticated
  using (
    bucket_id = 'photos' and (
      public.can_manage((storage.foldername(name))[1])
      -- profile_fields is itself protected, so this only matches photos the viewer may see
      or exists (select 1 from public.profile_fields f
                 where f.person_id = (storage.foldername(name))[1] and f.field = 'photo' and f.value = name)
    )
  );

create policy photos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.can_manage((storage.foldername(name))[1]));
create policy photos_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.can_manage((storage.foldername(name))[1]));
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.can_manage((storage.foldername(name))[1]));
commit;

-- ===================================================== 0003_consent_policy_v1.sql
begin;
-- Version 1 of the consent declaration. To change the wording, add a new
-- version in a new migration: everyone is then asked to agree again.
insert into public.policy_versions (version, body) values (1, $txt$
This site is private. Only invited family members who sign in can see it.

By continuing, I confirm that:

1. I am the person named on this profile, or their parent or guardian.
2. I'm happy for my name and relationships to be shown to signed-in family members, and my photo if I choose to show it.
3. Anything else I add will be shown only at the visibility I choose. I can change or remove it at any time.
4. I will only upload photos and stories about other people that I have the right to share.
5. The family admins can see my details to keep the site running. They will not share them outside the family or use them for anything else.
6. I can withdraw this consent and ask for my information to be deleted at any time from My privacy.
$txt$);
commit;

-- ===================================================== 0004_connected_families_traditions.sql
begin;
-- Connected families (in-laws' families, no depth limit) and Iyer traditions.
--
-- 1. New personal details, each a profile_fields row with its own visibility:
--    gothram, sutram, vedam, native_place, kuladeivam            → default: family
--    janma_nakshatram ("Avani|Moolam", for Tamil birthdays)       → default: close family
--    horoscope (rasi, lagnam, jathagam notes)                     → default: only me
--    shraddha_tithi ("Aippasi|Krishna Dasami", for late relatives) → default: family
--    upanayanam, sashtiabdapoorthi, bhimaratha_shanti, sathabhishekam (dates) → default: family
-- 2. add_relative(): one call an admin uses to add a parent, child, spouse or
--    sibling to anyone in the tree, including people in a married-in family.
-- 3. Privacy fix: persons.sort_key held full birth dates, visible to every member.
--    It now holds only the year and a birth-order rank ("1983.002").

-- ---------------------------------------------------------------------------
-- 1. New fields
-- ---------------------------------------------------------------------------
alter table public.profile_fields drop constraint if exists profile_fields_field_check;
alter table public.profile_fields add constraint profile_fields_field_check check (field in (
  'known_as', 'birth_date', 'birth_place', 'city', 'work', 'organisation',
  'interests', 'about', 'photo', 'phone', 'email', 'address',
  'gothram', 'sutram', 'vedam', 'native_place', 'kuladeivam',
  'janma_nakshatram', 'horoscope', 'shraddha_tithi',
  'upanayanam', 'sashtiabdapoorthi', 'bhimaratha_shanti', 'sathabhishekam'));

-- Star and tithi are stored as "Month|Value" so they can be read without the website.
alter table public.profile_fields add constraint profile_fields_star_format check (
  field not in ('janma_nakshatram', 'shraddha_tithi') or value ~ '^[A-Za-z]+\|[A-Za-z ]+$');
-- Milestone dates follow the tree's YYYYMMDD convention (00 for unknown parts).
alter table public.profile_fields add constraint profile_fields_milestone_format check (
  field not in ('upanayanam', 'sashtiabdapoorthi', 'bhimaratha_shanti', 'sathabhishekam') or value ~ '^[0-9]{8}$');

create or replace function public.default_visibility(f text) returns public.visibility
language sql immutable as $$
  select case
    when f in ('address', 'horoscope') then 'private'::public.visibility
    when f in ('phone', 'email', 'birth_date', 'janma_nakshatram') then 'close'::public.visibility
    else 'family'::public.visibility end
$$;

-- ---------------------------------------------------------------------------
-- 2. Adding relatives (admins only: the inserts below run under the caller's
--    own row-level security, and only admins may write the tree)
-- ---------------------------------------------------------------------------
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
  if not is_admin() then raise exception 'Only a family admin can add people to the tree.'; end if;
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
revoke all on function public.add_relative(text, text, text, text, text, text, int, boolean, text, text) from public, anon;
grant execute on function public.add_relative(text, text, text, text, text, text, int, boolean, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Birth order without birth dates
-- ---------------------------------------------------------------------------
with ranked as (
  select id, birth_year,
         row_number() over (partition by birth_year order by coalesce(sort_key, '99999999'), id) as n
  from persons where birth_year is not null
)
update persons p
   set sort_key = r.birth_year::text || '.' || lpad(r.n::text, 3, '0')
  from ranked r where r.id = p.id;
update persons set sort_key = null where birth_year is null;

-- sort_key may no longer carry a full date
alter table public.persons add constraint persons_sort_key_no_date check (sort_key is null or sort_key ~ '^[0-9]{4}\.[0-9]{3}$');
commit;

-- ===================================================== 0005_reminder_feed.sql
begin;
-- Birthday and remembrance reminders.
--
-- A small scheduled service (reminders/, a Cloudflare Worker) sends the family admin a
-- WhatsApp message on the 1st of each month and on each day with an occasion, ready to
-- forward to the family group. It reads only this one function, with the server key.
-- Nobody signed in to the website can call it.
--
-- Each row says whether the person's birth date is shared with the whole family
-- (birth_shared), so the message can mark the others with a lock: the admin asks
-- before forwarding those.

create or replace function public.reminder_feed()
returns table (
  id text,
  name text,
  given_name text,
  gender text,
  is_living boolean,
  birth_year int,
  birth_date text,        -- YYYYMMDD from profile_fields, if recorded
  birth_shared boolean,   -- visible to the whole family (family visibility and, if living, an active consent)
  death_date text,        -- YYYYMMDD, 00 for unknown parts
  janma_nakshatram text,  -- "Month|Star"
  shraddha_tithi text,    -- "Month|Tithi"
  parents text,           -- "Ramanathan & Kamala"
  partner text            -- current partner's given name
)
language sql stable security definer set search_path = public as $$
  select p.id,
         trim(p.given_name || ' ' || p.surname),
         p.given_name, p.gender, p.is_living, p.birth_year,
         bd.value,
         coalesce(bd.visibility = 'family' and (not p.is_living or has_consent(p.id)), false),
         p.death_date,
         js.value,
         st.value,
         (select string_agg(pp.given_name, ' & ' order by pp.gender desc, pp.given_name)
            from parent_links pl join persons pp on pp.id = pl.parent_id where pl.child_id = p.id),
         (select q.given_name from partnerships pt
            join persons q on q.id = case when pt.person_a = p.id then pt.person_b else pt.person_a end
           where (pt.person_a = p.id or pt.person_b = p.id) and pt.is_current limit 1)
    from persons p
    left join profile_fields bd on bd.person_id = p.id and bd.field = 'birth_date'
    left join profile_fields js on js.person_id = p.id and js.field = 'janma_nakshatram'
    left join profile_fields st on st.person_id = p.id and st.field = 'shraddha_tithi'
   where bd.value is not null or p.death_date is not null or js.value is not null or st.value is not null
$$;

revoke all on function public.reminder_feed() from public, anon, authenticated;
grant execute on function public.reminder_feed() to service_role;
comment on function public.reminder_feed() is
  'Server-only feed for the reminders worker (birthdays, remembrance days, Tamil birthdays, shraddhams).';
commit;

-- ===================================================== 0006_keep_one_admin.sql
begin;
-- The family must always have at least one active admin.
-- On 12 Nov 2026 the only admin switched their own role to member from the Admin page,
-- leaving nobody able to invite people or change the tree. This stops that happening:
-- demoting, suspending or removing the last active admin is refused.

create or replace function public.keep_one_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'admin' or new.status <> 'active')
     and not exists (select 1 from members m where m.user_id <> old.user_id and m.role = 'admin' and m.status = 'active')
  then
    raise exception 'The family needs at least one admin. Make someone else an admin first.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists keep_one_admin on public.members;
create trigger keep_one_admin before update or delete on public.members
  for each row execute function public.keep_one_admin();
commit;

-- ===================================================== 0007_family_page_photos_updates.sql
begin;
-- Family page (story, banner, tradition roots), shared photos with tags, and the
-- notification bell. Family-specific values (the story, gothram etc.) are entered on the
-- website by an admin, never in this file.

-- ---------------------------------------------------------------------------
-- Family page: one row, readable by members, editable by admins
-- ---------------------------------------------------------------------------
create table public.family_info (
  id              boolean primary key default true check (id),
  about           text check (length(about) <= 8000),
  banner_path     text check (banner_path ~ '^family/[A-Za-z0-9-]+\.jpg$'),
  roots_person_id text references public.persons(id) on delete set null,  -- the couple the traditions come from
  gothram         text check (length(gothram) <= 80),
  sutram          text check (length(sutram) <= 80),
  vedam           text check (length(vedam) <= 80),
  kuladeivam      text check (length(kuladeivam) <= 200),
  updated_by      uuid,
  updated_at      timestamptz not null default now()
);
insert into public.family_info default values;
alter table public.family_info enable row level security;
revoke all on public.family_info from anon;
revoke insert, delete on public.family_info from authenticated;
create policy family_info_read  on public.family_info for select to authenticated using (is_member());
create policy family_info_admin on public.family_info for update to authenticated using (is_admin()) with check (is_admin());
create trigger family_info_stamp before update on public.family_info for each row execute function public.stamp_field();
create trigger audit_family_info after update on public.family_info for each row execute function public.audit();

-- ---------------------------------------------------------------------------
-- Photos: any member can share; tags of living people need their say
-- ---------------------------------------------------------------------------
create table public.photos (
  id          uuid primary key default gen_random_uuid(),
  path        text not null unique check (path ~ '^album/[A-Za-z0-9-]+\.jpg$'),
  caption     text check (length(caption) <= 500),
  taken_year  int check (taken_year between 1850 and 2200),
  uploaded_by uuid not null default auth.uid(),
  created_at  timestamptz not null default now()
);
create table public.photo_tags (
  photo_id   uuid not null references public.photos(id) on delete cascade,
  person_id  text not null references public.persons(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  tagged_by  uuid not null default auth.uid(),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (photo_id, person_id)
);
create index on public.photo_tags(person_id);

-- A photo someone pictured in it has declined is hidden from the family.
create function public.photo_declined(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from photo_tags where photo_id = pid and status = 'declined')
$$;
-- The viewer looks after someone tagged in the photo (so they can approve or decline it).
create function public.photo_tags_me(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from photo_tags where photo_id = pid and can_manage(person_id))
$$;
create function public.photo_uploader(pid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select uploaded_by from photos where id = pid
$$;
-- A tag names a person in a photo, so a living person's tag shows only while their
-- consent allows photos and tags.
create function public.tag_allowed(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select can_manage(p)
      or exists (select 1 from persons where id = p and not is_living)
      or exists (select 1 from consents where person_id = p and withdrawn_at is null and show_photo and allow_tags)
$$;

-- The person's current consent says no tags.
create function public.tags_refused(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from consents where person_id = p and withdrawn_at is null and not allow_tags)
$$;

alter table public.photos     enable row level security;
alter table public.photo_tags enable row level security;
revoke all on public.photos, public.photo_tags from anon;

create policy photos_read on public.photos for select to authenticated using (
  is_admin() or uploaded_by = auth.uid() or (is_member() and (not photo_declined(id) or photo_tags_me(id))));
create policy photos_insert on public.photos for insert to authenticated with check (is_member() and uploaded_by = auth.uid());
create policy photos_update on public.photos for update to authenticated
  using (uploaded_by = auth.uid() or is_admin()) with check (uploaded_by = auth.uid() or is_admin());
create policy photos_delete on public.photos for delete to authenticated using (uploaded_by = auth.uid() or is_admin());

create policy tags_read on public.photo_tags for select to authenticated using (
  is_member() and exists (select 1 from photos ph where ph.id = photo_id) and (
    (status = 'approved' and tag_allowed(person_id))
    or can_manage(person_id) or tagged_by = auth.uid() or photo_uploader(photo_id) = auth.uid() or is_admin()));
create policy tags_insert on public.photo_tags for insert to authenticated with check (
  is_member() and tagged_by = auth.uid() and exists (select 1 from photos ph where ph.id = photo_id)
  and (can_manage(person_id) or not tags_refused(person_id)));
create policy tags_decide on public.photo_tags for update to authenticated
  using (can_manage(person_id)) with check (can_manage(person_id));
create policy tags_delete on public.photo_tags for delete to authenticated using (
  tagged_by = auth.uid() or can_manage(person_id) or photo_uploader(photo_id) = auth.uid() or is_admin());

-- New tags: approved straight away when there is no one else to ask (you tagged yourself,
-- your child, someone who has passed away, or an admin tagged someone who hasn't joined).
-- Otherwise the person tagged is asked.
create function public.photo_tags_new() returns trigger
language plpgsql security definer set search_path = public as $$
declare me text := my_person_id();
begin
  new.tagged_by := auth.uid();
  new.created_at := now();
  if new.person_id = me
     or exists (select 1 from persons where id = new.person_id and not is_living)
     or (is_minor(new.person_id) and exists (select 1 from parent_links where child_id = new.person_id and parent_id = me))
     or (is_admin() and not exists (select 1 from members where person_id = new.person_id and status = 'active'))
  then new.status := 'approved'; new.decided_by := auth.uid(); new.decided_at := now();
  else new.status := 'pending'; new.decided_by := null; new.decided_at := null;
  end if;
  return new;
end $$;
create trigger photo_tags_new before insert on public.photo_tags for each row execute function public.photo_tags_new();

-- Deciding a tag only changes its status.
create function public.photo_tags_guard() returns trigger
language plpgsql as $$
begin
  if new.photo_id is distinct from old.photo_id or new.person_id is distinct from old.person_id
     or new.tagged_by is distinct from old.tagged_by or new.created_at is distinct from old.created_at then
    raise exception 'Only the tag''s approval can be changed.';
  end if;
  new.decided_by := auth.uid();
  new.decided_at := now();
  return new;
end $$;
create trigger photo_tags_guard before update on public.photo_tags for each row execute function public.photo_tags_guard();

create function public.photos_stamp() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.uploaded_by := auth.uid(); new.created_at := now();
  else new.uploaded_by := old.uploaded_by; new.created_at := old.created_at; new.path := old.path; end if;
  return new;
end $$;
create trigger photos_stamp before insert or update on public.photos for each row execute function public.photos_stamp();

create trigger audit_photos     after insert or update or delete on public.photos     for each row execute function public.audit();
create trigger audit_photo_tags after insert or update or delete on public.photo_tags for each row execute function public.audit();

-- Storage: the banner lives in photos/family/, shared photos in photos/album/.
create policy family_banner_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = 'family' and public.is_member());
create policy family_banner_write on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = 'family' and public.is_admin());
create policy family_banner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = 'family' and public.is_admin());
create policy album_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = 'album'
         and exists (select 1 from public.photos p where p.path = name));   -- photos' own rules decide
create policy album_write on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = 'album' and public.is_member());
create policy album_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = 'album'
         and (owner_id = auth.uid()::text or public.is_admin()));

-- ---------------------------------------------------------------------------
-- Per-person settings: colour theme and when the bell was last opened
-- ---------------------------------------------------------------------------
create table public.member_prefs (
  user_id         uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  theme           text not null default 'blue' check (theme in ('blue', 'kumkum', 'turmeric', 'peacock', 'tulsi', 'lotus')),
  updates_seen_at timestamptz
);
alter table public.member_prefs enable row level security;
revoke all on public.member_prefs from anon;
create policy prefs_own on public.member_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and is_member());
create trigger audit_member_prefs after insert or update or delete on public.member_prefs for each row execute function public.audit();

-- Who joined recently, for the bell. Only person and date, never the email.
create function public.recent_joins() returns table (person_id text, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select person_id, created_at from members
  where status = 'active' and person_id is not null and is_member() and created_at > now() - interval '60 days'
$$;

revoke all on function public.photo_declined(uuid), public.photo_tags_me(uuid), public.photo_uploader(uuid),
  public.tag_allowed(text), public.tags_refused(text), public.recent_joins() from public, anon;
grant execute on function public.photo_declined(uuid), public.photo_tags_me(uuid), public.photo_uploader(uuid),
  public.tag_allowed(text), public.tags_refused(text), public.recent_joins() to authenticated;
grant select, insert, update, delete on public.photos, public.photo_tags, public.member_prefs to authenticated;
grant select, update on public.family_info to authenticated;
commit;

-- ===================================================== 0008_members_invite.sql
begin;
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
commit;

-- ===================================================== 0009_conversations.sql
begin;
-- Talk: conversation threads, replies and reactions. Everything here is visible to every
-- family member (and nobody else). Who wrote what is stamped by the server.

create table public.threads (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (length(btrim(title)) between 3 and 140),
  body             text not null check (length(body) between 1 and 10000),
  category         text not null default 'general'
                   check (category in ('traditions', 'recipes', 'festivals', 'calendar', 'news', 'general')),
  author           uuid not null default auth.uid(),
  author_person    text references public.persons(id) on delete set null,
  pinned           boolean not null default false,
  locked           boolean not null default false,
  reply_count      int not null default 0,
  created_at       timestamptz not null default now(),
  edited_at        timestamptz,
  last_activity_at timestamptz not null default now()
);
create index on public.threads(last_activity_at desc);

create table public.thread_posts (
  id            uuid primary key default gen_random_uuid(),
  thread_id     uuid not null references public.threads(id) on delete cascade,
  reply_to      uuid references public.thread_posts(id) on delete set null,
  body          text not null check (length(body) between 1 and 5000),
  author        uuid not null default auth.uid(),
  author_person text references public.persons(id) on delete set null,
  created_at    timestamptz not null default now(),
  edited_at     timestamptz
);
create index on public.thread_posts(thread_id, created_at);
create index on public.thread_posts(created_at desc);

create table public.reactions (
  target_id   uuid not null,   -- a thread or a reply
  target_kind text not null check (target_kind in ('thread', 'post')),
  thread_id   uuid not null references public.threads(id) on delete cascade,
  emoji       text not null check (emoji in ('👍', '❤️', '🙏', '😂', '😮', '👏')),
  user_id     uuid not null default auth.uid(),
  person_id   text references public.persons(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (target_id, user_id, emoji)
);
create index on public.reactions(thread_id);

-- who wrote it, when, and what only admins may change
create function public.threads_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.author := auth.uid(); new.author_person := my_person_id(); new.created_at := now();
    new.last_activity_at := now(); new.edited_at := null; new.reply_count := 0;
    if not is_admin() then new.pinned := false; new.locked := false; end if;
  else
    new.author := old.author; new.author_person := old.author_person; new.created_at := old.created_at;
    if current_setting('talk.internal', true) is distinct from 'on' then
      new.reply_count := old.reply_count; new.last_activity_at := old.last_activity_at;
      if not is_admin() then new.pinned := old.pinned; new.locked := old.locked; end if;
      if new.title is distinct from old.title or new.body is distinct from old.body or new.category is distinct from old.category then
        new.edited_at := now();
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger threads_stamp before insert or update on public.threads for each row execute function public.threads_stamp();

create function public.posts_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from threads where id = new.thread_id and locked) and not is_admin() then
      raise exception 'This conversation is closed for replies.';
    end if;
    if new.reply_to is not null and not exists (select 1 from thread_posts where id = new.reply_to and thread_id = new.thread_id) then
      new.reply_to := null;
    end if;
    new.author := auth.uid(); new.author_person := my_person_id(); new.created_at := now(); new.edited_at := null;
  else
    new.author := old.author; new.author_person := old.author_person; new.created_at := old.created_at;
    new.thread_id := old.thread_id; new.reply_to := old.reply_to;
    if new.body is distinct from old.body then new.edited_at := now(); end if;
  end if;
  return new;
end $$;
create trigger posts_stamp before insert or update on public.thread_posts for each row execute function public.posts_stamp();

-- keep the reply count and "last activity" up to date
create function public.posts_count() returns trigger
language plpgsql security definer set search_path = public as $$
declare t uuid := coalesce(new.thread_id, old.thread_id);
begin
  perform set_config('talk.internal', 'on', true);
  update threads set reply_count = (select count(*) from thread_posts where thread_id = t),
    last_activity_at = case when tg_op = 'INSERT' then now() else last_activity_at end
  where id = t;
  perform set_config('talk.internal', 'off', true);
  if tg_op = 'DELETE' then delete from reactions where target_id = old.id; end if;  -- reactions go with the reply
  return null;
end $$;
create trigger posts_count after insert or delete on public.thread_posts for each row execute function public.posts_count();

create function public.reactions_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid(); new.person_id := my_person_id(); new.created_at := now();
  if new.target_kind = 'thread' then
    if not exists (select 1 from threads where id = new.target_id) then raise exception 'That conversation no longer exists.'; end if;
    new.thread_id := new.target_id;
  else
    select thread_id into new.thread_id from thread_posts where id = new.target_id;
    if new.thread_id is null then raise exception 'That reply no longer exists.'; end if;
  end if;
  return new;
end $$;
create trigger reactions_stamp before insert on public.reactions for each row execute function public.reactions_stamp();

alter table public.threads      enable row level security;
alter table public.thread_posts enable row level security;
alter table public.reactions    enable row level security;
revoke all on public.threads, public.thread_posts, public.reactions from anon;

create policy threads_read   on public.threads for select to authenticated using (is_member());
create policy threads_insert on public.threads for insert to authenticated with check (is_member());
create policy threads_update on public.threads for update to authenticated
  using (is_member() and (author = auth.uid() or is_admin())) with check (is_member());
create policy threads_delete on public.threads for delete to authenticated using (is_member() and (author = auth.uid() or is_admin()));

create policy posts_read   on public.thread_posts for select to authenticated using (is_member());
create policy posts_insert on public.thread_posts for insert to authenticated with check (is_member());
create policy posts_update on public.thread_posts for update to authenticated
  using (is_member() and author = auth.uid()) with check (is_member());
create policy posts_delete on public.thread_posts for delete to authenticated using (is_member() and (author = auth.uid() or is_admin()));

create policy reactions_read   on public.reactions for select to authenticated using (is_member());
create policy reactions_insert on public.reactions for insert to authenticated with check (is_member());
create policy reactions_delete on public.reactions for delete to authenticated using (user_id = auth.uid());

create trigger audit_threads      after insert or update or delete on public.threads      for each row execute function public.audit();
create trigger audit_thread_posts after insert or update or delete on public.thread_posts for each row execute function public.audit();
create trigger audit_reactions    after insert or delete on public.reactions for each row execute function public.audit();

grant select, insert, update, delete on public.threads, public.thread_posts to authenticated;
grant select, insert, delete on public.reactions to authenticated;
commit;

-- ===================================================== 0010_wedding_dates.sql
begin;
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
commit;

-- ===================================================== 0011_welcome_emails.sql
begin;
-- Welcome emails.
--
-- When someone joins (their login is linked to their person in the tree), they are queued
-- here. The reminders Worker (reminders/, server key) checks the queue every few minutes,
-- sends a welcome email from the family email address and marks it sent.
--
-- Nobody signed in to the website can read the queue or call these functions: they return
-- email addresses, which members never see (invariant 15).

create table public.welcome_emails (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  queued_at timestamptz not null default now(),
  sent_at   timestamptz
);
alter table public.welcome_emails enable row level security;
revoke all on public.welcome_emails from anon, authenticated;
-- no policies: only the server key (and these security definer functions) touch it
create trigger audit_welcome_emails after insert or update or delete on public.welcome_emails
  for each row execute function public.audit();

-- Queue a welcome when a member is first linked to a person (on joining, or when an admin links them later).
create function public.queue_welcome() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.person_id is not null and new.status = 'active'
     and (tg_op = 'INSERT' or old.person_id is null) then
    insert into welcome_emails(user_id) values (new.user_id) on conflict (user_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.queue_welcome() from public, anon, authenticated;
create trigger members_queue_welcome after insert or update of person_id on public.members
  for each row execute function public.queue_welcome();

-- What the Worker needs for each unsent welcome (queued in the last 14 days; older ones are skipped).
create function public.welcome_due()
returns table (user_id uuid, email text, given_name text, invited_by_name text, admins text, people int)
language sql stable security definer set search_path = public as $$
  select w.user_id, u.email::text, p.given_name,
         (select trim(ip.given_name || ' ' || ip.surname) from members im join persons ip on ip.id = im.person_id
           where im.user_id = m.invited_by),
         (select string_agg(trim(ap.given_name || ' ' || ap.surname), ', ' order by ap.given_name)
            from members am join persons ap on ap.id = am.person_id
           where am.role = 'admin' and am.status = 'active'),
         (select count(*)::int from persons)
    from welcome_emails w
    join auth.users u on u.id = w.user_id
    join members m on m.user_id = w.user_id and m.status = 'active'
    join persons p on p.id = m.person_id
   where w.sent_at is null and w.queued_at > now() - interval '14 days' and u.email is not null
   order by w.queued_at
   limit 20
$$;

create function public.welcome_sent(uid uuid) returns void
language sql security definer set search_path = public as $$
  update welcome_emails set sent_at = now() where user_id = uid and sent_at is null
$$;

revoke all on function public.welcome_due(), public.welcome_sent(uuid) from public, anon, authenticated;
grant execute on function public.welcome_due(), public.welcome_sent(uuid) to service_role;
commit;

-- ===================================================== 0012_steward_role.sql
begin;
-- A third role between member and admin. (Its own migration: a new enum value must be
-- committed before functions can use it.)
alter type public.member_role add value if not exists 'steward';
commit;

-- ===================================================== 0013_roles_and_join_requests.sql
begin;
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
commit;

-- ===================================================== 0014_delete_person.sql
begin;
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
commit;

-- ===================================================== 0015_change_logs.sql
begin;
-- 0015: who decided each join request, and a per-profile change log every member can read.

-- ---------------------------------------------------------------------------
-- 1. Join requests: stamp the deciding steward/admin's place in the tree, so everyone who reviews
--    requests sees "Approved by <name>" (decided_by is an account id; stewards can't read members).
-- ---------------------------------------------------------------------------
alter table public.join_requests add column decided_by_person text references public.persons(id) on delete set null;

create function public.join_requests_stamp_decider() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.decided_by is distinct from old.decided_by then
    new.decided_by_person := (select person_id from members where user_id = new.decided_by);
  end if;
  return new;
end $$;
revoke all on function public.join_requests_stamp_decider() from public, anon, authenticated;
create trigger join_requests_stamp_decider before update on public.join_requests
  for each row execute function public.join_requests_stamp_decider();

update public.join_requests r set decided_by_person = m.person_id
  from public.members m where m.user_id = r.decided_by and r.decided_by_person is null;

-- ---------------------------------------------------------------------------
-- 2. profile_log(person): the history of one person's page, for any member.
--    Built from audit_log (still admin-only to read directly). A value is returned only if the viewer
--    could see that version of the detail today (can_see on its visibility; photos never as values).
--    A detail the viewer can't see appears as a change with no field name and no value.
--    Wedding dates and consent appear without values. Who made it: their place in the tree, never an email.
-- ---------------------------------------------------------------------------
create function public.profile_log(person text)
returns table (at timestamptz, action text, kind text, field text, old_value text, new_value text, other text, by_person text, by_role text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not is_member() then
    raise exception 'Only family members can see change logs.';
  end if;
  return query
  with raw as (
    select a.at, a.action, a.table_name, a.before, a.after, a.actor
    from audit_log a
    where (a.table_name = 'profile_fields' and a.record_key like person || '/%')
       or (a.table_name = 'persons' and a.record_key = person)
       or (a.table_name = 'parent_links' and (coalesce(a.after, a.before)->>'child_id' = person or coalesce(a.after, a.before)->>'parent_id' = person))
       or (a.table_name = 'partnerships' and (coalesce(a.after, a.before)->>'person_a' = person or coalesce(a.after, a.before)->>'person_b' = person))
       or (a.table_name = 'consents' and a.record_key = person)
       or (a.table_name = 'members' and a.record_key = person and a.action = 'insert')
    order by a.at desc, a.id desc
    limit 300
  ), rows as (
    -- details
    select r.at, r.action, 'detail'::text as kind, f.field,
           f.ob, f.nb, null::text as other, r.actor
    from raw r,
    lateral (select coalesce(r.after, r.before)->>'field' as field,
                    case when r.before is not null and (r.before->>'field') <> 'photo'
                              and can_see(person, (r.before->>'visibility')::visibility) then r.before->>'value' end as ob,
                    case when r.after is not null and (r.after->>'field') <> 'photo'
                              and can_see(person, (r.after->>'visibility')::visibility) then r.after->>'value' end as nb,
                    (r.before is null or can_see(person, (r.before->>'visibility')::visibility))
                    and (r.after is null or can_see(person, (r.after->>'visibility')::visibility)) as seen) f
    where r.table_name = 'profile_fields' and f.seen
      and not (r.action = 'update' and r.before->>'value' = r.after->>'value' and r.before->>'visibility' = r.after->>'visibility')
    union all
    -- visibility changes (value unchanged)
    select r.at, 'update', 'visibility', r.after->>'field', r.before->>'visibility', r.after->>'visibility', null, r.actor
    from raw r
    where r.table_name = 'profile_fields' and r.action = 'update'
      and r.before->>'value' = r.after->>'value' and r.before->>'visibility' <> r.after->>'visibility'
      and can_see(person, (r.before->>'visibility')::visibility) and can_see(person, (r.after->>'visibility')::visibility)
    union all
    -- details the viewer can't see
    select r.at, r.action, 'hidden', null, null, null, null, r.actor
    from raw r
    where r.table_name = 'profile_fields'
      and not ((r.before is null or can_see(person, (r.before->>'visibility')::visibility))
           and (r.after is null or can_see(person, (r.after->>'visibility')::visibility)))
    union all
    -- tree details (names, birth year, passing): visible to every member already
    select r.at, r.action, 'tree', k.key,
           case when r.before is not null then r.before->>k.key end,
           case when r.after is not null then r.after->>k.key end, null, r.actor
    from raw r,
    lateral (select unnest(array['given_name','surname','birth_surname','gender','birth_year','is_living','death_date','death_place']) as key) k
    where r.table_name = 'persons'
      and (r.action <> 'update' or (r.before->>k.key) is distinct from (r.after->>k.key))
      and (r.action = 'update' or k.key = 'given_name')
    union all
    -- relationships
    select r.at, r.action,
           case when coalesce(r.after, r.before)->>'child_id' = person then 'parent' else 'child' end, null, null, null,
           case when coalesce(r.after, r.before)->>'child_id' = person then coalesce(r.after, r.before)->>'parent_id'
                else coalesce(r.after, r.before)->>'child_id' end, r.actor
    from raw r where r.table_name = 'parent_links'
    union all
    select r.at, r.action,
           case when r.action = 'update' then 'wedding' else 'spouse' end, null, null, null,
           case when coalesce(r.after, r.before)->>'person_a' = person then coalesce(r.after, r.before)->>'person_b'
                else coalesce(r.after, r.before)->>'person_a' end, r.actor
    from raw r where r.table_name = 'partnerships'
      and (r.action <> 'update' or (r.before->>'start_date') is distinct from (r.after->>'start_date')
           or (r.before->>'place') is distinct from (r.after->>'place') or (r.before->>'kind') is distinct from (r.after->>'kind'))
    union all
    -- consent and joining (no details)
    select r.at, r.action, case when r.action = 'insert' then 'consent' else 'withdrawn' end, null, null, null, null, r.actor
    from raw r where r.table_name = 'consents'
      and (r.action = 'insert' or (r.before->>'withdrawn_at' is null and r.after->>'withdrawn_at' is not null))
    union all
    select r.at, 'insert', 'joined', null, null, null, null, r.actor
    from raw r where r.table_name = 'members'
  )
  select x.at, x.action, x.kind, x.field, x.ob, x.nb, x.other, m.person_id, m.role::text
  from rows x left join members m on m.user_id = x.actor
  order by x.at desc;
end $$;
revoke all on function public.profile_log(text) from public, anon;
grant execute on function public.profile_log(text) to authenticated;
commit;

-- ===================================================== 0016_hero_photos.sql
begin;
-- 0016: several family photos for the Family page hero (a moving slideshow), each with an optional caption.
-- Safe to run more than once.
-- Files stay in the private photos bucket under family/ (members read, admins write: 0007 storage policies).

alter table public.family_info add column if not exists hero_photos jsonb not null default '[]'::jsonb;

create or replace function public.valid_hero_photos(v jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(v) = 'array'
     and jsonb_array_length(v) <= 12
     and not exists (
       select 1 from jsonb_array_elements(v) e
       where jsonb_typeof(e) <> 'object'
          or coalesce(e->>'path', '') !~ '^family/[A-Za-z0-9-]+\.jpg$'
          or length(coalesce(e->>'caption', '')) > 120
          or exists (select 1 from jsonb_object_keys(e) k where k not in ('path', 'caption'))
     )
$$;
alter table public.family_info drop constraint if exists family_info_hero_photos_check;
alter table public.family_info add constraint family_info_hero_photos_check check (public.valid_hero_photos(hero_photos));

-- the existing single banner becomes the first slide
update public.family_info set hero_photos = jsonb_build_array(jsonb_build_object('path', banner_path))
  where banner_path is not null and hero_photos = '[]'::jsonb;
commit;

-- ===================================================== 0017_mentions.sql
begin;
-- 0017: @-mentions in Talk, and an email when someone mentions you.
-- A mention is written in the text as @[Name](person:ID). The database works out who is mentioned
-- from the text itself (generated columns), so nobody can claim a mention that isn't in the post.
-- The bell is still built from posts the viewer can already read (invariant 14).
-- Emails go through a server-key-only queue (like the welcome queue): it holds email addresses.

create function public.mention_ids(body text) returns text[]
language sql immutable as $$
  select coalesce(array_agg(distinct m[1]), '{}')
    from (select regexp_matches(coalesce(body, ''), '@\[[^\]\n]{1,80}\]\(person:([A-Za-z0-9]{1,20})\)', 'g') as m limit 30) x
$$;

alter table public.threads add column mentions text[] generated always as (public.mention_ids(body)) stored;
alter table public.thread_posts add column mentions text[] generated always as (public.mention_ids(body)) stored;
create index threads_mentions_idx on public.threads using gin (mentions);
create index thread_posts_mentions_idx on public.thread_posts using gin (mentions);

-- per-member choice; on by default
alter table public.member_prefs add column email_mentions boolean not null default true;

-- ---------------------------------------------------------------------------
-- the email queue (server key only)
-- ---------------------------------------------------------------------------
create table public.mention_emails (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  person_id  text not null,
  by_person  text,
  thread_id  uuid not null references public.threads(id) on delete cascade,
  post_id    uuid references public.thread_posts(id) on delete cascade,
  queued_at  timestamptz not null default now(),
  sent_at    timestamptz,
  unique (user_id, thread_id, post_id)
);
alter table public.mention_emails enable row level security;
revoke all on public.mention_emails from public, anon, authenticated;
revoke all on sequence public.mention_emails_id_seq from public, anon, authenticated;

-- queue one email per newly mentioned person who has joined, isn't the author and hasn't turned them off
create function public.queue_mention_emails() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  added text[];
  r jsonb := to_jsonb(new);
  tid uuid := case when tg_table_name = 'threads' then new.id else (r->>'thread_id')::uuid end;
  pid uuid := case when tg_table_name = 'threads' then null else new.id end;
begin
  added := array(select unnest(new.mentions) except
                 select unnest(case when tg_op = 'UPDATE' then old.mentions else '{}'::text[] end));
  if coalesce(array_length(added, 1), 0) = 0 then return new; end if;
  insert into mention_emails (user_id, person_id, by_person, thread_id, post_id)
  select m.user_id, m.person_id, new.author_person, tid, pid
    from members m
    left join member_prefs mp on mp.user_id = m.user_id
   where m.person_id = any(added) and m.status = 'active'
     and m.user_id <> new.author
     and coalesce(mp.email_mentions, true)
  on conflict do nothing;
  return new;
end $$;
revoke all on function public.queue_mention_emails() from public, anon, authenticated;
create trigger threads_mention_emails after insert or update of body on public.threads
  for each row execute function public.queue_mention_emails();
create trigger thread_posts_mention_emails after insert or update of body on public.thread_posts
  for each row execute function public.queue_mention_emails();

-- what the Worker sends: one row per pending mention, newest first, only while the reader may still see it
create function public.mentions_due()
returns table (id bigint, user_id uuid, email text, given_name text, by_name text, thread_id uuid, post_id uuid, title text, body text, at timestamptz)
language sql stable security definer set search_path = public as $$
  select q.id, q.user_id, u.email::text, p.given_name,
         (select trim(bp.given_name || ' ' || coalesce(bp.surname, '')) from persons bp where bp.id = q.by_person),
         q.thread_id, q.post_id, t.title,
         coalesce(tp.body, t.body), q.queued_at
    from mention_emails q
    join auth.users u on u.id = q.user_id
    join members m on m.user_id = q.user_id and m.status = 'active'
    join persons p on p.id = m.person_id
    join threads t on t.id = q.thread_id
    left join thread_posts tp on tp.id = q.post_id
    left join member_prefs mp on mp.user_id = q.user_id
   where q.sent_at is null and q.queued_at > now() - interval '3 days' and u.email is not null
     and coalesce(mp.email_mentions, true)
     and (q.post_id is null or tp.id is not null)
   order by q.user_id, q.queued_at
   limit 100
$$;

create function public.mentions_sent(ids bigint[]) returns void
language sql security definer set search_path = public as $$
  update mention_emails set sent_at = now() where id = any(ids) and sent_at is null
$$;
revoke all on function public.mentions_due(), public.mentions_sent(bigint[]) from public, anon, authenticated;
grant execute on function public.mentions_due(), public.mentions_sent(bigint[]) to service_role;
commit;

-- ===================================================== 0018_presence_and_chat.sql
begin;
-- 0018: who's online, and private one-to-one chat between members.
--
-- Presence: the site sends a heartbeat about every 45 seconds while it is open in front of you.
-- "Online" = a heartbeat in the last 2 minutes. Only members see it, and anyone can hide theirs
-- (member_prefs.show_online): then they show as neither online nor "last active".
--
-- Chat: conversations between exactly two active members. Only those two can read or write them;
-- admins can't read them through the site. The audit log records that a message was sent or
-- deleted (who, when, which conversation), never what it said.

alter table public.member_prefs add column show_online boolean not null default true;

create table public.member_presence (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
alter table public.member_presence enable row level security;
revoke all on public.member_presence from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- conversations and messages
-- ---------------------------------------------------------------------------
create table public.dm_conversations (
  id              uuid primary key default gen_random_uuid(),
  user_a          uuid not null references auth.users(id) on delete cascade,
  user_b          uuid not null references auth.users(id) on delete cascade,
  a_read_at       timestamptz not null default now(),
  b_read_at       timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  last_message_at timestamptz,
  check (user_a < user_b),
  unique (user_a, user_b)
);
create table public.dm_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  sender          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body            text not null check (length(btrim(body)) between 1 and 4000),
  created_at      timestamptz not null default now()
);
create index dm_messages_conv_idx on public.dm_messages (conversation_id, created_at);

alter table public.dm_conversations enable row level security;
alter table public.dm_messages enable row level security;
revoke all on public.dm_conversations, public.dm_messages from public, anon, authenticated;
grant select on public.dm_conversations to authenticated;
grant select, insert, delete on public.dm_messages to authenticated;

create function public.in_conversation(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_member() and exists (select 1 from dm_conversations d where d.id = c and auth.uid() in (d.user_a, d.user_b))
$$;

-- you may write while you are in the conversation and the other person is still an active member
create function public.dm_can_send(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select in_conversation(c) and exists (
    select 1 from dm_conversations d
      join members m on m.user_id = case when d.user_a = auth.uid() then d.user_b else d.user_a end
     where d.id = c and m.status = 'active')
$$;

create policy dm_conversations_read on public.dm_conversations for select to authenticated
  using (is_member() and auth.uid() in (user_a, user_b));
create policy dm_messages_read on public.dm_messages for select to authenticated
  using (in_conversation(conversation_id));
-- you can write only as yourself, only in your own conversation, and only while the other person is still an active member
create policy dm_messages_send on public.dm_messages for insert to authenticated
  with check (sender = auth.uid() and dm_can_send(conversation_id));
create policy dm_messages_delete on public.dm_messages for delete to authenticated
  using (sender = auth.uid() and in_conversation(conversation_id));

-- keep the conversation's last activity, and count your own message as read
create function public.dm_after_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update dm_conversations set last_message_at = new.created_at,
    a_read_at = case when user_a = new.sender then new.created_at else a_read_at end,
    b_read_at = case when user_b = new.sender then new.created_at else b_read_at end
  where id = new.conversation_id;
  return new;
end $$;
revoke all on function public.dm_after_message() from public, anon, authenticated;
create trigger dm_after_message after insert on public.dm_messages for each row execute function public.dm_after_message();

-- audit without the words
create function public.dm_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.dm_messages := case when tg_op = 'DELETE' then old else new end;
begin
  insert into audit_log(actor, action, table_name, record_key, before, after)
  values (auth.uid(), lower(tg_op), 'dm_messages', r.id::text, null,
          jsonb_build_object('conversation_id', r.conversation_id, 'sender', r.sender, 'at', r.created_at));
  return r;
end $$;
revoke all on function public.dm_audit() from public, anon, authenticated;
create trigger dm_messages_audit after insert or delete on public.dm_messages for each row execute function public.dm_audit();
create trigger dm_conversations_audit after insert on public.dm_conversations for each row execute function public.audit();

-- ---------------------------------------------------------------------------
-- functions the site calls
-- ---------------------------------------------------------------------------
-- open (or create) the conversation with someone in the tree who has joined
create function public.dm_open(person text) returns uuid
language plpgsql security definer set search_path = public as $$
declare other uuid; a uuid; b uuid; cid uuid;
begin
  if not is_member() then raise exception 'Only family members can send messages.'; end if;
  select user_id into other from members where person_id = person and status = 'active' limit 1;
  if other is null then raise exception 'They haven’t joined the site yet, so they can’t get messages. Invite them first.'; end if;
  if other = auth.uid() then raise exception 'That’s you.'; end if;
  a := least(other, auth.uid()); b := greatest(other, auth.uid());
  select id into cid from dm_conversations where user_a = a and user_b = b;
  if cid is null then
    insert into dm_conversations(user_a, user_b) values (a, b) returning id into cid;
  end if;
  return cid;
end $$;

-- your conversations: who with, the last message, how many unread
create function public.dm_list()
returns table (id uuid, other_person text, last_message_at timestamptz, last_body text, last_from_me boolean, unread int, other_read_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id,
         (select m.person_id from members m where m.user_id = case when d.user_a = auth.uid() then d.user_b else d.user_a end),
         d.last_message_at,
         (select left(x.body, 140) from dm_messages x where x.conversation_id = d.id order by x.created_at desc limit 1),
         (select x.sender = auth.uid() from dm_messages x where x.conversation_id = d.id order by x.created_at desc limit 1),
         (select count(*)::int from dm_messages x where x.conversation_id = d.id and x.sender <> auth.uid()
            and x.created_at > case when d.user_a = auth.uid() then d.a_read_at else d.b_read_at end),
         case when d.user_a = auth.uid() then d.b_read_at else d.a_read_at end
    from dm_conversations d
   where is_member() and auth.uid() in (d.user_a, d.user_b)
   order by coalesce(d.last_message_at, d.created_at) desc
$$;

create function public.dm_mark_read(c uuid) returns void
language sql security definer set search_path = public as $$
  update dm_conversations set
    a_read_at = case when user_a = auth.uid() then now() else a_read_at end,
    b_read_at = case when user_b = auth.uid() then now() else b_read_at end
  where id = c and is_member() and auth.uid() in (user_a, user_b)
$$;

-- heartbeat: mark me as here (if I allow it), and return who's around plus my unread count.
-- people: every active member with a place in the tree; seen = their last heartbeat (null if never, or hidden); h = hidden.
create function public.heartbeat(here boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare people jsonb; unread int;
begin
  if not is_member() then raise exception 'Only family members.'; end if;
  if here then
    insert into member_presence(user_id, last_seen_at) values (auth.uid(), now())
      on conflict (user_id) do update set last_seen_at = now();
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('p', m.person_id,
           'seen', case when coalesce(mp.show_online, true) and coalesce(me.show_online, true) then pr.last_seen_at end,
           'h', not (coalesce(mp.show_online, true) and coalesce(me.show_online, true)))), '[]')
    into people
    from members m
    left join member_presence pr on pr.user_id = m.user_id
    left join member_prefs mp on mp.user_id = m.user_id
    left join member_prefs me on me.user_id = auth.uid()
   where m.status = 'active' and m.person_id is not null and m.user_id <> auth.uid();
  select coalesce(sum(l.unread), 0)::int into unread from dm_list() l;
  return jsonb_build_object('people', people, 'unread', unread, 'now', now());
end $$;

revoke all on function public.in_conversation(uuid), public.dm_can_send(uuid), public.dm_open(text), public.dm_list(), public.dm_mark_read(uuid), public.heartbeat(boolean) from public, anon;
grant execute on function public.in_conversation(uuid), public.dm_can_send(uuid), public.dm_open(text), public.dm_list(), public.dm_mark_read(uuid), public.heartbeat(boolean) to authenticated;
commit;

-- ===================================================== 0019_welcome_and_broadcast.sql
begin;
-- 0019: message everyone (admins), and an automatic welcome message when someone joins.
-- Both arrive as ordinary private messages (0018) from a real admin's account, so replies go
-- straight back to that person. "{name}" in the text becomes each person's first name.

alter table public.family_info
  add column welcome_dm_on   boolean not null default false,
  add column welcome_dm      text check (welcome_dm is null or length(btrim(welcome_dm)) between 1 and 4000),
  add column welcome_dm_from text references public.persons(id) on delete set null;

-- internal: send one message from one account to another (creating the conversation if needed)
create function public.dm_send_as(sender uuid, recipient uuid, body text) returns void
language plpgsql security definer set search_path = public as $$
declare a uuid := least(sender, recipient); b uuid := greatest(sender, recipient); cid uuid;
begin
  if sender = recipient or btrim(coalesce(body, '')) = '' then return; end if;
  select id into cid from dm_conversations where user_a = a and user_b = b;
  if cid is null then insert into dm_conversations(user_a, user_b) values (a, b) returning id into cid; end if;
  insert into dm_messages(conversation_id, sender, body) values (cid, sender, left(body, 4000));
end $$;
revoke all on function public.dm_send_as(uuid, uuid, text) from public, anon, authenticated;

create function public.personalise(body text, person text) returns text
language sql stable security definer set search_path = public as $$
  select replace(body, '{name}', coalesce((select given_name from persons where id = person), 'there'))
$$;
revoke all on function public.personalise(text, text) from public, anon, authenticated;

-- admins: send a private message to every active member who has joined (not yourself). Returns how many.
create function public.dm_broadcast(body text) returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if not is_admin() then raise exception 'Only a family admin can message everyone.'; end if;
  if btrim(coalesce(body, '')) = '' then raise exception 'Write a message first.'; end if;
  if length(body) > 4000 then raise exception 'That message is too long (4,000 characters at most).'; end if;
  for r in select user_id, person_id from members where status = 'active' and person_id is not null and user_id <> auth.uid() loop
    perform dm_send_as(auth.uid(), r.user_id, personalise(body, r.person_id));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.dm_broadcast(text) from public, anon;
grant execute on function public.dm_broadcast(text) to authenticated;

-- the welcome message: when a member becomes active with a place in the tree for the first time
create function public.send_welcome_dm() returns trigger
language plpgsql security definer set search_path = public as $$
declare fi family_info; sender uuid;
begin
  if new.status <> 'active' or new.person_id is null then return new; end if;
  -- once only: when they first get a place in the tree (not when a suspended member is restored)
  if tg_op = 'UPDATE' and old.person_id is not null then return new; end if;
  select * into fi from family_info limit 1;
  if fi is null or not fi.welcome_dm_on or fi.welcome_dm is null or fi.welcome_dm_from is null then return new; end if;
  select user_id into sender from members where person_id = fi.welcome_dm_from and status = 'active' and role in ('admin', 'steward') limit 1;
  if sender is null or sender = new.user_id then return new; end if;
  perform dm_send_as(sender, new.user_id, personalise(fi.welcome_dm, new.person_id));
  return new;
end $$;
revoke all on function public.send_welcome_dm() from public, anon, authenticated;
create trigger members_welcome_dm after insert or update of status, person_id on public.members
  for each row execute function public.send_welcome_dm();
commit;

-- ===================================================== 0020_replace_login.sql
begin;
-- 0020: when someone comes back with a different email (e.g. invited at Yahoo, now signs in with Gmail),
-- an admin can approve their request and move their place in the tree to the new login.
-- The old login is deleted (its member row, preferences, chats and queues go with it by cascade);
-- the person's details, consent and history stay, because they belong to the person, not the login.
-- The new login keeps the old role (member/steward/admin). Stewards still can't do this: only admins.

create function public.approve_join_replacing(req uuid, person text) returns void
language plpgsql security definer set search_path = public, auth as $$
declare r join_requests%rowtype; old members%rowtype;
begin
  if not is_admin() then raise exception 'Only a family admin can move someone to a new login.'; end if;
  select * into r from join_requests where id = req for update;
  if not found or r.status <> 'pending' then raise exception 'This request has already been handled.'; end if;
  select * into old from members where person_id = person;
  if not found then raise exception 'Nobody has joined as this person yet: use Approve instead.'; end if;
  if old.user_id = r.user_id then raise exception 'They have already joined with this login.'; end if;
  if old.user_id = auth.uid() then raise exception 'You can’t replace your own login.'; end if;
  if exists (select 1 from members where user_id = r.user_id) then raise exception 'This new login already belongs to someone in the tree.'; end if;
  -- the last admin can't be removed this way either
  if old.role = 'admin' and old.status = 'active' and (select count(*) from members where role = 'admin' and status = 'active') <= 1 then
    raise exception 'That is the only admin; make someone else an admin first.';
  end if;
  insert into audit_log(actor, action, table_name, record_key, before, after)
  values (auth.uid(), 'update', 'members', person, jsonb_build_object('user_id', old.user_id, 'role', old.role),
          jsonb_build_object('user_id', r.user_id, 'replaced_login', true));
  -- remove the old login entirely (member row and everything tied to it cascade)
  delete from members where user_id = old.user_id;
  delete from auth.users where id = old.user_id;
  -- link the new login through the normal invitation path, then restore the role
  perform approve_join(req, person);
  update members set role = old.role where user_id = r.user_id and old.role <> 'member';
end $$;
revoke all on function public.approve_join_replacing(uuid, text) from public, anon;
grant execute on function public.approve_join_replacing(uuid, text) to authenticated;
commit;

-- ===================================================== 0021_writing_help.sql
begin;
-- 0021: writing help (AI rewrite and speak-to-write), gated and counted here.
--
-- The reminders Worker (<api address>/ai/...) runs Cloudflare Workers AI. Before each run it calls
-- ai_allow() with the member's own sign-in token, so only active members can use it and each person has
-- a daily allowance. Nothing that was written or said is stored anywhere: this table only counts uses.
-- Re-runnable.

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default ((now() at time zone 'Asia/Kolkata')::date),
  kind text not null check (kind in ('rewrite', 'voice')),
  n int not null default 0 check (n >= 0),
  primary key (user_id, day, kind)
);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
drop policy if exists ai_usage_own on public.ai_usage;
create policy ai_usage_own on public.ai_usage for select to authenticated using (user_id = auth.uid());
grant select on public.ai_usage to authenticated;

drop trigger if exists audit_ai_usage on public.ai_usage;
create trigger audit_ai_usage after insert or update or delete on public.ai_usage for each row execute function public.audit();

-- Counts one use and says how many are left today; refuses non-members and anyone over the allowance.
create or replace function public.ai_allow(what text) returns int
language plpgsql security definer set search_path = public as $$
declare lim int; used int; today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not is_member() then raise exception 'Only family members who have joined can use writing help.'; end if;
  lim := case what when 'rewrite' then 60 when 'voice' then 40 else null end;
  if lim is null then raise exception 'Unknown kind of writing help.'; end if;
  insert into ai_usage(user_id, day, kind, n) values (auth.uid(), today, what, 1)
  on conflict (user_id, day, kind) do update set n = ai_usage.n + 1
  where ai_usage.n < lim
  returning n into used;
  if used is null then
    raise exception 'You’ve used writing help a lot today. It will be ready again tomorrow.';
  end if;
  return lim - used;
end $$;
revoke all on function public.ai_allow(text) from public, anon;
grant execute on function public.ai_allow(text) to authenticated;
commit;

-- ===================================================== 0022_ops_health.sql
begin;
-- 0022: health checks and alert emails (reminders Worker, reminders/src/health.ts).
--
-- Every 10 minutes the Worker tests each part of the site and emails the admin when something breaks.
-- These tables hold only machine status (job names, times, short error text), never family data, and are
-- server-key only. They are not audited: ops_runs changes every 10 minutes and would bury the real audit log.
-- Re-runnable.

create table if not exists public.ops_runs (
  job text primary key,
  last_run_at timestamptz not null default now(),
  last_ok_at timestamptz,
  ok boolean not null default true,
  detail text
);
create table if not exists public.ops_alerts (
  key text primary key,
  summary text not null,
  opened_at timestamptz not null default now(),
  last_sent_at timestamptz,
  closed_at timestamptz
);
alter table public.ops_runs enable row level security;
alter table public.ops_alerts enable row level security;
revoke all on public.ops_runs, public.ops_alerts from anon, authenticated;
-- no policies: only the server key and the functions below touch them

-- A job (the 7 am digest, the 10-minute emails) says how it went.
create or replace function public.ops_record(job text, ok boolean, detail text default null) returns void
language sql security definer set search_path = public as $$
  insert into ops_runs as r (job, last_run_at, last_ok_at, ok, detail)
  values (job, now(), case when ok then now() end, ok, left(detail, 500))
  on conflict (job) do update set last_run_at = now(), ok = excluded.ok, detail = excluded.detail,
    last_ok_at = coalesce(excluded.last_ok_at, r.last_ok_at)
$$;

-- Counts only (no names or emails): emails that should have gone out but haven't, and when jobs last worked.
create or replace function public.ops_queues() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'welcome_stuck', (select count(*) from welcome_emails w join auth.users u on u.id = w.user_id
                        join members m on m.user_id = w.user_id and m.status = 'active'
                       where w.sent_at is null and u.email is not null
                         and w.queued_at < now() - interval '30 minutes' and w.queued_at > now() - interval '14 days'),
    'mentions_stuck', (select count(*) from mention_emails q join auth.users u on u.id = q.user_id
                         join members m on m.user_id = q.user_id and m.status = 'active'
                         left join member_prefs mp on mp.user_id = q.user_id
                         left join thread_posts tp on tp.id = q.post_id
                        where q.sent_at is null and u.email is not null and coalesce(mp.email_mentions, true)
                          and (q.post_id is null or tp.id is not null)
                          and q.queued_at < now() - interval '30 minutes' and q.queued_at > now() - interval '3 days'),
    'joins_stuck', (select count(*) from join_requests r
                     where r.status = 'pending' and r.notified_at is null
                       and r.created_at < now() - interval '30 minutes' and r.created_at > now() - interval '30 days'),
    'members', (select count(*) from members where status = 'active'),
    'runs', coalesce((select jsonb_object_agg(job, jsonb_build_object('last_run_at', last_run_at, 'last_ok_at', last_ok_at, 'ok', ok, 'detail', detail)) from ops_runs), '{}'::jsonb)
  )
$$;

-- Given the problems found now ([{key, summary}]), says which alerts to email:
-- new ones, ones still open after 24 hours (a reminder), and ones that have cleared.
create or replace function public.ops_alerts_sync(problems jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p jsonb; a ops_alerts%rowtype; started jsonb := '[]'; still jsonb := '[]'; cleared jsonb := '[]'; keys text[];
begin
  select coalesce(array_agg(x->>'key'), '{}') into keys from jsonb_array_elements(problems) x;
  for p in select * from jsonb_array_elements(problems) loop
    select * into a from ops_alerts where key = p->>'key';
    if not found or a.closed_at is not null then
      insert into ops_alerts (key, summary, opened_at, last_sent_at, closed_at) values (p->>'key', p->>'summary', now(), now(), null)
      on conflict (key) do update set summary = excluded.summary, opened_at = now(), last_sent_at = now(), closed_at = null;
      started := started || jsonb_build_array(p);
    elsif a.last_sent_at < now() - interval '24 hours' then
      update ops_alerts set last_sent_at = now(), summary = p->>'summary' where key = a.key;
      still := still || jsonb_build_array(p || jsonb_build_object('since', a.opened_at));
    end if;
  end loop;
  for a in select * from ops_alerts where closed_at is null and not (key = any(keys)) loop
    update ops_alerts set closed_at = now() where key = a.key;
    cleared := cleared || jsonb_build_array(jsonb_build_object('key', a.key, 'summary', a.summary, 'since', a.opened_at));
  end loop;
  return jsonb_build_object('started', started, 'still', still, 'cleared', cleared);
end $$;

revoke all on function public.ops_record(text, boolean, text), public.ops_queues(), public.ops_alerts_sync(jsonb) from public, anon, authenticated;
grant execute on function public.ops_record(text, boolean, text), public.ops_queues(), public.ops_alerts_sync(jsonb) to service_role;
commit;

-- ===================================================== 0023_retention.sql
begin;
-- 0023: how long things are kept (design choice). Run nightly by the reminders Worker after the 7 am digest.
--
--   decided join requests ............ 90 days after the decision (with their audit entries, which hold the email)
--   invitations never used ........... 6 months (with their audit entries)
--   sent / expired email queues ...... 30 days
--   writing-help counts .............. 30 days
--   closed health alerts ............. 90 days
--   audit log ........................ 3 years
--   audit entries about someone deleted from the tree: 1 year after the deletion
--
-- Not touched: the tree, profiles, consents, Talk, photos and private messages stay until a member or admin removes them.
-- The clean-up itself writes one summary line to the audit log (counts only), and suppresses the audit copies that
-- deleting would otherwise make (those copies would keep the very data being removed). Re-runnable.

-- audit() skips rows deleted by the retention job (fam.retention is set only inside retention_run(), which is server-only;
-- PostgREST cannot set it).
create or replace function public.audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  k text;
begin
  if tg_op = 'DELETE' and current_setting('fam.retention', true) = 'on' then return old; end if;
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

create or replace function public.retention_run() returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare
  n_join int; n_inv int; n_q int; n_ai int; n_alert int; n_old int; n_gone int := 0; n int;
  ids uuid[]; emails text[]; pid text;
begin
  perform set_config('fam.retention', 'on', true);

  -- decided join requests, and their audit entries
  select coalesce(array_agg(id), '{}') into ids from join_requests
   where status <> 'pending' and coalesce(decided_at, created_at) < now() - interval '90 days';
  delete from audit_log where table_name = 'join_requests' and record_key = any(ids::text[]);
  delete from join_requests where id = any(ids);
  n_join := cardinality(ids);

  -- invitations never used, and their audit entries (keyed by email)
  select coalesce(array_agg(email), '{}') into emails from invitations
   where accepted_at is null and created_at < now() - interval '6 months';
  delete from invitations where accepted_at is null and created_at < now() - interval '6 months';
  delete from audit_log a where a.table_name = 'invitations' and a.record_key = any(emails)
     and not exists (select 1 from invitations i where i.email = a.record_key);
  n_inv := cardinality(emails);

  -- email queues: sent, or too old to send
  delete from welcome_emails where coalesce(sent_at, queued_at) < now() - interval '30 days';
  get diagnostics n_q = row_count;
  delete from mention_emails where coalesce(sent_at, queued_at) < now() - interval '30 days';
  get diagnostics n = row_count; n_q := n_q + n;

  delete from ai_usage where day < (now() at time zone 'Asia/Kolkata')::date - 30;
  get diagnostics n_ai = row_count;
  delete from ops_alerts where closed_at < now() - interval '90 days';
  get diagnostics n_alert = row_count;

  -- people deleted from the tree more than a year ago: everything the audit log holds about them
  for pid in select a.record_key from audit_log a
              where a.table_name = 'persons' and a.action = 'delete' and a.at < now() - interval '1 year'
                and not exists (select 1 from persons p where p.id = a.record_key) loop
    delete from audit_log a
     where a.record_key = pid or a.record_key like pid || '/%' or a.record_key like pid || '<%' or a.record_key like '%<' || pid
        or a.before->>'person_id' = pid or a.after->>'person_id' = pid
        or a.before->>'person_a' = pid or a.after->>'person_a' = pid
        or a.before->>'person_b' = pid or a.after->>'person_b' = pid;
    n_gone := n_gone + 1;
  end loop;

  delete from audit_log where at < now() - interval '3 years';
  get diagnostics n_old = row_count;

  perform set_config('fam.retention', 'off', true);
  if n_join + n_inv + n_q + n_ai + n_alert + n_old + n_gone > 0 then
    insert into audit_log(actor, action, table_name, record_key, before, after)
    values (null, 'delete', 'retention', to_char(now(), 'YYYY-MM-DD'), null,
            jsonb_build_object('join_requests', n_join, 'invitations', n_inv, 'email_queue', n_q, 'ai_counts', n_ai,
                               'alerts', n_alert, 'audit_over_3_years', n_old, 'deleted_people_cleared', n_gone));
  end if;
  return jsonb_build_object('join_requests', n_join, 'invitations', n_inv, 'email_queue', n_q, 'ai_counts', n_ai,
                            'alerts', n_alert, 'audit_over_3_years', n_old, 'deleted_people_cleared', n_gone);
end $$;
revoke all on function public.retention_run() from public, anon, authenticated;
grant execute on function public.retention_run() to service_role;
commit;

-- ===================================================== 0024_security_hardening.sql
begin;
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
commit;

-- ===================================================== 0025_devcenter.sql
begin;
-- 0025: DevCenter — the operations handbook on the website (#/devcenter), admins only.
-- The handbook names accounts and the people who run them, so it lives here, never in the
-- site's code (anything bundled into the website can be downloaded by anyone, signed out).

create table public.dev_docs (
  id         text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  title      text not null check (length(btrim(title)) between 1 and 120),
  body       text not null default '' check (length(body) <= 200000),
  sort       int  not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
alter table public.dev_docs enable row level security;
revoke all on public.dev_docs from public, anon;
grant select, insert, update, delete on public.dev_docs to authenticated;
create policy dev_docs_admin on public.dev_docs for all to authenticated
  using (is_admin()) with check (is_admin());

create or replace function public.dev_docs_stamp() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
revoke all on function public.dev_docs_stamp() from public, anon;
create trigger dev_docs_stamp before insert or update on public.dev_docs
  for each row execute function public.dev_docs_stamp();
create trigger audit_dev_docs after insert or update or delete on public.dev_docs
  for each row execute function public.audit();
commit;

-- ===================================================== 0026_themes.sql
begin;
-- 0026: Themes — more styles (Instagram, Glass, Aurora) and a Light / Dark / Automatic choice.
alter table public.member_prefs drop constraint if exists member_prefs_theme_check;
alter table public.member_prefs add constraint member_prefs_theme_check
  check (theme in ('blue', 'kumkum', 'turmeric', 'peacock', 'tulsi', 'lotus', 'instagram', 'glass', 'aurora'));
alter table public.member_prefs add column if not exists mode text not null default 'auto'
  check (mode in ('auto', 'light', 'dark'));
commit;

-- ===================================================== 0027_design_styles.sql
begin;
-- 0027: three more design styles to pick from (Clean, Spotlight, Playful), inspired by shadcn/ui, Magic UI / Aceternity and React Bits.
alter table public.member_prefs drop constraint if exists member_prefs_theme_check;
alter table public.member_prefs add constraint member_prefs_theme_check
  check (theme in ('blue', 'kumkum', 'turmeric', 'peacock', 'tulsi', 'lotus', 'instagram', 'glass', 'aurora', 'clean', 'spotlight', 'playful'));
commit;

-- ===================================================== 0028_heritage_prefs.sql
begin;
-- 0028: family traditions in the interface. Each member's own choices:
-- woven border colour (veshti for men, saree for women; the gender itself comes from the tree),
-- which scripts to show beside English, the kolam background and the door welcome.
alter table public.member_prefs
  add column if not exists border text not null default ''
    check (border in ('', 'veshti-red', 'veshti-blue', 'saree-green', 'saree-red')),
  add column if not exists scripts text not null default 'both'
    check (scripts in ('both', 'ml', 'ta', 'en')),
  add column if not exists kolam boolean not null default true,
  add column if not exists doors boolean not null default true;
commit;

-- ===================================================== 0029_member_activity.sql
begin;
-- 0029: Admin → Members & roles shows each member's last sign-in and when their welcome email went out,
-- so an admin can answer "did they get the email / have they been back?" without the database.
-- Dates only: never email addresses. Admins only; everyone else gets no rows.
create or replace function public.member_activity()
returns table (user_id uuid, last_sign_in_at timestamptz, welcome_sent_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.last_sign_in_at, w.sent_at
    from members m
    join auth.users u on u.id = m.user_id
    left join welcome_emails w on w.user_id = m.user_id
   where is_admin()
$$;
revoke all on function public.member_activity() from public, anon;
grant execute on function public.member_activity() to authenticated;
commit;

-- ===================================================== 0030_push_notifications.sql
begin;
-- 0030: phone notifications (Web Push).
--
-- A member turns notifications on per device. The site stores that device's push address here; the reminders
-- Worker (server key) sends the notifications. Notifications say WHO, never WHAT: "Kavya sent you a message",
-- never the message text.
--
--   push_subscriptions  one row per device; members can't read the table directly (it holds the device keys),
--                       only through push_subscribe / push_unsubscribe / push_my_devices
--   push_queue          server-only; filled by triggers (messages, mentions, join requests, invitations to approve)
--                       and by the Worker's 7 am run (occasions, festivals). Holds names and links only, no
--                       message text, no emails. Not audited (it changes with every message; like ops_runs).
--   member_prefs        push_* switches per kind, and quiet hours (10 pm–7 am India time; messages still come through)

-- ---------------------------------------------------------------------------
-- preferences
-- ---------------------------------------------------------------------------
alter table public.member_prefs
  add column if not exists push_messages  boolean not null default true,
  add column if not exists push_mentions  boolean not null default true,
  add column if not exists push_occasions boolean not null default true,
  add column if not exists push_festivals boolean not null default false,
  add column if not exists push_admin     boolean not null default true,
  add column if not exists push_quiet     boolean not null default true;

-- ---------------------------------------------------------------------------
-- devices
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique check (endpoint ~ '^https://' and length(endpoint) < 1000),
  p256dh      text not null check (length(p256dh) between 40 and 200),
  auth        text not null check (length(auth) between 10 and 100),
  device      text not null default '' check (length(device) <= 80),
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz,
  fail_count  int not null default 0
);
create index push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
-- no policies: only these functions and the server key touch it

-- audit who turned notifications on or off and on what kind of device, never the keys or the address
create function public.push_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.push_subscriptions := case when tg_op = 'DELETE' then old else new end;
begin
  insert into audit_log(actor, action, table_name, record_key, before, after)
  values (auth.uid(), lower(tg_op), 'push_subscriptions', r.id::text, null,
          jsonb_build_object('user_id', r.user_id, 'device', r.device));
  return r;
end $$;
revoke all on function public.push_audit() from public, anon, authenticated;
create trigger push_subscriptions_audit after insert or delete on public.push_subscriptions
  for each row execute function public.push_audit();

-- turn on for this device (re-subscribing, or another person signing in on the same device, replaces the old row)
create function public.push_subscribe(endpoint text, p256dh text, auth text, device text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'Only family members can turn on notifications.'; end if;
  if (select count(*) from push_subscriptions s where s.user_id = auth.uid()) >= 10
     and not exists (select 1 from push_subscriptions s where s.endpoint = push_subscribe.endpoint) then
    raise exception 'Notifications are already on for 10 devices. Turn them off on one you no longer use.';
  end if;
  delete from push_subscriptions s where s.endpoint = push_subscribe.endpoint;
  insert into push_subscriptions(user_id, endpoint, p256dh, auth, device)
  values (auth.uid(), push_subscribe.endpoint, push_subscribe.p256dh, push_subscribe.auth, left(coalesce(push_subscribe.device, ''), 80));
end $$;

-- turn off for this device (or, with no address, for every device of mine: Sign out everywhere)
create function public.push_unsubscribe(endpoint text default null) returns void
language sql security definer set search_path = public as $$
  delete from push_subscriptions s
   where s.user_id = auth.uid() and (push_unsubscribe.endpoint is null or s.endpoint = push_unsubscribe.endpoint)
$$;

-- my devices, without their keys or addresses
create function public.push_my_devices()
returns table (id uuid, device text, created_at timestamptz, last_ok_at timestamptz, mine_here boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.device, s.created_at, s.last_ok_at, false from push_subscriptions s where s.user_id = auth.uid() order by s.created_at
$$;

revoke all on function public.push_subscribe(text, text, text, text), public.push_unsubscribe(text), public.push_my_devices() from public, anon;
grant execute on function public.push_subscribe(text, text, text, text), public.push_unsubscribe(text), public.push_my_devices() to authenticated;

-- ---------------------------------------------------------------------------
-- queue
-- ---------------------------------------------------------------------------
create table public.push_queue (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('message', 'mention', 'join', 'invite', 'occasion', 'festival', 'test')),
  title      text not null check (length(title) <= 120),
  body       text not null check (length(body) <= 240),
  url        text not null default '#/' check (url ~ '^#/' and length(url) <= 200),
  tag        text not null default '' check (length(tag) <= 80),
  queued_at  timestamptz not null default now(),
  sent_at    timestamptz
);
create index push_queue_due on public.push_queue (queued_at) where sent_at is null;
alter table public.push_queue enable row level security;
revoke all on public.push_queue from anon, authenticated;

-- is this kind switched on for this person, and do they have a device? (no prefs row = the defaults)
create function public.push_wanted(uid uuid, k text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from push_subscriptions where user_id = uid)
     and exists (select 1 from members where user_id = uid and status = 'active')
     and coalesce((select case k when 'message' then p.push_messages when 'mention' then p.push_mentions
                                  when 'join' then p.push_admin when 'invite' then p.push_admin
                                  when 'occasion' then p.push_occasions when 'festival' then p.push_festivals
                                  else true end
                     from member_prefs p where p.user_id = uid),
                  case k when 'festival' then false else true end)
$$;

create function public.push_enqueue(uid uuid, k text, t text, b text, u text, g text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if uid is null or not push_wanted(uid, k) then return; end if;
  insert into push_queue(user_id, kind, title, body, url, tag) values (uid, k, left(t, 120), left(b, 240), u, left(coalesce(g, ''), 80));
end $$;

-- first name of the person a login belongs to
create function public.push_name(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(p.given_name), ''), 'Someone') from members m join persons p on p.id = m.person_id where m.user_id = uid
$$;

revoke all on function public.push_wanted(uuid, text), public.push_enqueue(uuid, text, text, text, text, text), public.push_name(uuid) from public, anon, authenticated;

-- a private message: tell the other person who wrote, never what
create function public.push_on_dm() returns trigger
language plpgsql security definer set search_path = public as $$
declare c dm_conversations; other uuid; who text; whose text;
begin
  begin
    select * into c from dm_conversations where id = new.conversation_id;
    other := case when new.sender = c.user_a then c.user_b else c.user_a end;
    who := coalesce(push_name(new.sender), 'Someone');
    select person_id into whose from members where user_id = new.sender;
    perform push_enqueue(other, 'message', 'New message', who || ' sent you a message', '#/chat' || coalesce('/' || whose, ''), 'dm-' || new.conversation_id);
  exception when others then raise warning 'push (message): %', sqlerrm;   -- a notification must never stop a message being sent
  end;
  return null;
end $$;
create trigger dm_messages_push after insert on public.dm_messages for each row execute function public.push_on_dm();

-- an @-mention in Talk (the mention queue already holds only newly mentioned, joined members, never the author)
create function public.push_on_mention() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  begin
    select coalesce(nullif(trim(given_name), ''), 'Someone') into who from persons where id = new.by_person;
    perform push_enqueue(new.user_id, 'mention', 'Talk', coalesce(who, 'Someone') || ' mentioned you in Talk', '#/talk/' || new.thread_id, 'mention-' || new.thread_id);
  exception when others then raise warning 'push: %', sqlerrm;
  end;
  return null;
end $$;
create trigger mention_emails_push after insert on public.mention_emails for each row execute function public.push_on_mention();

-- a new request to join: every active steward and admin
create function public.push_on_join_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare s uuid;
begin
  begin
    for s in select user_id from members where status = 'active' and role in ('steward', 'admin') loop
      perform push_enqueue(s, 'join', 'Request to join', new.full_name || ' asked to join the family website', '#/admin/requests', 'join');
    end loop;
  exception when others then raise warning 'push: %', sqlerrm;
  end;
  return null;
end $$;
create trigger join_requests_push after insert on public.join_requests for each row execute function public.push_on_join_request();

-- a member's invitation waiting for approval: every active steward and admin
create function public.push_on_invitation() returns trigger
language plpgsql security definer set search_path = public as $$
declare s uuid; who text;
begin
  if new.approved_at is not null then return null; end if;
  begin
    who := coalesce(push_name(new.invited_by), 'A member');
    for s in select user_id from members where status = 'active' and role in ('steward', 'admin') loop
      perform push_enqueue(s, 'invite', 'Invitation to approve', who || ' invited a relative. Please check and approve.', '#/admin/requests', 'invite');
    end loop;
  exception when others then raise warning 'push: %', sqlerrm;
  end;
  return null;
end $$;
create trigger invitations_push after insert on public.invitations for each row execute function public.push_on_invitation();

revoke all on function public.push_on_dm(), public.push_on_mention(), public.push_on_join_request(), public.push_on_invitation() from public, anon, authenticated;

-- "Send me a test" (at most one a minute)
create function public.push_test() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'Only family members can do this.'; end if;
  if not exists (select 1 from push_subscriptions where user_id = auth.uid()) then raise exception 'Turn on notifications on this device first.'; end if;
  if exists (select 1 from push_queue where user_id = auth.uid() and kind = 'test' and queued_at > now() - interval '1 minute') then
    raise exception 'A test is already on its way. Give it a minute.';
  end if;
  insert into push_queue(user_id, kind, title, body, url, tag)
  values (auth.uid(), 'test', 'Notifications are on', 'This is how family news will reach you.', '#/privacy', 'test');
end $$;
revoke all on function public.push_test() from public, anon;
grant execute on function public.push_test() to authenticated;

-- ---------------------------------------------------------------------------
-- for the Worker (server key only)
-- ---------------------------------------------------------------------------
-- What to send now, one row per device. Quiet hours (10 pm–7 am India time) hold back everything except messages
-- and tests for people who keep them on. Old items (over 12 h) are dropped, and sent items older than 3 days removed.
create function public.push_due(lim int default 200)
returns table (qid bigint, sub_id uuid, endpoint text, p256dh text, auth text, title text, body text, url text, tag text, kind text)
language plpgsql security definer set search_path = public as $$
declare h int := extract(hour from (now() at time zone 'Asia/Kolkata'));
begin
  delete from push_queue q where q.sent_at < now() - interval '3 days';
  update push_queue q set sent_at = now() where q.sent_at is null and q.queued_at < now() - interval '12 hours';
  return query
    select q.id, s.id, s.endpoint, s.p256dh, s.auth, q.title, q.body, q.url, q.tag, q.kind
      from push_queue q
      join push_subscriptions s on s.user_id = q.user_id
      left join member_prefs p on p.user_id = q.user_id
     where q.sent_at is null
       and (q.kind in ('message', 'test') or not coalesce(p.push_quiet, true) or h between 7 and 21)
     order by q.queued_at
     limit lim;
end $$;

create function public.push_done(ids bigint[]) returns void
language sql security definer set search_path = public as $$
  update push_queue set sent_at = now() where id = any(ids) and sent_at is null
$$;

-- delivery result per device: gone (the browser dropped it) → remove; repeated failures → remove after 5
create function public.push_result(sid uuid, ok boolean, gone boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  if gone then delete from push_subscriptions where id = sid; return; end if;
  if ok then update push_subscriptions set last_ok_at = now(), fail_count = 0 where id = sid;
  else
    update push_subscriptions set fail_count = fail_count + 1 where id = sid;
    delete from push_subscriptions where id = sid and fail_count >= 5;
  end if;
end $$;

-- the 7 am run: one notification to everyone who wants this kind
create function public.push_daily(k text, t text, b text, u text default '#/', g text default '') returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; uid uuid;
begin
  if k not in ('occasion', 'festival') then raise exception 'unknown kind'; end if;
  for uid in select distinct s.user_id from push_subscriptions s loop
    if push_wanted(uid, k) then
      insert into push_queue(user_id, kind, title, body, url, tag) values (uid, k, left(t, 120), left(b, 240), u, left(g, 80));
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

revoke all on function public.push_due(int), public.push_done(bigint[]), public.push_result(uuid, boolean, boolean), public.push_daily(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.push_due(int), public.push_done(bigint[]), public.push_result(uuid, boolean, boolean), public.push_daily(text, text, text, text, text) to service_role;
commit;

-- ===================================================== 0031_announcements.sql
begin;
-- 0031: Notify everyone (admin announcements).
--
-- An admin writes a short notice ("New conversation: …") with a link inside the site. It appears at the top of
-- every member's bell, and goes as a phone notification to everyone who has notifications on and hasn't switched
-- off "Family news". The text is what the admin wrote for everyone to see; it never carries anyone's private data.
--
--   announcements        readable by members; written only through announce() (active admins, 6 a day)
--   member_prefs         push_news (on by default for people who turned notifications on)
--   push_queue           new kind 'news' (held back in quiet hours like everything except messages)

alter table public.member_prefs add column if not exists push_news boolean not null default true;

create table public.announcements (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (length(trim(title)) between 1 and 80),
  body           text not null default '' check (length(body) <= 200),
  url            text not null default '#/' check (url ~ '^#/[A-Za-z0-9/_\-]*$' and length(url) <= 120),
  created_by     uuid references auth.users(id) on delete set null default auth.uid(),
  created_person text references public.persons(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index announcements_recent on public.announcements (created_at desc);
alter table public.announcements enable row level security;
revoke all on public.announcements from public, anon;
grant select on public.announcements to authenticated;
create policy announcements_read on public.announcements for select to authenticated using (is_member());
-- admins may remove one (a mistake); nobody edits
grant delete on public.announcements to authenticated;
create policy announcements_delete on public.announcements for delete to authenticated using (is_admin());
create trigger audit_announcements after insert or update or delete on public.announcements
  for each row execute function public.audit();

alter table public.push_queue drop constraint if exists push_queue_kind_check;
alter table public.push_queue add constraint push_queue_kind_check
  check (kind in ('message', 'mention', 'join', 'invite', 'occasion', 'festival', 'test', 'news'));

create or replace function public.push_wanted(uid uuid, k text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from push_subscriptions where user_id = uid)
     and exists (select 1 from members where user_id = uid and status = 'active')
     and coalesce((select case k when 'message' then p.push_messages when 'mention' then p.push_mentions
                                  when 'join' then p.push_admin when 'invite' then p.push_admin
                                  when 'occasion' then p.push_occasions when 'festival' then p.push_festivals
                                  when 'news' then p.push_news
                                  else true end
                     from member_prefs p where p.user_id = uid),
                  case k when 'festival' then false else true end)
$$;
revoke all on function public.push_wanted(uuid, text) from public, anon, authenticated;

-- Send a notice to everyone. Returns how many members will see it in the bell and how many get a phone notification.
create function public.announce(title text, body text default '', url text default '#/')
returns table (members int, phones int)
language plpgsql security definer set search_path = public as $$
declare a announcements; who text; uid uuid; n int := 0;
begin
  if not is_admin() then raise exception 'Only admins can notify everyone.'; end if;
  if (select count(*) from announcements x where x.created_by = auth.uid() and x.created_at > now() - interval '24 hours') >= 6 then
    raise exception 'You have sent 6 notices today. Try again tomorrow.';
  end if;
  insert into announcements(title, body, url, created_by, created_person)
  values (trim(announce.title), trim(coalesce(announce.body, '')), coalesce(nullif(trim(announce.url), ''), '#/'), auth.uid(), my_person_id())
  returning * into a;
  who := coalesce(push_name(auth.uid()), 'Family');
  for uid in select m.user_id from members m where m.status = 'active' loop
    if push_wanted(uid, 'news') then
      insert into push_queue(user_id, kind, title, body, url, tag)
      values (uid, 'news', left(a.title, 120), left(who || ': ' || coalesce(nullif(a.body, ''), 'Tap to have a look.'), 240), a.url, 'news-' || a.id);
      n := n + 1;
    end if;
  end loop;
  return query select (select count(*)::int from members m where m.status = 'active'), n;
end $$;
revoke all on function public.announce(text, text, text) from public, anon;
grant execute on function public.announce(text, text, text) to authenticated;

-- how many would get a phone notification right now (for the admin screen; numbers only)
create function public.announce_reach() returns table (members int, phones int)
language sql stable security definer set search_path = public as $$
  select (select count(*)::int from members m where m.status = 'active'),
         (select count(*)::int from members m where m.status = 'active' and push_wanted(m.user_id, 'news'))
   where is_admin()
$$;
revoke all on function public.announce_reach() from public, anon;
grant execute on function public.announce_reach() to authenticated;
commit;

-- ===================================================== 0032_more_notifications.sql
begin;
-- 0032: more phone notifications, and notices to chosen people.
--
-- As before, notifications say WHO, never WHAT ("New details on Kavya's profile", never the details).
--
--   family   close family: someone close to you has new details on their profile (only details the family
--            or close family can see, and only while a living person's consent is active), at most one per
--            person every 6 hours
--   talk     a new conversation (everyone), and new replies in a conversation you started or replied in
--            (at most one per conversation an hour)
--   photo    new photos shared (at most one per person sharing every 2 hours)
--   tag      someone tagged you in a photo (asks you to approve or hide it); follows the Mentions switch
--   notices  announce() can now go to chosen people; only they see it in their bell

alter table public.member_prefs
  add column if not exists push_family boolean not null default true,
  add column if not exists push_talk   boolean not null default true,
  add column if not exists push_photos boolean not null default true;

alter table public.push_queue drop constraint if exists push_queue_kind_check;
alter table public.push_queue add constraint push_queue_kind_check
  check (kind in ('message', 'mention', 'join', 'invite', 'occasion', 'festival', 'test', 'news', 'family', 'talk', 'photo', 'tag'));

create or replace function public.push_wanted(uid uuid, k text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from push_subscriptions where user_id = uid)
     and exists (select 1 from members where user_id = uid and status = 'active')
     and coalesce((select case k when 'message' then p.push_messages when 'mention' then p.push_mentions when 'tag' then p.push_mentions
                                  when 'join' then p.push_admin when 'invite' then p.push_admin
                                  when 'occasion' then p.push_occasions when 'festival' then p.push_festivals
                                  when 'news' then p.push_news when 'family' then p.push_family
                                  when 'talk' then p.push_talk when 'photo' then p.push_photos
                                  else true end
                     from member_prefs p where p.user_id = uid),
                  case k when 'festival' then false else true end)
$$;
revoke all on function public.push_wanted(uuid, text) from public, anon, authenticated;

-- queue unless the same tag already went to this person within the window
create function public.push_once(uid uuid, k text, t text, b text, u text, g text, win interval) returns void
language plpgsql security definer set search_path = public as $$
begin
  if uid is null or not push_wanted(uid, k) then return; end if;
  if exists (select 1 from push_queue q where q.user_id = uid and q.tag = g and q.queued_at > now() - win) then return; end if;
  insert into push_queue(user_id, kind, title, body, url, tag) values (uid, k, left(t, 120), left(b, 240), u, left(g, 80));
end $$;
revoke all on function public.push_once(uuid, text, text, text, text, text, interval) from public, anon, authenticated;

create function public.push_first(p text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(regexp_replace(given_name, '\s*\(.*\)', '')), ''), 'Someone') from persons where id = p
$$;
revoke all on function public.push_first(text) from public, anon, authenticated;

-- close family: new details on someone's profile
create function public.push_on_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; who text; living boolean;
begin
  begin
    if new.visibility::text not in ('family', 'close') then return null; end if;
    if tg_op = 'UPDATE' and new.value is not distinct from old.value and new.visibility = old.visibility then return null; end if;
    select is_living into living from persons where id = new.person_id;
    if coalesce(living, false) and not exists (select 1 from consents where person_id = new.person_id and withdrawn_at is null) then return null; end if;
    who := push_first(new.person_id);
    for r in select m.user_id, m.person_id from members m
              where m.status = 'active' and m.person_id is not null and m.person_id <> new.person_id
                and m.user_id is distinct from auth.uid() and is_close(m.person_id, new.person_id) loop
      perform push_once(r.user_id, 'family', 'Family', 'New details on ' || who || '’s profile', '#/p/' || new.person_id, 'fam-' || new.person_id, interval '6 hours');
    end loop;
  exception when others then raise warning 'push (profile): %', sqlerrm;   -- never stop a profile being saved
  end;
  return null;
end $$;
create trigger profile_fields_push after insert or update on public.profile_fields for each row execute function public.push_on_profile();

-- Talk: a new conversation for everyone
create function public.push_on_thread() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid; who text;
begin
  begin
    who := coalesce(push_first(new.author_person), push_name(new.author), 'Someone');
    for uid in select user_id from members where status = 'active' and user_id <> new.author loop
      perform push_once(uid, 'talk', 'Talk', who || ' started a new conversation', '#/talk/' || new.id, 'talk-' || new.id, interval '1 hour');
    end loop;
  exception when others then raise warning 'push (thread): %', sqlerrm;
  end;
  return null;
end $$;
create trigger threads_push after insert on public.threads for each row execute function public.push_on_thread();

-- Talk: a reply, for the people in that conversation
create function public.push_on_post() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid; who text;
begin
  begin
    who := coalesce(push_first(new.author_person), push_name(new.author), 'Someone');
    for uid in select distinct x from (
                 select t.author as x from threads t where t.id = new.thread_id
                 union select p.author from thread_posts p where p.thread_id = new.thread_id) s
               where x is not null and x <> new.author loop
      perform push_once(uid, 'talk', 'Talk', who || ' replied in a conversation you’re in', '#/talk/' || new.thread_id, 'reply-' || new.thread_id, interval '1 hour');
    end loop;
  exception when others then raise warning 'push (reply): %', sqlerrm;
  end;
  return null;
end $$;
create trigger thread_posts_push after insert on public.thread_posts for each row execute function public.push_on_post();

-- Photos: new photos shared
create function public.push_on_photo() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid; who text;
begin
  begin
    who := coalesce(push_name(new.uploaded_by), 'Someone');
    for uid in select user_id from members where status = 'active' and user_id <> new.uploaded_by loop
      perform push_once(uid, 'photo', 'Photos', who || ' shared new family photos', '#/photos', 'photos-' || new.uploaded_by, interval '2 hours');
    end loop;
  exception when others then raise warning 'push (photo): %', sqlerrm;
  end;
  return null;
end $$;
create trigger photos_push after insert on public.photos for each row execute function public.push_on_photo();

-- Photos: you were tagged (waiting for you to approve or hide it)
create function public.push_on_tag() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid; who text;
begin
  if new.status <> 'pending' then return null; end if;
  begin
    who := coalesce(push_name(new.tagged_by), 'Someone');
    for uid in select user_id from members where status = 'active' and person_id = new.person_id and user_id <> new.tagged_by loop
      perform push_once(uid, 'tag', 'Photos', who || ' tagged you in a photo. Approve it or hide it.', '#/photos/' || new.photo_id, 'tag-' || new.photo_id, interval '1 hour');
    end loop;
  exception when others then raise warning 'push (tag): %', sqlerrm;
  end;
  return null;
end $$;
create trigger photo_tags_push after insert on public.photo_tags for each row execute function public.push_on_tag();

revoke all on function public.push_on_profile(), public.push_on_thread(), public.push_on_post(), public.push_on_photo(), public.push_on_tag() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- notices to chosen people
-- ---------------------------------------------------------------------------
alter table public.announcements add column if not exists to_persons text[];   -- null = everyone
drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements for select to authenticated
  using (is_member() and (to_persons is null or my_person_id() = any(to_persons) or created_by = auth.uid()));

drop function if exists public.announce(text, text, text);
create function public.announce(title text, body text default '', url text default '#/', to_persons text[] default null)
returns table (members int, phones int)
language plpgsql security definer set search_path = public as $$
declare a announcements; who text; uid uuid; n int := 0; m int := 0; pick text[];
begin
  if not is_admin() then raise exception 'Only admins can send notices.'; end if;
  if (select count(*) from announcements x where x.created_by = auth.uid() and x.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'You have sent 10 notices today. Try again tomorrow.';
  end if;
  pick := case when announce.to_persons is null or cardinality(announce.to_persons) = 0 then null
               else (select array_agg(distinct x) from unnest(announce.to_persons) x where exists (select 1 from members mm where mm.person_id = x and mm.status = 'active')) end;
  if announce.to_persons is not null and cardinality(announce.to_persons) > 0 and pick is null then
    raise exception 'None of the people you picked have joined yet.';
  end if;
  insert into announcements(title, body, url, created_by, created_person, to_persons)
  values (trim(announce.title), trim(coalesce(announce.body, '')), coalesce(nullif(trim(announce.url), ''), '#/'), auth.uid(), my_person_id(), pick)
  returning * into a;
  who := coalesce(push_name(auth.uid()), 'Family');
  for uid in select mm.user_id from members mm where mm.status = 'active' and (pick is null or mm.person_id = any(pick)) loop
    m := m + 1;
    if push_wanted(uid, 'news') then
      insert into push_queue(user_id, kind, title, body, url, tag)
      values (uid, 'news', left(a.title, 120), left(who || ': ' || coalesce(nullif(a.body, ''), 'Tap to have a look.'), 240), a.url, 'news-' || a.id);
      n := n + 1;
    end if;
  end loop;
  return query select m, n;
end $$;
revoke all on function public.announce(text, text, text, text[]) from public, anon;
grant execute on function public.announce(text, text, text, text[]) to authenticated;

-- how many of these people (or everyone) would get a phone notification right now; counts only, admins only
drop function if exists public.announce_reach();
create function public.announce_reach(to_persons text[] default null) returns table (members int, phones int)
language sql stable security definer set search_path = public as $$
  select count(*)::int, count(*) filter (where push_wanted(m.user_id, 'news'))::int
    from members m
   where is_admin() and m.status = 'active'
     and (announce_reach.to_persons is null or cardinality(announce_reach.to_persons) = 0 or m.person_id = any(announce_reach.to_persons))
$$;
revoke all on function public.announce_reach(text[]) from public, anon;
grant execute on function public.announce_reach(text[]) to authenticated;
commit;

-- ===================================================== 0033_app_installed.sql
begin;
-- 0033: who has the app on their home screen.
-- The site notes the first time someone opens it from their home screen (member_prefs.app_at, their own row),
-- so Admin → Members & roles can show who still needs a hand. A date only; admins only, via member_activity().

alter table public.member_prefs add column if not exists app_at timestamptz;

drop function if exists public.member_activity();
create function public.member_activity()
returns table (user_id uuid, last_sign_in_at timestamptz, welcome_sent_at timestamptz, app_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.last_sign_in_at, w.sent_at, p.app_at
    from members m
    join auth.users u on u.id = m.user_id
    left join welcome_emails w on w.user_id = m.user_id
    left join member_prefs p on p.user_id = m.user_id
   where is_admin()
$$;
revoke all on function public.member_activity() from public, anon;
grant execute on function public.member_activity() to authenticated;
commit;

-- ===================================================== 0034_under_18_accounts.sql
begin;
-- 0034: children under 18 can have their own account, with a parent checking first (design decision),
-- following India's Digital Personal Data Protection Act for children: verifiable parental consent, no tracking or
-- behavioural monitoring of children, and nothing of theirs shared without the parent's OK.
--
--   joining      approve_join() and invitations no longer refuse under-18s
--   consent      only a parent (or a named manager, or an admin) gives or withdraws a child's consent; never the child
--   their own    a child sees all of their own details, but can't change them directly
--   drafts       anything a child adds (a profile detail, a conversation, a reply, a photo) goes into child_drafts,
--                seen only by the child and whoever can consent for them; once a parent approves it is published
--                under the child's name; declined (or approved) drafts keep no copy of the content
--   blocked      under-18s can't post, upload, tag or edit directly; reactions and private messages work as before
--   no tracking  under-18s are never shown as online or last seen and their presence isn't recorded;
--                writing help (AI) isn't offered to them
--   contact      still no phone, email or address for under-18s (invariant 5)

create or replace function public.am_minor() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and is_member() and is_minor(my_person_id())
$$;
-- who a post or photo is published as: the child, while a parent approves it inside child_decide(); otherwise the caller
create or replace function public.acting_author() returns uuid
language sql stable as $$
  select coalesce(nullif(current_setting('fam.as_author', true), '')::uuid, auth.uid())
$$;
create or replace function public.person_of(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select person_id from members where user_id = uid
$$;
revoke all on function public.am_minor(), public.acting_author(), public.person_of(uuid) from public, anon;
grant execute on function public.am_minor(), public.acting_author() to authenticated;

-- consent: a child never consents for themselves
create or replace function public.can_consent(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or (
    is_member() and (
      (my_person_id() = p and not is_minor(p))
      or (is_minor(p) and exists (select 1 from parent_links where child_id = p and parent_id = my_person_id()))
      or (exists (select 1 from persons where id = p and not is_living)
          and exists (select 1 from parent_links where parent_id = p and child_id = my_person_id()))
      or exists (select 1 from managers where person_id = p and manager_person_id = my_person_id())
    )
  )
$$;

-- everyone sees their own details (a child included, though they can't change them)
create or replace function public.can_see(p text, vis public.visibility) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when can_manage(p) then true
    when not is_member() then false
    when my_person_id() = p then true
    when exists (select 1 from persons where id = p and is_living) and not has_consent(p) then false
    when vis = 'family' then true
    when vis = 'close' then is_close(my_person_id(), p)
    else false
  end
$$;

create or replace function public.approve_join(req uuid, person text) returns void
language plpgsql security definer set search_path = public as $$
declare r join_requests%rowtype;
begin
  if not is_steward() then raise exception 'Only a family steward or admin can approve requests.'; end if;
  select * into r from join_requests where id = req for update;
  if not found or r.status <> 'pending' then raise exception 'This request has already been handled.'; end if;
  if not exists (select 1 from persons where id = person and is_living) then raise exception 'Choose a living relative from the tree.'; end if;
  if exists (select 1 from members where person_id = person) then raise exception 'Someone has already joined as this person.'; end if;
  if exists (select 1 from members where user_id = r.user_id) then raise exception 'They have already joined.'; end if;
  if r.email = '' then raise exception 'This request has no email address.'; end if;
  delete from invitations where accepted_at is null and (person_id = person or email = r.email);
  insert into invitations (email, person_id, role) values (r.email, person, 'member');
  perform accept_invitation(r.user_id, r.email);
  update join_requests set status = 'approved', person_id = person, decided_by = auth.uid(), decided_at = now(), phone = null where id = req;
end $$;

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
  if exists (select 1 from members where person_id = new.person_id) then raise exception 'They have already joined.'; end if;
  if exists (select 1 from invitations where person_id = new.person_id and accepted_at is null) then
    raise exception 'Someone has already invited them.'; end if;
  if (select count(*) from invitations where invited_by = auth.uid() and accepted_at is null) >= 25 then
    raise exception 'You have 25 invitations waiting. Please wait for some to be accepted first.'; end if;
  return new;
end $$;


-- ---------------------------------------------------------------------------
-- under-18s can't post, upload, tag or edit directly; approved drafts are published as the child
-- ---------------------------------------------------------------------------
create or replace function public.threads_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if am_minor() then raise exception 'A parent checks what you write first. Your post has been kept for them to see.'; end if;
  if tg_op = 'INSERT' then
    new.author := acting_author(); new.author_person := coalesce(person_of(new.author), my_person_id()); new.created_at := now();
    new.last_activity_at := now(); new.edited_at := null; new.reply_count := 0;
    if not is_admin() then new.pinned := false; new.locked := false; end if;
  else
    new.author := old.author; new.author_person := old.author_person; new.created_at := old.created_at;
    if current_setting('talk.internal', true) is distinct from 'on' then
      new.reply_count := old.reply_count; new.last_activity_at := old.last_activity_at;
      if not is_admin() then new.pinned := old.pinned; new.locked := old.locked; end if;
      if new.title is distinct from old.title or new.body is distinct from old.body or new.category is distinct from old.category then
        new.edited_at := now();
      end if;
    end if;
  end if;
  return new;
end $$;

create or replace function public.posts_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if am_minor() then raise exception 'A parent checks what you write first. Your reply has been kept for them to see.'; end if;
  if tg_op = 'INSERT' then
    if exists (select 1 from threads where id = new.thread_id and locked) and not is_admin() then
      raise exception 'This conversation is closed for replies.';
    end if;
    if new.reply_to is not null and not exists (select 1 from thread_posts where id = new.reply_to and thread_id = new.thread_id) then
      new.reply_to := null;
    end if;
    new.author := acting_author(); new.author_person := coalesce(person_of(new.author), my_person_id()); new.created_at := now(); new.edited_at := null;
  else
    new.author := old.author; new.author_person := old.author_person; new.created_at := old.created_at;
    new.thread_id := old.thread_id; new.reply_to := old.reply_to;
    if new.body is distinct from old.body then new.edited_at := now(); end if;
  end if;
  return new;
end $$;

create or replace function public.photos_stamp() returns trigger
language plpgsql as $$
begin
  if am_minor() then raise exception 'A parent checks photos first. Your photo has been kept for them to see.'; end if;
  if tg_op = 'INSERT' then new.uploaded_by := acting_author(); new.created_at := now();
  else new.uploaded_by := old.uploaded_by; new.created_at := old.created_at; new.path := old.path; end if;
  return new;
end $$;

create or replace function public.photo_tags_new() returns trigger
language plpgsql security definer set search_path = public as $$
declare me text := my_person_id();
begin
  if am_minor() then raise exception 'Ask a parent to tag people in photos.'; end if;
  new.tagged_by := auth.uid();
  new.created_at := now();
  if new.person_id = me
     or exists (select 1 from persons where id = new.person_id and not is_living)
     or (is_minor(new.person_id) and exists (select 1 from parent_links where child_id = new.person_id and parent_id = me))
     or (is_admin() and not exists (select 1 from members where person_id = new.person_id and status = 'active'))
  then new.status := 'approved'; new.decided_by := auth.uid(); new.decided_at := now();
  else new.status := 'pending'; new.decided_by := null; new.decided_at := null;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- drafts waiting for a parent
-- ---------------------------------------------------------------------------
create table public.child_drafts (
  id           uuid primary key default gen_random_uuid(),
  child_user   uuid not null references auth.users(id) on delete cascade,
  child_person text not null references public.persons(id) on delete cascade,
  kind         text not null check (kind in ('detail', 'thread', 'reply', 'photo')),
  payload      jsonb not null default '{}' check (length(payload::text) <= 12000),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid,
  decision     text check (decision in ('approved', 'declined', 'withdrawn'))
);
create index child_drafts_person on public.child_drafts (child_person) where decided_at is null;
alter table public.child_drafts enable row level security;
revoke all on public.child_drafts from public, anon;
grant select on public.child_drafts to authenticated;
-- the child and whoever can consent for them (never the child's consent for themselves: can_consent is false for a minor's own row)
create policy child_drafts_read on public.child_drafts for select to authenticated
  using (child_user = auth.uid() or (can_consent(child_person) and my_person_id() is distinct from child_person));
create trigger audit_child_drafts after insert or update or delete on public.child_drafts
  for each row execute function public.audit();

alter table public.push_queue drop constraint if exists push_queue_kind_check;
alter table public.push_queue add constraint push_queue_kind_check
  check (kind in ('message', 'mention', 'join', 'invite', 'occasion', 'festival', 'test', 'news', 'family', 'talk', 'photo', 'tag', 'child'));

-- the parents (and managers) to ask about a child: joined, active members who can consent for them
create or replace function public.child_guardians(p text) returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.user_id from members m
   where m.status = 'active' and m.person_id is not null and m.person_id <> p
     and (exists (select 1 from parent_links l where l.child_id = p and l.parent_id = m.person_id)
          or exists (select 1 from managers g where g.person_id = p and g.manager_person_id = m.person_id))
$$;
revoke all on function public.child_guardians(text) from public, anon, authenticated;

-- a child sends something for a parent to check
create function public.child_submit(kind text, payload jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare me text := my_person_id(); d uuid; who text; g uuid; f text;
begin
  if not am_minor() then raise exception 'Only for family members under 18.'; end if;
  if (select count(*) from child_drafts x where x.child_user = auth.uid() and x.decided_at is null) >= 30 then
    raise exception 'You have 30 things waiting for a parent. Ask them to have a look first.';
  end if;
  if kind = 'detail' then
    f := payload->>'field';
    if f is null or length(f) > 40 then raise exception 'Which detail?'; end if;
    if is_contact_field(f) then raise exception 'Phone numbers, emails and addresses aren’t kept for anyone under 18.'; end if;
    if coalesce(payload->>'visibility', 'family') not in ('family', 'close', 'private') then raise exception 'Choose who can see it.'; end if;
    if length(coalesce(payload->>'value', '')) > 4000 then raise exception 'That’s too long.'; end if;
  elsif kind = 'thread' then
    if length(btrim(coalesce(payload->>'title', ''))) < 3 or length(coalesce(payload->>'body', '')) < 1 then raise exception 'Add a title and a message.'; end if;
  elsif kind = 'reply' then
    if not exists (select 1 from threads t where t.id = (payload->>'thread_id')::uuid and not t.locked) then raise exception 'That conversation is closed or gone.'; end if;
    if length(coalesce(payload->>'body', '')) < 1 then raise exception 'Write your reply first.'; end if;
  elsif kind = 'photo' then
    if coalesce(payload->>'path', '') !~ '^album/[A-Za-z0-9-]+\.jpg$' then raise exception 'Choose a photo first.'; end if;
  else raise exception 'Unknown kind.';
  end if;
  insert into child_drafts(child_user, child_person, kind, payload) values (auth.uid(), me, kind, payload) returning id into d;
  begin
    who := coalesce(push_first(me), 'Your child');
    for g in select child_guardians(me) loop
      perform push_once(g, 'child', 'Waiting for your OK', who || ' added something for the family. Please check it.', '#/child', 'child-' || me, interval '1 hour');
    end loop;
  exception when others then raise warning 'push (child): %', sqlerrm;
  end;
  return d;
end $$;

-- a parent approves (it's published under the child's name) or declines; either way the draft keeps no content
create function public.child_decide(draft uuid, approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare d child_drafts; v public.visibility;
begin
  select * into d from child_drafts where id = draft for update;
  if not found or d.decided_at is not null then raise exception 'This has already been handled.'; end if;
  if not can_consent(d.child_person) or my_person_id() is not distinct from d.child_person then
    raise exception 'Only a parent can approve this.';
  end if;
  if approve then
    perform set_config('fam.as_author', d.child_user::text, true);
    if d.kind = 'detail' then
      if is_contact_field(d.payload->>'field') then raise exception 'Contact details aren’t kept for anyone under 18.'; end if;
      v := coalesce(d.payload->>'visibility', 'family')::public.visibility;
      if coalesce((d.payload->>'remove')::boolean, false) or btrim(coalesce(d.payload->>'value', '')) = '' then
        delete from profile_fields where person_id = d.child_person and field = d.payload->>'field';
      else
        insert into profile_fields(person_id, field, value, visibility) values (d.child_person, d.payload->>'field', btrim(d.payload->>'value'), v)
          on conflict (person_id, field) do update set value = excluded.value, visibility = excluded.visibility;
      end if;
    elsif d.kind = 'thread' then
      insert into threads(title, body, category) values (btrim(d.payload->>'title'), d.payload->>'body', coalesce(nullif(d.payload->>'category', ''), 'general'));
    elsif d.kind = 'reply' then
      insert into thread_posts(thread_id, body, reply_to) values ((d.payload->>'thread_id')::uuid, d.payload->>'body', nullif(d.payload->>'reply_to', '')::uuid);
    elsif d.kind = 'photo' then
      insert into photos(path, caption, taken_year) values (d.payload->>'path', nullif(d.payload->>'caption', ''), nullif(d.payload->>'taken_year', '')::int);
    end if;
    perform set_config('fam.as_author', '', true);
  end if;
  update child_drafts set decided_at = now(), decided_by = auth.uid(), decision = case when approve then 'approved' else 'declined' end,
         payload = jsonb_build_object('summary', case d.kind when 'detail' then coalesce(d.payload->>'field', '') when 'thread' then left(coalesce(d.payload->>'title', ''), 80) else '' end)
   where id = draft;
  if not approve and d.kind = 'photo' then
    begin   -- the declined picture goes too (it was never readable by anyone else: no photos row points at it)
      delete from storage.objects where bucket_id = 'photos' and name = d.payload->>'path';
    exception when others then raise warning 'child photo cleanup: %', sqlerrm;
    end;
  end if;
end $$;

-- the child changes their mind
create function public.child_withdraw(draft uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d child_drafts;
begin
  select * into d from child_drafts where id = draft and child_user = auth.uid() and decided_at is null for update;
  if not found then raise exception 'This has already been handled.'; end if;
  update child_drafts set decided_at = now(), decided_by = auth.uid(), decision = 'withdrawn', payload = '{}' where id = draft;
  if d.kind = 'photo' then
    begin delete from storage.objects where bucket_id = 'photos' and name = d.payload->>'path';
    exception when others then raise warning 'child photo cleanup: %', sqlerrm; end;
  end if;
end $$;

revoke all on function public.child_submit(text, jsonb), public.child_decide(uuid, boolean), public.child_withdraw(uuid) from public, anon;
grant execute on function public.child_submit(text, jsonb), public.child_decide(uuid, boolean), public.child_withdraw(uuid) to authenticated;

-- a parent can see a child's waiting photo (and the child their own) before it is published
create policy album_read_child_draft on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = 'album'
         and exists (select 1 from public.child_drafts d where d.decided_at is null and d.kind = 'photo' and d.payload->>'path' = name
                       and (d.child_user = auth.uid() or (public.can_consent(d.child_person) and public.my_person_id() is distinct from d.child_person))));

-- a child joins: their parents are asked to give consent
create function public.push_on_child_join() returns trigger
language plpgsql security definer set search_path = public as $$
declare g uuid; who text;
begin
  if new.status <> 'active' or new.person_id is null or not is_minor(new.person_id) then return null; end if;
  if tg_op = 'UPDATE' and old.status = 'active' and old.person_id is not distinct from new.person_id then return null; end if;
  begin
    who := coalesce(push_first(new.person_id), 'Your child');
    for g in select child_guardians(new.person_id) loop
      perform push_once(g, 'child', 'Family', who || ' joined the family website. Please give your consent.', '#/p/' || new.person_id, 'childjoin-' || new.person_id, interval '1 day');
    end loop;
  exception when others then raise warning 'push (child join): %', sqlerrm;
  end;
  return null;
end $$;
revoke all on function public.push_on_child_join() from public, anon, authenticated;
create trigger members_child_join after insert or update of status, person_id on public.members
  for each row execute function public.push_on_child_join();

-- ---------------------------------------------------------------------------
-- no tracking of children: no presence recorded or shown; no AI writing help
-- ---------------------------------------------------------------------------
create or replace function public.heartbeat(here boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare people jsonb; unread int; kid boolean := am_minor();
begin
  if not is_member() then raise exception 'Only family members.'; end if;
  if here and not kid then
    insert into member_presence(user_id, last_seen_at) values (auth.uid(), now())
      on conflict (user_id) do update set last_seen_at = now();
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('p', m.person_id,
           'seen', case when not kid and not is_minor(m.person_id) and coalesce(mp.show_online, true) and coalesce(me.show_online, true) then pr.last_seen_at end,
           'h', kid or is_minor(m.person_id) or not (coalesce(mp.show_online, true) and coalesce(me.show_online, true)))), '[]')
    into people
    from members m
    left join member_presence pr on pr.user_id = m.user_id
    left join member_prefs mp on mp.user_id = m.user_id
    left join member_prefs me on me.user_id = auth.uid()
   where m.status = 'active' and m.person_id is not null and m.user_id <> auth.uid();
  select coalesce(sum(l.unread), 0)::int into unread from dm_list() l;
  return jsonb_build_object('people', people, 'unread', unread, 'now', now());
end $$;

create or replace function public.ai_allow(what text) returns int
language plpgsql security definer set search_path = public as $$
declare lim int; used int; today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not is_member() then raise exception 'Only family members who have joined can use writing help.'; end if;
  if am_minor() then raise exception 'Writing help isn’t available for anyone under 18.'; end if;
  lim := case what when 'rewrite' then 60 when 'voice' then 40 else null end;
  if lim is null then raise exception 'Unknown kind of writing help.'; end if;
  insert into ai_usage(user_id, day, kind, n) values (auth.uid(), today, what, 1)
  on conflict (user_id, day, kind) do update set n = ai_usage.n + 1
  where ai_usage.n < lim
  returning n into used;
  if used is null then
    raise exception 'You’ve used writing help a lot today. It will be ready again tomorrow.';
  end if;
  return lim - used;
end $$;
commit;

-- ===================================================== 0035_no_duplicate_invitations.sql
begin;
-- 0035: no duplicate invitations (an admin once sent two to the same person by accident).
-- Admins used to skip the checks, so a second invitation for the same person went through. Now nobody can invite
-- someone who has joined or who already has an invitation waiting. Exact duplicates already accepted (same person,
-- same email) are removed, keeping the first; the audit log keeps a record of the removal.

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

delete from public.invitations a
 using public.invitations b
 where a.person_id = b.person_id and lower(a.email) = lower(b.email)
   and a.accepted_at is not null and b.accepted_at is not null
   and (a.created_at, a.id::text) > (b.created_at, b.id::text);
commit;

-- ===================================================== 0036_family_admin_contact.sql
begin;
-- 0036: the site's own admin login (an active admin with no place in the tree) becomes a contact
-- called "Family Admin" in Messages. Conversations with it use the address 'site' instead of a person id.
-- It is not a person: it never appears in the tree, counts, presence or the bell.

-- the family admin login: the earliest active admin who isn't linked to anyone in the tree
create function public.site_admin_uid() returns uuid
language sql stable security definer set search_path = public as $$
  select m.user_id from members m
   where m.role = 'admin' and m.status = 'active' and m.person_id is null
     and (is_member() or auth.uid() is null)
   order by m.created_at limit 1
$$;
revoke all on function public.site_admin_uid() from public, anon;
grant execute on function public.site_admin_uid() to authenticated;

-- open a conversation with someone who has joined, or with 'site' (the Family Admin)
create or replace function public.dm_open(person text) returns uuid
language plpgsql security definer set search_path = public as $$
declare other uuid; a uuid; b uuid; cid uuid;
begin
  if not is_member() then raise exception 'Only family members can send messages.'; end if;
  if person = 'site' then
    other := site_admin_uid();
    if other is null then raise exception 'There’s no family admin account to message.'; end if;
  else
    select user_id into other from members where person_id = person and status = 'active' limit 1;
    if other is null then raise exception 'They haven’t joined the site yet, so they can’t get messages. Invite them first.'; end if;
  end if;
  if other = auth.uid() then raise exception 'That’s you.'; end if;
  a := least(other, auth.uid()); b := greatest(other, auth.uid());
  select id into cid from dm_conversations where user_a = a and user_b = b;
  if cid is null then
    insert into dm_conversations(user_a, user_b) values (a, b) returning id into cid;
  end if;
  return cid;
end $$;

-- same as before, but the Family Admin shows as 'site'
create or replace function public.dm_list()
returns table (id uuid, other_person text, last_message_at timestamptz, last_body text, last_from_me boolean, unread int, other_read_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id,
         coalesce((select m.person_id from members m where m.user_id = case when d.user_a = auth.uid() then d.user_b else d.user_a end),
                  case when site_admin_uid() = case when d.user_a = auth.uid() then d.user_b else d.user_a end then 'site' end),
         d.last_message_at,
         (select left(x.body, 140) from dm_messages x where x.conversation_id = d.id order by x.created_at desc limit 1),
         (select x.sender = auth.uid() from dm_messages x where x.conversation_id = d.id order by x.created_at desc limit 1),
         (select count(*)::int from dm_messages x where x.conversation_id = d.id and x.sender <> auth.uid()
            and x.created_at > case when d.user_a = auth.uid() then d.a_read_at else d.b_read_at end),
         case when d.user_a = auth.uid() then d.b_read_at else d.a_read_at end
    from dm_conversations d
   where is_member() and auth.uid() in (d.user_a, d.user_b)
   order by coalesce(d.last_message_at, d.created_at) desc
$$;

-- phone notifications name the Family Admin and open its conversation
create or replace function public.push_name(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nullif(trim(p.given_name), '') from members m join persons p on p.id = m.person_id where m.user_id = uid),
    case when uid = site_admin_uid() then 'Family Admin' end)
$$;
revoke all on function public.push_name(uuid) from public, anon, authenticated;

create or replace function public.push_on_dm() returns trigger
language plpgsql security definer set search_path = public as $$
declare c dm_conversations; other uuid; who text; whose text;
begin
  begin
    select * into c from dm_conversations where id = new.conversation_id;
    other := case when new.sender = c.user_a then c.user_b else c.user_a end;
    who := coalesce(push_name(new.sender), 'Someone');
    select person_id into whose from members where user_id = new.sender;
    if whose is null and new.sender = site_admin_uid() then whose := 'site'; end if;
    perform push_enqueue(other, 'message', 'New message', who || ' sent you a message', '#/chat' || coalesce('/' || whose, ''), 'dm-' || new.conversation_id);
  exception when others then raise warning 'push (message): %', sqlerrm;
  end;
  return null;
end $$;
commit;

-- ===================================================== 0037_joined_means_signed_in.sql
begin;
-- 0037: "X joined the family website" only once X has actually signed in.
-- Sending someone a sign-in link creates their login (and member row) before they open it,
-- so members.created_at is not when they joined. We now keep the first sign-in time.

alter table public.members add column if not exists first_signin_at timestamptz;

-- existing members who have signed in: their member row date (no flood of old "joined" items)
update public.members m set first_signin_at = m.created_at
  from auth.users u where u.id = m.user_id and u.last_sign_in_at is not null and m.first_signin_at is null;

-- from now on: the first sign-in after the member row exists
create function public.note_first_signin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.last_sign_in_at is not null and new.last_sign_in_at is distinct from old.last_sign_in_at then
    update members set first_signin_at = new.last_sign_in_at where user_id = new.id and first_signin_at is null;
  end if;
  return new;
exception when others then
  raise warning 'first sign-in: %', sqlerrm;   -- never stop a sign-in
  return new;
end $$;
revoke all on function public.note_first_signin() from public, anon, authenticated;
drop trigger if exists members_first_signin on auth.users;
create trigger members_first_signin after update of last_sign_in_at on auth.users
  for each row execute function public.note_first_signin();

-- a member row made for someone who already signed in (a join request approved later): joined now
create function public.member_first_signin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.first_signin_at is null and exists (select 1 from auth.users u where u.id = new.user_id and u.last_sign_in_at is not null) then
    new.first_signin_at := now();
  end if;
  return new;
end $$;
revoke all on function public.member_first_signin() from public, anon, authenticated;
create trigger members_first_signin_ins before insert on public.members
  for each row execute function public.member_first_signin();

create or replace function public.recent_joins() returns table (person_id text, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select person_id, first_signin_at from members
  where status = 'active' and person_id is not null and is_member()
    and first_signin_at > now() - interval '60 days'
$$;
commit;

-- ===================================================== 0038_close_family_tree_edits.sql
begin;
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
commit;

-- ===================================================== 0039_signed_in_people.sql
begin;
-- 0039: who has actually signed in (first_signin_at, 0037), for the "who's on the site" view of the Family tree.
-- Person ids only, members only, like joined_people().
create function public.signed_in_people() returns setof text
language sql stable security definer set search_path = public as $$
  select person_id from members
   where status = 'active' and person_id is not null and first_signin_at is not null and is_member()
$$;
revoke all on function public.signed_in_people() from public, anon;
grant execute on function public.signed_in_people() to authenticated;
commit;

-- ===================================================== 0040_engagement.sql
begin;
-- 0040: engagement milestone. engagement = the date (YYYYMMDD, 00 for unknown parts, like the other milestones);
-- engaged_to = the fiancé(e)'s name as free text, since they are usually not in the tree yet.
-- Both are ordinary profile_fields rows: their own visibility (default family), shown only while consent is active.
alter table public.profile_fields drop constraint if exists profile_fields_field_check;
alter table public.profile_fields add constraint profile_fields_field_check check (field in (
  'known_as', 'birth_date', 'birth_place', 'city', 'work', 'organisation',
  'interests', 'about', 'photo', 'phone', 'email', 'address',
  'gothram', 'sutram', 'vedam', 'native_place', 'kuladeivam',
  'janma_nakshatram', 'horoscope', 'shraddha_tithi',
  'upanayanam', 'sashtiabdapoorthi', 'bhimaratha_shanti', 'sathabhishekam',
  'engagement', 'engaged_to'));
alter table public.profile_fields drop constraint if exists profile_fields_milestone_format;
alter table public.profile_fields add constraint profile_fields_milestone_format check (
  field not in ('upanayanam', 'sashtiabdapoorthi', 'bhimaratha_shanti', 'sathabhishekam', 'engagement') or value ~ '^[0-9]{8}$');
alter table public.profile_fields drop constraint if exists profile_fields_engaged_to_len;
alter table public.profile_fields add constraint profile_fields_engaged_to_len check (field <> 'engaged_to' or char_length(value) <= 120);
commit;

-- ===================================================== 0041_engaged_couples.sql
begin;
-- 0041: engaged couples. partnerships.kind already allows 'engaged'; this adds the way to set it.
-- set_couple(a, b, status, on_date, at_place): status 'married' or 'engaged'; on_date is the wedding date for a married
-- couple and the engagement date for an engaged one (partnerships.start_date). The couple, whoever looks after either
-- profile, and stewards/admins may call it. Audited by the partnerships triggers.
create function public.set_couple(a text, b text, status text, on_date text, at_place text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_member() or not (can_manage(a) or can_manage(b) or is_steward()) then
    raise exception 'Only the couple (or someone who looks after their profile) can change this.';
  end if;
  if status not in ('married', 'engaged') then raise exception 'Choose married or engaged.'; end if;
  if on_date is not null and on_date !~ '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$' then
    raise exception 'Please give the date as a full date.';
  end if;
  update partnerships set kind = status, start_date = on_date, place = nullif(btrim(left(at_place, 120)), '')
  where least(person_a, person_b) = least(a, b) and greatest(person_a, person_b) = greatest(a, b) and kind in ('married', 'engaged');
  if not found then raise exception 'They aren’t linked as a couple in the tree. Ask a steward to add them first.'; end if;
end $$;
revoke all on function public.set_couple(text, text, text, text, text) from public, anon;
grant execute on function public.set_couple(text, text, text, text, text) to authenticated;
commit;

-- ===================================================== 0042_relationship_status.sql
begin;
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
commit;

-- ===================================================== 0043_status_options_trimmed.sql
begin;
-- 0043: Design choice: separated, divorced and "looking for an alliance" are too sensitive for the site; removed.
-- Personal status: single | engaged | married | widowed. Couple status: married | engaged.
alter table public.profile_fields drop constraint if exists profile_fields_marital_status;
alter table public.profile_fields add constraint profile_fields_marital_status check (
  field <> 'marital_status' or value in ('single', 'engaged', 'married', 'widowed'));

create or replace function public.set_couple(a text, b text, status text, on_date text, at_place text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_member() or not (can_manage(a) or can_manage(b) or is_steward()) then
    raise exception 'Only the couple (or someone who looks after their profile) can change this.';
  end if;
  if status not in ('married', 'engaged') then raise exception 'Choose married or engaged.'; end if;
  if on_date is not null and on_date !~ '^[0-9]{4}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$' then
    raise exception 'Please give the date as a full date.';
  end if;
  update partnerships set kind = status, start_date = on_date, place = nullif(btrim(left(at_place, 120)), '')
  where least(person_a, person_b) = least(a, b) and greatest(person_a, person_b) = greatest(a, b) and kind in ('married', 'engaged');
  if not found then raise exception 'They aren’t linked as a couple in the tree. Ask a steward to add them first.'; end if;
end $$;
commit;

-- ===================================================== 0044_hardening.sql
begin;
-- 0044: hardening after the Supabase security advisor (22 Nov 2026).
-- 1. Trigger functions can't be called directly anyway ("can only be called as triggers"), but they were still
--    listed as callable through the API. Take EXECUTE away from everyone; triggers keep firing (Postgres checks
--    EXECUTE on a trigger function only when the trigger is created).
-- 2. Pin search_path on the remaining helper functions, so no one can shadow a table or function they use.

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

alter function public.acting_author() set search_path = public, pg_temp;
alter function public.consents_guard() set search_path = public, pg_temp;
alter function public.default_visibility(text) set search_path = public, pg_temp;
alter function public.dev_docs_stamp() set search_path = public, pg_temp;
alter function public.is_contact_field(text) set search_path = public, pg_temp;
alter function public.mention_ids(text) set search_path = public, pg_temp;
alter function public.photo_tags_guard() set search_path = public, pg_temp;
alter function public.photos_stamp() set search_path = public, pg_temp;
alter function public.stamp_field() set search_path = public, pg_temp;
alter function public.valid_hero_photos(jsonb) set search_path = public, pg_temp;
commit;

-- ===================================================== 0045_no_passwords.sql
begin;
-- 0045: sign-in accounts never have a password, and their email can't be changed by the member.
-- The site signs people in only with Google, email links and our Microsoft/Yahoo broker. Supabase still offers
-- password sign-up and sign-in on its API, which we never use: a password set by anyone (an attacker signing up a
-- relative's address before they join, or a stolen session setting one) would be a second way in. Supabase's own
-- admin link also stores a random password for new logins. So:
--  * every stored password is cleared, now and on every insert/update (password sign-in can never succeed);
--  * a member can't change their sign-in email through the API (a stolen session can't lock the owner out);
--    a new address goes through Requests to join → "Approve and replace old login" instead.

create or replace function public.auth_user_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.encrypted_password := '';
  if tg_op = 'UPDATE' and coalesce(new.email_change, '') <> '' and coalesce(new.email_change, '') is distinct from coalesce(old.email_change, '') then
    raise exception 'The sign-in email can''t be changed here. Ask the family admin.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.auth_user_guard() from public, anon, authenticated;

drop trigger if exists auth_user_guard on auth.users;
create trigger auth_user_guard before insert or update on auth.users
  for each row execute function public.auth_user_guard();

update auth.users set encrypted_password = '' where coalesce(encrypted_password, '') <> '';
commit;

-- ===================================================== 0046_admin_two_step.sql
begin;
-- 0046: admins must use 2-step sign-in (an authenticator app, Supabase MFA "TOTP").
--
-- Why: an admin can see and change everything. If an admin's email account is broken into, a sign-in link
-- alone would give the intruder all of that. With 2-step on, they also need the code from the admin's phone.
--
-- Rules:
--  * members.admin_since is stamped whenever someone becomes an admin (existing admins: now).
--  * An admin who has set up 2-step has admin powers only in a session that passed the code (JWT aal = aal2).
--  * An admin who hasn't set it up keeps admin powers for 7 days from admin_since, then loses them.
--  * admin_mfa_run() (server only, every 10 minutes from the Worker) messages each admin without 2-step from the
--    Family Admin account: once when they become admin, then every day; on day 7 their admin role is removed
--    (back to member) and they're told how to get it back. When 2-step is on, they get a thank-you once.
--    If someone later removes their 2-step, the 7 days start again.
--  * The last admin can never be removed (keep_one_admin); they still lose admin powers until they set it up.

alter table public.members add column if not exists admin_since timestamptz;
alter table public.members add column if not exists mfa_stage smallint;   -- last day messaged (0..6); 100 = 2-step is on

update public.members set admin_since = now() where role = 'admin' and admin_since is null;

-- Does this login have a working authenticator app?
create or replace function public.has_mfa(uid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from auth.mfa_factors f where f.user_id = uid and f.factor_type::text = 'totp' and f.status::text = 'verified')
$$;
revoke all on function public.has_mfa(uuid) from public, anon, authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from members m
     where m.user_id = auth.uid() and m.status = 'active' and m.role = 'admin'
       and case when has_mfa(m.user_id) then coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
                else coalesce(m.admin_since, now()) > now() - interval '7 days' end)
$$;

-- admin_since / mfa_stage are kept by the database, not by whoever edits the row
create or replace function public.members_admin_stamp() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is not null then
    new.admin_since := old.admin_since; new.mfa_stage := old.mfa_stage;
  end if;
  if new.role = 'admin' and new.status = 'active'
     and (tg_op = 'INSERT' or old.role <> 'admin' or old.status <> 'active') then
    new.admin_since := now(); new.mfa_stage := null;
  elsif new.role <> 'admin' then
    new.admin_since := null; new.mfa_stage := null;
  end if;
  return new;
end $$;
revoke all on function public.members_admin_stamp() from public, anon, authenticated;
drop trigger if exists members_admin_stamp on public.members;
create trigger members_admin_stamp before insert or update on public.members
  for each row execute function public.members_admin_stamp();

-- The messages, from the Family Admin account. {name} = first name, {days} = days left.
create or replace function public.admin_mfa_text(kind text, days int) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case kind
  when 'intro' then
'Hello {name}, you are now an admin of our family website. Thank you for helping look after it.

One thing to do first, please: turn on **2-step sign-in**. It takes two minutes.

**Why it matters:** as an admin you can see and change everyone''s details. If someone ever got into your email, a sign-in link would be enough for them to get all of that. With 2-step on, they would also need a 6-digit code from your phone.

**How:**
1. Install a free authenticator app on your phone: Google Authenticator or Microsoft Authenticator.
2. On the website, tap **Turn on 2-step sign-in** (at the top of the page, or in My privacy).
3. Scan the picture with the app and type the 6-digit code it shows.

You have ' || days || ' days. If 2-step isn''t on by then, admin access is removed automatically (you stay a member, and it can be given back once 2-step is on).

Thank you! – Family Admin'
  when 'reminder' then
'Reminder, {name}: please turn on **2-step sign-in** for your admin access. ' ||
  case when days <= 1 then '**This is the last day.** Tomorrow admin access is removed automatically.'
       else days || ' days left.' end || '

On the website tap **Turn on 2-step sign-in**, scan the picture with Google Authenticator or Microsoft Authenticator, and type the code. It keeps everyone''s details safe even if your email is ever broken into.

– Family Admin'
  when 'removed' then
'Hello {name}, 2-step sign-in wasn''t turned on within 7 days, so your admin access has been removed for now. You are still a member and nothing else has changed.

To get it back: turn on **2-step sign-in** (in My privacy), then ask another admin to make you an admin again.

– Family Admin'
  when 'thanks' then
'Thank you, {name}. 2-step sign-in is on for your admin access. When you sign in, the website will ask for the 6-digit code from your authenticator app before admin tools work.

If you change phones, set the app up on the new phone first, or ask another admin to reset it.

– Family Admin'
  end
$$;

create or replace function public.admin_mfa_run() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; sender uuid; d int; n_sent int := 0; n_removed int := 0; n_kept int := 0; msg text;
begin
  if auth.uid() is not null then raise exception 'Server only.' using errcode = '42501'; end if;
  sender := site_admin_uid();
  for r in select m.* from members m where m.role = 'admin' and m.status = 'active' order by m.created_at loop
    msg := null;
    if has_mfa(r.user_id) then
      if coalesce(r.mfa_stage, -1) <> 100 then
        update members set mfa_stage = 100 where user_id = r.user_id;
        msg := admin_mfa_text('thanks', 0);
      end if;
    else
      if r.mfa_stage = 100 or r.admin_since is null then   -- 2-step was removed later: the 7 days start again
        update members set admin_since = now(), mfa_stage = null where user_id = r.user_id;
        r.admin_since := now(); r.mfa_stage := null;
      end if;
      d := floor(extract(epoch from now() - r.admin_since) / 86400)::int;
      if d >= 7 then
        begin
          update members set role = 'member' where user_id = r.user_id;
          msg := admin_mfa_text('removed', 0); n_removed := n_removed + 1;
        exception when others then
          n_kept := n_kept + 1;   -- the last admin stays (keep_one_admin); is_admin() is already false for them
        end;
      elsif r.mfa_stage is null then
        update members set mfa_stage = d where user_id = r.user_id;
        msg := admin_mfa_text('intro', 7 - d);
      elsif d > r.mfa_stage then
        update members set mfa_stage = d where user_id = r.user_id;
        msg := admin_mfa_text('reminder', 7 - d);
      end if;
    end if;
    if msg is not null and sender is not null and sender <> r.user_id then
      perform dm_send_as(sender, r.user_id, personalise(msg, r.person_id));
      n_sent := n_sent + 1;
    end if;
  end loop;
  return jsonb_build_object('sent', n_sent, 'removed', n_removed, 'last_admin_kept', n_kept);
end $$;
revoke all on function public.admin_mfa_run() from public, anon, authenticated;
grant execute on function public.admin_mfa_run() to service_role;   -- the Worker calls it with the server key
revoke all on function public.admin_mfa_text(text, int) from public, anon, authenticated;

-- Admin → Members & roles shows 2-step on/off and when admin started (still admins only, still no emails)
drop function if exists public.member_activity();
create function public.member_activity()
returns table(user_id uuid, last_sign_in_at timestamptz, welcome_sent_at timestamptz, app_at timestamptz, two_step boolean, admin_since timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select m.user_id, u.last_sign_in_at, w.sent_at, p.app_at, has_mfa(m.user_id), m.admin_since
    from members m
    join auth.users u on u.id = m.user_id
    left join welcome_emails w on w.user_id = m.user_id
    left join member_prefs p on p.user_id = m.user_id
   where is_admin()
$$;
revoke all on function public.member_activity() from public, anon;
grant execute on function public.member_activity() to authenticated;
commit;

-- ===================================================== 0047_block_probes.sql
begin;
-- 0047: after the probe of 22 Nov 2026 (throwaway email accounts, direct calls to supabase.co).
--
-- 1. Throwaway email addresses can't create a sign-in at all (mailinator, yopmail, guerrillamail, …), nor can
--    made-up ones (test.com, example.*) (a family can add its own domain here).
-- 2. The data API answers members and visitors only when the request came through our API address (the reminders Worker):
--    the Worker adds a header derived from the server key and registers only its hash here (proxy_token_set).
--    private.check_request() is PostgREST's pre-request check (switched on separately, see the end).
--    Server-key calls (the Worker's own jobs, backups) are not affected.

-- 1 · blocked email domains ------------------------------------------------------------------------------
create or replace function public.blocked_email(e text) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select lower(split_part(coalesce(e, ''), '@', 2)) ~ (
    '^(' || array_to_string(array[
      'mailinator\.com', 'yopmail\.(com|fr|net)', 'guerrillamail(block)?\.(com|net|org|biz|de|info)', 'sharklasers\.com',
      'grr\.la', 'pokemail\.net', 'spam4\.me', 'euploading\.com', '10minutemail\.[a-z.]+', 'temp-?mail\.[a-z.]+',
      'tempmail[a-z0-9]*\.[a-z.]+', 'trashmail\.[a-z.]+', 'dispostable\.com', 'getnada\.com', 'nada\.email',
      'maildrop\.cc', 'mohmal\.com', 'emailondeck\.com', 'throwawaymail\.com', 'mintemail\.com', 'fakeinbox\.com',
      'mailnesia\.com', 'mailcatch\.com', 'spamgourmet\.com', 'moakt\.[a-z.]+', 'tmail\.[a-z.]+', 'emailfake\.com',
      'discard\.email', 'inboxkitten\.com', 'mail\.tm', 'mailsac\.com', 'burnermail\.io', 'tempr\.email',
      'test\.com', 'example\.(com|org|net)', 'invalid', '[a-z0-9-]+\.invalid', 'b\.co', '[a-z0-9.-]*\.?example'
    ], '|') || ')$')
$$;
revoke all on function public.blocked_email(text) from public, anon, authenticated;

create or replace function public.auth_user_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.encrypted_password := '';
  if tg_op = 'INSERT' and blocked_email(new.email) then
    raise exception 'Please sign in with your usual email address.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and coalesce(new.email_change, '') <> '' and coalesce(new.email_change, '') is distinct from coalesce(old.email_change, '') then
    raise exception 'The sign-in email can''t be changed here. Ask the family admin.' using errcode = '42501';
  end if;
  return new;
end $$;

-- 2 · only through our API address ---------------------------------------------------------------------
create table if not exists public.proxy_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  registered_at timestamptz not null default now()
);
alter table public.proxy_tokens enable row level security;
revoke all on public.proxy_tokens from anon, authenticated;
-- not audited: machine data only (a hash), refreshed every 10 minutes

create or replace function public.proxy_token_set(h text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null then raise exception 'Server only.' using errcode = '42501'; end if;
  insert into proxy_tokens(token_hash) values (lower(h))
    on conflict (token_hash) do update set registered_at = now();
  delete from proxy_tokens where registered_at < now() - interval '2 days';   -- keeps the previous key's for a while
end $$;
revoke all on function public.proxy_token_set(text) from public, anon, authenticated;
grant execute on function public.proxy_token_set(text) to service_role;

create schema if not exists private;          -- not exposed by the data API
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create or replace function private.proxy_token_ok(h text) returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select exists (select 1 from public.proxy_tokens t where t.token_hash = encode(extensions.digest(coalesce(h, ''), 'sha256'), 'hex'))
$$;

-- runs as the caller (so current_user is anon / authenticated / service_role)
create or replace function private.check_request() returns void
language plpgsql stable set search_path = public, pg_temp as $$
begin
  -- two separate IFs: Postgres doesn't promise to skip the second half of an AND, and server-key calls must
  -- never reach proxy_token_ok (on 22 Nov they did, and every Worker job failed for 20 minutes)
  if current_user not in ('anon', 'authenticated') then return; end if;
  if not private.proxy_token_ok(coalesce(current_setting('request.headers', true), '{}')::json ->> 'x-fam-proxy') then
    raise exception 'Please use the family website.' using errcode = '42501';
  end if;
end $$;
revoke all on function private.proxy_token_ok(text) from public;
revoke all on function private.check_request() from public;
grant execute on function private.proxy_token_ok(text) to anon, authenticated, service_role;
grant execute on function private.check_request() to anon, authenticated, service_role;

-- Switched on separately, once the Worker has registered its token:
--   alter role authenticator set pgrst.db_pre_request = 'private.check_request';
--   notify pgrst, 'reload config';
-- Off again (emergency):
--   alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config';
commit;

-- ===================================================== 0048_news_emails.sql
begin;
-- 0048: Notify everyone can also send an email.
-- An admin's notice (announce(), 0031/0032) may be emailed to the same people: one email each, queued here and sent by the
-- Worker every 10 minutes (news_due()/news_sent(), server key only). Members can turn these emails off in My privacy
-- (member_prefs.email_news). The text is the admin's own notice, never anyone's private data. At most 2 emailed notices a day
-- (Resend allows 100 emails a day on our plan). Sent rows are deleted at once, unsent ones after 3 days.

alter table public.member_prefs add column if not exists email_news boolean not null default true;

create table public.news_emails (
  id              bigserial primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  queued_at       timestamptz not null default now(),
  unique (user_id, announcement_id)
);
alter table public.news_emails enable row level security;
revoke all on public.news_emails from public, anon, authenticated;
revoke all on sequence public.news_emails_id_seq from public, anon, authenticated;
alter table public.announcements add column if not exists emailed boolean not null default false;

drop function if exists public.announce(text, text, text, text[]);
create function public.announce(title text, body text default '', url text default '#/', to_persons text[] default null, email boolean default false)
returns table (members int, phones int, emails int)
language plpgsql security definer set search_path = public, pg_temp as $$
declare a announcements; who text; uid uuid; n int := 0; m int := 0; e int := 0; pick text[];
begin
  if not is_admin() then raise exception 'Only admins can send notices.'; end if;
  if (select count(*) from announcements x where x.created_by = auth.uid() and x.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'You have sent 10 notices today. Try again tomorrow.';
  end if;
  if announce.email and (select count(*) from announcements x where x.emailed and x.created_at > now() - interval '24 hours') >= 2 then
    raise exception 'Two notices have already been emailed today. Send this one without email, or try again tomorrow.';
  end if;
  pick := case when announce.to_persons is null or cardinality(announce.to_persons) = 0 then null
               else (select array_agg(distinct x) from unnest(announce.to_persons) x where exists (select 1 from members mm where mm.person_id = x and mm.status = 'active')) end;
  if announce.to_persons is not null and cardinality(announce.to_persons) > 0 and pick is null then
    raise exception 'None of the people you picked have joined yet.';
  end if;
  insert into announcements(title, body, url, created_by, created_person, to_persons, emailed)
  values (trim(announce.title), trim(coalesce(announce.body, '')), coalesce(nullif(trim(announce.url), ''), '#/'), auth.uid(), my_person_id(), pick, coalesce(announce.email, false))
  returning * into a;
  who := coalesce(push_name(auth.uid()), 'Family');
  for uid in select mm.user_id from members mm where mm.status = 'active' and (pick is null or mm.person_id = any(pick)) loop
    m := m + 1;
    if push_wanted(uid, 'news') then
      insert into push_queue(user_id, kind, title, body, url, tag)
      values (uid, 'news', left(a.title, 120), left(who || ': ' || coalesce(nullif(a.body, ''), 'Tap to have a look.'), 240), a.url, 'news-' || a.id);
      n := n + 1;
    end if;
  end loop;
  if announce.email then
    insert into news_emails(user_id, announcement_id)
    select mm.user_id, a.id
      from members mm
      join auth.users u on u.id = mm.user_id
      left join member_prefs mp on mp.user_id = mm.user_id
     where mm.status = 'active' and mm.person_id is not null and u.email is not null
       and mm.user_id <> auth.uid()
       and (pick is null or mm.person_id = any(pick))
       and coalesce(mp.email_news, true)
    on conflict do nothing;
    get diagnostics e = row_count;
  end if;
  return query select m, n, e;
end $$;
revoke all on function public.announce(text, text, text, text[], boolean) from public, anon;
grant execute on function public.announce(text, text, text, text[], boolean) to authenticated;

-- what the Worker sends: one row per waiting email, only while the notice still exists and the reader still wants it
create function public.news_due()
returns table (id bigint, email text, given_name text, by_name text, title text, body text, url text)
language sql stable security definer set search_path = public, pg_temp as $$
  select q.id, u.email::text, p.given_name,
         (select trim(bp.given_name || ' ' || coalesce(bp.surname, '')) from persons bp where bp.id = a.created_person),
         a.title, a.body, a.url
    from news_emails q
    join announcements a on a.id = q.announcement_id
    join auth.users u on u.id = q.user_id
    join members m on m.user_id = q.user_id and m.status = 'active'
    join persons p on p.id = m.person_id
    left join member_prefs mp on mp.user_id = q.user_id
   where q.queued_at > now() - interval '3 days' and u.email is not null and coalesce(mp.email_news, true)
   order by q.id
   limit 100
$$;

-- sent rows go at once; anything left after 3 days goes too (nothing about the reader is kept)
create function public.news_sent(ids bigint[]) returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from news_emails where id = any(ids) or queued_at < now() - interval '3 days'
$$;
revoke all on function public.news_due(), public.news_sent(bigint[]) from public, anon, authenticated;
grant execute on function public.news_due(), public.news_sent(bigint[]) to service_role;
commit;

-- ===================================================== 0049_weekly_email.sql
begin;
-- 0049: "This week in the family" — a Sunday-morning email to every member.
-- Built only from what every member can already see on the site: who joined (as in the bell, recent_joins()),
-- conversation titles and reply counts (Talk is visible to all members), a count of new photos (never captions or
-- pictures; photos with a declined tag are not counted) and notices sent to everyone. Birthdays, remembrance days and
-- festivals for the coming week are worked out by the Worker from reminder_feed() with the same rule as the phone
-- notifications (only birthdays shared with the whole family). Members can turn it off (member_prefs.email_weekly,
-- My privacy **This week in the family**). weekly_digest() is server-key only: it returns email addresses.
-- weekly_emails holds machine status only (which week went out and how many emails), like ops_runs.

alter table public.member_prefs add column if not exists email_weekly boolean not null default true;

create table public.weekly_emails (
  week       date primary key,
  sent_at    timestamptz not null default now(),
  emails     int not null default 0
);
alter table public.weekly_emails enable row level security;
revoke all on public.weekly_emails from public, anon, authenticated;

-- everything the email needs, or null if this week's email has already gone out
create function public.weekly_digest(wk date)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when exists (select 1 from weekly_emails w where w.week = wk) then null else jsonb_build_object(
    'recipients', coalesce((
      select jsonb_agg(jsonb_build_object('email', u.email, 'given_name', p.given_name) order by p.given_name)
        from members m
        join auth.users u on u.id = m.user_id
        join persons p on p.id = m.person_id
        left join member_prefs mp on mp.user_id = m.user_id
       where m.status = 'active' and u.email is not null and coalesce(mp.email_weekly, true)), '[]'::jsonb),
    'joined', coalesce((
      select jsonb_agg(trim(p.given_name || ' ' || coalesce(p.surname, '')) order by m.first_signin_at)
        from members m join persons p on p.id = m.person_id
       where m.status = 'active' and m.first_signin_at > now() - interval '7 days'), '[]'::jsonb),
    'threads', coalesce((
      select jsonb_agg(x order by x->>'at' desc) from (
        select jsonb_build_object('id', t.id, 'title', t.title, 'new', t.created_at > now() - interval '7 days',
                 'replies', (select count(*) from thread_posts tp where tp.thread_id = t.id and tp.created_at > now() - interval '7 days'),
                 'at', t.last_activity_at) x
          from threads t
         where t.created_at > now() - interval '7 days'
            or exists (select 1 from thread_posts tp where tp.thread_id = t.id and tp.created_at > now() - interval '7 days')
         order by t.last_activity_at desc limit 6) s), '[]'::jsonb),
    'photos', (select count(*) from photos ph where ph.created_at > now() - interval '7 days'
                 and not exists (select 1 from photo_tags pt where pt.photo_id = ph.id and pt.status = 'declined')),
    'notices', coalesce((
      select jsonb_agg(jsonb_build_object('title', a.title, 'url', a.url) order by a.created_at desc)
        from announcements a where a.to_persons is null and a.created_at > now() - interval '7 days'), '[]'::jsonb),
    'members', (select count(*) from members m where m.status = 'active' and m.person_id is not null),
    'living', (select count(*) from persons p where p.is_living)
  ) end
$$;

-- the Worker calls this only after Resend has accepted the emails
create function public.weekly_sent(wk date, n int) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into weekly_emails(week, emails) values (wk, n) on conflict (week) do nothing
$$;
revoke all on function public.weekly_digest(date), public.weekly_sent(date, int) from public, anon, authenticated;
grant execute on function public.weekly_digest(date), public.weekly_sent(date, int) to service_role;
commit;

-- ===================================================== 0050_email_borders.sql
begin;
-- 0050: every email carries the reader's own woven border (as on the website): mayil kann veshti for men, Kanjeevaram
-- saree for women, green saree otherwise; their own colour from Theme if they chose one (member_prefs.border).
-- Server key only: it returns email addresses. Nothing else about the person.
create function public.email_borders()
returns table (email text, border text)
language sql stable security definer set search_path = public, pg_temp as $$
  select u.email::text,
         case when p.gender = 'm' then case when mp.border in ('veshti-red', 'veshti-blue') then mp.border else 'veshti-red' end
              when p.gender = 'f' then case when mp.border in ('saree-green', 'saree-red') then mp.border else 'saree-green' end
              else 'saree-green' end
    from members m
    join auth.users u on u.id = m.user_id
    join persons p on p.id = m.person_id
    left join member_prefs mp on mp.user_id = m.user_id
   where m.status = 'active' and u.email is not null
$$;
revoke all on function public.email_borders() from public, anon, authenticated;
grant execute on function public.email_borders() to service_role;
commit;

-- ===================================================== 0051_first_admin.sql
begin;
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
commit;
