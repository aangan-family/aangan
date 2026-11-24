# What's done, and what's still to build

> **Next big step: the hosted edition.** Aangan runs a separate site per family; families never see the technical accounts. See [HOSTED.md](HOSTED.md).

## Done (November 2026)

- Family tree, profiles with per-detail privacy and consent, roles (member, steward, admin), invitations and requests to join
- Children's accounts with parent approval; no tracking of children
- Talk, photos with tag approval, private messages, the bell, phone notifications
- Reminders, welcome emails, weekly family email, health checks, retention, encrypted nightly backups, 2-step sign-in for admins
- One settings file (`site.config.json`) and a settings check (`npm run check`)
- Excel / CSV import with plain-language checks; template and a made-up sample family
- One-paste database setup (`supabase/setup.sql`) and a safe way to add the first admin
- **Community packs**: Hindi, Punjabi, Bengali, Marathi, Gujarati, Urdu, Tamil, Telugu, Kannada, Malayalam, and English only. Family words in English letters and in the community's own script, menus in each language, each relative chooses their own
- **Calendars**: Tamil, Malayalam and Bengali solar months; lunar months (Amanta and Purnimanta) with tithis; Hijri dates
- **Festivals** in groups each person switches on: all-India Hindu, North Indian, Tamil, Kerala, Bengali, Punjabi, Marathi, Gujarati, Telugu, Kannada, Sikh, Muslim, Christian, Jain, Buddhist, national days. Checked against published 2025–26 dates
- Woven borders from every community's dress, on the site and in emails (South Indian kolam and gopuram only with South Indian traditions)
- Free setup (Google sign-in on `.pages.dev`) and own-domain setup; hosting and privacy guides

## Gaps, in order of importance

### 1. Setup is still too technical (most important)
A 16-year-old can follow SETUP.md, but it is 10 steps across five websites.
- ~~**Browser setup wizard**~~ — done (Nov 2026): [https://aangan-family.github.io/aangan/](https://aangan-family.github.io/aangan/) (`wizard/`). Checks the sheet in the browser (never uploading it; its CSP blocks every other site), previews the tree, writes `site.config.json`, `wrangler.toml` and `seed.sql`, and walks through each account with the family's own values to copy. Since 24 Nov 2026 it opens on a colourful aangan landing page with sign-up, and the project keeps a sign-up dashboard (`#admin`) to count who is setting up a site (`project/`). Each account step now has a drawn where-to-click picture (Nov 2026, `wizard/src/pictures.js`).
- ~~**One-click deploy**~~ — done (Nov 2026), untested against live accounts until the first family runs it: **Set up my site** (`.github/workflows/setup.yml` → `scripts/setup.mjs`) creates the Supabase project, tables, keys and sign-in settings (templates, SMTP, Google), the Worker and its secrets, the Pages site and domain, Resend's DNS records and a send-only key, and email forwarding; safe to re-run. **Deploy my site** (`deploy.yml`) redeploys on every push. Still by hand: making the accounts and keys, Google's OAuth client, backups' secrets, loading `seed.sql`.
- **Video walkthrough** in Hindi and English.

### 2. Community words need review by native speakers
The packs are a careful first draft. Words vary by region, caste and religion (a Lucknow Muslim family and a Jaipur Marwari family both speak "Hindi" at home, with different words). Needed: a reviewer for each language, and regional variants (e.g. Marwari, Bhojpuri, Sylheti, Konkani, Tulu, Kodava).
- **Review kit** — done (Nov 2026): a sheet per language in [docs/review](review/README.md) (about 95 relationships plus menus, made from the packs and kept in step by a test) and a *Family words* issue form. Still needed: the reviewers themselves.
- **New communities, first drafts** (Nov 2026): Odia, Assamese, Konkani, Sindhi, Kashmiri, Parsi, Goan Catholic, Syrian Christian. Words we weren't sure of are left out (the English shows); Sindhi, Kashmiri and Goan Catholic words are in English letters only, and Sindhi, Kashmiri, Parsi and Goan Catholic borrow Hindi, Urdu, Gujarati and Konkani menus for now. Each needs a native speaker.
- **More first drafts** (Nov 2026): Nepali, Manipuri, Khasi, Mizo, Tulu, Kodava, Anglo-Indian, Bohra and Khoja, with only the words we're sure of (very few for Manipuri, Khasi, Bohra), their own tradition labels, and new dhaka, phanek, puan and jainsem borders. Each needs a native speaker. Still missing: Sikkimese/Lepcha, Garo, Naga languages, Santali, Bhili, Dogri, Maithili and Bhojpuri as their own packs.
- **Festival groups added** (Nov 2026): Odia (Pana Sankranti, Raja, Rath Yatra, Kumar Purnima, Boita Bandana), Assamese (the three Bihus; Assam's own month rule can put them a day off), Sindhi (Cheti Chand), Parsi (Jamshedi Navroz, Parsi New Year, Pateti and Khordad Sal on the Shahenshahi calendar), Goan Catholic and Kerala Christian feasts, and Ash Wednesday, Palm Sunday and Maundy Thursday. Still to add: more regional Muslim days.

### 3. Pages are in English
Menus are translated. **Page text, first drafts (Nov 2026):** a phrasebook translator (`web/src/lib/i18n/pages.ts`) swaps exact interface phrases for their translation and never touches people's own words; the interface's 1,213 phrases are collected by `npm run phrases`, and the 250 most used are drafted in Hindi and Tamil (Theme → Menus in → **Pages too**). Still needed: native speakers to check and extend Hindi and Tamil, and the other languages.

### 4. Art for every community
**Borders done (Nov 2026):** 22 woven borders from each community's dress (phulkari, khes, bandhani, ajrak, paithani, pheta, laal paar, dhuti, Banarasi, leheriya, chikankari, zardozi, Pochampally, Ilkal, Mysore peta, kasavu, Sambalpuri, mekhela, gamosa, kunbi, kani, gara), chosen in Theme and carried on every email. **Done (Nov 2026):** background floor art by tradition (kolam, rangoli, alpana, jali, vine), a banyan tree for the generations outside the South, and a banyan app icon for those families. Still to do: a weaver's or designer's eye on the drawings, and more motifs (mandana, aripan, sathiya).

### 5. Emails follow each family's traditions
**Done (Nov 2026):** emails carry each member's own border (their Theme choice, else the family's traditions' default); the welcome and sign-in emails speak of the family's own calendar and family words; phone notifications and the weekly email list only the festivals of the family's traditions; the writing help knows the family's words. Still to do: members' own festival and tradition choices live on their devices, so the server uses the family's default for festivals.

### 6. Tradition fields
Gotra and family deity are named per community; sutram and vedam show only with South Indian traditions. **Done (Nov 2026, 0053):** naming, annaprashan and mundan; Amrit Sanchar, Dastar Bandi and the family gurdwara; Aqiqah, Bismillah and Hajj; Baptism, First Holy Communion and Confirmation, each offered by the family's traditions. 60/70/80 celebrations only with South Indian traditions. Still to add: Jain and Buddhist ceremonies, and Parsi navjote.

### 7. Free setup without email
**Done (Nov 2026):** free setups can send sign-in links and reminders through the admin's own Gmail with an app password (up to 500 a day; `reminders/src/smtp.ts`). Still open: a WhatsApp sender.

### 8. Bigger families and lower cost photos
Above a few thousand photos, families need Supabase Pro. Cheaper photo storage (Cloudflare R2, 10 GB free) would let large families stay free. **Not done yet, on purpose:** photo privacy rests on Supabase Storage's row-level rules (invariant 8, tested). Moving files to R2 means the Worker must check every view and upload against the same rules (signed links, deletes when a photo is declined, backups), so it needs its own careful change with privacy tests.

### 9. Moving between levels
A guided move from Level 1 (`.pages.dev`) to Level 2 (own domain), and an export / import between copies (for when a family splits a tree, or merges with in-laws who also run Aangan).

### 10. Project basics
- ~~A GitHub organisation, issue templates, a code of conduct, a security policy~~ — done (Nov 2026): `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue forms, PR checklist. To do in GitHub settings: turn on **Private vulnerability reporting**
- The name: "Aangan" is already used by an iPhone household app, an NGO and trademarks in other fields (paints, foods, a US restaurant). Fine for an open-source project; before any app-store listing, company or paid service, search the IP India register (classes 9, 42, 45) and consider a distinctive form such as "Aangan Family"
- Automated end-to-end tests of a fresh setup (the project sign-up service has a daily live check, `project-check.yml`; one-click setup still needs a live run against real accounts)
