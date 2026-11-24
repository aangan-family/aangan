-- 0046: admins must use 2-step sign-in (an authenticator app, Supabase MFA "TOTP").
--
-- Why: an admin can see and change everything. If an admin's email account is broken into, a sign-in link
-- alone would give the intruder all of that. With 2-step on, they also need the code from the admin's phone.
--
-- Rules:
--  * members.admin_since is stamped whenever someone becomes an admin (existing admins: now).
--  * An admin who has set up 2-step has admin powers only in a session that passed the code (JWT aal = aal2).
--  * An admin who hasn't set it up keeps admin powers for 7 days from admin_since, then loses them.
--  * admin_mfa_run() (server only, every 10 minutes from the Worker) messages each admin without 2-step from the
--    Family Admin account: once when they become admin, then every day; on day 7 their admin role is removed
--    (back to member) and they're told how to get it back. When 2-step is on, they get a thank-you once.
--    If someone later removes their 2-step, the 7 days start again.
--  * The last admin can never be removed (keep_one_admin); they still lose admin powers until they set it up.

alter table public.members add column if not exists admin_since timestamptz;
alter table public.members add column if not exists mfa_stage smallint;   -- last day messaged (0..6); 100 = 2-step is on

update public.members set admin_since = now() where role = 'admin' and admin_since is null;

-- Does this login have a working authenticator app?
create or replace function public.has_mfa(uid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from auth.mfa_factors f where f.user_id = uid and f.factor_type::text = 'totp' and f.status::text = 'verified')
$$;
revoke all on function public.has_mfa(uuid) from public, anon, authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from members m
     where m.user_id = auth.uid() and m.status = 'active' and m.role = 'admin'
       and case when has_mfa(m.user_id) then coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
                else coalesce(m.admin_since, now()) > now() - interval '7 days' end)
$$;

-- admin_since / mfa_stage are kept by the database, not by whoever edits the row
create or replace function public.members_admin_stamp() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is not null then
    new.admin_since := old.admin_since; new.mfa_stage := old.mfa_stage;
  end if;
  if new.role = 'admin' and new.status = 'active'
     and (tg_op = 'INSERT' or old.role <> 'admin' or old.status <> 'active') then
    new.admin_since := now(); new.mfa_stage := null;
  elsif new.role <> 'admin' then
    new.admin_since := null; new.mfa_stage := null;
  end if;
  return new;
end $$;
revoke all on function public.members_admin_stamp() from public, anon, authenticated;
drop trigger if exists members_admin_stamp on public.members;
create trigger members_admin_stamp before insert or update on public.members
  for each row execute function public.members_admin_stamp();

-- The messages, from the Family Admin account. {name} = first name, {days} = days left.
create or replace function public.admin_mfa_text(kind text, days int) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case kind
  when 'intro' then
'Hello {name}, you are now an admin of our family website. Thank you for helping look after it.

One thing to do first, please: turn on **2-step sign-in**. It takes two minutes.

**Why it matters:** as an admin you can see and change everyone''s details. If someone ever got into your email, a sign-in link would be enough for them to get all of that. With 2-step on, they would also need a 6-digit code from your phone.

**How:**
1. Install a free authenticator app on your phone: Google Authenticator or Microsoft Authenticator.
2. On the website, tap **Turn on 2-step sign-in** (at the top of the page, or in My privacy).
3. Scan the picture with the app and type the 6-digit code it shows.

You have ' || days || ' days. If 2-step isn''t on by then, admin access is removed automatically (you stay a member, and it can be given back once 2-step is on).

Thank you! – Family Admin'
  when 'reminder' then
'Reminder, {name}: please turn on **2-step sign-in** for your admin access. ' ||
  case when days <= 1 then '**This is the last day.** Tomorrow admin access is removed automatically.'
       else days || ' days left.' end || '

On the website tap **Turn on 2-step sign-in**, scan the picture with Google Authenticator or Microsoft Authenticator, and type the code. It keeps everyone''s details safe even if your email is ever broken into.

– Family Admin'
  when 'removed' then
'Hello {name}, 2-step sign-in wasn''t turned on within 7 days, so your admin access has been removed for now. You are still a member and nothing else has changed.

To get it back: turn on **2-step sign-in** (in My privacy), then ask another admin to make you an admin again.

– Family Admin'
  when 'thanks' then
'Thank you, {name}. 2-step sign-in is on for your admin access. When you sign in, the website will ask for the 6-digit code from your authenticator app before admin tools work.

If you change phones, set the app up on the new phone first, or ask another admin to reset it.

– Family Admin'
  end
$$;

create or replace function public.admin_mfa_run() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; sender uuid; d int; n_sent int := 0; n_removed int := 0; n_kept int := 0; msg text;
begin
  if auth.uid() is not null then raise exception 'Server only.' using errcode = '42501'; end if;
  sender := site_admin_uid();
  for r in select m.* from members m where m.role = 'admin' and m.status = 'active' order by m.created_at loop
    msg := null;
    if has_mfa(r.user_id) then
      if coalesce(r.mfa_stage, -1) <> 100 then
        update members set mfa_stage = 100 where user_id = r.user_id;
        msg := admin_mfa_text('thanks', 0);
      end if;
    else
      if r.mfa_stage = 100 or r.admin_since is null then   -- 2-step was removed later: the 7 days start again
        update members set admin_since = now(), mfa_stage = null where user_id = r.user_id;
        r.admin_since := now(); r.mfa_stage := null;
      end if;
      d := floor(extract(epoch from now() - r.admin_since) / 86400)::int;
      if d >= 7 then
        begin
          update members set role = 'member' where user_id = r.user_id;
          msg := admin_mfa_text('removed', 0); n_removed := n_removed + 1;
        exception when others then
          n_kept := n_kept + 1;   -- the last admin stays (keep_one_admin); is_admin() is already false for them
        end;
      elsif r.mfa_stage is null then
        update members set mfa_stage = d where user_id = r.user_id;
        msg := admin_mfa_text('intro', 7 - d);
      elsif d > r.mfa_stage then
        update members set mfa_stage = d where user_id = r.user_id;
        msg := admin_mfa_text('reminder', 7 - d);
      end if;
    end if;
    if msg is not null and sender is not null and sender <> r.user_id then
      perform dm_send_as(sender, r.user_id, personalise(msg, r.person_id));
      n_sent := n_sent + 1;
    end if;
  end loop;
  return jsonb_build_object('sent', n_sent, 'removed', n_removed, 'last_admin_kept', n_kept);
end $$;
revoke all on function public.admin_mfa_run() from public, anon, authenticated;
grant execute on function public.admin_mfa_run() to service_role;   -- the Worker calls it with the server key
revoke all on function public.admin_mfa_text(text, int) from public, anon, authenticated;

-- Admin → Members & roles shows 2-step on/off and when admin started (still admins only, still no emails)
drop function if exists public.member_activity();
create function public.member_activity()
returns table(user_id uuid, last_sign_in_at timestamptz, welcome_sent_at timestamptz, app_at timestamptz, two_step boolean, admin_since timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select m.user_id, u.last_sign_in_at, w.sent_at, p.app_at, has_mfa(m.user_id), m.admin_since
    from members m
    join auth.users u on u.id = m.user_id
    left join welcome_emails w on w.user_id = m.user_id
    left join member_prefs p on p.user_id = m.user_id
   where is_admin()
$$;
revoke all on function public.member_activity() from public, anon;
grant execute on function public.member_activity() to authenticated;
