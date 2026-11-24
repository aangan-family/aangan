-- 0044: hardening after the Supabase security advisor (22 Nov 2026).
-- 1. Trigger functions can't be called directly anyway ("can only be called as triggers"), but they were still
--    listed as callable through the API. Take EXECUTE away from everyone; triggers keep firing (Postgres checks
--    EXECUTE on a trigger function only when the trigger is created).
-- 2. Pin search_path on the remaining helper functions, so no one can shadow a table or function they use.

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

alter function public.acting_author() set search_path = public, pg_temp;
alter function public.consents_guard() set search_path = public, pg_temp;
alter function public.default_visibility(text) set search_path = public, pg_temp;
alter function public.dev_docs_stamp() set search_path = public, pg_temp;
alter function public.is_contact_field(text) set search_path = public, pg_temp;
alter function public.mention_ids(text) set search_path = public, pg_temp;
alter function public.photo_tags_guard() set search_path = public, pg_temp;
alter function public.photos_stamp() set search_path = public, pg_temp;
alter function public.stamp_field() set search_path = public, pg_temp;
alter function public.valid_hero_photos(jsonb) set search_path = public, pg_temp;
