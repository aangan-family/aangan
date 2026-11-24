-- 0047: after the probe of 22 Nov 2026 (throwaway email accounts, direct calls to supabase.co).
--
-- 1. Throwaway email addresses can't create a sign-in at all (mailinator, yopmail, guerrillamail, …), nor can
--    made-up ones (test.com, example.*) (a family can add its own domain here).
-- 2. The data API answers members and visitors only when the request came through our API address (the reminders Worker):
--    the Worker adds a header derived from the server key and registers only its hash here (proxy_token_set).
--    private.check_request() is PostgREST's pre-request check (switched on separately, see the end).
--    Server-key calls (the Worker's own jobs, backups) are not affected.

-- 1 · blocked email domains ------------------------------------------------------------------------------
create or replace function public.blocked_email(e text) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select lower(split_part(coalesce(e, ''), '@', 2)) ~ (
    '^(' || array_to_string(array[
      'mailinator\.com', 'yopmail\.(com|fr|net)', 'guerrillamail(block)?\.(com|net|org|biz|de|info)', 'sharklasers\.com',
      'grr\.la', 'pokemail\.net', 'spam4\.me', 'euploading\.com', '10minutemail\.[a-z.]+', 'temp-?mail\.[a-z.]+',
      'tempmail[a-z0-9]*\.[a-z.]+', 'trashmail\.[a-z.]+', 'dispostable\.com', 'getnada\.com', 'nada\.email',
      'maildrop\.cc', 'mohmal\.com', 'emailondeck\.com', 'throwawaymail\.com', 'mintemail\.com', 'fakeinbox\.com',
      'mailnesia\.com', 'mailcatch\.com', 'spamgourmet\.com', 'moakt\.[a-z.]+', 'tmail\.[a-z.]+', 'emailfake\.com',
      'discard\.email', 'inboxkitten\.com', 'mail\.tm', 'mailsac\.com', 'burnermail\.io', 'tempr\.email',
      'test\.com', 'example\.(com|org|net)', 'invalid', '[a-z0-9-]+\.invalid', 'b\.co', '[a-z0-9.-]*\.?example'
    ], '|') || ')$')
$$;
revoke all on function public.blocked_email(text) from public, anon, authenticated;

create or replace function public.auth_user_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.encrypted_password := '';
  if tg_op = 'INSERT' and blocked_email(new.email) then
    raise exception 'Please sign in with your usual email address.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and coalesce(new.email_change, '') <> '' and coalesce(new.email_change, '') is distinct from coalesce(old.email_change, '') then
    raise exception 'The sign-in email can''t be changed here. Ask the family admin.' using errcode = '42501';
  end if;
  return new;
end $$;

-- 2 · only through our API address ---------------------------------------------------------------------
create table if not exists public.proxy_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  registered_at timestamptz not null default now()
);
alter table public.proxy_tokens enable row level security;
revoke all on public.proxy_tokens from anon, authenticated;
-- not audited: machine data only (a hash), refreshed every 10 minutes

create or replace function public.proxy_token_set(h text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null then raise exception 'Server only.' using errcode = '42501'; end if;
  insert into proxy_tokens(token_hash) values (lower(h))
    on conflict (token_hash) do update set registered_at = now();
  delete from proxy_tokens where registered_at < now() - interval '2 days';   -- keeps the previous key's for a while
end $$;
revoke all on function public.proxy_token_set(text) from public, anon, authenticated;
grant execute on function public.proxy_token_set(text) to service_role;

create schema if not exists private;          -- not exposed by the data API
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create or replace function private.proxy_token_ok(h text) returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select exists (select 1 from public.proxy_tokens t where t.token_hash = encode(extensions.digest(coalesce(h, ''), 'sha256'), 'hex'))
$$;

-- runs as the caller (so current_user is anon / authenticated / service_role)
create or replace function private.check_request() returns void
language plpgsql stable set search_path = public, pg_temp as $$
begin
  -- two separate IFs: Postgres doesn't promise to skip the second half of an AND, and server-key calls must
  -- never reach proxy_token_ok (on 22 Nov they did, and every Worker job failed for 20 minutes)
  if current_user not in ('anon', 'authenticated') then return; end if;
  if not private.proxy_token_ok(coalesce(current_setting('request.headers', true), '{}')::json ->> 'x-fam-proxy') then
    raise exception 'Please use the family website.' using errcode = '42501';
  end if;
end $$;
revoke all on function private.proxy_token_ok(text) from public;
revoke all on function private.check_request() from public;
grant execute on function private.proxy_token_ok(text) to anon, authenticated, service_role;
grant execute on function private.check_request() to anon, authenticated, service_role;

-- Switched on separately, once the Worker has registered its token:
--   alter role authenticator set pgrst.db_pre_request = 'private.check_request';
--   notify pgrst, 'reload config';
-- Off again (emergency):
--   alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config';
