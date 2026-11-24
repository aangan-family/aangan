-- 0030: phone notifications (Web Push).
--
-- A member turns notifications on per device. The site stores that device's push address here; the reminders
-- Worker (server key) sends the notifications. Notifications say WHO, never WHAT: "Kavya sent you a message",
-- never the message text.
--
--   push_subscriptions  one row per device; members can't read the table directly (it holds the device keys),
--                       only through push_subscribe / push_unsubscribe / push_my_devices
--   push_queue          server-only; filled by triggers (messages, mentions, join requests, invitations to approve)
--                       and by the Worker's 7 am run (occasions, festivals). Holds names and links only, no
--                       message text, no emails. Not audited (it changes with every message; like ops_runs).
--   member_prefs        push_* switches per kind, and quiet hours (10 pm–7 am India time; messages still come through)

-- ---------------------------------------------------------------------------
-- preferences
-- ---------------------------------------------------------------------------
alter table public.member_prefs
  add column if not exists push_messages  boolean not null default true,
  add column if not exists push_mentions  boolean not null default true,
  add column if not exists push_occasions boolean not null default true,
  add column if not exists push_festivals boolean not null default false,
  add column if not exists push_admin     boolean not null default true,
  add column if not exists push_quiet     boolean not null default true;

-- ---------------------------------------------------------------------------
-- devices
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique check (endpoint ~ '^https://' and length(endpoint) < 1000),
  p256dh      text not null check (length(p256dh) between 40 and 200),
  auth        text not null check (length(auth) between 10 and 100),
  device      text not null default '' check (length(device) <= 80),
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz,
  fail_count  int not null default 0
);
create index push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
-- no policies: only these functions and the server key touch it

-- audit who turned notifications on or off and on what kind of device, never the keys or the address
create function public.push_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.push_subscriptions := case when tg_op = 'DELETE' then old else new end;
begin
  insert into audit_log(actor, action, table_name, record_key, before, after)
  values (auth.uid(), lower(tg_op), 'push_subscriptions', r.id::text, null,
          jsonb_build_object('user_id', r.user_id, 'device', r.device));
  return r;
end $$;
revoke all on function public.push_audit() from public, anon, authenticated;
create trigger push_subscriptions_audit after insert or delete on public.push_subscriptions
  for each row execute function public.push_audit();

-- turn on for this device (re-subscribing, or another person signing in on the same device, replaces the old row)
create function public.push_subscribe(endpoint text, p256dh text, auth text, device text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'Only family members can turn on notifications.'; end if;
  if (select count(*) from push_subscriptions s where s.user_id = auth.uid()) >= 10
     and not exists (select 1 from push_subscriptions s where s.endpoint = push_subscribe.endpoint) then
    raise exception 'Notifications are already on for 10 devices. Turn them off on one you no longer use.';
  end if;
  delete from push_subscriptions s where s.endpoint = push_subscribe.endpoint;
  insert into push_subscriptions(user_id, endpoint, p256dh, auth, device)
  values (auth.uid(), push_subscribe.endpoint, push_subscribe.p256dh, push_subscribe.auth, left(coalesce(push_subscribe.device, ''), 80));
end $$;

-- turn off for this device (or, with no address, for every device of mine: Sign out everywhere)
create function public.push_unsubscribe(endpoint text default null) returns void
language sql security definer set search_path = public as $$
  delete from push_subscriptions s
   where s.user_id = auth.uid() and (push_unsubscribe.endpoint is null or s.endpoint = push_unsubscribe.endpoint)
$$;

-- my devices, without their keys or addresses
create function public.push_my_devices()
returns table (id uuid, device text, created_at timestamptz, last_ok_at timestamptz, mine_here boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.device, s.created_at, s.last_ok_at, false from push_subscriptions s where s.user_id = auth.uid() order by s.created_at
$$;

revoke all on function public.push_subscribe(text, text, text, text), public.push_unsubscribe(text), public.push_my_devices() from public, anon;
grant execute on function public.push_subscribe(text, text, text, text), public.push_unsubscribe(text), public.push_my_devices() to authenticated;

-- ---------------------------------------------------------------------------
-- queue
-- ---------------------------------------------------------------------------
create table public.push_queue (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('message', 'mention', 'join', 'invite', 'occasion', 'festival', 'test')),
  title      text not null check (length(title) <= 120),
  body       text not null check (length(body) <= 240),
  url        text not null default '#/' check (url ~ '^#/' and length(url) <= 200),
  tag        text not null default '' check (length(tag) <= 80),
  queued_at  timestamptz not null default now(),
  sent_at    timestamptz
);
create index push_queue_due on public.push_queue (queued_at) where sent_at is null;
alter table public.push_queue enable row level security;
revoke all on public.push_queue from anon, authenticated;

-- is this kind switched on for this person, and do they have a device? (no prefs row = the defaults)
create function public.push_wanted(uid uuid, k text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from push_subscriptions where user_id = uid)
     and exists (select 1 from members where user_id = uid and status = 'active')
     and coalesce((select case k when 'message' then p.push_messages when 'mention' then p.push_mentions
                                  when 'join' then p.push_admin when 'invite' then p.push_admin
                                  when 'occasion' then p.push_occasions when 'festival' then p.push_festivals
                                  else true end
                     from member_prefs p where p.user_id = uid),
                  case k when 'festival' then false else true end)
$$;

create function public.push_enqueue(uid uuid, k text, t text, b text, u text, g text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if uid is null or not push_wanted(uid, k) then return; end if;
  insert into push_queue(user_id, kind, title, body, url, tag) values (uid, k, left(t, 120), left(b, 240), u, left(coalesce(g, ''), 80));
end $$;

-- first name of the person a login belongs to
create function public.push_name(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(p.given_name), ''), 'Someone') from members m join persons p on p.id = m.person_id where m.user_id = uid
$$;

revoke all on function public.push_wanted(uuid, text), public.push_enqueue(uuid, text, text, text, text, text), public.push_name(uuid) from public, anon, authenticated;

-- a private message: tell the other person who wrote, never what
create function public.push_on_dm() returns trigger
language plpgsql security definer set search_path = public as $$
declare c dm_conversations; other uuid; who text; whose text;
begin
  begin
    select * into c from dm_conversations where id = new.conversation_id;
    other := case when new.sender = c.user_a then c.user_b else c.user_a end;
    who := coalesce(push_name(new.sender), 'Someone');
    select person_id into whose from members where user_id = new.sender;
    perform push_enqueue(other, 'message', 'New message', who || ' sent you a message', '#/chat' || coalesce('/' || whose, ''), 'dm-' || new.conversation_id);
  exception when others then raise warning 'push (message): %', sqlerrm;   -- a notification must never stop a message being sent
  end;
  return null;
end $$;
create trigger dm_messages_push after insert on public.dm_messages for each row execute function public.push_on_dm();

-- an @-mention in Talk (the mention queue already holds only newly mentioned, joined members, never the author)
create function public.push_on_mention() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  begin
    select coalesce(nullif(trim(given_name), ''), 'Someone') into who from persons where id = new.by_person;
    perform push_enqueue(new.user_id, 'mention', 'Talk', coalesce(who, 'Someone') || ' mentioned you in Talk', '#/talk/' || new.thread_id, 'mention-' || new.thread_id);
  exception when others then raise warning 'push: %', sqlerrm;
  end;
  return null;
end $$;
create trigger mention_emails_push after insert on public.mention_emails for each row execute function public.push_on_mention();

-- a new request to join: every active steward and admin
create function public.push_on_join_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare s uuid;
begin
  begin
    for s in select user_id from members where status = 'active' and role in ('steward', 'admin') loop
      perform push_enqueue(s, 'join', 'Request to join', new.full_name || ' asked to join the family website', '#/admin/requests', 'join');
    end loop;
  exception when others then raise warning 'push: %', sqlerrm;
  end;
  return null;
end $$;
create trigger join_requests_push after insert on public.join_requests for each row execute function public.push_on_join_request();

-- a member's invitation waiting for approval: every active steward and admin
create function public.push_on_invitation() returns trigger
language plpgsql security definer set search_path = public as $$
declare s uuid; who text;
begin
  if new.approved_at is not null then return null; end if;
  begin
    who := coalesce(push_name(new.invited_by), 'A member');
    for s in select user_id from members where status = 'active' and role in ('steward', 'admin') loop
      perform push_enqueue(s, 'invite', 'Invitation to approve', who || ' invited a relative. Please check and approve.', '#/admin/requests', 'invite');
    end loop;
  exception when others then raise warning 'push: %', sqlerrm;
  end;
  return null;
end $$;
create trigger invitations_push after insert on public.invitations for each row execute function public.push_on_invitation();

revoke all on function public.push_on_dm(), public.push_on_mention(), public.push_on_join_request(), public.push_on_invitation() from public, anon, authenticated;

-- "Send me a test" (at most one a minute)
create function public.push_test() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'Only family members can do this.'; end if;
  if not exists (select 1 from push_subscriptions where user_id = auth.uid()) then raise exception 'Turn on notifications on this device first.'; end if;
  if exists (select 1 from push_queue where user_id = auth.uid() and kind = 'test' and queued_at > now() - interval '1 minute') then
    raise exception 'A test is already on its way. Give it a minute.';
  end if;
  insert into push_queue(user_id, kind, title, body, url, tag)
  values (auth.uid(), 'test', 'Notifications are on', 'This is how family news will reach you.', '#/privacy', 'test');
end $$;
revoke all on function public.push_test() from public, anon;
grant execute on function public.push_test() to authenticated;

-- ---------------------------------------------------------------------------
-- for the Worker (server key only)
-- ---------------------------------------------------------------------------
-- What to send now, one row per device. Quiet hours (10 pm–7 am India time) hold back everything except messages
-- and tests for people who keep them on. Old items (over 12 h) are dropped, and sent items older than 3 days removed.
create function public.push_due(lim int default 200)
returns table (qid bigint, sub_id uuid, endpoint text, p256dh text, auth text, title text, body text, url text, tag text, kind text)
language plpgsql security definer set search_path = public as $$
declare h int := extract(hour from (now() at time zone 'Asia/Kolkata'));
begin
  delete from push_queue q where q.sent_at < now() - interval '3 days';
  update push_queue q set sent_at = now() where q.sent_at is null and q.queued_at < now() - interval '12 hours';
  return query
    select q.id, s.id, s.endpoint, s.p256dh, s.auth, q.title, q.body, q.url, q.tag, q.kind
      from push_queue q
      join push_subscriptions s on s.user_id = q.user_id
      left join member_prefs p on p.user_id = q.user_id
     where q.sent_at is null
       and (q.kind in ('message', 'test') or not coalesce(p.push_quiet, true) or h between 7 and 21)
     order by q.queued_at
     limit lim;
end $$;

create function public.push_done(ids bigint[]) returns void
language sql security definer set search_path = public as $$
  update push_queue set sent_at = now() where id = any(ids) and sent_at is null
$$;

-- delivery result per device: gone (the browser dropped it) → remove; repeated failures → remove after 5
create function public.push_result(sid uuid, ok boolean, gone boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  if gone then delete from push_subscriptions where id = sid; return; end if;
  if ok then update push_subscriptions set last_ok_at = now(), fail_count = 0 where id = sid;
  else
    update push_subscriptions set fail_count = fail_count + 1 where id = sid;
    delete from push_subscriptions where id = sid and fail_count >= 5;
  end if;
end $$;

-- the 7 am run: one notification to everyone who wants this kind
create function public.push_daily(k text, t text, b text, u text default '#/', g text default '') returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; uid uuid;
begin
  if k not in ('occasion', 'festival') then raise exception 'unknown kind'; end if;
  for uid in select distinct s.user_id from push_subscriptions s loop
    if push_wanted(uid, k) then
      insert into push_queue(user_id, kind, title, body, url, tag) values (uid, k, left(t, 120), left(b, 240), u, left(g, 80));
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

revoke all on function public.push_due(int), public.push_done(bigint[]), public.push_result(uuid, boolean, boolean), public.push_daily(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.push_due(int), public.push_done(bigint[]), public.push_result(uuid, boolean, boolean), public.push_daily(text, text, text, text, text) to service_role;
