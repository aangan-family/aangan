-- The family must always have at least one active admin.
-- On 12 Nov 2026 the only admin switched their own role to member from the Admin page,
-- leaving nobody able to invite people or change the tree. This stops that happening:
-- demoting, suspending or removing the last active admin is refused.

create or replace function public.keep_one_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'admin' or new.status <> 'active')
     and not exists (select 1 from members m where m.user_id <> old.user_id and m.role = 'admin' and m.status = 'active')
  then
    raise exception 'The family needs at least one admin. Make someone else an admin first.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists keep_one_admin on public.members;
create trigger keep_one_admin before update or delete on public.members
  for each row execute function public.keep_one_admin();
