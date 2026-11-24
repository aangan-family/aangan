-- 0031: Notify everyone (admin announcements).
--
-- An admin writes a short notice ("New conversation: …") with a link inside the site. It appears at the top of
-- every member's bell, and goes as a phone notification to everyone who has notifications on and hasn't switched
-- off "Family news". The text is what the admin wrote for everyone to see; it never carries anyone's private data.
--
--   announcements        readable by members; written only through announce() (active admins, 6 a day)
--   member_prefs         push_news (on by default for people who turned notifications on)
--   push_queue           new kind 'news' (held back in quiet hours like everything except messages)

alter table public.member_prefs add column if not exists push_news boolean not null default true;

create table public.announcements (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (length(trim(title)) between 1 and 80),
  body           text not null default '' check (length(body) <= 200),
  url            text not null default '#/' check (url ~ '^#/[A-Za-z0-9/_\-]*$' and length(url) <= 120),
  created_by     uuid references auth.users(id) on delete set null default auth.uid(),
  created_person text references public.persons(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index announcements_recent on public.announcements (created_at desc);
alter table public.announcements enable row level security;
revoke all on public.announcements from public, anon;
grant select on public.announcements to authenticated;
create policy announcements_read on public.announcements for select to authenticated using (is_member());
-- admins may remove one (a mistake); nobody edits
grant delete on public.announcements to authenticated;
create policy announcements_delete on public.announcements for delete to authenticated using (is_admin());
create trigger audit_announcements after insert or update or delete on public.announcements
  for each row execute function public.audit();

alter table public.push_queue drop constraint if exists push_queue_kind_check;
alter table public.push_queue add constraint push_queue_kind_check
  check (kind in ('message', 'mention', 'join', 'invite', 'occasion', 'festival', 'test', 'news'));

create or replace function public.push_wanted(uid uuid, k text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from push_subscriptions where user_id = uid)
     and exists (select 1 from members where user_id = uid and status = 'active')
     and coalesce((select case k when 'message' then p.push_messages when 'mention' then p.push_mentions
                                  when 'join' then p.push_admin when 'invite' then p.push_admin
                                  when 'occasion' then p.push_occasions when 'festival' then p.push_festivals
                                  when 'news' then p.push_news
                                  else true end
                     from member_prefs p where p.user_id = uid),
                  case k when 'festival' then false else true end)
$$;
revoke all on function public.push_wanted(uuid, text) from public, anon, authenticated;

-- Send a notice to everyone. Returns how many members will see it in the bell and how many get a phone notification.
create function public.announce(title text, body text default '', url text default '#/')
returns table (members int, phones int)
language plpgsql security definer set search_path = public as $$
declare a announcements; who text; uid uuid; n int := 0;
begin
  if not is_admin() then raise exception 'Only admins can notify everyone.'; end if;
  if (select count(*) from announcements x where x.created_by = auth.uid() and x.created_at > now() - interval '24 hours') >= 6 then
    raise exception 'You have sent 6 notices today. Try again tomorrow.';
  end if;
  insert into announcements(title, body, url, created_by, created_person)
  values (trim(announce.title), trim(coalesce(announce.body, '')), coalesce(nullif(trim(announce.url), ''), '#/'), auth.uid(), my_person_id())
  returning * into a;
  who := coalesce(push_name(auth.uid()), 'Family');
  for uid in select m.user_id from members m where m.status = 'active' loop
    if push_wanted(uid, 'news') then
      insert into push_queue(user_id, kind, title, body, url, tag)
      values (uid, 'news', left(a.title, 120), left(who || ': ' || coalesce(nullif(a.body, ''), 'Tap to have a look.'), 240), a.url, 'news-' || a.id);
      n := n + 1;
    end if;
  end loop;
  return query select (select count(*)::int from members m where m.status = 'active'), n;
end $$;
revoke all on function public.announce(text, text, text) from public, anon;
grant execute on function public.announce(text, text, text) to authenticated;

-- how many would get a phone notification right now (for the admin screen; numbers only)
create function public.announce_reach() returns table (members int, phones int)
language sql stable security definer set search_path = public as $$
  select (select count(*)::int from members m where m.status = 'active'),
         (select count(*)::int from members m where m.status = 'active' and push_wanted(m.user_id, 'news'))
   where is_admin()
$$;
revoke all on function public.announce_reach() from public, anon;
grant execute on function public.announce_reach() to authenticated;
