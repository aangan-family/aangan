-- 0017: @-mentions in Talk, and an email when someone mentions you.
-- A mention is written in the text as @[Name](person:ID). The database works out who is mentioned
-- from the text itself (generated columns), so nobody can claim a mention that isn't in the post.
-- The bell is still built from posts the viewer can already read (invariant 14).
-- Emails go through a server-key-only queue (like the welcome queue): it holds email addresses.

create function public.mention_ids(body text) returns text[]
language sql immutable as $$
  select coalesce(array_agg(distinct m[1]), '{}')
    from (select regexp_matches(coalesce(body, ''), '@\[[^\]\n]{1,80}\]\(person:([A-Za-z0-9]{1,20})\)', 'g') as m limit 30) x
$$;

alter table public.threads add column mentions text[] generated always as (public.mention_ids(body)) stored;
alter table public.thread_posts add column mentions text[] generated always as (public.mention_ids(body)) stored;
create index threads_mentions_idx on public.threads using gin (mentions);
create index thread_posts_mentions_idx on public.thread_posts using gin (mentions);

-- per-member choice; on by default
alter table public.member_prefs add column email_mentions boolean not null default true;

-- ---------------------------------------------------------------------------
-- the email queue (server key only)
-- ---------------------------------------------------------------------------
create table public.mention_emails (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  person_id  text not null,
  by_person  text,
  thread_id  uuid not null references public.threads(id) on delete cascade,
  post_id    uuid references public.thread_posts(id) on delete cascade,
  queued_at  timestamptz not null default now(),
  sent_at    timestamptz,
  unique (user_id, thread_id, post_id)
);
alter table public.mention_emails enable row level security;
revoke all on public.mention_emails from public, anon, authenticated;
revoke all on sequence public.mention_emails_id_seq from public, anon, authenticated;

-- queue one email per newly mentioned person who has joined, isn't the author and hasn't turned them off
create function public.queue_mention_emails() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  added text[];
  r jsonb := to_jsonb(new);
  tid uuid := case when tg_table_name = 'threads' then new.id else (r->>'thread_id')::uuid end;
  pid uuid := case when tg_table_name = 'threads' then null else new.id end;
begin
  added := array(select unnest(new.mentions) except
                 select unnest(case when tg_op = 'UPDATE' then old.mentions else '{}'::text[] end));
  if coalesce(array_length(added, 1), 0) = 0 then return new; end if;
  insert into mention_emails (user_id, person_id, by_person, thread_id, post_id)
  select m.user_id, m.person_id, new.author_person, tid, pid
    from members m
    left join member_prefs mp on mp.user_id = m.user_id
   where m.person_id = any(added) and m.status = 'active'
     and m.user_id <> new.author
     and coalesce(mp.email_mentions, true)
  on conflict do nothing;
  return new;
end $$;
revoke all on function public.queue_mention_emails() from public, anon, authenticated;
create trigger threads_mention_emails after insert or update of body on public.threads
  for each row execute function public.queue_mention_emails();
create trigger thread_posts_mention_emails after insert or update of body on public.thread_posts
  for each row execute function public.queue_mention_emails();

-- what the Worker sends: one row per pending mention, newest first, only while the reader may still see it
create function public.mentions_due()
returns table (id bigint, user_id uuid, email text, given_name text, by_name text, thread_id uuid, post_id uuid, title text, body text, at timestamptz)
language sql stable security definer set search_path = public as $$
  select q.id, q.user_id, u.email::text, p.given_name,
         (select trim(bp.given_name || ' ' || coalesce(bp.surname, '')) from persons bp where bp.id = q.by_person),
         q.thread_id, q.post_id, t.title,
         coalesce(tp.body, t.body), q.queued_at
    from mention_emails q
    join auth.users u on u.id = q.user_id
    join members m on m.user_id = q.user_id and m.status = 'active'
    join persons p on p.id = m.person_id
    join threads t on t.id = q.thread_id
    left join thread_posts tp on tp.id = q.post_id
    left join member_prefs mp on mp.user_id = q.user_id
   where q.sent_at is null and q.queued_at > now() - interval '3 days' and u.email is not null
     and coalesce(mp.email_mentions, true)
     and (q.post_id is null or tp.id is not null)
   order by q.user_id, q.queued_at
   limit 100
$$;

create function public.mentions_sent(ids bigint[]) returns void
language sql security definer set search_path = public as $$
  update mention_emails set sent_at = now() where id = any(ids) and sent_at is null
$$;
revoke all on function public.mentions_due(), public.mentions_sent(bigint[]) from public, anon, authenticated;
grant execute on function public.mentions_due(), public.mentions_sent(bigint[]) to service_role;
