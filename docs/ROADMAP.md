# What's done, and what's still to build

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
- South Indian art (woven borders, kolam, gopuram) shown only with South Indian traditions
- Free setup (Google sign-in on `.pages.dev`) and own-domain setup; hosting and privacy guides

## Gaps, in order of importance

### 1. Setup is still too technical (most important)
A 16-year-old can follow SETUP.md, but it is 10 steps across five websites.
- ~~**Browser setup wizard**~~ — done (Nov 2026): [https://aangan-family.github.io/aangan/](https://aangan-family.github.io/aangan/) (`wizard/`). Checks the sheet in the browser (never uploading it; its CSP blocks every other site), previews the tree, writes `site.config.json`, `wrangler.toml` and `seed.sql`, and walks through each account with the family's own values to copy. Still to add: screenshots for each account step.
- **One-click deploy**: a "Deploy to Cloudflare" button and a script that creates the Supabase tables, keys and secrets through their APIs.
- **Video walkthrough** in Hindi and English.

### 2. Community words need review by native speakers
The packs are a careful first draft. Words vary by region, caste and religion (a Lucknow Muslim family and a Jaipur Marwari family both speak "Hindi" at home, with different words). Needed: a reviewer for each language, and regional variants (e.g. Marwari, Bhojpuri, Sylheti, Konkani, Tulu, Kodava).
- **Missing communities**: Odia, Assamese, Konkani, Sindhi, Kashmiri, Nepali, Manipuri, Khasi, Mizo, Tulu, Kodava, Parsi (Gujarati words with Zoroastrian festivals), Anglo-Indian, Goan Catholic, Syrian Christian (Malayalam with church calendar), Bohra and Khoja (Gujarati Muslim).
- **Festival groups** to add: Odia (Rath Yatra, Raja), Assamese (the three Bihus), Sindhi (Cheti Chand), Parsi (Navroz, Khordad Sal), more regional Muslim and Christian days.

### 3. Pages are in English
Menus are translated; page text isn't. Translating the whole interface (about 1,500 phrases) into ten languages needs a translation system and volunteers.

### 4. Art for every community
North, East and West Indian families get a plain design for now. Ideas: rangoli, phulkari and bandhani borders, alpana, a banyan tree for the generations (instead of the gopuram), crescent-and-star or church motifs for families who want them. The home-screen icon is still a gopuram.

### 5. Emails follow Tamil traditions
Welcome and reminder emails still use the South Indian woven border, and the Worker's reminder calendar knows only the Tamil festivals. They should follow each member's traditions.

### 6. Tradition fields
Gotra and family deity are named per community; sutram and vedam show only with South Indian traditions. Still missing: fields Sikh families use (e.g. the gurdwara or village of the family), Muslim families (e.g. family line), Christian families (baptism, parish), and the milestones list (upanayanam, shashtiabdapoorthi) is Hindu and South Indian.

### 7. Free setup without email
Level 1 (free) has no emails. A free email sender that works without a domain, or a WhatsApp sender, would close the gap.

### 8. Bigger families and lower cost photos
Above a few thousand photos, families need Supabase Pro. Cheaper photo storage (Cloudflare R2, 10 GB free) would let large families stay free.

### 9. Moving between levels
A guided move from Level 1 (`.pages.dev`) to Level 2 (own domain), and an export / import between copies (for when a family splits a tree, or merges with in-laws who also run Aangan).

### 10. Project basics
- A GitHub organisation, issue templates, a code of conduct, a security policy (`SECURITY.md`) and a way to report problems privately
- The name: "Aangan" is already used by an iPhone household app, an NGO and trademarks in other fields (paints, foods, a US restaurant). Fine for an open-source project; before any app-store listing, company or paid service, search the IP India register (classes 9, 42, 45) and consider a distinctive form such as "Aangan Family"
- Automated end-to-end tests of a fresh setup
