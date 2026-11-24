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
