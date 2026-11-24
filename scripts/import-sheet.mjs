#!/usr/bin/env node
// Turns your family spreadsheet (Excel .xlsx or .csv, one row per person) into SQL you run once in the
// Supabase SQL editor. Start from templates/family-tree-template.xlsx (npm run template makes a fresh one).
//
//   npm run import -- my-family.xlsx --admin-email you@gmail.com --admin-person P001 > data/seed.sql
//   npm run import -- my-family.xlsx --check            (only check the sheet, write nothing)
//   npm run import -- my-family.xlsx --demo             (preview: writes web/public/demo-data.json for npm run demo)
//
// Phone numbers, emails and addresses are never imported, even if the sheet has them:
// each person adds their own after they join and agree to share them.
// The output contains family data, so keep it under data/, which Git ignores.

import { readFileSync, writeFileSync } from 'node:fs';
import { toSQL } from './import-familyscript.mjs';

import { COLUMNS, norm, text, rowsToRecords, parseCsv } from './lib/sheet.mjs';
export { COLUMNS, parseDate, rowsToRecords, parseCsv } from './lib/sheet.mjs';

/** Reads the first sheet that has a "First name" heading (or the only sheet). CSV works too. */
export async function readSheet(file) {
  if (/\.csv$/i.test(file)) return parseCsv(readFileSync(file, 'utf8'));
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  for (const ws of wb.worksheets) {
    const head = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { head[i] = text(c.value); });
    if (!head.some((h) => COLUMNS.given_name.includes(norm(h)))) continue;
    const rows = [];
    ws.eachRow({ includeEmpty: true }, (row, i) => {
      if (i === 1) return;
      const o = {};
      head.forEach((h, j) => { if (h) o[h] = text(row.getCell(j).value); });
      rows.push(o);
    });
    while (rows.length && Object.values(rows[rows.length - 1]).every((v) => v === '')) rows.pop();
    return rows;
  }
  throw new Error('No sheet with a "First name" column was found. Use the Family sheet from the template.');
}

// ---- CLI -----------------------------------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const file = args.find((a, i) => !a.startsWith('--') && !['--admin-email', '--admin-person', '--me'].includes(args[i - 1]));
  if (!file) {
    console.error('Usage: npm run import -- <family.xlsx|.csv> [--check] [--demo [--me ID]] [--admin-email you@gmail.com --admin-person ID]');
    process.exit(1);
  }
  const rec = rowsToRecords(await readSheet(file));
  const say = (s) => console.error(s);
  say(`\nRead ${rec.persons.length} people, ${rec.links.length} parent links, ${rec.partners.length} couples, ${rec.fields.length} details.`);
  if (rec.notes.length) { say('\nGood to know:'); rec.notes.forEach((x) => say('  · ' + x)); }
  if (rec.problems.length) {
    say(`\nPlease fix ${rec.problems.length === 1 ? 'this' : `these ${rec.problems.length} things`} in the sheet, then run it again:`);
    rec.problems.forEach((x) => say('  ✗ ' + x));
    process.exit(2);
  }
  say('\n✓ The sheet looks good.');
  if (args.includes('--check')) process.exit(0);
  if (args.includes('--demo')) {
    const policy = readFileSync(new URL('../supabase/migrations/0003_consent_policy_v1.sql', import.meta.url), 'utf8').split('$txt$')[1];
    writeFileSync(new URL('../web/public/demo-data.json', import.meta.url), JSON.stringify({
      me: opt('--me') || rec.persons[0]?.id, policy, persons: rec.persons, links: rec.links,
      partners: rec.partners.map((p, i) => ({ id: i + 1, ...p })),
      fields: rec.fields.map((f) => ({ ...f, updated_at: null, updated_by: null })),
    }));
    say('Wrote web/public/demo-data.json. Now: cd web && npm run demo');
    process.exit(0);
  }
  const ids = new Set(rec.persons.map((p) => p.id));
  const adminPerson = opt('--admin-person');
  if (adminPerson && !ids.has(adminPerson)) { say(`--admin-person "${adminPerson}" isn't an ID in the sheet.`); process.exit(2); }
  process.stdout.write(toSQL(rec, { adminEmail: opt('--admin-email'), adminPerson }).replace('Generated from a Family Echo export', 'Generated from your family spreadsheet'));
}
