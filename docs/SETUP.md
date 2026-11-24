# Set up your family website

About an afternoon. You don't need to know how to code: you'll copy and paste, and click through a few websites. If you're 16 and comfortable on a laptop, you can do this.

**You'll need**
- A laptop and a Gmail address (it will be the admin's sign-in)
- About ₹500–900 a year for a domain name, e.g. `sharmaparivar.in`. Everything else is free. (Or nothing at all: see the free setup in [HOSTING.md](HOSTING.md).)
- Read [PRIVACY-GUIDE.md](PRIVACY-GUIDE.md) first. You'll be looking after your relatives' private details.
- Free accounts on: **GitHub** (the code), **Supabase** (the database), **Cloudflare** (the website and domain), **Resend** (sends the emails)

Tick each step off as you go.

---

## 1. Make your own private copy

1. Sign in to GitHub, open this project and press **Use this template → Create a new repository**.
2. Name it (e.g. `sharma-family`) and choose **Private**. Your copy must be private: it will hold your settings, and its backups.
3. In your new repository, press **Code → Codespaces → Create codespace**. A coding window opens in your browser with everything installed. You'll type a few commands in its **Terminal** (bottom of the screen).

In the terminal, run once:

```bash
npm install
```

## 2. Fill in your family sheet

1. Download `templates/family-tree-template.xlsx` (right-click it in the file list → Download). Open it in Excel or Google Sheets (File → Download → .xlsx when you're done).
2. Read the **Start here** tab, then fill in the **Family** tab: one row per person, with their father, mother and spouse. Look at `templates/sample-family.xlsx` if you're unsure.
3. Drag your finished file into the **data** folder in the Codespace file list. (Anything in `data/` is never uploaded to GitHub.)
4. Check it:

```bash
npm run import -- data/my-family.xlsx --check
```

It lists anything to fix, row by row, in plain words. Fix those in the sheet, drag it in again, and repeat until it says **✓ The sheet looks good.**

Want to see it before going further? `npm run import -- data/my-family.xlsx --demo`, then `cd web && npm install && npm run demo`, and open the link it shows. Press Ctrl+C to stop, and `cd ..` to go back.

## 3. Get your domain

1. Sign up at **cloudflare.com**.
2. Buy a domain in **Domain Registration → Register Domains** (or add one you already own under **Add a domain** and follow the steps to point it at Cloudflare). Cloudflare doesn't sell `.in` domains: buy those from an Indian registrar and add them here.

**No budget for a domain?** You can run the site free on a `.pages.dev` address with Google sign-in only. See [HOSTING.md](HOSTING.md), Level 1.

## 4. Create the database

1. Sign up at **supabase.com** → **New project**. Pick the region nearest your family (for India: **Mumbai**). Save the database password somewhere safe.
2. Open **SQL Editor → New query**. In the Codespace open `supabase/setup.sql`, select everything, copy, paste into the SQL editor and press **Run**. It sets up all the tables and privacy rules. Run it only once.
3. Make your family's data file. Use your own Gmail and your own ID from the sheet (e.g. P005):

```bash
npm run import -- data/my-family.xlsx --admin-email you@gmail.com --admin-person P005 > data/seed.sql
```

4. Open `data/seed.sql`, copy all of it, paste it into a **new query** in the SQL editor and press **Run**. Your tree is now in your database, and you're invited as the admin.
5. Keep this page open. From **Project Settings → API Keys** (and **Data API**) you'll need: the **Project URL**, the **publishable key** (`sb_publishable_…`) and the **secret key** (`sb_secret_…`). **Never put the secret key in any file.**

## 5. Your settings

Open `site.config.json` in the Codespace and fill in:

| Line | What to write |
| --- | --- |
| `familyName` | Your family's name, e.g. `Sharma Parivar` |
| `appName` | A short name for the phone home screen (up to 14 letters) |
| `siteUrl` | `https://` + your domain |
| `apiUrl` | `https://api.` + your domain |
| `emailFrom` / `privacyEmail` | e.g. `family@yourdomain` and `privacy@yourdomain` |
| `admin.name`, `admin.shortName`, `admin.phone` | You. Your name and mobile go on the family's emails so relatives know they're genuine. |
| `supabaseProjectUrl`, `supabasePublishableKey` | From step 4.5 (not the secret key) |
| `familyStoryHint` | The first words of your family story, e.g. `Our family comes from…` |
| `community` | Your family's traditions: `hindi`, `punjabi`, `bengali`, `marathi`, `gujarati`, `urdu`, `tamil`, `telugu`, `kannada`, `malayalam` or `english`. Family words, menus, calendar and festivals follow it. Each relative can still pick their own in Theme → Traditions. |
| `emailSignIn` | `true` with your own domain; `false` on the free setup (Google sign-in only) |

Then check and save:

```bash
npm run check
git add site.config.json reminders/wrangler.toml
git commit -m "Our family settings"
git push
```

`npm run check` tells you anything that's missing. Only ever `git add` those two files: never `data/`.

## 6. Put the helper service online (Cloudflare Worker)

This small service sends the emails and reminders, and connects the website to the database (some Indian internet providers block Supabase's own address, so the site talks to `api.yourdomain` instead).

1. In Cloudflare: **Workers & Pages → Create → Import a repository**, choose your repository, and set the **root directory** to `reminders`. Deploy.
2. Open the Worker → **Settings → Variables and Secrets** and add these as **Secrets**:
   - `SUPABASE_SERVICE_KEY` – the secret key from step 4.5
   - `RESEND_API_KEY` – from step 8 (come back for it)
   - `REMINDER_EMAIL` – your Gmail (daily reminders and health alerts come here)
   - `PREVIEW_KEY` – any long random password you make up
3. `api.yourdomain` is attached automatically (it's in `reminders/wrangler.toml`). Wait 10 minutes: the Worker introduces itself to the database on its first run, and the website can't read anything before that.

## 7. Put the website online (Cloudflare Pages)

1. **Workers & Pages → Create → Pages → Connect to Git**, choose your repository.
2. Build command: `cd web && npm ci && npm run build` · Output directory: `web/dist`. Save and deploy (it runs the tests first, so it takes a few minutes).
3. **Custom domains → Set up a custom domain** → your domain.

Every time you `git push`, the site and the Worker update themselves.

## 8. Emails

1. Sign up at **resend.com** → **Domains → Add domain** → your domain. Add the records it shows in Cloudflare **DNS** (Resend can do it for you if you connect Cloudflare). Wait until it says Verified.
2. **API Keys → Create** → put it in the Worker as `RESEND_API_KEY` (step 6.2).
3. Supabase → **Authentication → Emails → SMTP Settings**: turn on custom SMTP. Host `smtp.resend.com`, port `465`, username `resend`, password = the Resend API key, sender = your `emailFrom`.
4. Make the sign-in emails in your family's name, then paste them in Supabase → **Authentication → Emails → Templates** (*Confirm signup* and *Magic link*; the subjects are in `supabase/templates/subjects.txt`):

```bash
cd reminders && npm install && npm run templates && cd ..
```

5. Supabase → **Authentication → URL Configuration**: Site URL = your `siteUrl`.
6. Cloudflare → your domain → **Email → Email Routing**: forward `family@` and `privacy@` to your Gmail, so replies reach you.

## 9. Sign in as the admin

1. Open your website, enter your Gmail and press the button. Open the link in the email.
2. You're in, as admin. Read and accept the privacy agreement.
3. Within 7 days, turn on **2-step sign-in** (My privacy). Admins can see everyone's details, so this is required.

## 10. Bring the family in

- Make one or two relatives from each branch **stewards** (Admin → Members & roles). They add relatives and approve who joins.
- Share `yourdomain/#/join` in the family WhatsApp groups. People sign in and ask to join; a steward checks and lets them in.
- On anyone's profile, **Invite** sends a personal link. For elders, **Set this up for…** makes a QR code with large text.

---

## Optional extras

**Continue with Google** (most relatives prefer it). In Google Cloud Console: create a project → **APIs & Services → Credentials → Create OAuth client ID → Web application**. Authorised JavaScript origins: your `siteUrl`. Authorised redirect URI: `https://api.yourdomain/oauth/google/callback`. Put the client ID in `site.config.json` → `googleClientId`, and in Supabase → **Authentication → Sign In / Providers → Google** (with the client secret). Add the client secret to the Worker as the secret `GOOGLE_CLIENT_SECRET`. Run `npm run check`, commit and push.

**Phone notifications.** Run `npx web-push generate-vapid-keys`. Put the public key in `site.config.json` → `vapidPublicKey`, and the private key in the Worker as the secret `VAPID_PRIVATE`. `npm run check`, commit, push.

**Nightly backups.** In your GitHub repository → **Settings → Secrets and variables → Actions**, add `SUPABASE_DB_URL` (Supabase → Connect → Session pooler connection string, with your password), `SUPABASE_SERVICE_KEY` and `BACKUP_PASSPHRASE` (a long password: write it down offline; without it a backup can't be opened). Backups run only in private copies.

**Make it yours.** The sign-in page shows two soft abstract pictures (`web/public/login/a.jpg` and `b.jpg`). You may replace them with old family group photos, but blur them first so no face can be recognised: these two files are public.

## Something not working?

- `npm run check` catches most setting mistakes.
- The Worker emails `REMINDER_EMAIL` when something breaks, with what to do. You can also open `https://api.yourdomain/ops/health?key=YOUR_PREVIEW_KEY`.
- The website or dashboards may have moved a button since this was written. Look for the nearest match, or ask in the project's Discussions.
