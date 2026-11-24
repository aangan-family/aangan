-- 0045: sign-in accounts never have a password, and their email can't be changed by the member.
-- The site signs people in only with Google, email links and our Microsoft/Yahoo broker. Supabase still offers
-- password sign-up and sign-in on its API, which we never use: a password set by anyone (an attacker signing up a
-- relative's address before they join, or a stolen session setting one) would be a second way in. Supabase's own
-- admin link also stores a random password for new logins. So:
--  * every stored password is cleared, now and on every insert/update (password sign-in can never succeed);
--  * a member can't change their sign-in email through the API (a stolen session can't lock the owner out);
--    a new address goes through Requests to join → "Approve and replace old login" instead.

create or replace function public.auth_user_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.encrypted_password := '';
  if tg_op = 'UPDATE' and coalesce(new.email_change, '') <> '' and coalesce(new.email_change, '') is distinct from coalesce(old.email_change, '') then
    raise exception 'The sign-in email can''t be changed here. Ask the family admin.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.auth_user_guard() from public, anon, authenticated;

drop trigger if exists auth_user_guard on auth.users;
create trigger auth_user_guard before insert or update on auth.users
  for each row execute function public.auth_user_guard();

update auth.users set encrypted_password = '' where coalesce(encrypted_password, '') <> '';
