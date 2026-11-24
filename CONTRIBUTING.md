# Contributing

Thank you. The most useful help right now:

1. **Family words for your community.** Are they right? Are they the words your family uses at home?
2. **Festivals and calendars** for your community.
3. **Trying the setup guide** and telling us where you got stuck.

See [docs/ROADMAP.md](docs/ROADMAP.md) for everything still to build.

## Rules that never bend

- **No real family data, ever**: not in code, tests, screenshots or issues. Use made-up people (see `templates/sample-family.xlsx`).
- Every privacy rule lives in the database and has a test in `tests/rls_test.sql`. A change without a test won't be merged.
- Don't hard-code a family name, domain or contact: read `site.config.json`.

## Correcting or adding family words

Everything for one community is in `web/src/lib/community/packs.ts`:

- A table of words, one line per relationship. `fEBro` is the father's elder brother, `mSis` the mother's sister, `hYBro` the husband's younger brother, and so on (every key is explained in `terms.ts`).
- Write each word as `'English letters|own script'`, e.g. `fYBro: 'Chacha|चाचा'`.
- Leave out a relationship that has no everyday word: the English is always shown.
- South Indian packs use `dravidian(…)`: cousins through a parent's same-sex sibling are brothers and sisters; cross-cousins get their own words.
- Menus are in `web/src/lib/community/menus.ts`.
- Add or fix a test in `web/src/lib/community.test.ts` (a small made-up family with every kind of relative).

**To add a new community:** copy the closest pack, change the words, add it to `PACKS` and `PACK_LIST`, give it menus, festival groups and a date style, and add it to `COMMUNITIES` in `scripts/check-config.mjs`.

## Festivals

`web/src/lib/calendar.ts` marks festivals by rule (a lunar month and tithi, a solar month and star, a fixed date, a Hijri date). Tag each with the festival groups that keep it. Add the published dates for two years to `web/src/lib/festivals.test.ts`.

## Before you open a pull request

```bash
npm test                                   # importers
tests/run_rls_tests.sh                     # privacy rules (needs Postgres)
cd web && npm run build                    # website tests + build
cd ../reminders && npm test && npx tsc -p .
```
