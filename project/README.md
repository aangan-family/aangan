# The Aangan project site's own backend

This is **not** part of a family's website. It runs the public Aangan site (https://aangan-family.github.io/aangan/):
the sign-up before setup, setup progress, daily page counts, and the admin numbers page.
No family data ever comes here: the family sheet is read only on the person's own computer.

- `supabase/` — the project's tables (`migrations/`) and its Edge Function `aangan` (sign-up, step, view, forget, admin).
  Project: `aangan` in the maintainers' Supabase organisation, Mumbai. Tables have RLS on and no policies: only the function reads or writes.
- `api/` — a Cloudflare Worker that passes requests through to the function, because some Indian providers block supabase.co.
  Live as `aangan-api` at https://aangan-api.always4vicky.workers.dev (the site's `HELPER_URL` in `wizard/src/api.js`; it falls back
  to the function only if the helper can't be reached). Edit it in the Cloudflare dashboard, or let `.github/workflows/project-api.yml`
  redeploy it on changes once the repository has `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.
  `.github/workflows/project-check.yml` tests a made-up sign-up through both addresses every day.

What a sign-up keeps: name, email, and optionally family name, traditions, city, country, and rough family size,
with the consent text they agreed to; which setup steps they reached (step names only); and per-day page counts (no cookies, no addresses).
Anyone can delete their own sign-up from the site (**Delete my sign-up**). The admin password is stored only as a hash. Setting it needs a one-time setup code (also kept only as a hash,
used up when the password is set), so nobody else can claim `#admin` first. To reset a lost password: delete the row in
`admin_key`, insert a new setup code (see `migrations/0003_admin_setup_code.sql`) and set a new password from the admin page.

## Hosted edition (docs/HOSTED.md)

Migration `0004_hosted.sql` adds what Aangan keeps about each hosted family: `families` (address, family name,
traditions, admin email, the declaration they accepted, status), `subscriptions` and `provision_events` (each setup
step's plain message). Never any family data: the tree and everything in it live only in the family's own database.

Endpoints in `functions/aangan`: `/address` (is an address free), `/family/start` (address + declaration for a
signed-up browser; payment comes next), `/family/status` (progress page, only for the browser that signed up),
`/progress` (reports from `scripts/setup.mjs` in hosted mode; needs the Edge Function secret `PROVISION_TOKEN`, set
once with the operations repository's matching secret). `/admin/stats` now includes hosted families by status.
The helper (`api/`) forwards the three browser endpoints; `/progress` comes from GitHub Actions straight to Supabase.
