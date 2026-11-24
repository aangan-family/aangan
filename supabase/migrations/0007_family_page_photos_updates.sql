-- Family page (story, banner, tradition roots), shared photos with tags, and the
-- notification bell. Family-specific values (the story, gothram etc.) are entered on the
-- website by an admin, never in this file.

-- ---------------------------------------------------------------------------
-- Family page: one row, readable by members, editable by admins
-- ---------------------------------------------------------------------------
create table public.family_info (
  id              boolean primary key default true check (id),
  about           text check (length(about) <= 8000),
  banner_path     text check (banner_path ~ '^family/[A-Za-z0-9-]+\.jpg$'),
  roots_person_id text references public.persons(id) on delete set null,  -- the couple the traditions come from
  gothram         text check (length(gothram) <= 80),
  sutram          text check (length(sutram) <= 80),
  vedam           text check (length(vedam) <= 80),
  kuladeivam      text check (length(kuladeivam) <= 200),
  updated_by      uuid,
  updated_at      timestamptz not null default now()
);
insert into public.family_info default values;
alter table public.family_info enable row level security;
revoke all on public.family_info from anon;
revoke insert, delete on public.family_info from authenticated;
create policy family_info_read  on public.family_info for select to authenticated using (is_member());
create policy family_info_admin on public.family_info for update to authenticated using (is_admin()) with check (is_admin());
create trigger family_info_stamp before update on public.family_info for each row execute function public.stamp_field();
create trigger audit_family_info after update on public.family_info for each row execute function public.audit();

-- ---------------------------------------------------------------------------
-- Photos: any member can share; tags of living people need their say
-- ---------------------------------------------------------------------------
create table public.photos (
  id          uuid primary key default gen_random_uuid(),
  path        text not null unique check (path ~ '^album/[A-Za-z0-9-]+\.jpg$'),
  caption     text check (length(caption) <= 500),
  taken_year  int check (taken_year between 1850 and 2200),
  uploaded_by uuid not null default auth.uid(),
  created_at  timestamptz not null default now()
);
create table public.photo_tags (
  photo_id   uuid not null references public.photos(id) on delete cascade,
  person_id  text not null references public.persons(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  tagged_by  uuid not null default auth.uid(),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (photo_id, person_id)
);
create index on public.photo_tags(person_id);

-- A photo someone pictured in it has declined is hidden from the family.
create function public.photo_declined(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from photo_tags where photo_id = pid and status = 'declined')
$$;
-- The viewer looks after someone tagged in the photo (so they can approve or decline it).
create function public.photo_tags_me(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from photo_tags where photo_id = pid and can_manage(person_id))
$$;
create function public.photo_uploader(pid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select uploaded_by from photos where id = pid
$$;
-- A tag names a person in a photo, so a living person's tag shows only while their
-- consent allows photos and tags.
create function public.tag_allowed(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select can_manage(p)
      or exists (select 1 from persons where id = p and not is_living)
      or exists (select 1 from consents where person_id = p and withdrawn_at is null and show_photo and allow_tags)
$$;

-- The person's current consent says no tags.
create function public.tags_refused(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from consents where person_id = p and withdrawn_at is null and not allow_tags)
$$;

alter table public.photos     enable row level security;
alter table public.photo_tags enable row level security;
revoke all on public.photos, public.photo_tags from anon;

create policy photos_read on public.photos for select to authenticated using (
  is_admin() or uploaded_by = auth.uid() or (is_member() and (not photo_declined(id) or photo_tags_me(id))));
create policy photos_insert on public.photos for insert to authenticated with check (is_member() and uploaded_by = auth.uid());
create policy photos_update on public.photos for update to authenticated
  using (uploaded_by = auth.uid() or is_admin()) with check (uploaded_by = auth.uid() or is_admin());
create policy photos_delete on public.photos for delete to authenticated using (uploaded_by = auth.uid() or is_admin());

create policy tags_read on public.photo_tags for select to authenticated using (
  is_member() and exists (select 1 from photos ph where ph.id = photo_id) and (
    (status = 'approved' and tag_allowed(person_id))
    or can_manage(person_id) or tagged_by = auth.uid() or photo_uploader(photo_id) = auth.uid() or is_admin()));
create policy tags_insert on public.photo_tags for insert to authenticated with check (
  is_member() and tagged_by = auth.uid() and exists (select 1 from photos ph where ph.id = photo_id)
  and (can_manage(person_id) or not tags_refused(person_id)));
create policy tags_decide on public.photo_tags for update to authenticated
  using (can_manage(person_id)) with check (can_manage(person_id));
create policy tags_delete on public.photo_tags for delete to authenticated using (
  tagged_by = auth.uid() or can_manage(person_id) or photo_uploader(photo_id) = auth.uid() or is_admin());

-- New tags: approved straight away when there is no one else to ask (you tagged yourself,
-- your child, someone who has passed away, or an admin tagged someone who hasn't joined).
-- Otherwise the person tagged is asked.
create function public.photo_tags_new() returns trigger
language plpgsql security definer set search_path = public as $$
declare me text := my_person_id();
begin
  new.tagged_by := auth.uid();
  new.created_at := now();
  if new.person_id = me
     or exists (select 1 from persons where id = new.person_id and not is_living)
     or (is_minor(new.person_id) and exists (select 1 from parent_links where child_id = new.person_id and parent_id = me))
     or (is_admin() and not exists (select 1 from members where person_id = new.person_id and status = 'active'))
  then new.status := 'approved'; new.decided_by := auth.uid(); new.decided_at := now();
  else new.status := 'pending'; new.decided_by := null; new.decided_at := null;
  end if;
  return new;
end $$;
create trigger photo_tags_new before insert on public.photo_tags for each row execute function public.photo_tags_new();

-- Deciding a tag only changes its status.
create function public.photo_tags_guard() returns trigger
language plpgsql as $$
begin
  if new.photo_id is distinct from old.photo_id or new.person_id is distinct from old.person_id
     or new.tagged_by is distinct from old.tagged_by or new.created_at is distinct from old.created_at then
    raise exception 'Only the tag''s approval can be changed.';
  end if;
  new.decided_by := auth.uid();
  new.decided_at := now();
  return new;
end $$;
create trigger photo_tags_guard before update on public.photo_tags for each row execute function public.photo_tags_guard();

create function public.photos_stamp() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.uploaded_by := auth.uid(); new.created_at := now();
  else new.uploaded_by := old.uploaded_by; new.created_at := old.created_at; new.path := old.path; end if;
  return new;
end $$;
create trigger photos_stamp before insert or update on public.photos for each row execute function public.photos_stamp();

create trigger audit_photos     after insert or update or delete on public.photos     for each row execute function public.audit();
create trigger audit_photo_tags after insert or update or delete on public.photo_tags for each row execute function public.audit();

-- Storage: the banner lives in photos/family/, shared photos in photos/album/.
create policy family_banner_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = 'family' and public.is_member());
create policy family_banner_write on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = 'family' and public.is_admin());
create policy family_banner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = 'family' and public.is_admin());
create policy album_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = 'album'
         and exists (select 1 from public.photos p where p.path = name));   -- photos' own rules decide
create policy album_write on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = 'album' and public.is_member());
create policy album_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = 'album'
         and (owner_id = auth.uid()::text or public.is_admin()));

-- ---------------------------------------------------------------------------
-- Per-person settings: colour theme and when the bell was last opened
-- ---------------------------------------------------------------------------
create table public.member_prefs (
  user_id         uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  theme           text not null default 'blue' check (theme in ('blue', 'kumkum', 'turmeric', 'peacock', 'tulsi', 'lotus')),
  updates_seen_at timestamptz
);
alter table public.member_prefs enable row level security;
revoke all on public.member_prefs from anon;
create policy prefs_own on public.member_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and is_member());
create trigger audit_member_prefs after insert or update or delete on public.member_prefs for each row execute function public.audit();

-- Who joined recently, for the bell. Only person and date, never the email.
create function public.recent_joins() returns table (person_id text, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select person_id, created_at from members
  where status = 'active' and person_id is not null and is_member() and created_at > now() - interval '60 days'
$$;

revoke all on function public.photo_declined(uuid), public.photo_tags_me(uuid), public.photo_uploader(uuid),
  public.tag_allowed(text), public.tags_refused(text), public.recent_joins() from public, anon;
grant execute on function public.photo_declined(uuid), public.photo_tags_me(uuid), public.photo_uploader(uuid),
  public.tag_allowed(text), public.tags_refused(text), public.recent_joins() to authenticated;
grant select, insert, update, delete on public.photos, public.photo_tags, public.member_prefs to authenticated;
grant select, update on public.family_info to authenticated;
