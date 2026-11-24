-- 0055: the Aangan look (saffron, marigold, leaf green and maroon on cream) as a style members can pick, and the
-- default for new families (site.config.json "theme" can choose another). '' = "the family's default": new accounts
-- start there, so a family's choice applies until a member picks their own. Existing choices are kept.
alter table public.member_prefs drop constraint if exists member_prefs_theme_check;
alter table public.member_prefs add constraint member_prefs_theme_check
  check (theme in ('', 'blue', 'kumkum', 'turmeric', 'peacock', 'tulsi', 'lotus', 'aangan', 'instagram', 'glass', 'aurora', 'clean', 'spotlight', 'playful'));
alter table public.member_prefs alter column theme set default '';
