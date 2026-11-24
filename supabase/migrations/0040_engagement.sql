-- 0040: engagement milestone. engagement = the date (YYYYMMDD, 00 for unknown parts, like the other milestones);
-- engaged_to = the fiancé(e)'s name as free text, since they are usually not in the tree yet.
-- Both are ordinary profile_fields rows: their own visibility (default family), shown only while consent is active.
alter table public.profile_fields drop constraint if exists profile_fields_field_check;
alter table public.profile_fields add constraint profile_fields_field_check check (field in (
  'known_as', 'birth_date', 'birth_place', 'city', 'work', 'organisation',
  'interests', 'about', 'photo', 'phone', 'email', 'address',
  'gothram', 'sutram', 'vedam', 'native_place', 'kuladeivam',
  'janma_nakshatram', 'horoscope', 'shraddha_tithi',
  'upanayanam', 'sashtiabdapoorthi', 'bhimaratha_shanti', 'sathabhishekam',
  'engagement', 'engaged_to'));
alter table public.profile_fields drop constraint if exists profile_fields_milestone_format;
alter table public.profile_fields add constraint profile_fields_milestone_format check (
  field not in ('upanayanam', 'sashtiabdapoorthi', 'bhimaratha_shanti', 'sathabhishekam', 'engagement') or value ~ '^[0-9]{8}$');
alter table public.profile_fields drop constraint if exists profile_fields_engaged_to_len;
alter table public.profile_fields add constraint profile_fields_engaged_to_len check (field <> 'engaged_to' or char_length(value) <= 120);
