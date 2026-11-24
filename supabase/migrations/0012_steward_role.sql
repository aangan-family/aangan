-- A third role between member and admin. (Its own migration: a new enum value must be
-- committed before functions can use it.)
alter type public.member_role add value if not exists 'steward';
