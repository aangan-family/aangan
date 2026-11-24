-- 0053: tradition fields for every family, not only Hindu and South Indian ones.
-- New dated milestones (YYYYMMDD, 00 for unknown parts, like the others):
--   Hindu (all India): naamkaran (naming), annaprashan (first rice), mundan (first haircut)
--   Sikh: amrit_sanchar (taking Amrit), dastar_bandi (first turban)
--   Muslim: aqiqah, bismillah (first lesson), hajj
--   Christian: baptism, first_communion, confirmation
-- and one place: gurdwara (the family's gurdwara or village gurdwara, up to 120 characters).
-- All default to family visibility (profile_default_visibility's else branch) and follow consent like every detail.
-- Which ones the edit form offers depends on the family's traditions (web/src/components/Sheets.tsx).
alter table public.profile_fields drop constraint if exists profile_fields_field_check;
alter table public.profile_fields add constraint profile_fields_field_check check (field in (
  'known_as', 'birth_date', 'birth_place', 'city', 'work', 'organisation',
  'interests', 'about', 'photo', 'phone', 'email', 'address',
  'gothram', 'sutram', 'vedam', 'native_place', 'kuladeivam',
  'janma_nakshatram', 'horoscope', 'shraddha_tithi',
  'upanayanam', 'sashtiabdapoorthi', 'bhimaratha_shanti', 'sathabhishekam',
  'engagement', 'engaged_to', 'marital_status',
  'naamkaran', 'annaprashan', 'mundan', 'amrit_sanchar', 'dastar_bandi',
  'aqiqah', 'bismillah', 'hajj', 'baptism', 'first_communion', 'confirmation', 'gurdwara'));
alter table public.profile_fields drop constraint if exists profile_fields_milestone_format;
alter table public.profile_fields add constraint profile_fields_milestone_format check (
  field not in ('upanayanam', 'sashtiabdapoorthi', 'bhimaratha_shanti', 'sathabhishekam', 'engagement',
                'naamkaran', 'annaprashan', 'mundan', 'amrit_sanchar', 'dastar_bandi',
                'aqiqah', 'bismillah', 'hajj', 'baptism', 'first_communion', 'confirmation')
  or value ~ '^[0-9]{8}$');
alter table public.profile_fields drop constraint if exists profile_fields_gurdwara_len;
alter table public.profile_fields add constraint profile_fields_gurdwara_len check (field <> 'gurdwara' or char_length(value) <= 120);
