-- 0034: children under 18 can have their own account, with a parent checking first (design decision),
-- following India's Digital Personal Data Protection Act for children: verifiable parental consent, no tracking or
-- behavioural monitoring of children, and nothing of theirs shared without the parent's OK.
--
--   joining      approve_join() and invitations no longer refuse under-18s
--   consent      only a parent (or a named manager, or an admin) gives or withdraws a child's consent; never the child
--   their own    a child sees all of their own details, but can't change them directly
--   drafts       anything a child adds (a profile detail, a conversation, a reply, a photo) goes into child_drafts,
--                seen only by the child and whoever can consent for them; once a parent approves it is published
--                under the child's name; declined (or approved) drafts keep no copy of the content
--   blocked      under-18s can't post, upload, tag or edit directly; reactions and private messages work as before
--   no tracking  under-18s are never shown as online or last seen and their presence isn't recorded;
--                writing help (AI) isn't offered to them
--   contact      still no phone, email or address for under-18s (invariant 5)

create or replace function public.am_minor() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and is_member() and is_minor(my_person_id())
$$;
-- who a post or photo is published as: the child, while a parent approves it inside child_decide(); otherwise the caller
create or replace function public.acting_author() returns uuid
language sql stable as $$
  select coalesce(nullif(current_setting('fam.as_author', true), '')::uuid, auth.uid())
$$;
create or replace function public.person_of(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select person_id from members where user_id = uid
$$;
revoke all on function public.am_minor(), public.acting_author(), public.person_of(uuid) from public, anon;
grant execute on function public.am_minor(), public.acting_author() to authenticated;

-- consent: a child never consents for themselves
create or replace function public.can_consent(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or (
    is_member() and (
      (my_person_id() = p and not is_minor(p))
      or (is_minor(p) and exists (select 1 from parent_links where child_id = p and parent_id = my_person_id()))
      or (exists (select 1 from persons where id = p and not is_living)
          and exists (select 1 from parent_links where parent_id = p and child_id = my_person_id()))
      or exists (select 1 from managers where person_id = p and manager_person_id = my_person_id())
    )
  )
$$;

-- everyone sees their own details (a child included, though they can't change them)
create or replace function public.can_see(p text, vis public.visibility) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when can_manage(p) then true
    when not is_member() then false
    when my_person_id() = p then true
    when exists (select 1 from persons where id = p and is_living) and not has_consent(p) then false
    when vis = 'family' then true
    when vis = 'close' then is_close(my_person_id(), p)
    else false
  end
$$;

create or replace function public.approve_join(req uuid, person text) returns void
language plpgsql security definer set search_path = public as $$
declare r join_requests%rowtype;
begin
  if not is_steward() then raise exception 'Only a family steward or admin can approve requests.'; end if;
  select * into r from join_requests where id = req for update;
  if not found or r.status <> 'pending' then raise exception 'This request has already been handled.'; end if;
  if not exists (select 1 from persons where id = person and is_living) then raise exception 'Choose a living relative from the tree.'; end if;
  if exists (select 1 from members where person_id = person) then raise exception 'Someone has already joined as this person.'; end if;
  if exists (select 1 from members where user_id = r.user_id) then raise exception 'They have already joined.'; end if;
  if r.email = '' then raise exception 'This request has no email address.'; end if;
  delete from invitations where accepted_at is null and (person_id = person or email = r.email);
  insert into invitations (email, person_id, role) values (r.email, person, 'member');
  perform accept_invitation(r.user_id, r.email);
  update join_requests set status = 'approved', person_id = person, decided_by = auth.uid(), decided_at = now(), phone = null where id = req;
end $$;

create or replace function public.invitations_new() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.invited_by := auth.uid();
  new.created_at := now();
  new.accepted_at := null;
  new.notified_at := null;
  new.code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  -- stewards and admins vouch for the email themselves; a member's invitation waits for one of them
  if is_steward() then new.approved_at := now(); new.approved_by := auth.uid();
  else new.approved_at := null; new.approved_by := null; end if;
  if is_admin() then return new; end if;
  if not is_member() then raise exception 'Only family members can invite.'; end if;
  if new.role <> 'member' then raise exception 'Only a family admin can invite another admin.'; end if;
  if new.person_id is null then raise exception 'Choose who you are inviting from the family tree.'; end if;
  if not exists (select 1 from persons where id = new.person_id and is_living) then
    raise exception 'You can only invite living relatives.'; end if;
  if exists (select 1 from members where person_id = new.person_id) then raise exception 'They have already joined.'; end if;
  if exists (select 1 from invitations where person_id = new.person_id and accepted_at is null) then
    raise exception 'Someone has already invited them.'; end if;
  if (select count(*) from invitations where invited_by = auth.uid() and accepted_at is null) >= 25 then
    raise exception 'You have 25 invitations waiting. Please wait for some to be accepted first.'; end if;
  return new;
end $$;


-- ---------------------------------------------------------------------------
-- under-18s can't post, upload, tag or edit directly; approved drafts are published as the child
-- ---------------------------------------------------------------------------
create or replace function public.threads_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if am_minor() then raise exception 'A parent checks what you write first. Your post has been kept for them to see.'; end if;
  if tg_op = 'INSERT' then
    new.author := acting_author(); new.author_person := coalesce(person_of(new.author), my_person_id()); new.created_at := now();
    new.last_activity_at := now(); new.edited_at := null; new.reply_count := 0;
    if not is_admin() then new.pinned := false; new.locked := false; end if;
  else
    new.author := old.author; new.author_person := old.author_person; new.created_at := old.created_at;
    if current_setting('talk.internal', true) is distinct from 'on' then
      new.reply_count := old.reply_count; new.last_activity_at := old.last_activity_at;
      if not is_admin() then new.pinned := old.pinned; new.locked := old.locked; end if;
      if new.title is distinct from old.title or new.body is distinct from old.body or new.category is distinct from old.category then
        new.edited_at := now();
      end if;
    end if;
  end if;
  return new;
end $$;

create or replace function public.posts_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if am_minor() then raise exception 'A parent checks what you write first. Your reply has been kept for them to see.'; end if;
  if tg_op = 'INSERT' then
    if exists (select 1 from threads where id = new.thread_id and locked) and not is_admin() then
      raise exception 'This conversation is closed for replies.';
    end if;
    if new.reply_to is not null and not exists (select 1 from thread_posts where id = new.reply_to and thread_id = new.thread_id) then
      new.reply_to := null;
    end if;
    new.author := acting_author(); new.author_person := coalesce(person_of(new.author), my_person_id()); new.created_at := now(); new.edited_at := null;
  else
    new.author := old.author; new.author_person := old.author_person; new.created_at := old.created_at;
    new.thread_id := old.thread_id; new.reply_to := old.reply_to;
    if new.body is distinct from old.body then new.edited_at := now(); end if;
  end if;
  return new;
end $$;

create or replace function public.photos_stamp() returns trigger
language plpgsql as $$
begin
  if am_minor() then raise exception 'A parent checks photos first. Your photo has been kept for them to see.'; end if;
  if tg_op = 'INSERT' then new.uploaded_by := acting_author(); new.created_at := now();
  else new.uploaded_by := old.uploaded_by; new.created_at := old.created_at; new.path := old.path; end if;
  return new;
end $$;

create or replace function public.photo_tags_new() returns trigger
language plpgsql security definer set search_path = public as $$
declare me text := my_person_id();
begin
  if am_minor() then raise exception 'Ask a parent to tag people in photos.'; end if;
  new.tagged_by := auth.uid();
  new.created_at := now();
  if new.person_id = me
     or exists (select 1 from persons where id = new.person_id and not is_living)
     or (is_minor(new.person_id) and exists (select 1 from parent_links where child_id = new.person_id and parent_id = me))
     or (is_admin() and not exists (select 1 from members where person_id = new.person_id and status = 'active'))
  then new.status := 'approved'; new.decided_by := auth.uid(); new.decided_at := now();
  else new.status := 'pending'; new.decided_by := null; new.decided_at := null;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- drafts waiting for a parent
-- ---------------------------------------------------------------------------
create table public.child_drafts (
  id           uuid primary key default gen_random_uuid(),
  child_user   uuid not null references auth.users(id) on delete cascade,
  child_person text not null references public.persons(id) on delete cascade,
  kind         text not null check (kind in ('detail', 'thread', 'reply', 'photo')),
  payload      jsonb not null default '{}' check (length(payload::text) <= 12000),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid,
  decision     text check (decision in ('approved', 'declined', 'withdrawn'))
);
create index child_drafts_person on public.child_drafts (child_person) where decided_at is null;
alter table public.child_drafts enable row level security;
revoke all on public.child_drafts from public, anon;
grant select on public.child_drafts to authenticated;
-- the child and whoever can consent for them (never the child's consent for themselves: can_consent is false for a minor's own row)
create policy child_drafts_read on public.child_drafts for select to authenticated
  using (child_user = auth.uid() or (can_consent(child_person) and my_person_id() is distinct from child_person));
create trigger audit_child_drafts after insert or update or delete on public.child_drafts
  for each row execute function public.audit();

alter table public.push_queue drop constraint if exists push_queue_kind_check;
alter table public.push_queue add constraint push_queue_kind_check
  check (kind in ('message', 'mention', 'join', 'invite', 'occasion', 'festival', 'test', 'news', 'family', 'talk', 'photo', 'tag', 'child'));

-- the parents (and managers) to ask about a child: joined, active members who can consent for them
create or replace function public.child_guardians(p text) returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.user_id from members m
   where m.status = 'active' and m.person_id is not null and m.person_id <> p
     and (exists (select 1 from parent_links l where l.child_id = p and l.parent_id = m.person_id)
          or exists (select 1 from managers g where g.person_id = p and g.manager_person_id = m.person_id))
$$;
revoke all on function public.child_guardians(text) from public, anon, authenticated;

-- a child sends something for a parent to check
create function public.child_submit(kind text, payload jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare me text := my_person_id(); d uuid; who text; g uuid; f text;
begin
  if not am_minor() then raise exception 'Only for family members under 18.'; end if;
  if (select count(*) from child_drafts x where x.child_user = auth.uid() and x.decided_at is null) >= 30 then
    raise exception 'You have 30 things waiting for a parent. Ask them to have a look first.';
  end if;
  if kind = 'detail' then
    f := payload->>'field';
    if f is null or length(f) > 40 then raise exception 'Which detail?'; end if;
    if is_contact_field(f) then raise exception 'Phone numbers, emails and addresses aren’t kept for anyone under 18.'; end if;
    if coalesce(payload->>'visibility', 'family') not in ('family', 'close', 'private') then raise exception 'Choose who can see it.'; end if;
    if length(coalesce(payload->>'value', '')) > 4000 then raise exception 'That’s too long.'; end if;
  elsif kind = 'thread' then
    if length(btrim(coalesce(payload->>'title', ''))) < 3 or length(coalesce(payload->>'body', '')) < 1 then raise exception 'Add a title and a message.'; end if;
  elsif kind = 'reply' then
    if not exists (select 1 from threads t where t.id = (payload->>'thread_id')::uuid and not t.locked) then raise exception 'That conversation is closed or gone.'; end if;
    if length(coalesce(payload->>'body', '')) < 1 then raise exception 'Write your reply first.'; end if;
  elsif kind = 'photo' then
    if coalesce(payload->>'path', '') !~ '^album/[A-Za-z0-9-]+\.jpg$' then raise exception 'Choose a photo first.'; end if;
  else raise exception 'Unknown kind.';
  end if;
  insert into child_drafts(child_user, child_person, kind, payload) values (auth.uid(), me, kind, payload) returning id into d;
  begin
    who := coalesce(push_first(me), 'Your child');
    for g in select child_guardians(me) loop
      perform push_once(g, 'child', 'Waiting for your OK', who || ' added something for the family. Please check it.', '#/child', 'child-' || me, interval '1 hour');
    end loop;
  exception when others then raise warning 'push (child): %', sqlerrm;
  end;
  return d;
end $$;

-- a parent approves (it's published under the child's name) or declines; either way the draft keeps no content
create function public.child_decide(draft uuid, approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare d child_drafts; v public.visibility;
begin
  select * into d from child_drafts where id = draft for update;
  if not found or d.decided_at is not null then raise exception 'This has already been handled.'; end if;
  if not can_consent(d.child_person) or my_person_id() is not distinct from d.child_person then
    raise exception 'Only a parent can approve this.';
  end if;
  if approve then
    perform set_config('fam.as_author', d.child_user::text, true);
    if d.kind = 'detail' then
      if is_contact_field(d.payload->>'field') then raise exception 'Contact details aren’t kept for anyone under 18.'; end if;
      v := coalesce(d.payload->>'visibility', 'family')::public.visibility;
      if coalesce((d.payload->>'remove')::boolean, false) or btrim(coalesce(d.payload->>'value', '')) = '' then
        delete from profile_fields where person_id = d.child_person and field = d.payload->>'field';
      else
        insert into profile_fields(person_id, field, value, visibility) values (d.child_person, d.payload->>'field', btrim(d.payload->>'value'), v)
          on conflict (person_id, field) do update set value = excluded.value, visibility = excluded.visibility;
      end if;
    elsif d.kind = 'thread' then
      insert into threads(title, body, category) values (btrim(d.payload->>'title'), d.payload->>'body', coalesce(nullif(d.payload->>'category', ''), 'general'));
    elsif d.kind = 'reply' then
      insert into thread_posts(thread_id, body, reply_to) values ((d.payload->>'thread_id')::uuid, d.payload->>'body', nullif(d.payload->>'reply_to', '')::uuid);
    elsif d.kind = 'photo' then
      insert into photos(path, caption, taken_year) values (d.payload->>'path', nullif(d.payload->>'caption', ''), nullif(d.payload->>'taken_year', '')::int);
    end if;
    perform set_config('fam.as_author', '', true);
  end if;
  update child_drafts set decided_at = now(), decided_by = auth.uid(), decision = case when approve then 'approved' else 'declined' end,
         payload = jsonb_build_object('summary', case d.kind when 'detail' then coalesce(d.payload->>'field', '') when 'thread' then left(coalesce(d.payload->>'title', ''), 80) else '' end)
   where id = draft;
  if not approve and d.kind = 'photo' then
    begin   -- the declined picture goes too (it was never readable by anyone else: no photos row points at it)
      delete from storage.objects where bucket_id = 'photos' and name = d.payload->>'path';
    exception when others then raise warning 'child photo cleanup: %', sqlerrm;
    end;
  end if;
end $$;

-- the child changes their mind
create function public.child_withdraw(draft uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d child_drafts;
begin
  select * into d from child_drafts where id = draft and child_user = auth.uid() and decided_at is null for update;
  if not found then raise exception 'This has already been handled.'; end if;
  update child_drafts set decided_at = now(), decided_by = auth.uid(), decision = 'withdrawn', payload = '{}' where id = draft;
  if d.kind = 'photo' then
    begin delete from storage.objects where bucket_id = 'photos' and name = d.payload->>'path';
    exception when others then raise warning 'child photo cleanup: %', sqlerrm; end;
  end if;
end $$;

revoke all on function public.child_submit(text, jsonb), public.child_decide(uuid, boolean), public.child_withdraw(uuid) from public, anon;
grant execute on function public.child_submit(text, jsonb), public.child_decide(uuid, boolean), public.child_withdraw(uuid) to authenticated;

-- a parent can see a child's waiting photo (and the child their own) before it is published
create policy album_read_child_draft on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = 'album'
         and exists (select 1 from public.child_drafts d where d.decided_at is null and d.kind = 'photo' and d.payload->>'path' = name
                       and (d.child_user = auth.uid() or (public.can_consent(d.child_person) and public.my_person_id() is distinct from d.child_person))));

-- a child joins: their parents are asked to give consent
create function public.push_on_child_join() returns trigger
language plpgsql security definer set search_path = public as $$
declare g uuid; who text;
begin
  if new.status <> 'active' or new.person_id is null or not is_minor(new.person_id) then return null; end if;
  if tg_op = 'UPDATE' and old.status = 'active' and old.person_id is not distinct from new.person_id then return null; end if;
  begin
    who := coalesce(push_first(new.person_id), 'Your child');
    for g in select child_guardians(new.person_id) loop
      perform push_once(g, 'child', 'Family', who || ' joined the family website. Please give your consent.', '#/p/' || new.person_id, 'childjoin-' || new.person_id, interval '1 day');
    end loop;
  exception when others then raise warning 'push (child join): %', sqlerrm;
  end;
  return null;
end $$;
revoke all on function public.push_on_child_join() from public, anon, authenticated;
create trigger members_child_join after insert or update of status, person_id on public.members
  for each row execute function public.push_on_child_join();

-- ---------------------------------------------------------------------------
-- no tracking of children: no presence recorded or shown; no AI writing help
-- ---------------------------------------------------------------------------
create or replace function public.heartbeat(here boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare people jsonb; unread int; kid boolean := am_minor();
begin
  if not is_member() then raise exception 'Only family members.'; end if;
  if here and not kid then
    insert into member_presence(user_id, last_seen_at) values (auth.uid(), now())
      on conflict (user_id) do update set last_seen_at = now();
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('p', m.person_id,
           'seen', case when not kid and not is_minor(m.person_id) and coalesce(mp.show_online, true) and coalesce(me.show_online, true) then pr.last_seen_at end,
           'h', kid or is_minor(m.person_id) or not (coalesce(mp.show_online, true) and coalesce(me.show_online, true)))), '[]')
    into people
    from members m
    left join member_presence pr on pr.user_id = m.user_id
    left join member_prefs mp on mp.user_id = m.user_id
    left join member_prefs me on me.user_id = auth.uid()
   where m.status = 'active' and m.person_id is not null and m.user_id <> auth.uid();
  select coalesce(sum(l.unread), 0)::int into unread from dm_list() l;
  return jsonb_build_object('people', people, 'unread', unread, 'now', now());
end $$;

create or replace function public.ai_allow(what text) returns int
language plpgsql security definer set search_path = public as $$
declare lim int; used int; today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not is_member() then raise exception 'Only family members who have joined can use writing help.'; end if;
  if am_minor() then raise exception 'Writing help isn’t available for anyone under 18.'; end if;
  lim := case what when 'rewrite' then 60 when 'voice' then 40 else null end;
  if lim is null then raise exception 'Unknown kind of writing help.'; end if;
  insert into ai_usage(user_id, day, kind, n) values (auth.uid(), today, what, 1)
  on conflict (user_id, day, kind) do update set n = ai_usage.n + 1
  where ai_usage.n < lim
  returning n into used;
  if used is null then
    raise exception 'You’ve used writing help a lot today. It will be ready again tomorrow.';
  end if;
  return lim - used;
end $$;
