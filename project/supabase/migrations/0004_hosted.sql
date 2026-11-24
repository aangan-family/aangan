-- 0004: the hosted edition (docs/HOSTED.md, stage 2). What Aangan's backend keeps about each hosted family:
-- its address and public settings, its subscription, and how its site's setup went. Never any family data
-- (the tree, details, photos): that lives only in the family's own database.
-- Like the other tables here: row-level security on, no policies, nothing for anon/authenticated; only the
-- Edge Function (service role) reads or writes, and only through the endpoints in functions/aangan.

create table public.families (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  signup_id uuid not null references public.signups(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z](?:[a-z0-9]|-(?!-)){1,28}[a-z0-9]$' and slug !~ '-api$'),
  family_name text not null check (char_length(family_name) between 1 and 120),
  community text check (community ~ '^[a-z_]{2,30}$'),
  admin_email text not null check (admin_email ~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'),
  -- the agreement the admin accepted (docs/legal/declaration.md): which version, their answers, when
  declaration_version text not null,
  declaration jsonb not null,
  declared_at timestamptz not null default now(),
  status text not null default 'awaiting_payment' check (status in
    ('awaiting_payment', 'provisioning', 'ready', 'failed', 'paused', 'cancelled', 'deleted')),
  status_message text,
  site_url text,
  ready_at timestamptz,
  paused_at timestamptz,
  deleted_at timestamptz
);
create index families_status on public.families (status);
create unique index families_one_per_signup on public.families (signup_id) where status not in ('cancelled', 'deleted');

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  provider text not null default 'razorpay' check (provider in ('razorpay', 'manual')),
  provider_subscription_id text unique,
  plan text not null check (plan in ('monthly', 'yearly', 'trial', 'pilot')),
  status text not null default 'created' check (status in ('created', 'trial', 'active', 'past_due', 'paused', 'cancelled', 'ended')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_family on public.subscriptions (family_id);

-- every step the setup reported (scripts/setup.mjs report()): status working/ready/failed and a plain message
create table public.provision_events (
  id bigint generated always as identity primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  at timestamptz not null default now(),
  status text not null check (status in ('queued', 'working', 'ready', 'failed')),
  step int,
  message text check (char_length(message) <= 500)
);
create index provision_events_family on public.provision_events (family_id, at desc);

alter table public.families enable row level security;
alter table public.subscriptions enable row level security;
alter table public.provision_events enable row level security;
revoke all on public.families, public.subscriptions, public.provision_events from anon, authenticated;

-- a family's progress from a setup report: record it and move the family's status on
create or replace function public.provision_report(p_slug text, p_status text, p_step int, p_message text)
returns void language plpgsql security definer set search_path = public as $$
declare f public.families;
begin
  select * into f from families where slug = p_slug and status in ('provisioning', 'failed', 'ready');
  if not found then raise exception 'no family in setup with that address'; end if;
  insert into provision_events (family_id, status, step, message) values (f.id, p_status, p_step, left(p_message, 500));
  update families set
    status = case p_status when 'ready' then 'ready' when 'failed' then 'failed' else 'provisioning' end,
    status_message = left(p_message, 500),
    ready_at = case when p_status = 'ready' then coalesce(ready_at, now()) else ready_at end,
    updated_at = now()
  where id = f.id;
end $$;

-- what the family's progress page may see: status and the last steps' plain messages, nothing else
create or replace function public.family_progress(p_signup uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'slug', f.slug, 'family_name', f.family_name, 'status', f.status, 'message', f.status_message, 'site_url', f.site_url,
    'steps', coalesce((select jsonb_agg(jsonb_build_object('at', e.at, 'status', e.status, 'message', e.message) order by e.at)
                       from (select * from provision_events where family_id = f.id order by at desc limit 30) e), '[]'))
  from families f where f.signup_id = p_signup and f.status not in ('cancelled', 'deleted')
  order by f.created_at desc limit 1;
$$;

revoke all on function public.provision_report(text, text, int, text), public.family_progress(uuid) from public, anon, authenticated;
grant execute on function public.provision_report(text, text, int, text), public.family_progress(uuid) to service_role;

-- the admin dashboard: hosted families by status (no admin emails in the counts)
create or replace function public.hosted_stats()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from families group by 1) x), '{}'),
    'recent', coalesce((select jsonb_agg(r order by r->>'created_at' desc) from (
      select jsonb_build_object('created_at', f.created_at, 'slug', f.slug, 'family_name', f.family_name, 'community', f.community,
        'status', f.status, 'message', f.status_message, 'ready_at', f.ready_at,
        'plan', (select s.plan from subscriptions s where s.family_id = f.id order by s.created_at desc limit 1),
        'subscription', (select s.status from subscriptions s where s.family_id = f.id order by s.created_at desc limit 1)) r
      from families f order by f.created_at desc limit 200) x), '[]'));
$$;
revoke all on function public.hosted_stats() from public, anon, authenticated;
grant execute on function public.hosted_stats() to service_role;
