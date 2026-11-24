# Where your family website lives: four levels

Pick the level that suits your family. You can start at a lower level and move up later without losing anything. The privacy rules are the same at every level: they're built into the database, not bought with a plan.

| | Level 0 · Try it | Level 1 · Free | Level 2 · Own domain (recommended) | Level 3 · Grown family |
| --- | --- | --- | --- | --- |
| **Cost** | ₹0 | ₹0 | About ₹500–900 a year (the domain) | About ₹2,100 a month (Supabase Pro) + domain |
| **Address** | Only on your computer | `sharma-parivar.pages.dev` | `sharmaparivar.in` | `sharmaparivar.in` |
| **Sign-in** | None (preview) | Google only | Google + email link (+ Microsoft, Yahoo) | Same |
| **Emails** (welcome, reminders, weekly news) | No | No (phone notifications only) | Yes, from `family@yourdomain` | Yes |
| **Good for** | Seeing it with a made-up family | Up to a few hundred relatives, few photos | Most families | Thousands of photos, very large families |
| **Setup time** | 10 minutes | 2 hours | An afternoon | Same as Level 2 |

## What the free plans give you (checked November 2026)

- **Supabase (database, sign-in, photos).** Free: 500 MB database, 1 GB photo storage, 5 GB downloads a month, 2 projects. A family tree of 1,000 people uses about 5 MB, so the database is rarely the limit. **Photos are**: 1 GB is roughly 2,000–4,000 phone photos after the site shrinks them. Free projects **pause after a week with no activity**; the helper service checks in every 10 minutes, so yours stays awake.
- **Cloudflare (website, helper service).** Free: unlimited visits to the website itself; the helper service gets 100,000 requests a day (a busy family uses a few thousand).
- **Resend (emails).** Free: 100 emails a day, 3,000 a month. Enough for daily reminders, welcome emails and a weekly email for about 400 members. Needs your own domain.
- **GitHub (code and backups).** Free, with private repositories.

These limits change; check each pricing page before you rely on a number.

---

## Level 0 · Try it (₹0, 10 minutes)

On your computer, with the made-up sample family. Nothing goes online.

```bash
npm install && npm run import -- templates/sample-family.xlsx --demo --me P005
cd web && npm install && npm run demo
```

## Level 1 · Free, no domain (₹0)

Everything runs on free addresses: the website on `yourname.pages.dev` and the helper service on `family-reminders.yourname.workers.dev`.

What's different from Level 2:
- **Sign-in is with Google only.** Email sign-in links need an email sender, and senders need your own domain. Most relatives have a Gmail address; anyone who doesn't can make one in two minutes.
- **No emails.** Birthdays, messages and family news reach people as phone notifications instead (turn on step 8 in the setup guide). The admin's daily reminder can go to WhatsApp through CallMeBot (free) instead of email.
- **The address isn't yours.** If you later buy a domain, you move to it (Level 2) and send everyone the new link.

In `site.config.json`:

```json
"siteUrl": "https://sharma-parivar.pages.dev",
"apiUrl": "https://family-reminders.yourname.workers.dev",
"emailSignIn": false
```

Then follow [SETUP.md](SETUP.md), skipping step 3 (domain) and step 8 (emails). `npm run check` knows about the free setup and tells you if anything is missing.

**What about free domains?** Free domain services come and go (Freenom, the best known, stopped in 2023), are often blocked or flagged as spam, and can be taken back. For a site your family will rely on for years, a `.pages.dev` address is more dependable than a free domain, and a paid `.in` domain more dependable still.

## Level 2 · Your own domain (recommended, about ₹500–900 a year)

The full experience: your family's own address, sign-in by email link as well as Google, welcome emails signed by the admin, the daily reminder digest and the weekly "This week in the family" email.

- Buy the domain on Cloudflare (Domain Registration), which sells at cost with no markup (`.com`, `.family`, `.net` and many more).
- Cloudflare doesn't sell `.in` domains. To get one, buy it from an Indian registrar, then add it to Cloudflare and point its name servers there.
- Follow [SETUP.md](SETUP.md) from start to finish.

## Level 3 · When the family grows

Move up only when the site tells you to. The health check emails the admin when storage is filling up.

- **Supabase Pro ($25 a month):** 100 GB of photos, 8 GB database, daily backups kept for 7 days, never pauses.
- **Resend Pro ($20 a month):** 50,000 emails a month, no daily cap. Only if you have more than about 400 members getting the weekly email.
- **Cloudflare Workers Paid ($5 a month):** only if the helper service ever hits 100,000 requests in a day.

Split the cost: many families ask each branch to chip in once a year.

## Why we don't run one big site for everyone

We could host every family on one server, but then one company (us) would hold the private details of thousands of families, and one breach would expose them all. Instead every family runs its own copy, on accounts it owns, and this project never sees anyone's data. See [PRIVACY-GUIDE.md](PRIVACY-GUIDE.md).
