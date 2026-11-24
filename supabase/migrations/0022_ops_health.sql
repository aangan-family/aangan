-- 0022: health checks and alert emails (reminders Worker, reminders/src/health.ts).
--
-- Every 10 minutes the Worker tests each part of the site and emails the admin when something breaks.
-- These tables hold only machine status (job names, times, short error text), never family data, and are
-- server-key only. They are not audited: ops_runs changes every 10 minutes and would bury the real audit log.
-- Re-runnable.

create table if not exists public.ops_runs (
  job text primary key,
  last_run_at timestamptz not null default now(),
  last_ok_at timestamptz,
  ok boolean not null default true,
  detail text
);
create table if not exists public.ops_alerts (
  key text primary key,
  summary text not null,
  opened_at timestamptz not null default now(),
  last_sent_at timestamptz,
  closed_at timestamptz
);
alter table public.ops_runs enable row level security;
alter table public.ops_alerts enable row level security;
revoke all on public.ops_runs, public.ops_alerts from anon, authenticated;
-- no policies: only the server key and the functions below touch them

-- A job (the 7 am digest, the 10-minute emails) says how it went.
create or replace function public.ops_record(job text, ok boolean, detail text default null) returns void
language sql security definer set search_path = public as $$
  insert into ops_runs as r (job, last_run_at, last_ok_at, ok, detail)
  values (job, now(), case when ok then now() end, ok, left(detail, 500))
  on conflict (job) do update set last_run_at = now(), ok = excluded.ok, detail = excluded.detail,
    last_ok_at = coalesce(excluded.last_ok_at, r.last_ok_at)
$$;

-- Counts only (no names or emails): emails that should have gone out but haven't, and when jobs last worked.
create or replace function public.ops_queues() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'welcome_stuck', (select count(*) from welcome_emails w join auth.users u on u.id = w.user_id
                        join members m on m.user_id = w.user_id and m.status = 'active'
                       where w.sent_at is null and u.email is not null
                         and w.queued_at < now() - interval '30 minutes' and w.queued_at > now() - interval '14 days'),
    'mentions_stuck', (select count(*) from mention_emails q join auth.users u on u.id = q.user_id
                         join members m on m.user_id = q.user_id and m.status = 'active'
                         left join member_prefs mp on mp.user_id = q.user_id
                         left join thread_posts tp on tp.id = q.post_id
                        where q.sent_at is null and u.email is not null and coalesce(mp.email_mentions, true)
                          and (q.post_id is null or tp.id is not null)
                          and q.queued_at < now() - interval '30 minutes' and q.queued_at > now() - interval '3 days'),
    'joins_stuck', (select count(*) from join_requests r
                     where r.status = 'pending' and r.notified_at is null
                       and r.created_at < now() - interval '30 minutes' and r.created_at > now() - interval '30 days'),
    'members', (select count(*) from members where status = 'active'),
    'runs', coalesce((select jsonb_object_agg(job, jsonb_build_object('last_run_at', last_run_at, 'last_ok_at', last_ok_at, 'ok', ok, 'detail', detail)) from ops_runs), '{}'::jsonb)
  )
$$;

-- Given the problems found now ([{key, summary}]), says which alerts to email:
-- new ones, ones still open after 24 hours (a reminder), and ones that have cleared.
create or replace function public.ops_alerts_sync(problems jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p jsonb; a ops_alerts%rowtype; started jsonb := '[]'; still jsonb := '[]'; cleared jsonb := '[]'; keys text[];
begin
  select coalesce(array_agg(x->>'key'), '{}') into keys from jsonb_array_elements(problems) x;
  for p in select * from jsonb_array_elements(problems) loop
    select * into a from ops_alerts where key = p->>'key';
    if not found or a.closed_at is not null then
      insert into ops_alerts (key, summary, opened_at, last_sent_at, closed_at) values (p->>'key', p->>'summary', now(), now(), null)
      on conflict (key) do update set summary = excluded.summary, opened_at = now(), last_sent_at = now(), closed_at = null;
      started := started || jsonb_build_array(p);
    elsif a.last_sent_at < now() - interval '24 hours' then
      update ops_alerts set last_sent_at = now(), summary = p->>'summary' where key = a.key;
      still := still || jsonb_build_array(p || jsonb_build_object('since', a.opened_at));
    end if;
  end loop;
  for a in select * from ops_alerts where closed_at is null and not (key = any(keys)) loop
    update ops_alerts set closed_at = now() where key = a.key;
    cleared := cleared || jsonb_build_array(jsonb_build_object('key', a.key, 'summary', a.summary, 'since', a.opened_at));
  end loop;
  return jsonb_build_object('started', started, 'still', still, 'cleared', cleared);
end $$;

revoke all on function public.ops_record(text, boolean, text), public.ops_queues(), public.ops_alerts_sync(jsonb) from public, anon, authenticated;
grant execute on function public.ops_record(text, boolean, text), public.ops_queues(), public.ops_alerts_sync(jsonb) to service_role;
