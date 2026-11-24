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
