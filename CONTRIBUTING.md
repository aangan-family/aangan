# Contributing

Thank you. The most useful help right now: **relationship words, festival rules and calendar details for your community**
(see the roadmap in CLAUDE.md), and trying the setup guide and telling us where you got stuck.

Rules that never bend:
- **No real family data, ever** — not in code, tests, screenshots or issues. Use made-up people (see `templates/sample-family.xlsx`).
- Every privacy rule lives in the database and has a test in `tests/rls_test.sql`. A change without a test won't be merged.
- Don't hard-code a family name, domain or contact: read `site.config.json`.

Before you open a pull request:
```bash
npm test                                   # importers
tests/run_rls_tests.sh                     # privacy rules (needs Postgres)
cd web && npm run build                    # website tests + build
cd ../reminders && npm test && npx tsc -p .
```
