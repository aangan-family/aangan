# Aangan, hosted: one site per family, run by Aangan

Decided 24 Nov 2026. A family signs up on the Aangan site, pays, and gets its own private family website a few
minutes later. They never see Supabase, Cloudflare or Resend, never copy a key, and never open GitHub.
The self-host edition (each family runs its own copy) stays exactly as it is; hosting reuses the same code.

## What a family sees

1. **Sign up** on aangan-family.github.io/aangan (later the Aangan domain): name, email, family name, traditions.
2. **Choose the address**: `sharma` → `sharma.<aangan-domain>`. Checked for availability as they type.
3. **Read and accept the agreement** (docs/legal/): what Aangan does with their family's data, their duties as admin.
4. **Pay**: monthly or yearly subscription (Razorpay: UPI AutoPay, cards, net banking).
5. **Wait 5–15 minutes** on a progress page ("Making your family's database… Setting up emails… Almost ready").
   Email when it's ready.
6. **Sign in** to their new site (Google or email link) as the first admin. 2-step sign-in is required at once.
7. **Bring in the family sheet** on their own site (Admin → **Import family**): the sheet goes straight into their
   own database, never through Aangan's systems. Preview, plain-language checks, then load.
8. **Invite relatives** as today.

## What runs behind the scenes

| Piece | Where | Per family |
|---|---|---|
| Database, sign-in, photos | A Supabase project in Aangan's organisation | one project (Micro compute) |
| Website | A Cloudflare Pages project, `sharma.<aangan-domain>` | one project |
| Helper (API pass-through, emails, reminders, push, health) | A Cloudflare Worker, `sharma-api.<aangan-domain>` | one Worker |
| Emails | Resend, Aangan's sending domain, From "Sharma family" | shared domain |
| Sign-ups, subscriptions, provisioning status | The project backend (`project/`, Supabase project `aangan`) | one row |
| Provisioning and updates | GitHub Actions in a private Aangan ops repository, started by the project backend | one run |

Why `sharma-api.` and not `api.sharma.`: Cloudflare's free certificate covers one level of subdomain.

**Provisioning** = the existing one-click setup (`scripts/setup.mjs`) in a new *hosted* mode:
- uses Aangan's tokens (never the family's), creates the family's Supabase project, applies `setup.sql`,
  sets sign-in, deploys the Worker and the Pages project under the Aangan domain, adds DNS;
- builds the website with that family's `site.config.json` (kept in the project backend, public values only);
- creates the first admin invitation (0051) for the email that signed up;
- reports each step back to the project backend (the progress page reads it);
- never sees family data: the tree arrives later, through the family's own site.

**Updates** reach every family: a release runs a fleet workflow that applies new migrations to each family's
database and redeploys its Worker and website, a few families at a time, stopping on the first failure.

**Fleet care**: one health view across families (the Worker health checks already exist), nightly encrypted
backups per family, alerts to Aangan's operations email.

## Money

Running cost per family, roughly (Nov 2026 prices; check before setting the price):
- Supabase: Pro organisation $25/month (includes the first project), then about **$10/month per family** (Micro compute).
- Cloudflare: Workers Paid $5/month for the account. The free plan allows 5 scheduled jobs per account in total and
  each family's Worker has 3; Workers Paid allows 250, so about 80 families per account. Before that, each family
  Worker moves to a single every-minute schedule that decides what to run (then about 250 families per account,
  within the 500 Workers an account may have), and later families go into a second account.
  Pages and Workers requests are well within limits for family sites.
- Resend: free up to 3,000 emails a month in total, then a paid plan.
- So about ₹900–1,000 a family a month at small scale, falling slightly as numbers grow.

Pricing is yours to set. A yearly plan (with a discount) suits families better than monthly; a free 14-day trial
lets them see their tree before paying.

**Subscription life**: trial → active → payment failed (7 days' grace, reminders) → paused (site shows a polite
"paused" page; data kept 60 days; admin can download everything) → deleted (database and files removed, confirmed by
email). Cancel any time; same export and deletion path.

## The agreement

Drafts in `docs/legal/`: terms of service, privacy notice for the family admin, and the declaration the admin accepts.
In short:
- The **family admin** decides what is collected and who is invited; relatives still give their own consent on the
  site (already built: consent, per-detail visibility, under-18 rules).
- **Aangan** runs the service on the family's behalf: keeps data in India where the providers allow it, uses it only to
  run their site, never sells or shares it, never reads it except to fix a problem the admin asks about, deletes it when
  they leave.
- India's DPDP Act exempts data an *individual* keeps for personal or domestic purposes, but not a business. Aangan
  is a paid service, so it meets the Act in full (notice, consent, security, breach reporting, deletion, children,
  a grievance contact), whatever the family's own position.
- These are drafts. **A lawyer must review them before the first paying family.**

## Build order

1. **Hosted mode for setup** (`scripts/setup.mjs --hosted`): Aangan's tokens, subdomains under the Aangan domain,
   shared sending domain, first admin invitation, progress callbacks. Tested with fake APIs like today.
2. **Project backend tables**: families (address, config, status), subscriptions, provisioning runs; RLS locked to the
   service role. The progress page and admin dashboard read them.
3. **Ops repository + provisioning workflow**, started by the project backend after payment.
4. **Import family on the site** (Admin → Import family), reusing `scripts/lib/sheet.mjs` in the browser.
5. **Sign-up journey** on the Aangan site: address, agreement, payment, progress, ready.
6. **Razorpay** subscriptions and webhooks; pause, export, delete.
7. **Fleet updates, health and backups** across families.
8. Move the Aangan site to the Aangan domain; Aangan's own privacy notice and terms pages live.

## What only you can do

- **Buy the Aangan domain** families' sites will live under (for example `aangan.family`, `aangan.in` or
  `myaangan.in`; check availability).
- **Accounts for Aangan itself**, separate from your family site: a Supabase organisation on Pro, a Cloudflare account
  on Workers Paid, a Resend account, and a private GitHub repository for operations. Then give the ops repository three
  secrets (I'll walk you through it; I can't type tokens for you).
- **Razorpay**: a business account with KYC and Subscriptions turned on.
- **Price** and trial length.
- **A lawyer's review** of `docs/legal/` before the first paying family.
