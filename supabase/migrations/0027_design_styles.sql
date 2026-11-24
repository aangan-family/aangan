-- 0027: three more design styles to pick from (Clean, Spotlight, Playful), inspired by shadcn/ui, Magic UI / Aceternity and React Bits.
alter table public.member_prefs drop constraint if exists member_prefs_theme_check;
alter table public.member_prefs add constraint member_prefs_theme_check
  check (theme in ('blue', 'kumkum', 'turmeric', 'peacock', 'tulsi', 'lotus', 'instagram', 'glass', 'aurora', 'clean', 'spotlight', 'playful'));
