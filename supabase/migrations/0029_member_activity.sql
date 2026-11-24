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
