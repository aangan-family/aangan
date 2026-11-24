-- 0018: who's online, and private one-to-one chat between members.
--
-- Presence: the site sends a heartbeat about every 45 seconds while it is open in front of you.
-- "Online" = a heartbeat in the last 2 minutes. Only members see it, and anyone can hide theirs
-- (member_prefs.show_online): then they show as neither online nor "last active".
--
-- Chat: conversations between exactly two active members. Only those two can read or write them;
-- admins can't read them through the site. The audit log records that a message was sent or
-- deleted (who, when, which conversation), never what it said.

alter table public.member_prefs add column show_online boolean not null default true;

create table public.member_presence (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
alter table public.member_presence enable row level security;
revoke all on public.member_presence from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- conversations and messages
-- ---------------------------------------------------------------------------
create table public.dm_conversations (
  id              uuid primary key default gen_random_uuid(),
  user_a          uuid not null references auth.users(id) on delete cascade,
  user_b          uuid not null references auth.users(id) on delete cascade,
  a_read_at       timestamptz not null default now(),
  b_read_at       timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  last_message_at timestamptz,
  check (user_a < user_b),
  unique (user_a, user_b)
);
create table public.dm_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  sender          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body            text not null check (length(btrim(body)) between 1 and 4000),
  created_at      timestamptz not null default now()
);
create index dm_messages_conv_idx on public.dm_messages (conversation_id, created_at);

alter table public.dm_conversations enable row level security;
alter table public.dm_messages enable row level security;
revoke all on public.dm_conversations, public.dm_messages from public, anon, authenticated;
grant select on public.dm_conversations to authenticated;
grant select, insert, delete on public.dm_messages to authenticated;

create function public.in_conversation(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_member() and exists (select 1 from dm_conversations d where d.id = c and auth.uid() in (d.user_a, d.user_b))
$$;

-- you may write while you are in the conversation and the other person is still an active member
create function public.dm_can_send(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select in_conversation(c) and exists (
    select 1 from dm_conversations d
      join members m on m.user_id = case when d.user_a = auth.uid() then d.user_b else d.user_a end
     where d.id = c and m.status = 'active')
$$;

create policy dm_conversations_read on public.dm_conversations for select to authenticated
  using (is_member() and auth.uid() in (user_a, user_b));
create policy dm_messages_read on public.dm_messages for select to authenticated
  using (in_conversation(conversation_id));
-- you can write only as yourself, only in your own conversation, and only while the other person is still an active member
create policy dm_messages_send on public.dm_messages for insert to authenticated
  with check (sender = auth.uid() and dm_can_send(conversation_id));
create policy dm_messages_delete on public.dm_messages for delete to authenticated
  using (sender = auth.uid() and in_conversation(conversation_id));

-- keep the conversation's last activity, and count your own message as read
create function public.dm_after_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update dm_conversations set last_message_at = new.created_at,
    a_read_at = case when user_a = new.sender then new.created_at else a_read_at end,
    b_read_at = case when user_b = new.sender then new.created_at else b_read_at end
  where id = new.conversation_id;
  return new;
end $$;
revoke all on function public.dm_after_message() from public, anon, authenticated;
create trigger dm_after_message after insert on public.dm_messages for each row execute function public.dm_after_message();

-- audit without the words
create function public.dm_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.dm_messages := case when tg_op = 'DELETE' then old else new end;
begin
  insert into audit_log(actor, action, table_name, record_key, before, after)
  values (auth.uid(), lower(tg_op), 'dm_messages', r.id::text, null,
          jsonb_build_object('conversation_id', r.conversation_id, 'sender', r.sender, 'at', r.created_at));
  return r;
end $$;
revoke all on function public.dm_audit() from public, anon, authenticated;
create trigger dm_messages_audit after insert or delete on public.dm_messages for each row execute function public.dm_audit();
create trigger dm_conversations_audit after insert on public.dm_conversations for each row execute function public.audit();

-- ---------------------------------------------------------------------------
-- functions the site calls
-- ---------------------------------------------------------------------------
-- open (or create) the conversation with someone in the tree who has joined
create function public.dm_open(person text) returns uuid
language plpgsql security definer set search_path = public as $$
declare other uuid; a uuid; b uuid; cid uuid;
begin
  if not is_member() then raise exception 'Only family members can send messages.'; end if;
  select user_id into other from members where person_id = person and status = 'active' limit 1;
  if other is null then raise exception 'They haven’t joined the site yet, so they can’t get messages. Invite them first.'; end if;
  if other = auth.uid() then raise exception 'That’s you.'; end if;
  a := least(other, auth.uid()); b := greatest(other, auth.uid());
  select id into cid from dm_conversations where user_a = a and user_b = b;
  if cid is null then
    insert into dm_conversations(user_a, user_b) values (a, b) returning id into cid;
  end if;
  return cid;
end $$;

-- your conversations: who with, the last message, how many unread
create function public.dm_list()
returns table (id uuid, other_person text, last_message_at timestamptz, last_body text, last_from_me boolean, unread int, other_read_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id,
         (select m.person_id from members m where m.user_id = case when d.user_a = auth.uid() then d.user_b else d.user_a end),
         d.last_message_at,
         (select left(x.body, 140) from dm_messages x where x.conversation_id = d.id order by x.created_at desc limit 1),
         (select x.sender = auth.uid() from dm_messages x where x.conversation_id = d.id order by x.created_at desc limit 1),
         (select count(*)::int from dm_messages x where x.conversation_id = d.id and x.sender <> auth.uid()
            and x.created_at > case when d.user_a = auth.uid() then d.a_read_at else d.b_read_at end),
         case when d.user_a = auth.uid() then d.b_read_at else d.a_read_at end
    from dm_conversations d
   where is_member() and auth.uid() in (d.user_a, d.user_b)
   order by coalesce(d.last_message_at, d.created_at) desc
$$;

create function public.dm_mark_read(c uuid) returns void
language sql security definer set search_path = public as $$
  update dm_conversations set
    a_read_at = case when user_a = auth.uid() then now() else a_read_at end,
    b_read_at = case when user_b = auth.uid() then now() else b_read_at end
  where id = c and is_member() and auth.uid() in (user_a, user_b)
$$;

-- heartbeat: mark me as here (if I allow it), and return who's around plus my unread count.
-- people: every active member with a place in the tree; seen = their last heartbeat (null if never, or hidden); h = hidden.
create function public.heartbeat(here boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare people jsonb; unread int;
begin
  if not is_member() then raise exception 'Only family members.'; end if;
  if here then
    insert into member_presence(user_id, last_seen_at) values (auth.uid(), now())
      on conflict (user_id) do update set last_seen_at = now();
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('p', m.person_id,
           'seen', case when coalesce(mp.show_online, true) and coalesce(me.show_online, true) then pr.last_seen_at end,
           'h', not (coalesce(mp.show_online, true) and coalesce(me.show_online, true)))), '[]')
    into people
    from members m
    left join member_presence pr on pr.user_id = m.user_id
    left join member_prefs mp on mp.user_id = m.user_id
    left join member_prefs me on me.user_id = auth.uid()
   where m.status = 'active' and m.person_id is not null and m.user_id <> auth.uid();
  select coalesce(sum(l.unread), 0)::int into unread from dm_list() l;
  return jsonb_build_object('people', people, 'unread', unread, 'now', now());
end $$;

revoke all on function public.in_conversation(uuid), public.dm_can_send(uuid), public.dm_open(text), public.dm_list(), public.dm_mark_read(uuid), public.heartbeat(boolean) from public, anon;
grant execute on function public.in_conversation(uuid), public.dm_can_send(uuid), public.dm_open(text), public.dm_list(), public.dm_mark_read(uuid), public.heartbeat(boolean) to authenticated;
