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

// ---- columns: the first heading that matches wins (case, spaces and punctuation don't matter) ----------
export const COLUMNS = {
  id: ['id', 'person id', 'code'],
  given_name: ['first name', 'given name', 'name', 'first'],
  surname: ['surname', 'last name', 'family name', 'initial', 'initials'],
  birth_surname: ['maiden name', 'birth surname', 'surname at birth'],
  known_as: ['known as', 'nickname', 'pet name', 'called'],
  gender: ['gender', 'sex', 'male female'],
  father: ['father', 'father id', 'father name', 'dad'],
  mother: ['mother', 'mother id', 'mother name', 'mom', 'mum', 'amma'],
  spouse: ['spouse', 'husband wife', 'husband or wife', 'husband', 'wife', 'partner', 'married to'],
  wedding: ['wedding date', 'marriage date', 'married on', 'wedding'],
  birth: ['birth date', 'date of birth', 'dob', 'born', 'birth year', 'year of birth', 'birth date or year'],
  living: ['living', 'alive', 'is living', 'living yes no', 'living yes or no'],
  death: ['death date', 'date of passing', 'passed away', 'died', 'death year', 'date or year of passing'],
  birth_place: ['birth place', 'place of birth', 'born in'],
  native_place: ['native place', 'native village', 'native', 'ancestral place', 'origin'],
  city: ['city', 'lives in', 'current city', 'town'],
  work: ['work', 'occupation', 'job', 'profession'],
  gothram: ['gothram', 'gotra', 'gotram', 'gothra', 'gotra gothram', 'gothram gotra'],
  kuladeivam: ['kuladeivam', 'kuldevi', 'kuldevta', 'kul devta', 'family deity', 'kuladevata', 'family deity kuldevi kuladeivam', 'kuldevi kuladeivam'],
  about: ['notes', 'about', 'note', 'comments'],
};
/** never imported: each person adds these themselves after joining and consenting */
const CONTACT = ['phone', 'mobile', 'email', 'e mail', 'address', 'whatsapp', 'phone number', 'mobile number'];

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const text = (v) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object' && 'text' in v) return String(v.text).trim();          // Excel rich text / links
  if (typeof v === 'object' && 'result' in v) return text(v.result);               // Excel formulas
  if (typeof v === 'object' && 'richText' in v) return v.richText.map((r) => r.text).join('').trim();
  return String(v).trim();
};

/** "14-07-1968", "14/7/1968", "1968-07-14", "07-1968", "1968", an Excel date → "19680714" (00 for unknown parts) */
export function parseDate(v) {
  if (v === '' || v === null || v === undefined) return { value: null };
  if (v instanceof Date && !isNaN(v)) {
    const y = v.getUTCFullYear(), m = v.getUTCMonth() + 1, d = v.getUTCDate();
    return { value: `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}` };
  }
  const s = String(v).trim();
  let m;
  const ok = (y, mo = 0, d = 0) => {
    y = Number(y); mo = Number(mo); d = Number(d);
    if (y < 1000 || y > 2100 || mo > 12 || d > 31) return { value: null, bad: true };
    return { value: `${y}${String(mo).padStart(2, '0')}${String(d).padStart(2, '0')}` };
  };
  if ((m = /^(\d{4})$/.exec(s))) return ok(m[1]);
  if ((m = /^(\d{1,2})[-/.](\d{4})$/.exec(s))) return ok(m[2], m[1]);
  if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s))) return ok(m[3], m[2], m[1]);   // day first (India)
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s))) return ok(m[1], m[2], m[3]);
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  if ((m = /^(?:(\d{1,2})\s+)?([a-z]{3})[a-z]*\.?,?\s+(\d{4})$/i.exec(s)) && months.includes(m[2].toLowerCase()))
    return ok(m[3], months.indexOf(m[2].toLowerCase()) + 1, m[1] || 0);
  return { value: null, bad: true };
}

const yes = (v) => /^(y|yes|true|1|alive|living|haan|ha)$/i.test(String(v).trim());
const no = (v) => /^(n|no|false|0|dead|late|passed|passed away|deceased|expired)$/i.test(String(v).trim());
const genderOf = (v) => { const g = norm(v)[0]; return g === 'm' ? 'm' : g === 'f' ? 'f' : g === 'o' ? 'o' : ''; };

/**
 * rows: [{heading: value, …}] as read from the sheet (row 1 = headings). Returns the same records the
 * Family Echo importer makes, plus plain-language problems (must fix) and notes (good to know).
 */
export function rowsToRecords(rows, { firstRow = 2 } = {}) {
  const problems = [], notes = [];
  const headings = Object.keys(rows[0] || {});
  const col = {};
  for (const [key, names] of Object.entries(COLUMNS)) col[key] = headings.find((h) => names.includes(norm(h)));
  const contactCols = headings.filter((h) => CONTACT.includes(norm(h)));
  if (contactCols.length) notes.push(`Skipped ${contactCols.join(', ')}: phone numbers, emails and addresses are never imported. Each person adds their own after they join.`);
  if (!col.given_name) { problems.push('The sheet needs a "First name" column.'); return { persons: [], links: [], partners: [], fields: [], problems, notes }; }

  const get = (r, k) => (col[k] ? text(r[col[k]]) : '');
  const people = [];
  rows.forEach((r, i) => {
    const row = firstRow + i;
    const given = String(get(r, 'given_name'));
    if (!given && Object.values(r).every((v) => text(v) === '')) return; // empty row
    if (!given) { problems.push(`Row ${row}: the first name is empty.`); return; }
    let id = String(get(r, 'id')).replace(/\s+/g, '');
    if (id && !/^[A-Za-z0-9_-]{1,40}$/.test(id)) { problems.push(`Row ${row}: the ID "${id}" can only use letters, numbers, - and _.`); id = ''; }
    people.push({ row, r, id, given, surname: String(get(r, 'surname')) });
  });

  // IDs: keep the ones given, number the rest P001, P002…
  const used = new Set();
  for (const p of people) {
    if (!p.id) continue;
    if (used.has(p.id.toLowerCase())) { problems.push(`Row ${p.row}: the ID "${p.id}" is used twice. Each person needs their own ID.`); p.id = ''; }
    else used.add(p.id.toLowerCase());
  }
  let n = 0;
  for (const p of people) if (!p.id) { do p.id = `P${String(++n).padStart(3, '0')}`; while (used.has(p.id.toLowerCase())); used.add(p.id.toLowerCase()); }

  const byId = new Map(people.map((p) => [p.id.toLowerCase(), p]));
  const byName = new Map();
  const addName = (k, p) => { if (!k) return; const l = byName.get(k) || []; if (!l.includes(p)) l.push(p); byName.set(k, l); };
  for (const p of people) { addName(norm(`${p.given} ${p.surname}`), p); addName(norm(p.given), p); }
  const find = (value, who, what) => {
    const v = String(value).trim();
    if (!v) return null;
    const hit = byId.get(v.toLowerCase());
    if (hit) return hit;
    const list = byName.get(norm(v)) || [];
    if (list.length === 1) return list[0];
    if (list.length > 1) { problems.push(`Row ${who.row}: ${what} "${v}" could be ${list.length} people (rows ${list.map((x) => x.row).join(', ')}). Write their ID instead.`); return null; }
    problems.push(`Row ${who.row}: ${what} "${v}" isn't in the sheet. Add a row for them, or leave it blank.`);
    return null;
  };

  const persons = [], links = [], fields = [], pairs = new Map();
  const inferred = new Map();
  for (const p of people) {
    const r = p.r;
    const birth = parseDate(get(r, 'birth'));
    if (birth.bad) problems.push(`Row ${p.row}: couldn't read the birth date "${get(r, 'birth')}". Use DD-MM-YYYY, or just the year.`);
    const death = parseDate(get(r, 'death'));
    if (death.bad) problems.push(`Row ${p.row}: couldn't read the date of passing "${get(r, 'death')}". Use DD-MM-YYYY, or just the year.`);
    const livingCell = get(r, 'living');
    const dead = !!death.value || no(livingCell);
    if (livingCell && !yes(livingCell) && !no(livingCell)) notes.push(`Row ${p.row}: "Living" says "${livingCell}"; we read it as Yes. Use Yes or No.`);
    const g = genderOf(get(r, 'gender'));
    persons.push({
      id: p.id, given_name: p.given, surname: p.surname, birth_surname: String(get(r, 'birth_surname')),
      gender: g, birth_year: birth.value && birth.value.slice(0, 4) !== '0000' ? Number(birth.value.slice(0, 4)) : null,
      is_living: !dead, death_date: dead ? death.value : null, death_place: null, sort_key: birth.value,
    });
    for (const [k, kind] of [['father', 'm'], ['mother', 'f']]) {
      const parent = find(get(r, k), p, k === 'father' ? 'Father' : 'Mother');
      if (!parent) continue;
      if (parent === p) { problems.push(`Row ${p.row}: someone can't be their own ${k}.`); continue; }
      links.push({ child_id: p.id, parent_id: parent.id, kind: 'biological' });
      if (!inferred.has(parent.id)) inferred.set(parent.id, kind);
    }
    for (const s of String(get(r, 'spouse')).split(/[;,]| and | & /).map((x) => x.trim()).filter(Boolean)) {
      const sp = find(s, p, 'Spouse');
      if (!sp || sp === p) continue;
      const key = [p.id, sp.id].sort().join(' ');
      const wed = parseDate(get(r, 'wedding'));
      if (wed.bad) problems.push(`Row ${p.row}: couldn't read the wedding date "${get(r, 'wedding')}". Use DD-MM-YYYY, or just the year.`);
      const prev = pairs.get(key);
      pairs.set(key, { person_a: key.split(' ')[0], person_b: key.split(' ')[1], kind: 'married', is_current: true, start_date: wed.value || prev?.start_date || null, place: null });
    }
    const add = (field, value, visibility) => { const v = String(value || '').trim(); if (v) fields.push({ person_id: p.id, field, value: v.slice(0, 4000), visibility }); };
    if (birth.value && !/^\d{4}0000$/.test(birth.value) && !birth.value.endsWith('00')) add('birth_date', birth.value, dead ? 'family' : 'close');
    for (const f of ['known_as', 'birth_place', 'native_place', 'city', 'work', 'gothram', 'kuladeivam', 'about']) add(f, get(r, f), 'family');
  }
  // a blank gender is filled in when the person is someone's father or mother
  for (const p of persons) if (!p.gender && inferred.has(p.id)) { p.gender = inferred.get(p.id); notes.push(`${p.given_name}: gender left blank, so we used ${p.gender === 'm' ? 'male (listed as a father)' : 'female (listed as a mother)'}.`); }
  for (const l of links) {
    const parent = persons.find((x) => x.id === l.parent_id);
    const childRow = people.find((x) => x.id === l.child_id).row;
    if (parent && parent.birth_year && persons.find((x) => x.id === l.child_id).birth_year && parent.birth_year >= persons.find((x) => x.id === l.child_id).birth_year)
      notes.push(`Row ${childRow}: ${parent.given_name} is listed as a parent but was born in the same year or later. Please check.`);
  }

  // birth order without exposing birth dates (same rule as the Family Echo importer): "1983.002"
  const order = persons.map((p) => ({ p, k: p.sort_key || (p.birth_year ? `${p.birth_year}9999` : null) }))
    .sort((a, b) => (a.k || '99999999').localeCompare(b.k || '99999999'));
  const perYear = new Map();
  for (const { p, k } of order) {
    if (!k || k.startsWith('0000')) { p.sort_key = null; continue; }
    const y = k.slice(0, 4); const c = (perYear.get(y) || 0) + 1; perYear.set(y, c);
    p.sort_key = `${y}.${String(c).padStart(3, '0')}`;
  }
  const seen = new Set();
  return {
    persons, fields, partners: [...pairs.values()],
    links: links.filter((l) => !seen.has(l.child_id + '|' + l.parent_id) && seen.add(l.child_id + '|' + l.parent_id)),
    problems, notes: [...new Set(notes)],
  };
}

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

export function parseCsv(t) {
  const out = []; let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  const [head, ...rest] = out;
  return rest.filter((r) => r.some((c) => c.trim())).map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] || '').trim()])));
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
