-- Aangan project site: who signs up to set up a family website, how far they get, and daily page counts.
-- No family data ever comes here (the family sheet stays on the person's computer).
-- Every table: RLS on, no policies, revoked from anon/authenticated: only the Edge Function (service role) reads and writes.

create table public.signups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (length(name) between 1 and 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 200),
  family_name text check (length(family_name) <= 120),
  community text check (length(community) <= 40),
  city text check (length(city) <= 80),
  country text check (length(country) <= 80),
  family_size text check (family_size in ('under-50', '50-200', '200-plus')),
  heard_from text check (length(heard_from) <= 60),
  consent_text text not null,
  last_seen_at timestamptz not null default now()
);
create unique index signups_email on public.signups (lower(email));

create table public.setup_steps (
  signup_id uuid not null references public.signups(id) on delete cascade,
  step text not null check (step in ('sheet_checked', 'settings_saved', 'seed_made', 'accounts_started', 'accounts_done', 'oneclick_chosen', 'byhand_chosen')),
  at timestamptz not null default now(),
  primary key (signup_id, step)
);

create table public.page_views (
  day date not null default (now() at time zone 'Asia/Kolkata')::date,
  page text not null check (page in ('home', 'signup', 'sheet', 'settings', 'database', 'accounts')),
  views integer not null default 0,
  primary key (day, page)
);

-- the admin's password, stored only as a hash; set once from the admin page (reset: delete the row)
create table public.admin_key (
  id boolean primary key default true check (id),
  hash text not null,
  set_at timestamptz not null default now()
);

alter table public.signups enable row level security;
alter table public.setup_steps enable row level security;
alter table public.page_views enable row level security;
alter table public.admin_key enable row level security;
revoke all on public.signups, public.setup_steps, public.page_views, public.admin_key from anon, authenticated;

-- one page view, counted per day (no cookies, no addresses, nothing about the visitor)
create function public.count_view(p text) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into page_views (page, views) values (p, 1)
  on conflict (day, page) do update set views = page_views.views + 1;
$$;
revoke all on function public.count_view(text) from public, anon, authenticated;
grant execute on function public.count_view(text) to service_role;

-- the numbers for the admin page
create function public.stats() returns jsonb
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
    'heard_from', coalesce((select jsonb_object_agg(k, n) from (select coalesce(nullif(heard_from, ''), 'not given') k, count(*) n from signups group by 1) x), '{}'),
    'steps', coalesce((select jsonb_object_agg(step, n) from (select step, count(*) n from setup_steps group by 1) x), '{}'),
    'recent', coalesce((select jsonb_agg(r order by r->>'created_at' desc) from (
        select jsonb_build_object('created_at', s.created_at, 'name', s.name, 'email', s.email, 'family_name', s.family_name, 'community', s.community,
          'city', s.city, 'country', s.country, 'family_size', s.family_size, 'heard_from', s.heard_from, 'last_seen_at', s.last_seen_at,
          'steps', coalesce((select jsonb_agg(step order by at) from setup_steps t where t.signup_id = s.id), '[]')) r
        from signups s order by s.created_at desc limit 500) x), '[]')
  );
$$;
revoke all on function public.stats() from public, anon, authenticated;
grant execute on function public.stats() to service_role;
