-- 0032: more phone notifications, and notices to chosen people.
--
-- As before, notifications say WHO, never WHAT ("New details on Kavya's profile", never the details).
--
--   family   close family: someone close to you has new details on their profile (only details the family
--            or close family can see, and only while a living person's consent is active), at most one per
--            person every 6 hours
--   talk     a new conversation (everyone), and new replies in a conversation you started or replied in
--            (at most one per conversation an hour)
--   photo    new photos shared (at most one per person sharing every 2 hours)
--   tag      someone tagged you in a photo (asks you to approve or hide it); follows the Mentions switch
--   notices  announce() can now go to chosen people; only they see it in their bell

alter table public.member_prefs
  add column if not exists push_family boolean not null default true,
  add column if not exists push_talk   boolean not null default true,
  add column if not exists push_photos boolean not null default true;

alter table public.push_queue drop constraint if exists push_queue_kind_check;
alter table public.push_queue add constraint push_queue_kind_check
  check (kind in ('message', 'mention', 'join', 'invite', 'occasion', 'festival', 'test', 'news', 'family', 'talk', 'photo', 'tag'));

create or replace function public.push_wanted(uid uuid, k text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from push_subscriptions where user_id = uid)
     and exists (select 1 from members where user_id = uid and status = 'active')
     and coalesce((select case k when 'message' then p.push_messages when 'mention' then p.push_mentions when 'tag' then p.push_mentions
                                  when 'join' then p.push_admin when 'invite' then p.push_admin
                                  when 'occasion' then p.push_occasions when 'festival' then p.push_festivals
                                  when 'news' then p.push_news when 'family' then p.push_family
                                  when 'talk' then p.push_talk when 'photo' then p.push_photos
                                  else true end
                     from member_prefs p where p.user_id = uid),
                  case k when 'festival' then false else true end)
$$;
revoke all on function public.push_wanted(uuid, text) from public, anon, authenticated;

-- queue unless the same tag already went to this person within the window
create function public.push_once(uid uuid, k text, t text, b text, u text, g text, win interval) returns void
language plpgsql security definer set search_path = public as $$
begin
  if uid is null or not push_wanted(uid, k) then return; end if;
  if exists (select 1 from push_queue q where q.user_id = uid and q.tag = g and q.queued_at > now() - win) then return; end if;
  insert into push_queue(user_id, kind, title, body, url, tag) values (uid, k, left(t, 120), left(b, 240), u, left(g, 80));
end $$;
revoke all on function public.push_once(uuid, text, text, text, text, text, interval) from public, anon, authenticated;

create function public.push_first(p text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(regexp_replace(given_name, '\s*\(.*\)', '')), ''), 'Someone') from persons where id = p
$$;
revoke all on function public.push_first(text) from public, anon, authenticated;

-- close family: new details on someone's profile
create function public.push_on_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; who text; living boolean;
begin
  begin
    if new.visibility::text not in ('family', 'close') then return null; end if;
    if tg_op = 'UPDATE' and new.value is not distinct from old.value and new.visibility = old.visibility then return null; end if;
    select is_living into living from persons where id = new.person_id;
    if coalesce(living, false) and not exists (select 1 from consents where person_id = new.person_id and withdrawn_at is null) then return null; end if;
    who := push_first(new.person_id);
    for r in select m.user_id, m.person_id from members m
              where m.status = 'active' and m.person_id is not null and m.person_id <> new.person_id
                and m.user_id is distinct from auth.uid() and is_close(m.person_id, new.person_id) loop
      perform push_once(r.user_id, 'family', 'Family', 'New details on ' || who || '’s profile', '#/p/' || new.person_id, 'fam-' || new.person_id, interval '6 hours');
    end loop;
  exception when others then raise warning 'push (profile): %', sqlerrm;   -- never stop a profile being saved
  end;
  return null;
end $$;
create trigger profile_fields_push after insert or update on public.profile_fields for each row execute function public.push_on_profile();

-- Talk: a new conversation for everyone
create function public.push_on_thread() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid; who text;
begin
  begin
    who := coalesce(push_first(new.author_person), push_name(new.author), 'Someone');
    for uid in select user_id from members where status = 'active' and user_id <> new.author loop
      perform push_once(uid, 'talk', 'Talk', who || ' started a new conversation', '#/talk/' || new.id, 'talk-' || new.id, interval '1 hour');
    end loop;
  exception when others then raise warning 'push (thread): %', sqlerrm;
  end;
  return null;
end $$;
create trigger threads_push after insert on public.threads for each row execute function public.push_on_thread();

-- Talk: a reply, for the people in that conversation
create function public.push_on_post() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid; who text;
begin
  begin
    who := coalesce(push_first(new.author_person), push_name(new.author), 'Someone');
    for uid in select distinct x from (
                 select t.author as x from threads t where t.id = new.thread_id
                 union select p.author from thread_posts p where p.thread_id = new.thread_id) s
               where x is not null and x <> new.author loop
      perform push_once(uid, 'talk', 'Talk', who || ' replied in a conversation you’re in', '#/talk/' || new.thread_id, 'reply-' || new.thread_id, interval '1 hour');
    end loop;
  exception when others then raise warning 'push (reply): %', sqlerrm;
  end;
  return null;
end $$;
create trigger thread_posts_push after insert on public.thread_posts for each row execute function public.push_on_post();

-- Photos: new photos shared
create function public.push_on_photo() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid; who text;
begin
  begin
    who := coalesce(push_name(new.uploaded_by), 'Someone');
    for uid in select user_id from members where status = 'active' and user_id <> new.uploaded_by loop
      perform push_once(uid, 'photo', 'Photos', who || ' shared new family photos', '#/photos', 'photos-' || new.uploaded_by, interval '2 hours');
    end loop;
  exception when others then raise warning 'push (photo): %', sqlerrm;
  end;
  return null;
end $$;
create trigger photos_push after insert on public.photos for each row execute function public.push_on_photo();

-- Photos: you were tagged (waiting for you to approve or hide it)
create function public.push_on_tag() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid; who text;
begin
  if new.status <> 'pending' then return null; end if;
  begin
    who := coalesce(push_name(new.tagged_by), 'Someone');
    for uid in select user_id from members where status = 'active' and person_id = new.person_id and user_id <> new.tagged_by loop
      perform push_once(uid, 'tag', 'Photos', who || ' tagged you in a photo. Approve it or hide it.', '#/photos/' || new.photo_id, 'tag-' || new.photo_id, interval '1 hour');
    end loop;
  exception when others then raise warning 'push (tag): %', sqlerrm;
  end;
  return null;
end $$;
create trigger photo_tags_push after insert on public.photo_tags for each row execute function public.push_on_tag();

revoke all on function public.push_on_profile(), public.push_on_thread(), public.push_on_post(), public.push_on_photo(), public.push_on_tag() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- notices to chosen people
-- ---------------------------------------------------------------------------
alter table public.announcements add column if not exists to_persons text[];   -- null = everyone
drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements for select to authenticated
  using (is_member() and (to_persons is null or my_person_id() = any(to_persons) or created_by = auth.uid()));

drop function if exists public.announce(text, text, text);
create function public.announce(title text, body text default '', url text default '#/', to_persons text[] default null)
returns table (members int, phones int)
language plpgsql security definer set search_path = public as $$
declare a announcements; who text; uid uuid; n int := 0; m int := 0; pick text[];
begin
  if not is_admin() then raise exception 'Only admins can send notices.'; end if;
  if (select count(*) from announcements x where x.created_by = auth.uid() and x.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'You have sent 10 notices today. Try again tomorrow.';
  end if;
  pick := case when announce.to_persons is null or cardinality(announce.to_persons) = 0 then null
               else (select array_agg(distinct x) from unnest(announce.to_persons) x where exists (select 1 from members mm where mm.person_id = x and mm.status = 'active')) end;
  if announce.to_persons is not null and cardinality(announce.to_persons) > 0 and pick is null then
    raise exception 'None of the people you picked have joined yet.';
  end if;
  insert into announcements(title, body, url, created_by, created_person, to_persons)
  values (trim(announce.title), trim(coalesce(announce.body, '')), coalesce(nullif(trim(announce.url), ''), '#/'), auth.uid(), my_person_id(), pick)
  returning * into a;
  who := coalesce(push_name(auth.uid()), 'Family');
  for uid in select mm.user_id from members mm where mm.status = 'active' and (pick is null or mm.person_id = any(pick)) loop
    m := m + 1;
    if push_wanted(uid, 'news') then
      insert into push_queue(user_id, kind, title, body, url, tag)
      values (uid, 'news', left(a.title, 120), left(who || ': ' || coalesce(nullif(a.body, ''), 'Tap to have a look.'), 240), a.url, 'news-' || a.id);
      n := n + 1;
    end if;
  end loop;
  return query select m, n;
end $$;
revoke all on function public.announce(text, text, text, text[]) from public, anon;
grant execute on function public.announce(text, text, text, text[]) to authenticated;

-- how many of these people (or everyone) would get a phone notification right now; counts only, admins only
drop function if exists public.announce_reach();
create function public.announce_reach(to_persons text[] default null) returns table (members int, phones int)
language sql stable security definer set search_path = public as $$
  select count(*)::int, count(*) filter (where push_wanted(m.user_id, 'news'))::int
    from members m
   where is_admin() and m.status = 'active'
     and (announce_reach.to_persons is null or cardinality(announce_reach.to_persons) = 0 or m.person_id = any(announce_reach.to_persons))
$$;
revoke all on function public.announce_reach(text[]) from public, anon;
grant execute on function public.announce_reach(text[]) to authenticated;
