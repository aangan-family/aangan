# Aangan · आँगन

**A private home online for every Indian family.** A free, open-source family tree and family website. Any community, any religion, any language. Your family runs its own copy, on its own accounts, so your family's data never passes through anyone else.

## Why "Aangan"

In Indian homes, the *aangan* is the open courtyard at the centre of the house. It's where the whole family meets: grandparents in the afternoon sun, children playing, pickles drying, a wedding mandap or a Diwali rangoli, news shared over tea. Every room opens onto it, and only family and trusted guests come in.

Every Indian language has its courtyard: *aangan* in Hindi and Urdu, *angan* in Marathi, *aangnu* in Gujarati, *vehra* in Punjabi, *uthon* in Bengali, *mutram* in Tamil, *muttam* in Malayalam, *angala* in Kannada, *mungili* in Telugu.

That's what this project is: a courtyard for your family, open to every relative, closed to everyone else.

## What your family gets

- **The family tree**, as deep as it goes, including the families you married into, half-siblings, second marriages and adoption.
- **Your traditions, your words.** Each relative picks their own traditions (Hindi, Punjabi, Bengali, Marathi, Gujarati, Urdu, Tamil, Telugu, Kannada or Malayalam). The site then calls relatives by the right word, in their own script: *Chacha (चाचा)*, *Bua*, *Mausi*, *Taya ji (ਤਾਇਆ ਜੀ)*, *Pishi (পিসি)*, *Mamu (ماموں)*, *Athai*, *Bava*, *Doddappa*. It knows father's side from mother's side and elder from younger, and tells a South Indian cross-cousin from a parallel one.
- **A calendar for every faith.** The date in your own calendar (Tamil, Malayalam, Bengali, lunar Purnimanta or Amanta, or Hijri), and the festivals you keep: Hindu (all-India and regional), Sikh, Muslim, Christian, Jain and Buddhist, plus national days.
- **Profiles each relative controls.** Every detail is *Family*, *Close family* or *Only me*. Nothing about a living person shows until they agree.
- **Coming up:** birthdays, anniversaries and remembrance days, with a ready-to-send wish that greets elders the right way.
- **Talk, photos and messages**, with notifications on the phone, and menus in each person's language.
- **Stewards:** one or two people from each branch add relatives and approve who joins.
- **Children** can join, with a parent approving what they post. No contact details are ever kept for under-18s.
- **Works like an app** on any phone (Add to Home Screen). No app store.
- **Runs itself:** daily reminders, a weekly family email, health checks, nightly encrypted backups.

## Start with a spreadsheet

You don't need to type the tree into a website. Fill in one Excel sheet, one row per person:

1. Open [`templates/family-tree-template.xlsx`](templates/family-tree-template.xlsx). [`templates/sample-family.xlsx`](templates/sample-family.xlsx) is a made-up family across seven communities, to see how it's done.
2. Write each person's name, and who their father, mother and spouse are (by name or ID).
3. Check it: `npm run import -- my-family.xlsx --check`. It tells you in plain words what to fix ("Row 12: Father 'Ramesh' could be 2 people…").

Phone numbers, emails and addresses are never imported, even if the sheet has them. Each person adds their own after they join and chooses who sees them.

## Set it up: free, or about ₹800 a year

| Level | Cost | What you get |
| --- | --- | --- |
| **0 · Try it** | ₹0 | The site on your own computer with the made-up family (10 minutes) |
| **1 · Free** | ₹0 | `yourfamily.pages.dev`, Google sign-in, phone notifications |
| **2 · Own domain** (recommended) | about ₹500–900 a year | `yourfamily.in`, email sign-in, welcome and reminder emails |
| **3 · Grown family** | from about ₹2,100 a month | Room for many thousands of photos, daily backups by Supabase |

Details in **[docs/HOSTING.md](docs/HOSTING.md)**; step by step in **[docs/SETUP.md](docs/SETUP.md)**, written so that a 16-year-old comfortable with a laptop can do it in an afternoon.

**Easiest start: the [setup wizard](https://aangan-family.github.io/aangan/)**. It checks your family sheet in your browser (it's never uploaded), shows your tree, writes your settings and database files, and walks you through each account with your own values filled in.

Try it now on your computer:

```bash
npm install && npm run import -- templates/sample-family.xlsx --demo --me P005
cd web && npm install && npm run demo
```

## Privacy comes first

A family tree is exactly what a scammer wants: names, relationships, birthdays, maiden names. So:

- Each family's data lives only in that family's own database. This project has no server and collects nothing.
- Signed-out visitors see nothing; a login without an invitation sees nothing.
- Every rule is enforced in the database (row-level security), checked by over 500 automated tests.
- Consent is recorded and can be withdrawn. Children's data is protected by design.
- Built with India's DPDP Act in mind. (Not legal advice.)

Read **[docs/PRIVACY-GUIDE.md](docs/PRIVACY-GUIDE.md)** before you set up: it covers what the site does for you and the ten things only the admin can do.

## What's inside

| Folder | What it is |
| --- | --- |
| `web/` | The website (React + TypeScript, static, hosted free on Cloudflare Pages) |
| `web/src/lib/community/` | **Community packs**: family words, menus, calendars and festivals for each tradition |
| `reminders/` | A Cloudflare Worker: emails, reminders, notifications, sign-in helpers, health checks |
| `supabase/` | The database: tables, privacy rules, consent text (`setup.sql` = everything in one file) |
| `wizard/` | The browser setup wizard (static; published to GitHub Pages; can't connect to any other site) |
| `scripts/` | Excel/CSV and Family Echo importers, settings check, template maker (`scripts/lib/` is shared with the wizard) |
| `templates/` | The Excel template and the made-up sample family |
| `tests/` | Privacy-rule tests on a real Postgres, importer tests |
| `site.config.json` | **Your family's settings**: the only file you need to edit |

## Help wanted

Family words differ from region to region, and between communities in the same state. If a word is wrong for your family, or your community isn't here yet (Odia, Assamese, Konkani, Sindhi, Kashmiri, Tulu, Bhojpuri…), please help: see [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/ROADMAP.md](docs/ROADMAP.md).

## Licence

MIT. See [LICENSE](LICENSE). Free to use, change and share. No real family's data is in this repository, and none ever should be.
