-- 0020: when someone comes back with a different email (e.g. invited at Yahoo, now signs in with Gmail),
-- an admin can approve their request and move their place in the tree to the new login.
-- The old login is deleted (its member row, preferences, chats and queues go with it by cascade);
-- the person's details, consent and history stay, because they belong to the person, not the login.
-- The new login keeps the old role (member/steward/admin). Stewards still can't do this: only admins.

create function public.approve_join_replacing(req uuid, person text) returns void
language plpgsql security definer set search_path = public, auth as $$
declare r join_requests%rowtype; old members%rowtype;
begin
  if not is_admin() then raise exception 'Only a family admin can move someone to a new login.'; end if;
  select * into r from join_requests where id = req for update;
  if not found or r.status <> 'pending' then raise exception 'This request has already been handled.'; end if;
  select * into old from members where person_id = person;
  if not found then raise exception 'Nobody has joined as this person yet: use Approve instead.'; end if;
  if old.user_id = r.user_id then raise exception 'They have already joined with this login.'; end if;
  if old.user_id = auth.uid() then raise exception 'You can’t replace your own login.'; end if;
  if exists (select 1 from members where user_id = r.user_id) then raise exception 'This new login already belongs to someone in the tree.'; end if;
  -- the last admin can't be removed this way either
  if old.role = 'admin' and old.status = 'active' and (select count(*) from members where role = 'admin' and status = 'active') <= 1 then
    raise exception 'That is the only admin; make someone else an admin first.';
  end if;
  insert into audit_log(actor, action, table_name, record_key, before, after)
  values (auth.uid(), 'update', 'members', person, jsonb_build_object('user_id', old.user_id, 'role', old.role),
          jsonb_build_object('user_id', r.user_id, 'replaced_login', true));
  -- remove the old login entirely (member row and everything tied to it cascade)
  delete from members where user_id = old.user_id;
  delete from auth.users where id = old.user_id;
  -- link the new login through the normal invitation path, then restore the role
  perform approve_join(req, person);
  update members set role = old.role where user_id = r.user_id and old.role <> 'member';
end $$;
revoke all on function public.approve_join_replacing(uuid, text) from public, anon;
grant execute on function public.approve_join_replacing(uuid, text) to authenticated;
