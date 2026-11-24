-- Talk: conversation threads, replies and reactions. Everything here is visible to every
-- family member (and nobody else). Who wrote what is stamped by the server.

create table public.threads (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (length(btrim(title)) between 3 and 140),
  body             text not null check (length(body) between 1 and 10000),
  category         text not null default 'general'
                   check (category in ('traditions', 'recipes', 'festivals', 'calendar', 'news', 'general')),
  author           uuid not null default auth.uid(),
  author_person    text references public.persons(id) on delete set null,
  pinned           boolean not null default false,
  locked           boolean not null default false,
  reply_count      int not null default 0,
  created_at       timestamptz not null default now(),
  edited_at        timestamptz,
  last_activity_at timestamptz not null default now()
);
create index on public.threads(last_activity_at desc);

create table public.thread_posts (
  id            uuid primary key default gen_random_uuid(),
  thread_id     uuid not null references public.threads(id) on delete cascade,
  reply_to      uuid references public.thread_posts(id) on delete set null,
  body          text not null check (length(body) between 1 and 5000),
  author        uuid not null default auth.uid(),
  author_person text references public.persons(id) on delete set null,
  created_at    timestamptz not null default now(),
  edited_at     timestamptz
);
create index on public.thread_posts(thread_id, created_at);
create index on public.thread_posts(created_at desc);

create table public.reactions (
  target_id   uuid not null,   -- a thread or a reply
  target_kind text not null check (target_kind in ('thread', 'post')),
  thread_id   uuid not null references public.threads(id) on delete cascade,
  emoji       text not null check (emoji in ('👍', '❤️', '🙏', '😂', '😮', '👏')),
  user_id     uuid not null default auth.uid(),
  person_id   text references public.persons(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (target_id, user_id, emoji)
);
create index on public.reactions(thread_id);

-- who wrote it, when, and what only admins may change
create function public.threads_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.author := auth.uid(); new.author_person := my_person_id(); new.created_at := now();
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
create trigger threads_stamp before insert or update on public.threads for each row execute function public.threads_stamp();

create function public.posts_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from threads where id = new.thread_id and locked) and not is_admin() then
      raise exception 'This conversation is closed for replies.';
    end if;
    if new.reply_to is not null and not exists (select 1 from thread_posts where id = new.reply_to and thread_id = new.thread_id) then
      new.reply_to := null;
    end if;
    new.author := auth.uid(); new.author_person := my_person_id(); new.created_at := now(); new.edited_at := null;
  else
    new.author := old.author; new.author_person := old.author_person; new.created_at := old.created_at;
    new.thread_id := old.thread_id; new.reply_to := old.reply_to;
    if new.body is distinct from old.body then new.edited_at := now(); end if;
  end if;
  return new;
end $$;
create trigger posts_stamp before insert or update on public.thread_posts for each row execute function public.posts_stamp();

-- keep the reply count and "last activity" up to date
create function public.posts_count() returns trigger
language plpgsql security definer set search_path = public as $$
declare t uuid := coalesce(new.thread_id, old.thread_id);
begin
  perform set_config('talk.internal', 'on', true);
  update threads set reply_count = (select count(*) from thread_posts where thread_id = t),
    last_activity_at = case when tg_op = 'INSERT' then now() else last_activity_at end
  where id = t;
  perform set_config('talk.internal', 'off', true);
  if tg_op = 'DELETE' then delete from reactions where target_id = old.id; end if;  -- reactions go with the reply
  return null;
end $$;
create trigger posts_count after insert or delete on public.thread_posts for each row execute function public.posts_count();

create function public.reactions_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid(); new.person_id := my_person_id(); new.created_at := now();
  if new.target_kind = 'thread' then
    if not exists (select 1 from threads where id = new.target_id) then raise exception 'That conversation no longer exists.'; end if;
    new.thread_id := new.target_id;
  else
    select thread_id into new.thread_id from thread_posts where id = new.target_id;
    if new.thread_id is null then raise exception 'That reply no longer exists.'; end if;
  end if;
  return new;
end $$;
create trigger reactions_stamp before insert on public.reactions for each row execute function public.reactions_stamp();

alter table public.threads      enable row level security;
alter table public.thread_posts enable row level security;
alter table public.reactions    enable row level security;
revoke all on public.threads, public.thread_posts, public.reactions from anon;

create policy threads_read   on public.threads for select to authenticated using (is_member());
create policy threads_insert on public.threads for insert to authenticated with check (is_member());
create policy threads_update on public.threads for update to authenticated
  using (is_member() and (author = auth.uid() or is_admin())) with check (is_member());
create policy threads_delete on public.threads for delete to authenticated using (is_member() and (author = auth.uid() or is_admin()));

create policy posts_read   on public.thread_posts for select to authenticated using (is_member());
create policy posts_insert on public.thread_posts for insert to authenticated with check (is_member());
create policy posts_update on public.thread_posts for update to authenticated
  using (is_member() and author = auth.uid()) with check (is_member());
create policy posts_delete on public.thread_posts for delete to authenticated using (is_member() and (author = auth.uid() or is_admin()));

create policy reactions_read   on public.reactions for select to authenticated using (is_member());
create policy reactions_insert on public.reactions for insert to authenticated with check (is_member());
create policy reactions_delete on public.reactions for delete to authenticated using (user_id = auth.uid());

create trigger audit_threads      after insert or update or delete on public.threads      for each row execute function public.audit();
create trigger audit_thread_posts after insert or update or delete on public.thread_posts for each row execute function public.audit();
create trigger audit_reactions    after insert or delete on public.reactions for each row execute function public.audit();

grant select, insert, update, delete on public.threads, public.thread_posts to authenticated;
grant select, insert, delete on public.reactions to authenticated;
