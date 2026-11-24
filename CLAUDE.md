# CLAUDE.md — open-source family website for Indian families

A private family tree + directory any Indian family can run for itself (any community, religion or language).
Relatives sign in, claim their profile, consent, and control the visibility of each detail.
Each family runs its own copy: its own Supabase project, Cloudflare account and domain. The project never holds anyone's data.
**This repository must never contain real family data.** Examples and tests use made-up people only.

## Settings
- `site.config.json` (repo root) holds the family's name, domain, API address, sender email, admin name/phone and public keys.
  `web/src/lib/site.ts` and `reminders/src/site.ts` read it; `web/vite.config.ts` fills `%FAMILY%`-style placeholders in
  `index.html`, `privacy.html`, `manifest.webmanifest`, `_headers` and `.well-known/security.txt`. Never hard-code a domain or a name.
- `npm run check` validates it and copies values into `reminders/wrangler.toml`.
- `templates/` — Excel template + made-up sample family (`npm run template`); `scripts/import-sheet.mjs` → seed SQL (`npm run import`).
- `supabase/setup.sql` = all migrations, each in its own transaction (`npm run sql`; regenerate after adding a migration).
- **Setup wizard** (`wizard/`, Vite, plain JS, published to GitHub Pages by `.github/workflows/wizard.yml` from aangan-family/aangan only): reads the sheet in the browser (`wizard/src/read.js`, exceljs), previews the tree (`tree.js` `buildPreview`), settings form → `site.config.json` + `wrangler.toml`, `seed.sql` made locally, account walkthrough (`steps.js` `accountSteps`, keep in step with docs/SETUP.md). CSP `connect-src 'self'`: it must never send anything to another site; only settings and ticks go in localStorage, never the sheet. Shares `scripts/lib/` (`sheet.mjs`, `sql.mjs`, `config.mjs`) with the command line; tests in `tests/wizard.test.mjs`.
- `0051_first_admin.sql`: on a new site, the SQL editor (auth.uid() null) may add the first admin invitation once.

## Layout
- `supabase/migrations/` — schema, row-level security, storage, consent text. **The privacy model lives here.**
- `scripts/import-familyscript.mjs` — Family Echo FamilyScript → seed SQL (never imports contact details).
- `scripts/make-demo-data.mjs` — preview data for `npm run demo`.
- `web/` — Vite + React + TypeScript static site (Cloudflare Pages). `src/lib/api.ts` is the backend
  interface; `api-supabase.ts` is production, `api-demo.ts` an in-memory preview.
- `web/src/lib/family.ts` — tree model; `sides` are married-in families (no depth limit), reached through the spouse.
- `web/src/components/FamilySections.tsx` — Family page: banner, story, traditions' roots (`family_info`, admin-edited), Coming up, what you can do, privacy levels.
- Home page (called **Home** in the menus, so it isn't confused with Family tree) = `components/Overview.tsx`: bento of tiles (wide screens: hero spans 3 of 4 columns at 3:2 with a gentle drift so the whole family photo shows) (hero with family photo + animated mesh, You, Coming up, Talk, Photos,
  Story, Roots, Generations, Find) that jump to full sections below; sticky `SectionNav` with scroll-spy; sections fade in (`.hsec.in`).
  CSS-only animation, all off under prefers-reduced-motion.
- Hero slideshow (0016): `family_info.hero_photos` (jsonb `[{path, caption}]`, files only in private `photos/family/`, admins edit via **Family photos** → `BannerSheet`); `components/HeroSlides.tsx` crossfades and slowly pans each photo (9 s per slide), progress dots + caption; still under reduced motion.
- `web/src/lib/richtext.tsx` — safe formatting for the family story (`**bold**`, `*italic*`, `## heading`, lists, quotes, https links only); rendered as React elements, never raw HTML.
- Mobile-first: phones get a bottom tab bar (`TabBar.tsx`: Home, Tree, Talk, Messages, More) and the full-screen tree (`pages/Tree.tsx`, `#/tree[/<id>]`);
  `TreeList.tsx` (`useTreeList`, used by the Family tree page; the menu's "Browse the family" list was removed Nov 2026 as a duplicate) always highlights the signed-in person ("You") and their line, and (0039) shows a dot on every living person: green = signed in (`signed_in_people()`, `snap.signedIn`), red = not yet. `MeCard.tsx` puts you first on the Family page.
- `web/src/components/MentionMenu.tsx` — @-mention suggestions in `RichEditor` (`mentions` prop; joined people first).
- Writing help (0021): `components/WritingHelp.tsx` in `RichEditor` and the Messages composer: **Help me write** ✨ (Fix grammar / Make it clearer / Shorter / Warmer → Use this / Keep mine) and the 🎤 Speak button (press and hold, or tap + ■ Stop; ≤60 s; `lib/wav.ts` converts to 16 kHz mono WAV).
  Runs on Cloudflare Workers AI via the Worker (`reminders/src/ai.ts`, `/ai/rewrite`, `/ai/voice` on the API address (site.config.json apiUrl)): Whisper turbo transcribes (auto language), Llama 3.3 translates to English if needed; mentions are masked as ⟦M1⟧ so they survive. `Permissions-Policy: microphone=(self)`.
- `web/src/pages/Talk.tsx` — conversations (`#/talk[/<uuid>]`): categories, ideas to start, replies with quote-reply, reactions; polls every 15 s while open.
  `components/RichEditor.tsx` — shared editor (formatting, emoji, preview). The site is an installable web app (`public/manifest.webmanifest`, `InstallApp.tsx`; icons = gopuram on kolam, made by rendering `Gopuram.tsx`). `public/sw.js` handles notifications only (no fetch handler), so nothing private is cached.
- Invitations: `lib/invite.ts` personal links `#/join/<base64url email>` (fragment only; pre-fills the sign-in page), `components/InviteShare.tsx`
  (WhatsApp / copy / "Email a sign-in link now" = `signInWithOtp` for their address). Admin page and members' own invitations have **Share**.
  **Join by request** (`#/join` link for WhatsApp groups): a login without an invitation gets the request form (`Gate.tsx` `NotInvited`);
  stewards/admins review in Admin → Requests to join (`components/JoinRequests.tsx`, `suggestMatches()`), notified by email from the Worker.
  Admin page is open to stewards (Requests to join, No email yet); roles are chosen in Members & roles. Under-18s can be approved too (0034: a parent then consents and checks what they add).
  Admin → **No email yet** (`components/NoEmailList.tsx`): living adults not joined/invited, grouped by branch, with joined close relatives to ask; copy/WhatsApp list (names only, never contacts).
- Bring the family in (Nov 2026, `components/BringFamily.tsx`): Home **Bring in your family** (`InviteNudge`: 3 closest unjoined adults by `closeRelatives()` in `lib/invite.ts`; **Ask on WhatsApp** = `joinRequestMessage()` with the `#/join` link, **Invite by email** = `InviteSheet`; "Not now" hides it 14 days, localStorage), **Who's here, by branch** (`BranchProgress`: `family.branch` heads, joined/living counts, names only, tap for who isn't on), **Set this up for …** (`ElderSheet`, profile of a living relative 60+ not joined: invite, QR code (`qrcode`, data: URL) or WhatsApp of `elderLink(code, tamil)` = `/?elder=1[&ta=1]#/invite/<code>`; `applyElderLink()` in `main.tsx` sets Larger text and Tamil menus on that phone, then tidies the address).
- Tamil menus (`lib/menulang.ts`): Theme → **Menus in** English/தமிழ் (localStorage `fam-menu-lang`, `data-menu` on `<html>`); `useT()` translates Sidebar, TabBar, Breadcrumbs and Add to home screen from `TA`; test checks every menu label has Tamil. Pages stay English.
- Google sign-in uses Google Identity Services (`lib/google.ts`, button on our domain → `signInWithIdToken` with a hashed nonce), falling back to
  the redirect flow; `InAppNotice` warns inside WhatsApp/Instagram webviews (Google blocks them) with an Open-in-Chrome intent. CSP allows accounts.google.com/gsi.
- **supabase.co is blocked by Indian ISPs.** On our sites the app talks to `https://the API address (site.config.json apiUrl)` (`api-supabase.ts` `API_PROXY`),
  a pass-through in the reminders Worker (`reminders/src/proxy.ts`, custom domain route). The production bundle never contains the project address or the legacy anon key (0044 review): only `API_PROXY` and the publishable key (`sb_publishable_…`, in `api-supabase.ts`); `VITE_SUPABASE_URL` is read only in dev builds. Session storageKey is `fam-auth` (`moveOldSession()` moves old `sb-<ref>-auth-token` sessions).
  Sign-in emails link to `{{ .SiteURL }}/#/auth?token_hash=…` and the app calls `verifyOtp` (no supabase.co hop). Microsoft, Yahoo and Google's full-page fallback
  are finished by our own broker (`reminders/src/oauth.ts`, `/oauth/{azure,yahoo,google}/{start,callback}` on the API address (site.config.json apiUrl); Google needs `GOOGLE_CLIENT_SECRET` and the redirect URI in Google Cloud): code exchange with
  the app secret, ID-token checks (issuer, audience, nonce, expiry; Microsoft personal accounts only; Yahoo verified email), then
  `admin/generate_link` (server key) → `<site>/#/auth?token_hash=…`. State/nonce in an HMAC cookie keyed from the server key. Nothing in the browser talks to supabase.co any more (CSP no longer allows it).
  Server key: the Worker and `backup-photos.mjs` send it with `serverHeaders()` (`reminders/src/keys.ts`): new secret keys (`sb_secret_…`) only as `apikey`, the old service_role JWT in both headers. The backup workflow derives the project address from `SUPABASE_DB_URL`.
- Help: `lib/help.ts` (FAQ items by section, role-aware; test checks every **bold** label exists in the UI), `components/Help.tsx`
  (`HelpTip` "?" beside page titles; `SuggestCorrection` → WhatsApp to the admin for members), `pages/Help.tsx` (`#/help[/<section>]`, searchable).
  Keep answers true to the UI when changing labels.
- **What's New!** (`#/whats-new`, everyone): `lib/whatsnew.ts` `RELEASES` (plain-language release notes, newest first; add one at the top whenever members can see or use something new), `pages/WhatsNew.tsx`; sidebar blue dot until opened (localStorage `fam.whatsnew.seen`).
- **DevCenter** (`#/devcenter[/<section>]`, admins only, 0025): the operations handbook, kept in the `dev_docs` table (never in code: the site bundle is public), `pages/DevCenter.tsx` with search, contents, Edit/New section; rendered by `RichText extended` (tables, `code`, `- [ ]` checklists). Keep it in step with docs/OPERATIONS.md.
- Breadcrumbs (`components/Breadcrumbs.tsx`, labels in `lib/crumbs.ts` `crumbsFor()`): sticky "you are here" bar + **Back** at the top of `main` on every page except Home. Back uses browser history only within this visit (`history.state.famDepth`), otherwise goes one step up the trail (`parentHref`). Add a case for every new route; phones show only the last two steps.
- Menu (`components/Sidebar.tsx`): groups Family / Conversations / You / Help / Admin; **Theme** opens `ThemePicker`.
- Scrolling: the page frame (html, body, #root, .layout) never scrolls; only `main` and inner lists do. Use `revealIn()` from `lib/scroll.ts`, never `el.scrollIntoView()` (it scrolls overflow:hidden ancestors too and shifted the whole page on iPhone); `App.tsx` calls `pinShell()` if anything nudges the frame.
- Text size (Theme → **Text size**): `lib/theme.ts` `applyTextSize()` sets `data-text` on `<html>` (localStorage only, per device); CSS `zoom` on `main` (1.12 / 1.25). Never put `contain`/`container-type`/`isolation` on `main`: it traps pop-up sheets under the tab bar; container queries use `.ovbox` (Home) and `.treegopuram`.
- Themes (0026, spec in `web/DESIGN.md`): `lib/theme.ts` sets `data-theme` (colours: blue…lotus; styles: clean, spotlight, playful (0027, after shadcn / Magic UI–Aceternity / React Bits), instagram, glass, aurora) and `data-mode` (auto/light/dark) on `<html>`, saved in localStorage and `member_prefs.theme/mode`. Write every dark rule both as `@media (prefers-color-scheme:dark){html:not([data-mode=light]) …}` and `html[data-mode=dark] …`.
- Traditions (0028, spec in `web/DESIGN.md`): `lib/heritage.ts` (`borderFor(gender, pref)`: men → mayil kann veshti red/blue, women → Kanjeevaram saree green/red, others → green saree; `pageName()` Malayalam + Tamil names) and `components/Heritage.tsx` (`WovenBorder` full/slim, `Thoranam`, `Scripts`/`PageNames`, `KolamBackground` sticky at 5–6%, `KolamMark`, `Lamp`, `Marigold`, `useHeritage()`; the door welcome was removed by design (Nov 2026); Theme picker choices apply at once via `setHeritagePrefs`). `components/Gopuram.tsx`: generations as temple tiers (Home tile compact, full on Family tree). Tamil/Malayalam use system fonts (CSP font-src 'self'; no Google Fonts). Gender comes from `persons.gender` of the signed-in person.
- `web/src/pages/Photos.tsx` — shared photos and tags; `lib/updates.ts` — the bell (`Bell.tsx`: header fixed, only the list scrolls).
- Photos in Talk: a line `![caption](photo:<uuid>)` (`richtext.tsx` `PHOTO_LINE`, `photoToken`, `photosIn`, max 8 per post) rendered by `components/PostPhoto.tsx` only from `snap.photos` (so only photos the viewer may already see; otherwise "Photo not available"); 📷 in `RichEditor` (`photos` prop) opens `PhotoPicker.tsx` (From Photos / Upload new → `sharePhoto` returns the id, so new pictures land in Photos with the same tags and consent). No new table. The Worker masks photo lines like mentions for Help me write and shows them as "📷 caption" in mention emails.
- Get the app (0033): `components/GetTheApp.tsx` + `lib/app.ts` (`platform()`: installed / inapp / ios-safari / ios-other / android / desktop). Phones in a browser get a "Get the family app." sheet 3.5 s after load (never over another sheet; once a day, 5 times max, "Don't ask again" after 2), with picture steps per platform or Android's native install prompt (`beforeinstallprompt`). First launch from the home screen: "You're all set." + Turn on notifications (once per device). Installed devices set `member_prefs.app_at`; Admin → Members & roles shows **App** via `member_activity()` (admins only). Menu **Add to home screen** (`InstallApp.tsx`) reuses `AppSteps`.
- Sharing a conversation: **Share** on a Talk thread (`components/ShareLink.tsx`): Copy link / Send on WhatsApp / phone share sheet, with an editable message; only the link and the sharer's own words leave the site. Signed-out visitors keep the link (`lib/returnto.ts`, localStorage `fam.next`, 1 h, page addresses only) and it opens after sign-in; the sign-in page says a conversation was shared.
- Gothram/sutram/vedam/kuladeivam (`traditions.ts` `tradition()`): own record wins; otherwise a married woman takes her husband's (his record or
  what he carries), never her father's ("Not recorded yet" for gothram if unknown); sons and unmarried daughters take their father's; the founder
  (`family_info.roots_person_id`) carries `family_info`. Applies to every family in the tree. A daughter counts as married only if her husband is in the tree.
- Relationship wording never says "once removed": cousins in other generations are "first cousin's son" / "father's first cousin".
- Calendar (`pages/Calendar.tsx`, `#/calendar[/YYYY-MM[-DD]]`): `lib/calendar.ts` marks Tamil dates, nakshatram/tithi (sunrise), lunar months (amanta, adhika),
  festivals (solar-month + star/tithi, lunar-month + tithi rules; tested against published 2025–26 dates) and monthly days; `lib/familyDays.ts` adds birthdays,
  Tamil birthdays, remembrance, shraddham and wedding anniversaries (living partners need consent). Couples set their own date via `set_wedding()` (0010).
- `web/src/lib/wishes.ts` — Coming up shows who each person is to you (`relationToMe()` + Tamil term) and **Send a wish** (`wishRecipient()`, `wishText()`): opens Messages with the wish pre-typed (`draft`), addressing elders by the Tamil word.
- `web/src/lib/tamil.ts` — Tamil (Iyer) kinship terms; `panchang.ts` — Tamil month, nakshatram, tithi (Lahiri) for reminders.
- `web/public/privacy.html` — public privacy notice (required by Google sign-in). No family data.
- `reminders/` — Cloudflare Worker (cron 07:00 IST): monthly digest on the 1st + daily occasion messages to the
  admin by email (Resend) with "Send on WhatsApp" (wa.me) buttons, plus CallMeBot WhatsApp if keys are set. Reads only `reminder_feed()` (server key, no website access).
  Living people's ages/years are never sent; birth dates not shared with the family are marked 🔒 / sent as a private note.
- Sending (`reminders/src/mail.ts`): every email goes through `sendEmail()`/`sendBatch()`: From `<familyName> <emailFrom>` (Cloudflare Email Routing forwards family@ and privacy@ to the admin), plain-text part with the same footer, unique `X-Entity-Ref-ID`, `List-Unsubscribe` on optional kinds (mentions), Resend `category` tag; steward/admin notices are one email each via the batch endpoint (no BCC lists); no open/click tracking. DNS: DKIM `resend._domainkey`, return-path `send.` (Resend), root SPF `-all`, DMARC `p=reject` (since 22 Nov 2026, after a clean week of reports: all Resend mail aligned) with Cloudflare DMARC reports.
- Email heritage (0050, a core feature): every email starts with the reader's woven border (veshti red/blue for men, Kanjeevaram saree green/red for women, green saree otherwise, own Theme colour wins) and the mango-leaf thoranam under it. PNGs in `web/public/email/` drawn from `Heritage.tsx` (no family data); `layout()` writes `BORDER_TOKEN`, `payload()` swaps in the recipient's border from server-only `email_borders()` (Worker `loadBorders()` before email jobs). Supabase sign-in templates use the default green saree.
- Emails: `reminders/src/brand.ts` is the shared email look; `welcome.ts` is the welcome email (queued by `0011` when a member is
  linked to a person, sent by the Worker every 10 min via `welcome_due()`/`welcome_sent()`); `auth-templates.ts` → `npm run templates`
  writes `supabase/templates/` (Confirm signup, Magic link), pasted into Supabase → Auth → Emails. Signed by the admin with their phone .
- **This week in the family** (0049): Sunday email after the 7 am run (`sendWeekly()` in `reminders/src/index.ts`, `reminders/src/weekly.ts`): coming 7 days' shared birthdays, remembrance days, festivals (`upcoming()`, same rule as daily pushes) + last 7 days from server-only `weekly_digest(wk)` (joins, Talk titles and reply counts, photo count without declined ones, notices to everyone; null once `weekly_sent(wk, n)` recorded it in `weekly_emails`). Off switch `member_prefs.email_weekly` (My privacy **This week in the family**). Preview with live data: `GET /weekly?key=<PREVIEW_KEY>[&date=…]`.
- Health checks (0022): `reminders/src/health.ts` runs after the 10-minute email jobs: website, database (`ops_queues()`), Auth, Storage, Workers AI (every 6 h), Microsoft/Yahoo app secrets (hourly `probeProvider()` in `oauth.ts`: redeems a made-up code, invalid_grant/INVALID_AUTHORIZATION_CODE = secret accepted, invalid_client = wrong/expired; result kept in `ops_runs` `signin_ms`/`signin_yahoo` and reused between hourly runs), stuck email queues, the 7 am digest (`ops_record()` from each job), secrets.
  `ops_alerts_sync()` decides new / 24 h reminder / cleared; alert email to REMINDER_EMAIL with a fix per problem (`FIX`, mirrored in docs/OPERATIONS.md). `GET /ops/health?key=<PREVIEW_KEY>` (also on the API address (site.config.json apiUrl)) shows the checks.
- Retention (0023): `retention_run()` (server key) runs nightly after the 7 am digest: decided join requests 90 d, unused invitations 6 mo (with their audit rows), sent/expired email queues and `ai_usage` 30 d, closed alerts 90 d, audit log 3 y, audit rows about a person deleted >1 y ago. `audit()` skips deletes while `fam.retention` is on (set only inside the function). Periods are stated in privacy.html.
- Backup: `.github/workflows/backup.yml` nightly 02:00 IST (DB; photos on Sundays via `scripts/backup-photos.mjs`), gpg AES256 with `BACKUP_PASSPHRASE`, private artifact kept 30 days; secrets `SUPABASE_DB_URL` (session pooler), `SUPABASE_SERVICE_KEY`, `BACKUP_PASSPHRASE`. Restore test: `.github/workflows/restore-test.yml` (4th of each month + by hand) decrypts the newest backup and runs `scripts/restore-test.sh` (throwaway Postgres on the stubs; prints counts and error headlines only, never rows).
- Deploys run tests first: `web` build = `vitest run && tsc && vite build`; Worker `[build] command = "npm test"` in wrangler.toml.
- `tests/` — `run_rls_tests.sh` (privacy rules on real Postgres with Supabase stubs), importer tests.
- `data/` — family files and generated SQL. **Git-ignored. Never commit family data.**

## Privacy invariants (do not break; add a test in tests/rls_test.sql for any change)
1. Signed-out visitors and logins without an invitation see nothing (a login without an invitation sees only its own join request).
   The only imagery on public pages is `web/public/login/*.jpg` behind the sign-in box (`GateBackdrop.tsx`): abstract by default;
   a family may use its own photos only pre-blurred from ~120 px copies so no face is recognisable. Never put a sharp family photo in `web/public`.
2. The tree (persons, parent_links, partnerships) holds only names, relationships, birth year and death facts.
   Everything personal is a row in `profile_fields` with its own `visibility` (family / close / private).
3. A living person's details are visible to others only while they have an active consent
   (`consents.withdrawn_at is null`). Consents are never edited or deleted, only withdrawn and replaced.
4. Roles (0013): member / steward / admin. Only `can_manage(person)` may write a person's details: `can_consent` (themselves,
   a parent while under 18, a child once they have passed away, a named manager, an admin) or — only while the person hasn't
   joined — a steward or a close relative. Once someone joins, their details are theirs. Consent is only ever given by `can_consent`.
5. No contact fields (phone, email, address) for under-18s. Photos of anyone are shown only if their consent allows.
6. Structural changes to the tree (people, links, partnerships): stewards and admins add and correct; only admins delete (trigger).
   Since 0038 every adult member may also correct the tree details (`persons`: names, gender, birth year, passing) of themselves and their close family (`can_edit_tree()` = steward or `is_close(my_person_id(), p)`; profile **Edit tree details**, store `canEditTree`); `persons_member_edit_guard` stops members changing id/sort_key/created_* and marking someone who has joined as passed away. Under-18s can't. Adding/removing people and links stays with stewards/admins.
   Admins remove a person with `delete_person()` (0014; profile **Delete** button → `DeletePersonSheet`, warns with `cutOffBy()`): never someone who has joined, never themselves.
7. Every change is written to `audit_log` by triggers.
8. Photos are in a private bucket, served only through short-lived signed URLs; EXIF is stripped client-side.
9. The production build must never contain `demo-data.json` (enforced in `vite.config.ts` and `npm run build`).
10. `persons.sort_key` holds only birth year + rank (`1983.002`), never a full date (check constraint). Full dates live in `profile_fields`.
11. Tradition fields: gothram/sutram/vedam/native_place/kuladeivam/shraddha_tithi/milestones (incl. `engagement` date + `engaged_to` name, 0040: edit form shows them for living people not yet married) default to family;
    `janma_nakshatram` to close family; `horoscope` to only-me. Star and tithi are stored as `Month|Value`.
13. Shared photos (`photos`, `photo_tags`, files in `photos/album/`): any member shares; only the uploader or an admin edits/deletes.
    A tag of a living person is shown only once approved by them (or whoever manages them) and while their consent allows photos and tags;
    a person whose consent says no tags can't be tagged. Declining hides the photo from everyone except the uploader, admins and that person.
14. The bell is built only from rows the viewer can already read (plus `recent_joins()`: person and date, never emails; since 0037 "joined" = `members.first_signin_at`, set by a trigger on `auth.users.last_sign_in_at`, because sending a sign-in link creates the login before anyone signs in). No separate notification store.
   @-mentions (0017): written as `@[Name](person:ID)`; `threads/thread_posts.mentions` are generated from the text (can't be forged).
   The bell shows "mentioned you" / "replied to you" from those readable rows (`lib/updates.ts`), refreshes every 3 min, and puts the count
   in the tab title and app badge. Mention emails: server-key-only queue `mention_emails` (trigger on insert/edit, only newly mentioned
   joined members, never the author, respects `member_prefs.email_mentions`), sent by the Worker every 10 min (`reminders/src/mentions.ts`).
15. Any member may invite (`invitations_new` trigger): only as `member`, only a living relative (under-18s too since 0034) in the tree who hasn't joined and has no open invitation,
    max 25 open per member, `invited_by` always stamped; since 0035 nobody (admins included) can invite someone who has joined or already has an invitation waiting. Members see/cancel only their own invitations; others see only who is invited (`invited_people()`), never emails.
    0024: a plain member's invitation has `approved_at` null and links nobody (`accept_invitation` needs approval) until a steward/admin calls
    `approve_invitation()` (Admin → Requests to join → **Invitations to approve**, emailed via `invites_due()`); stewards'/admins' are approved at once.
    Links are `#/invite/<12-char code>`; signed out, `invite_hint(code)` gives only a masked email. Old `#/join/<base64 email>` links still work.
16. Talk (`threads`, `thread_posts`, `reactions`): visible to every member, nobody else. Author/person/time stamped by triggers; only the author edits,
    author or admin deletes; only admins pin or close; closed threads take no replies; reactions are a fixed emoji set and only removable by their owner.
17. Wedding dates live on `partnerships.start_date/place`; besides admins, only `set_wedding()` (either partner or their manager) and `set_couple(a, b, 'married'|'engaged', date, place)` (0041: also stewards; married/engaged only) may change them. 0042/0043: personal `marital_status` profile field (single/engaged/married/widowed only; separated, divorced and "looking for an alliance" were removed by design as too sensitive, so never add them back), own visibility, under-18s only 'single' by trigger `marital_status_guard`; profile Status fact: own choice wins, else a living married/engaged partner in the tree. An `engaged` partnership's start_date is the engagement date; `family.engaged` / `isEngaged()`: tree shows "· engaged", wording says fiancé/fiancée, traditions don't treat her as married, no anniversary.
19. The sign-in broker only issues a sign-in for an email the provider has verified (no work/school Microsoft accounts),
    only redirects back to our own sites, and adds no access: invitations still decide what anyone sees.
18. The welcome queue (`welcome_emails`, `welcome_due()`, `welcome_sent()`) is server-key only: it returns email addresses.
20. Join requests (`join_requests`): any login without membership may ask (one open at a time, stamped user/email); the requester
    sees only their own; stewards/admins see all and decide only via `approve_join()` (links the account through an invitation)
    or `decline_join()`; the phone number is deleted on decision; `join_requests_due()` is server-key only.
21. Change logs (0015): `audit_log` stays admin-only to read directly. Members read one person's history only through
    `profile_log(person)` (profile **Show logs**, `components/ProfileLog.tsx`, wording in `lib/changelog.ts`): values only where the viewer
    could see that version today (`can_see`), photos never as values, hidden details as "a detail you can't see" with no field name;
    who = their place in the tree, never an email. Join requests stamp `decided_by_person` (shown as "Approved by …").
22. Presence and chat (0018). Presence: `heartbeat()` every ~45 s while the site is in front; online = last 2 min; raw
    `member_presence` is server-only; members get `{people:[{p, seen}], unread}`; `member_prefs.show_online=false` hides you as
    online/last active, and you then can't see others' either. Chat: `dm_conversations` (exactly two members, `dm_open(person)`
    only for someone who has joined) and `dm_messages`: readable/writable only by the two participants (not admins), sender
    stamped and checked, delete own only, sending stops when the other is no longer active. Audit records message metadata only
    (`dm_audit()`), never the text. UI: `lib/presence.tsx` (`PresenceProvider`, `StatusDot`), `components/Online.tsx`
    (green "online" button + Messages button in the top bar), `pages/Chat.tsx` (`#/chat[/<personId>]`, polls every 4 s).
23. Admin messages (0019): `dm_broadcast(body)` (admins only) sends a private message from the admin to every active member;
    the welcome message (`family_info.welcome_dm_on/welcome_dm/welcome_dm_from`, sender must be an active admin or steward) is sent
    once by the `members_welcome_dm` trigger when a member first becomes active with a person. `{name}` = recipient's first name.
    UI: Admin → **Messages** (`components/AdminMessages.tsx`). Phones: Messages replaces Me in the bottom bar (unread badge).
24. Replacing a login (0020): `approve_join_replacing(req, person)` (admins only) approves a join request for a person who already has a
    login with another email: deletes the old login (auth user + member row, cascades), links the new one via `approve_join`, keeps the
    old role, never the last admin or yourself. UI: **Approve and replace old login** on the request card. Audited.
25. Writing help (0021): the Worker runs AI only after `ai_allow(what)` succeeds with the member's own token (active members only; daily allowance 60 rewrites / 40 voice, counted in `ai_usage`, which members can only read for themselves).
    Nothing written or spoken is stored or logged; results only go into the member's own text box and are never sent without them pressing send.
26. Health status (0022): `ops_runs`, `ops_alerts` and the `ops_*` functions are server-key only and hold machine status only (counts, job names, short errors), never names or emails. Not audited by design (they change every 10 min).
27. Retention (0023): only `retention_run()` deletes on a schedule, never the tree, profiles, consents, Talk, photos or messages; its deletes leave no audit copy of the removed data, only a counts-only summary row. Keep privacy.html's "How long things are kept" in step.
28. Security review (0024, handbook tab "Security review (VAPT)"): no security-definer function in public is executable by `anon`
    except `invite_hint`; person-fact helpers (`household`, `is_minor`, `has_consent`, `is_close`, `has_joined`, `photo_*`, `tags_refused`) return
    nothing unless `is_member()` (or the server, `auth.uid()` null). Max 20 new join requests per 24 h. The Worker rate-limits the API address (site.config.json apiUrl)
    (300/min per user or IP, `reminders/src/limits.ts`; stops are recorded as `ops_record('reading')` → health alert) and key pages (10 tries/min/IP).
    Photo signed links last 10 minutes (store renews every 8). Join approval needs the "I've checked" box. My privacy → **Sign out everywhere**.
    0044: trigger functions are not executable by anon/authenticated (tested); every public function has a fixed search_path (tested).
    0045: sign-in accounts never keep a password (`auth_user_guard` trigger clears `encrypted_password` on every insert/update) and members can't change their sign-in email (a new address goes through Approve and replace old login). The API address (site.config.json apiUrl) pass-through forwards only `/rest/v1`, `/storage/v1/object` and the auth steps we use (otp, verify, token refresh/id_token/pkce, GET user, logout); everything else is 404 (`proxy.ts` `allowed()`), and photo files get `CSP: sandbox` + nosniff. Sign-in email requests: 5/min per IP in the Worker (`MAIL_LIMIT`); Supabase project cap 20 emails/h.
    0047 (after the 22 Nov probe): `auth_user_guard` refuses new sign-ins from throwaway/made-up domains and reserved .example domains (`blocked_email()`); PostgREST pre-request `private.check_request()` (set on role authenticator, `pgrst.db_pre_request`) refuses anon/authenticated requests without header `x-fam-proxy` = HMAC(server key, 'fam-proxy-v1') (`keys.ts` `proxyToken`), added by `proxy.ts` and `ai.ts`; the Worker registers only its SHA-256 every 10 min (`proxy_token_set`, `proxy_tokens`, last 2 days kept). So supabase.co can't be called directly with the data API. Emergency off: `alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config';`.
29. DevCenter (0025): `dev_docs` is readable and writable only by active admins (RLS `is_admin()`), audited, stamped with `updated_by`. Handbook text names accounts and people, so it never goes into the website's code or `web/public`; never put passwords or keys in it.
30. Member activity (0029, app date 0033): `member_activity()` returns user id, last sign-in, welcome-email date and first home-screen launch (`app_at`) only (no emails), and only for active admins; Admin → Members & roles shows **Last sign-in**, **Welcome email** and **App**.
31. Phone notifications (0030): `push_subscriptions` (device push address + keys) is never readable by members (only `push_subscribe/push_unsubscribe/push_my_devices`, no keys returned); audited without address or keys. `push_queue` is server-only, filled by triggers (DMs, mentions, join requests, invitations to approve) and the 7 am run (`push_daily`: shared birthdays, remembrance days, festivals; never Tamil birthdays or shraddhams). Payload says who, never what (never message text). Per-kind switches + quiet hours in `member_prefs`. Sign out removes this device; Sign out everywhere removes all. Worker: `reminders/src/push.ts` (VAPID + RFC 8291 in WebCrypto), cron every minute; `VAPID_PUBLIC` in wrangler.toml and `web/src/lib/push.ts`, `VAPID_PRIVATE` a Worker secret.
32. Notify everyone (0031, chosen people 0032): `announcements` readable by members (only the chosen `to_persons` when set, plus the sender), written only by `announce(title, body, url, to_persons)` (active admins, 10 a day, links only inside the site `#/…`), deleted only by admins, never edited, audited. It puts a 📣 item in every bell (`lib/updates.ts` kind `news`) and queues push kind `news` for members with `member_prefs.push_news` (on by default). The text is the admin's own notice, never anyone's private data. `announce_reach()` gives admins counts only. UI: Admin → Messages → **Notify everyone** (`components/NotifyEveryone.tsx`). 0048: **Also email them** (`announce(..., email)`): server-key-only queue `news_emails` (`news_due()`/`news_sent()`, sent rows deleted at once, unsent after 3 days), active members with a person except the sender, `member_prefs.email_news` (My privacy **Family news by email**), max 2 emailed notices a day; Worker `reminders/src/news.ts` sends one email each via the batch endpoint, with List-Unsubscribe.
33. More notifications (0032): push kinds `family` (close family, `is_close`, only for family/close-visible details of a person whose consent is active, never private ones; one per person per 6 h), `talk` (new conversation to all; replies to the people in that conversation; 1 h per thread), `photo` (new photos; 2 h per uploader), `tag` (you were tagged, follows `push_mentions`). Switches `push_family/push_talk/push_photos`. All say who, never what; `push_once()` dedupes by tag; every trigger catches its own errors so saving never fails.
34. Under-18s (0034, DPDP Act): they can join (approve_join/invitations allow them) and see the site, but never consent for themselves (`can_consent` excludes a minor's own row; a parent, named manager or admin consents) and can't write anything directly: Talk, photos, tags and profile edits raise for `am_minor()`. Instead `child_submit(kind, payload)` (detail / thread / reply / photo, 30 waiting max, no contact fields) puts it in `child_drafts`, readable only by the child and whoever can consent for them (not the child's own consent); `child_decide(id, approve)` publishes it as the child (`fam.as_author`, set only inside that function, read by `acting_author()` in the stamp triggers) or declines it (declined photo files are deleted); decided drafts keep no content. Parents are notified (push kind `child`, bell action item, menu **Waiting for your OK**, page `#/child` `pages/ChildApprovals.tsx`); a child joining asks the parents for consent. No tracking of children: no presence recorded or shown (`heartbeat`), no writing help (`ai_allow`). A child sees all of their own details (`can_see`) and suggests changes with **Suggest a change** (`EditSheet draft`). Contact fields stay blocked (invariant 5). Private messages work as for adults (design choice).
35. Family Admin contact (0036): the site's own admin login (earliest active admin with no person, `site_admin_uid()`, members only) is addressed as `site` in Messages (`dm_open('site')`, `dm_list().other_person = 'site'`, `#/chat/site`, shown as "Family Admin" with a lamp avatar; `components/SiteAdmin.tsx` `SITE`, `SiteAvatar`, `useIsSiteAdmin()`, `SiteAdminCard`: signed in as that account, Home "You" tile, Tree MeCard and the top-bar avatar show the Family Admin persona; no My profile). It is never a person: no tree row, no presence, not in New message. Push says "Family Admin sent you a message".
36. Admin 2-step sign-in (0046): `is_admin()` is true only for an active admin who either has a verified TOTP factor and a session with `aal2`, or has none yet and became admin (`members.admin_since`, stamped by `members_admin_stamp`, which members can't change) less than 7 days ago. `admin_mfa_run()` (server only, Worker every 10 min) messages admins without 2-step from the Family Admin account (`site_admin_uid()`) on day 0 and every day after, demotes them to member on day 7 (never the last admin: `keep_one_admin`), thanks them once when it's on (`mfa_stage` 100), and restarts the 7 days if 2-step is removed. UI: `components/TwoStep.tsx` (`TwoStepBanner` on every page for admins: set up with countdown, or **Unlock admin tools** with today's code; `TwoStepCard` in My privacy; `TwoStepSetup` sheet), `lib/twostep.ts`, Admin → Members & roles **2-step** column (`member_activity().two_step`). The proxy passes `/auth/v1/factors…` for this. Lost phone: delete the factor in Supabase → Authentication → Users.
12. There is always at least one active admin (`keep_one_admin` trigger): the last admin can't be demoted, suspended or removed.

## Conventions
- New tables: enable RLS, `revoke all ... from anon`, add policies, add an audit trigger, add tests.
- Changing the consent wording = a new row in `policy_versions` via a new migration (everyone re-consents).
- Dates in the tree are `YYYYMMDD` strings with `00` for unknown parts (Family Echo convention).
- UI tone: Apple-like (system font, quiet greys, one blue accent, large headlines ending in a full stop).
  Copy is short and warm; error messages say what to do next (`friendly()` in `api.ts`).
- Hash routing (`#/p/<id>`, `#/related`, `#/photos[/<uuid>]`, `#/tree[/<id>]`, `#/talk[/<uuid>]`, `#/calendar[/YYYY-MM[-DD]]`, `#/privacy`, `#/admin`) so any static host works.

## Commands
```bash
npm install && npm test        # spreadsheet + Family Echo importers (root package)
npm run check                  # validate site.config.json, copy into reminders/wrangler.toml
npm run template               # rebuild templates/*.xlsx
npm run import -- file.xlsx [--check | --demo [--me ID] | --admin-email x --admin-person ID > data/seed.sql]
npm run sql                    # rebuild supabase/setup.sql after adding a migration
tests/run_rls_tests.sh
tests/check_seed.sh            # loads data/seed.sql into a throwaway database
cd web && npm test && npm run build
cd web && npm run demo      # after npm run import -- templates/sample-family.xlsx --demo
cd reminders && npm test     # reminder messages; preview live: GET <worker-url>/?key=<PREVIEW_KEY>&date=YYYY-MM-DD
```

## Community packs (traditions)
- `web/src/lib/kin/roles.ts` `roleOf(f, other, ego)` → a language-neutral role: key (parent, parent_sibling, cousin, spouse_sibling…), sex, ego's sex, side (P/M), via (sex of the linking relative), older (true/false/null).
- `web/src/lib/community/packs.ts` — one pack per community (hindi, punjabi, bengali, marathi, gujarati, urdu, tamil, telugu, kannada, malayalam, english): `term(role)`, menus, labels for gothram/kuladeivam, date style, default festival groups, starBirthday, art (south/plain), rtl. Words are `'Roman|native'` (`terms.ts` `T()`); `fromTable()` for tables, `dravidian()` for cross/parallel cousins. Tamil keeps its own function (tests in `tamil.test.ts`; `lib/tamil.ts` `tamilTerm` wraps it).
- `web/src/lib/community/index.ts` — choice per device (localStorage `fam-community`, `fam-festivals`), default `site.config.json` `community`; `usePack()`, `useFestivals()`, `kinTerm()`, `termText()`. Theme → **Traditions** (`Sidebar.tsx` `TraditionsRow`) also sets menu language.
- `lib/menulang.ts` — menus in any pack language (`MENUS` in `community/menus.ts`); elder links `?elder=1&lang=hi`.
- Calendar: every festival `CalEvent.groups`; `shownFor(e, groups)` filters in Calendar and Home. Evening festivals use `eveningTithi` (Diwali, Dhanteras, Karva Chauth), afternoon ones `afternoonTithi` (Holika Dahan, Vasant Panchami); `firstOf()` for month-start festivals (Ugadi, Gudi Padwa). Hijri via `Intl` (`hijri()`), Easter by computus. Dates tested in `festivals.test.ts`. `community/dates.ts` names the day per date style (tamil, malayalam, bengali, amanta, purnimanta, hijri).
- Heritage art (`useHeritage().south`): borders, kolam, gopuram and Malayalam/Tamil page names only for South packs. Star birthdays only for packs with `starBirthday`.
- `emailSignIn: false` in site.config.json hides the email form (free `.pages.dev` setup, Google only). Default sign-in providers: Google.

## Roadmap (open-source edition)
Inherited and working: tree, profiles with per-detail visibility and consent, roles (member/steward/admin), invitations and join requests,
under-18 accounts with parent approval, Talk, photos with tag approval, private messages, bell + phone notifications, calendar,
reminders and weekly email, writing help, health checks, retention, backups, 2-step for admins. Added: site.config.json,
Excel/CSV import with plain-language checks, made-up sample family, one-file database setup, first-admin bootstrap (0051).
Community packs are in (see above). Next: docs/ROADMAP.md (setup wizard, native-speaker review, more communities,
translated pages, art per community, emails per tradition).
