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
