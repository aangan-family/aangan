-- 0021: writing help (AI rewrite and speak-to-write), gated and counted here.
--
-- The reminders Worker (<api address>/ai/...) runs Cloudflare Workers AI. Before each run it calls
-- ai_allow() with the member's own sign-in token, so only active members can use it and each person has
-- a daily allowance. Nothing that was written or said is stored anywhere: this table only counts uses.
-- Re-runnable.

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default ((now() at time zone 'Asia/Kolkata')::date),
  kind text not null check (kind in ('rewrite', 'voice')),
  n int not null default 0 check (n >= 0),
  primary key (user_id, day, kind)
);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
drop policy if exists ai_usage_own on public.ai_usage;
create policy ai_usage_own on public.ai_usage for select to authenticated using (user_id = auth.uid());
grant select on public.ai_usage to authenticated;

drop trigger if exists audit_ai_usage on public.ai_usage;
create trigger audit_ai_usage after insert or update or delete on public.ai_usage for each row execute function public.audit();

-- Counts one use and says how many are left today; refuses non-members and anyone over the allowance.
create or replace function public.ai_allow(what text) returns int
language plpgsql security definer set search_path = public as $$
declare lim int; used int; today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not is_member() then raise exception 'Only family members who have joined can use writing help.'; end if;
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
revoke all on function public.ai_allow(text) from public, anon;
grant execute on function public.ai_allow(text) to authenticated;
