# The Aangan project site's own backend

This is **not** part of a family's website. It runs the public Aangan site (https://aangan-family.github.io/aangan/):
the sign-up before setup, setup progress, daily page counts, and the admin numbers page.
No family data ever comes here: the family sheet is read only on the person's own computer.

- `supabase/` — the project's tables (`migrations/`) and its Edge Function `aangan` (sign-up, step, view, forget, admin).
  Project: `aangan` in the maintainers' Supabase organisation, Mumbai. Tables have RLS on and no policies: only the function reads or writes.
- `api/` — a Cloudflare Worker that passes requests through to the function, because some Indian providers block supabase.co.
  Deployed by `.github/workflows/project-api.yml` when the repository has `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.
  Then set the repository variable `AANGAN_API_URL` to the Worker's address, and the site uses it.

What a sign-up keeps: name, email, and optionally family name, traditions, city, country, and rough family size,
with the consent text they agreed to; which setup steps they reached (step names only); and per-day page counts (no cookies, no addresses).
Anyone can delete their own sign-up from the site (**Delete my sign-up**). The admin password is stored only as a hash; to reset it,
delete the row in `admin_key` and set a new one from the admin page.
