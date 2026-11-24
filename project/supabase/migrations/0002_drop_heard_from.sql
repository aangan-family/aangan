-- The sign-up no longer asks how people heard of Aangan (24 Nov 2026): drop what was kept.

create or replace function public.stats() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'signups', (select count(*) from signups),
    'last7', (select count(*) from signups where created_at > now() - interval '7 days'),
    'active7', (select count(*) from signups where last_seen_at > now() - interval '7 days'),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'n', n) order by d) from (
        select (created_at at time zone 'Asia/Kolkata')::date d, count(*) n from signups
        where created_at > now() - interval '60 days' group by 1) x), '[]'),
    'views_by_day', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'page', page, 'n', views) order by day) from page_views
        where day > (now() at time zone 'Asia/Kolkata')::date - 60), '[]'),
    'community', coalesce((select jsonb_object_agg(k, n) from (select coalesce(nullif(community, ''), 'not given') k, count(*) n from signups group by 1) x), '{}'),
    'country', coalesce((select jsonb_object_agg(k, n) from (select coalesce(nullif(country, ''), 'not given') k, count(*) n from signups group by 1) x), '{}'),
    'city', coalesce((select jsonb_object_agg(k, n) from (select coalesce(nullif(city, ''), 'not given') k, count(*) n from signups group by 1 order by 2 desc limit 25) x), '{}'),
    'family_size', coalesce((select jsonb_object_agg(k, n) from (select coalesce(family_size, 'not given') k, count(*) n from signups group by 1) x), '{}'),
    'steps', coalesce((select jsonb_object_agg(step, n) from (select step, count(*) n from setup_steps group by 1) x), '{}'),
    'recent', coalesce((select jsonb_agg(r order by r->>'created_at' desc) from (
        select jsonb_build_object('created_at', s.created_at, 'name', s.name, 'email', s.email, 'family_name', s.family_name, 'community', s.community,
          'city', s.city, 'country', s.country, 'family_size', s.family_size, 'last_seen_at', s.last_seen_at,
          'steps', coalesce((select jsonb_agg(step order by at) from setup_steps t where t.signup_id = s.id), '[]')) r
        from signups s order by s.created_at desc limit 500) x), '[]')
  );
$$;
alter table public.signups drop column heard_from;

revoke all on function public.stats() from public, anon, authenticated;
grant execute on function public.stats() to service_role;
