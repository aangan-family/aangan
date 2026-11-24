# Aangan — your family's own private website

*Aangan* (आँगन, the courtyard where the whole family gathers) is a free, open-source family tree and family website for Indian families. Any community, any religion, any language. Your family runs its own copy, on its own accounts, so **your family's data never passes through us**.

> Working name. Rename it in this README and `site.config.json` if you like.

## What your family gets

- **The family tree**, as deep as it goes: in-laws' families too, half-siblings, second marriages, adoption.
- **Profiles each relative controls.** Every detail (birthday, phone, city, work) is *Family*, *Close family* or *Only me*. Nothing about a living person is shown until they agree.
- **"How are we related?"** in plain words, with family words like Athimber, Mama or Chithi (Tamil today, more communities coming).
- **Coming up:** birthdays, anniversaries and remembrance days, with a ready-to-send wish.
- **Talk:** family conversations, photos with tag approval, private messages, and notifications on the phone.
- **Stewards:** one or two people from each branch add relatives and approve who joins.
- **Children** can join, with a parent approving what they post. No contact details are ever kept for under-18s.
- **Works like an app** on any phone (Add to Home Screen). No app store.
- **Runs itself:** daily reminders, a weekly family email, health checks, nightly encrypted backups.

## Start with a spreadsheet

You don't need to type the tree into a website. Fill in one Excel sheet, one row per person:

1. Open [`templates/family-tree-template.xlsx`](templates/family-tree-template.xlsx) (or look at [`templates/sample-family.xlsx`](templates/sample-family.xlsx), a made-up family, first).
2. Write each person's name, and who their father, mother and spouse are (by name or ID).
3. Check it: `npm run import -- my-family.xlsx --check`. It tells you in plain words what to fix ("Row 12: Father 'Ramesh' could be 2 people…").

Phone numbers, emails and addresses are never imported, even if the sheet has them. Each person adds their own after they join and choose who sees them.

## Set it up for your family

Follow **[docs/SETUP.md](docs/SETUP.md)**. It's written so that a 16-year-old who's comfortable with a laptop can do it in an afternoon. Everything runs on free plans (Supabase, Cloudflare, Resend); the only cost is a domain name (about ₹800 a year).

Want to look first? Try it on your computer with the sample family:

```bash
npm install && npm run import -- templates/sample-family.xlsx --demo --me P005
cd web && npm install && npm run demo      # opens a preview with the made-up family
```

## Privacy, by design

- Each family's data lives only in that family's own database. This project has no server and collects nothing.
- Signed-out visitors see nothing. A login without an invitation sees nothing.
- Every rule is enforced in the database (row-level security), with 200+ automated tests in `tests/rls_test.sql`.
- Consent is recorded and can be withdrawn; anyone can download or delete their own data.
- Built with India's DPDP Act in mind: consent, children's data, retention periods, breach contact. (This is not legal advice.)

## What's inside

| Folder | What it is |
| --- | --- |
| `web/` | The website (React + TypeScript, static, hosted free on Cloudflare Pages) |
| `reminders/` | A Cloudflare Worker: emails, reminders, notifications, sign-in helpers, health checks |
| `supabase/` | The database: tables, privacy rules, consent text (`setup.sql` = everything in one file) |
| `scripts/` | Excel/CSV and Family Echo importers, settings check, template maker |
| `templates/` | The Excel template and the made-up sample family |
| `tests/` | Privacy-rule tests on a real Postgres, importer tests |
| `site.config.json` | **Your family's settings** — the only file you need to edit |

## Status

Everything above works today. The calendar, relationship words and decorative art currently follow Tamil traditions; **community packs** (Hindi, Punjabi, Bengali, Marathi, Gujarati, Telugu, Kannada, Malayalam and more, with their own calendars and art) are next. See the roadmap in [CLAUDE.md](CLAUDE.md#roadmap-open-source-edition). Contributions welcome — especially relationship words and festival rules for your community.

## Licence

MIT. See [LICENSE](LICENSE).
