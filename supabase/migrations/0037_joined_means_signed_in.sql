-- 0037: "X joined the family website" only once X has actually signed in.
-- Sending someone a sign-in link creates their login (and member row) before they open it,
-- so members.created_at is not when they joined. We now keep the first sign-in time.

alter table public.members add column if not exists first_signin_at timestamptz;

-- existing members who have signed in: their member row date (no flood of old "joined" items)
update public.members m set first_signin_at = m.created_at
  from auth.users u where u.id = m.user_id and u.last_sign_in_at is not null and m.first_signin_at is null;

-- from now on: the first sign-in after the member row exists
create function public.note_first_signin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.last_sign_in_at is not null and new.last_sign_in_at is distinct from old.last_sign_in_at then
    update members set first_signin_at = new.last_sign_in_at where user_id = new.id and first_signin_at is null;
  end if;
  return new;
exception when others then
  raise warning 'first sign-in: %', sqlerrm;   -- never stop a sign-in
  return new;
end $$;
revoke all on function public.note_first_signin() from public, anon, authenticated;
drop trigger if exists members_first_signin on auth.users;
create trigger members_first_signin after update of last_sign_in_at on auth.users
  for each row execute function public.note_first_signin();

-- a member row made for someone who already signed in (a join request approved later): joined now
create function public.member_first_signin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.first_signin_at is null and exists (select 1 from auth.users u where u.id = new.user_id and u.last_sign_in_at is not null) then
    new.first_signin_at := now();
  end if;
  return new;
end $$;
revoke all on function public.member_first_signin() from public, anon, authenticated;
create trigger members_first_signin_ins before insert on public.members
  for each row execute function public.member_first_signin();

create or replace function public.recent_joins() returns table (person_id text, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select person_id, first_signin_at from members
  where status = 'active' and person_id is not null and is_member()
    and first_signin_at > now() - interval '60 days'
$$;
