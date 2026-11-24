-- 0016: several family photos for the Family page hero (a moving slideshow), each with an optional caption.
-- Safe to run more than once.
-- Files stay in the private photos bucket under family/ (members read, admins write: 0007 storage policies).

alter table public.family_info add column if not exists hero_photos jsonb not null default '[]'::jsonb;

create or replace function public.valid_hero_photos(v jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(v) = 'array'
     and jsonb_array_length(v) <= 12
     and not exists (
       select 1 from jsonb_array_elements(v) e
       where jsonb_typeof(e) <> 'object'
          or coalesce(e->>'path', '') !~ '^family/[A-Za-z0-9-]+\.jpg$'
          or length(coalesce(e->>'caption', '')) > 120
          or exists (select 1 from jsonb_object_keys(e) k where k not in ('path', 'caption'))
     )
$$;
alter table public.family_info drop constraint if exists family_info_hero_photos_check;
alter table public.family_info add constraint family_info_hero_photos_check check (public.valid_hero_photos(hero_photos));

-- the existing single banner becomes the first slide
update public.family_info set hero_photos = jsonb_build_array(jsonb_build_object('path', banner_path))
  where banner_path is not null and hero_photos = '[]'::jsonb;
