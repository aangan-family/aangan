-- 0054: borders for the north-east and Nepal: dhaka (Nepali), phanek (Manipuri), puan (Mizo), jainsem (Khasi).
-- Keep in step with web/src/lib/textiles.ts TEXTILES (a test checks they match).
alter table public.member_prefs drop constraint if exists member_prefs_border_check;
alter table public.member_prefs add constraint member_prefs_border_check
  check (border in ('', 'veshti-red', 'veshti-blue', 'saree-green', 'saree-red', 'kasavu', 'pochampally', 'ilkal', 'mysore-peta', 'banarasi', 'leheriya', 'phulkari', 'khes', 'bandhani', 'ajrak', 'paithani', 'pheta', 'laal-paar', 'dhuti', 'chikankari', 'zardozi', 'sambalpuri', 'mekhela', 'gamosa', 'kunbi', 'kani', 'gara', 'dhaka', 'phanek', 'puan', 'jainsem'));
