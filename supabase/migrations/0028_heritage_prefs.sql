-- 0028: family traditions in the interface. Each member's own choices:
-- woven border colour (veshti for men, saree for women; the gender itself comes from the tree),
-- which scripts to show beside English, the kolam background and the door welcome.
alter table public.member_prefs
  add column if not exists border text not null default ''
    check (border in ('', 'veshti-red', 'veshti-blue', 'saree-green', 'saree-red')),
  add column if not exists scripts text not null default 'both'
    check (scripts in ('both', 'ml', 'ta', 'en')),
  add column if not exists kolam boolean not null default true,
  add column if not exists doors boolean not null default true;
