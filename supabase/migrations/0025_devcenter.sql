-- 0025: DevCenter — the operations handbook on the website (#/devcenter), admins only.
-- The handbook names accounts and the people who run them, so it lives here, never in the
-- site's code (anything bundled into the website can be downloaded by anyone, signed out).

create table public.dev_docs (
  id         text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  title      text not null check (length(btrim(title)) between 1 and 120),
  body       text not null default '' check (length(body) <= 200000),
  sort       int  not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
alter table public.dev_docs enable row level security;
revoke all on public.dev_docs from public, anon;
grant select, insert, update, delete on public.dev_docs to authenticated;
create policy dev_docs_admin on public.dev_docs for all to authenticated
  using (is_admin()) with check (is_admin());

create or replace function public.dev_docs_stamp() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
revoke all on function public.dev_docs_stamp() from public, anon;
create trigger dev_docs_stamp before insert or update on public.dev_docs
  for each row execute function public.dev_docs_stamp();
create trigger audit_dev_docs after insert or update or delete on public.dev_docs
  for each row execute function public.audit();
