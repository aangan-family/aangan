# Running your family website

Day to day it runs itself. This page is for the admin.

## Health alerts
The Worker checks the website, database, sign-in, photos and email every 10 minutes and emails `REMINDER_EMAIL`
when something needs attention, with the fix for each problem. Full status: `https://api.<your domain>/ops/health?key=<PREVIEW_KEY>`.

## Backups
`.github/workflows/backup.yml` runs nightly at 02:00 India time in your **private** copy: the database every night,
photos on Sundays, encrypted with `BACKUP_PASSPHRASE` and kept 30 days as private artifacts (Actions → the run → Artifacts).
`.github/workflows/restore-test.yml` proves on the 4th of each month that the newest backup opens and loads.

Restore: download the artifact, then
`gpg -d fam-backup-<date>.tar.gz.gpg | tar xz` (it asks for the passphrase) and load `db.sql` into a new Supabase project
with `psql "<session pooler connection string>" -f db.sql`.

## Updating to a newer version of this project
In your copy on GitHub: **Sync fork** isn't available for template copies, so in the Codespace:
```bash
git remote add upstream https://github.com/<this project>.git   # once
git fetch upstream && git merge upstream/main
```
If there are new files in `supabase/migrations/`, run each new one (in order) in the Supabase SQL editor before pushing.
Your `site.config.json` is yours; keep your lines if Git asks.

## Adding an admin or steward
Admin → Members & roles. New admins must turn on 2-step sign-in within 7 days.

## If something goes wrong

If you think someone got into the site who shouldn't have, or a key was shared by mistake:

1. **Sign everyone out.** As admin: My privacy → **Sign out everywhere** signs you out on every device. To sign out every member,
   in Supabase → Authentication → Users, sign out the affected users (or all of them).
2. **Rotate the server key.** Supabase → Project Settings → API keys: create a new secret key, delete the old one, then put the new one
   in the Worker (`npx wrangler secret put SUPABASE_SERVICE_KEY` in `reminders/`, or re-run **Set up my site**) and in the backup secret.
3. **Check who has access.** Admin → Members & roles: suspend anyone you don't recognise; check the **2-step** column for admins.
4. **Look at what changed.** Every change is in the audit log (Supabase → Table editor → `audit_log`), with who and when.
5. **Restore if needed.** The nightly encrypted backup (GitHub → Actions → backup) can be restored; the restore test shows how.
6. **Tell the family** in plain words what happened and what you did (Admin → Messages → **Notify everyone**).
   Under India's DPDP Act, a breach of personal data must also be reported to the Data Protection Board and to the people affected.

If you found a weakness in Aangan itself, please report it privately: see [SECURITY.md](../SECURITY.md).
