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
