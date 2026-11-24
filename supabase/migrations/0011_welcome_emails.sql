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
