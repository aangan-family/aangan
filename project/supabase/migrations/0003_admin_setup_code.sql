-- Setting the admin password needs a one-time setup code (24 Nov 2026), so nobody else can claim #admin first.
-- Make a code: pick a random code, then insert encode(sha256(('aangan-setup:' || '<code>')::bytea), 'hex').
-- The code is deleted when it is used. To reset a lost password: delete the admin_key row and insert a new setup code.
create table public.admin_setup_code (
  hash text primary key check (hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
alter table public.admin_setup_code enable row level security;
revoke all on public.admin_setup_code from anon, authenticated;
