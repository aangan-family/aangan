-- Private photo storage. Files live at photos/<person_id>/<random>.jpg.
-- No public URLs: the website asks for short-lived signed links, and only
-- people allowed to see that person's photo can get one.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy photos_read on storage.objects for select to authenticated
  using (
    bucket_id = 'photos' and (
      public.can_manage((storage.foldername(name))[1])
      -- profile_fields is itself protected, so this only matches photos the viewer may see
      or exists (select 1 from public.profile_fields f
                 where f.person_id = (storage.foldername(name))[1] and f.field = 'photo' and f.value = name)
    )
  );

create policy photos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.can_manage((storage.foldername(name))[1]));
create policy photos_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.can_manage((storage.foldername(name))[1]));
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.can_manage((storage.foldername(name))[1]));
