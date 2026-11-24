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
