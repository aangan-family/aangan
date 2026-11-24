-- 0026: Themes — more styles (Instagram, Glass, Aurora) and a Light / Dark / Automatic choice.
alter table public.member_prefs drop constraint if exists member_prefs_theme_check;
alter table public.member_prefs add constraint member_prefs_theme_check
  check (theme in ('blue', 'kumkum', 'turmeric', 'peacock', 'tulsi', 'lotus', 'instagram', 'glass', 'aurora'));
alter table public.member_prefs add column if not exists mode text not null default 'auto'
  check (mode in ('auto', 'light', 'dark'));
