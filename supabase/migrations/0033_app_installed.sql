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
