-- 0019: message everyone (admins), and an automatic welcome message when someone joins.
-- Both arrive as ordinary private messages (0018) from a real admin's account, so replies go
-- straight back to that person. "{name}" in the text becomes each person's first name.

alter table public.family_info
  add column welcome_dm_on   boolean not null default false,
  add column welcome_dm      text check (welcome_dm is null or length(btrim(welcome_dm)) between 1 and 4000),
  add column welcome_dm_from text references public.persons(id) on delete set null;

-- internal: send one message from one account to another (creating the conversation if needed)
create function public.dm_send_as(sender uuid, recipient uuid, body text) returns void
language plpgsql security definer set search_path = public as $$
declare a uuid := least(sender, recipient); b uuid := greatest(sender, recipient); cid uuid;
begin
  if sender = recipient or btrim(coalesce(body, '')) = '' then return; end if;
  select id into cid from dm_conversations where user_a = a and user_b = b;
  if cid is null then insert into dm_conversations(user_a, user_b) values (a, b) returning id into cid; end if;
  insert into dm_messages(conversation_id, sender, body) values (cid, sender, left(body, 4000));
end $$;
revoke all on function public.dm_send_as(uuid, uuid, text) from public, anon, authenticated;

create function public.personalise(body text, person text) returns text
language sql stable security definer set search_path = public as $$
  select replace(body, '{name}', coalesce((select given_name from persons where id = person), 'there'))
$$;
revoke all on function public.personalise(text, text) from public, anon, authenticated;

-- admins: send a private message to every active member who has joined (not yourself). Returns how many.
create function public.dm_broadcast(body text) returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if not is_admin() then raise exception 'Only a family admin can message everyone.'; end if;
  if btrim(coalesce(body, '')) = '' then raise exception 'Write a message first.'; end if;
  if length(body) > 4000 then raise exception 'That message is too long (4,000 characters at most).'; end if;
  for r in select user_id, person_id from members where status = 'active' and person_id is not null and user_id <> auth.uid() loop
    perform dm_send_as(auth.uid(), r.user_id, personalise(body, r.person_id));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.dm_broadcast(text) from public, anon;
grant execute on function public.dm_broadcast(text) to authenticated;

-- the welcome message: when a member becomes active with a place in the tree for the first time
create function public.send_welcome_dm() returns trigger
language plpgsql security definer set search_path = public as $$
declare fi family_info; sender uuid;
begin
  if new.status <> 'active' or new.person_id is null then return new; end if;
  -- once only: when they first get a place in the tree (not when a suspended member is restored)
  if tg_op = 'UPDATE' and old.person_id is not null then return new; end if;
  select * into fi from family_info limit 1;
  if fi is null or not fi.welcome_dm_on or fi.welcome_dm is null or fi.welcome_dm_from is null then return new; end if;
  select user_id into sender from members where person_id = fi.welcome_dm_from and status = 'active' and role in ('admin', 'steward') limit 1;
  if sender is null or sender = new.user_id then return new; end if;
  perform dm_send_as(sender, new.user_id, personalise(fi.welcome_dm, new.person_id));
  return new;
end $$;
revoke all on function public.send_welcome_dm() from public, anon, authenticated;
create trigger members_welcome_dm after insert or update of status, person_id on public.members
  for each row execute function public.send_welcome_dm();
