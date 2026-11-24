-- 0036: the site's own admin login (an active admin with no place in the tree) becomes a contact
-- called "Family Admin" in Messages. Conversations with it use the address 'site' instead of a person id.
-- It is not a person: it never appears in the tree, counts, presence or the bell.

-- the family admin login: the earliest active admin who isn't linked to anyone in the tree
create function public.site_admin_uid() returns uuid
language sql stable security definer set search_path = public as $$
  select m.user_id from members m
   where m.role = 'admin' and m.status = 'active' and m.person_id is null
     and (is_member() or auth.uid() is null)
   order by m.created_at limit 1
$$;
revoke all on function public.site_admin_uid() from public, anon;
grant execute on function public.site_admin_uid() to authenticated;

-- open a conversation with someone who has joined, or with 'site' (the Family Admin)
create or replace function public.dm_open(person text) returns uuid
language plpgsql security definer set search_path = public as $$
declare other uuid; a uuid; b uuid; cid uuid;
begin
  if not is_member() then raise exception 'Only family members can send messages.'; end if;
  if person = 'site' then
    other := site_admin_uid();
    if other is null then raise exception 'There’s no family admin account to message.'; end if;
  else
    select user_id into other from members where person_id = person and status = 'active' limit 1;
    if other is null then raise exception 'They haven’t joined the site yet, so they can’t get messages. Invite them first.'; end if;
  end if;
  if other = auth.uid() then raise exception 'That’s you.'; end if;
  a := least(other, auth.uid()); b := greatest(other, auth.uid());
  select id into cid from dm_conversations where user_a = a and user_b = b;
  if cid is null then
    insert into dm_conversations(user_a, user_b) values (a, b) returning id into cid;
  end if;
  return cid;
end $$;

-- same as before, but the Family Admin shows as 'site'
create or replace function public.dm_list()
returns table (id uuid, other_person text, last_message_at timestamptz, last_body text, last_from_me boolean, unread int, other_read_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id,
         coalesce((select m.person_id from members m where m.user_id = case when d.user_a = auth.uid() then d.user_b else d.user_a end),
                  case when site_admin_uid() = case when d.user_a = auth.uid() then d.user_b else d.user_a end then 'site' end),
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

-- phone notifications name the Family Admin and open its conversation
create or replace function public.push_name(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nullif(trim(p.given_name), '') from members m join persons p on p.id = m.person_id where m.user_id = uid),
    case when uid = site_admin_uid() then 'Family Admin' end)
$$;
revoke all on function public.push_name(uuid) from public, anon, authenticated;

create or replace function public.push_on_dm() returns trigger
language plpgsql security definer set search_path = public as $$
declare c dm_conversations; other uuid; who text; whose text;
begin
  begin
    select * into c from dm_conversations where id = new.conversation_id;
    other := case when new.sender = c.user_a then c.user_b else c.user_a end;
    who := coalesce(push_name(new.sender), 'Someone');
    select person_id into whose from members where user_id = new.sender;
    if whose is null and new.sender = site_admin_uid() then whose := 'site'; end if;
    perform push_enqueue(other, 'message', 'New message', who || ' sent you a message', '#/chat' || coalesce('/' || whose, ''), 'dm-' || new.conversation_id);
  exception when others then raise warning 'push (message): %', sqlerrm;
  end;
  return null;
end $$;
