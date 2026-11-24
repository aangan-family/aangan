#!/usr/bin/env node
// Builds web/public/demo-data.json from a Family Echo export, for `npm run demo`
// (a preview of the site without a database). Contains family data: never commit it.
//   node scripts/make-demo-data.mjs data/family-echo.txt --me START
import { readFileSync, writeFileSync } from 'node:fs';
import { parseFamilyScript, toRecords } from './import-familyscript.mjs';

const args = process.argv.slice(2);
const file = args[0];
const me = args.includes('--me') ? args[args.indexOf('--me') + 1] : undefined;
if (!file) { console.error('Usage: node scripts/make-demo-data.mjs <export.txt> [--me PERSON_ID]'); process.exit(1); }
const rec = toRecords(parseFamilyScript(readFileSync(file, 'utf8')));
const policy = readFileSync(new URL('../supabase/migrations/0003_consent_policy_v1.sql', import.meta.url), 'utf8').split('$txt$')[1];
writeFileSync(new URL('../web/public/demo-data.json', import.meta.url), JSON.stringify({
  me, policy, persons: rec.persons, links: rec.links,
  partners: rec.partners.map((p, i) => ({ id: i + 1, ...p })),
  fields: rec.fields.map((f) => ({ ...f, updated_at: null, updated_by: null })),
}));
console.error(`Wrote web/public/demo-data.json (${rec.persons.length} people).`);
