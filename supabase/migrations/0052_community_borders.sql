-- 0052: woven borders from every community's dress (phulkari, bandhani, paithani, laal paar, Sambalpuri ikat,
-- mekhela, kunbi, ajrak, kani, gara, kasavu…), not only the South's veshti and saree. The list is
-- web/src/lib/heritage.ts TEXTILES (a test checks they match). Anyone may pick any border of their traditions;
-- the South's veshti stays for men and the saree for women (decided in the app and the Worker, as before).
alter table public.member_prefs drop constraint if exists member_prefs_border_check;
alter table public.member_prefs add constraint member_prefs_border_check
  check (border in ('', 'veshti-red', 'veshti-blue', 'saree-green', 'saree-red', 'kasavu', 'pochampally', 'ilkal', 'mysore-peta', 'banarasi', 'leheriya', 'phulkari', 'khes', 'bandhani', 'ajrak', 'paithani', 'pheta', 'laal-paar', 'dhuti', 'chikankari', 'zardozi', 'sambalpuri', 'mekhela', 'gamosa', 'kunbi', 'kani', 'gara'));

-- Emails: return each member's gender and saved choice as they are; the Worker picks the border with the same
-- rule as the website (lib/heritage.ts borderFor), defaulting to the family's traditions (site.config.json).
-- Server key only: it returns email addresses. Nothing else about the person.
drop function if exists public.email_borders();
create function public.email_borders()
returns table (email text, gender text, border text)
language sql stable security definer set search_path = public, pg_temp as $$
  select u.email::text, coalesce(p.gender, '')::text, coalesce(mp.border, '')::text
    from members m
    join auth.users u on u.id = m.user_id
    join persons p on p.id = m.person_id
    left join member_prefs mp on mp.user_id = m.user_id
   where m.status = 'active' and u.email is not null
$$;
revoke all on function public.email_borders() from public, anon, authenticated;
grant execute on function public.email_borders() to service_role;
