# Security policy

Aangan holds families' private details, so we take security reports seriously and answer them quickly.

## Reporting a problem privately

**Please don't open a public issue for a security problem.** Instead:

1. Go to the [Security tab](https://github.com/aangan-family/aangan/security) of this repository and choose **Report a vulnerability**.
   Only the maintainers see the report.
2. Tell us what you found, how to reproduce it, and what someone could do with it.
3. **Never include a real family's data** — not names, emails, photos or screenshots of a live family site.
   Use the made-up sample family (`templates/sample-family.xlsx`) or `npm run demo`.

We aim to reply within 3 days and to fix serious problems within 14 days. We'll credit you in the release notes if you'd like.

## What counts

- Anything that lets someone see a detail they shouldn't: a signed-out visitor, a login without an invitation, a member
  seeing a `private` or `close` detail, a living person's details without consent, a child's contact details
  (see the privacy invariants in [CLAUDE.md](CLAUDE.md) and the tests in `tests/rls_test.sql`).
- Ways around the sign-in broker, the API pass-through (`reminders/src/proxy.ts`), rate limits or admin 2-step sign-in.
- Leaks of keys or secrets in the website bundle, logs or GitHub Actions.
- Problems in the setup wizard (`wizard/`) that send a family's sheet anywhere, or in the project sign-up service (`project/`).

## Not in scope

- A family's own mistakes in setting up their copy (a key pasted in public, a site made public on purpose).
- Problems in Supabase, Cloudflare, Resend or Google themselves: report those to them.
- Denial of service by sheer volume against the free tiers.

## Supported versions

Only the latest `main` is supported. Each family runs its own copy: **Deploy my site** picks up fixes when they update.
Security fixes are announced in the GitHub release notes and in **What's New** on every family's site.

## For families running Aangan

If you think your family's site was misused, see "If something goes wrong" in [docs/OPERATIONS.md](docs/OPERATIONS.md):
sign everyone out (My privacy → **Sign out everywhere**), rotate the server key in Supabase, and check Admin → Members & roles.
