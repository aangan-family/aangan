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
