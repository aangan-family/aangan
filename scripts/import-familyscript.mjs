#!/usr/bin/env node
// Turns a Family Echo FamilyScript export (.txt) into SQL you can run in the
// Supabase SQL editor. Contact details (email, phone, address) are NOT imported:
// each person adds their own after they join and consent.
//
//   node scripts/import-familyscript.mjs data/family.txt \
//        --admin-email you@example.com --admin-person START > data/seed.sql
//
// The output contains family data, so it is written under data/, which Git ignores.

import { readFileSync } from 'node:fs';

export function parseFamilyScript(text) {
  const people = new Map();
  const pairs = new Map();
  const unesc = (s) => s.replace(/\\(\\|t|n)/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : '\\'));
  for (const raw of text.split(/\r\n|\r|\n/)) {
    if (!raw) continue;
    const kind = raw[0];
    if (kind !== 'i' && kind !== 'p') continue;
    const parts = raw.split('\t');
    const facts = {};
    for (const f of parts.slice(1)) if (f) facts[f[0]] = unesc(f.slice(1)); else continue;
    // an empty tag unsets a fact; later lines win (FamilyScript is read top to bottom)
    for (const f of parts.slice(1)) if (f.length === 1) facts[f] = '';
    if (kind === 'i') {
      const id = parts[0].slice(1);
      if (!/^[A-Za-z0-9]+$/.test(id)) continue;
      people.set(id, Object.assign(people.get(id) || {}, facts));
    } else {
      const [a, b] = parts[0].slice(1).split(' ');
      if (!a || !b) continue;
      const key = [a, b].sort().join(' ');
      pairs.set(key, Object.assign(pairs.get(key) || {}, facts));
      for (const id of [a, b]) if (!people.has(id)) people.set(id, {});
    }
  }
  return { people, pairs };
}

const tidy = (s) => (s || '').trim().replace(/[A-Za-z]{4,}/g, (w) => (w === w.toUpperCase() ? w[0] + w.slice(1).toLowerCase() : w));
const dateCore = (d) => { const m = /^B?(\d{8,})/.exec(d || ''); return m && m[1].length === 8 ? m[1] : null; };
const yearOf = (d) => { const c = dateCore(d); return c && c.slice(0, 4) !== '0000' ? Number(c.slice(0, 4)) : null; };
const exactDate = (d) => { const c = dateCore(d); return c && !/^0000|^\d{4}00|00$/.test(c) && !/[~<>-]/.test(d) ? c : null; };
const parentKind = (v) => ({ b: 'biological', a: 'adopted', s: 'step', d: 'guardian', f: 'foster' }[(v || 'b')[0]] || 'other');
const partnerKind = (g) => ({ m: 'married', n: 'married', e: 'engaged', r: 'partner', c: 'partner', d: 'divorced', s: 'separated', a: 'divorced' }[(g || 'm')[0]] || 'other');

export function toRecords({ people, pairs }) {
  const persons = [], links = [], partners = [], fields = [];
  for (const [id, f] of people) {
    const dead = f.z === '1' || !!f.d;
    persons.push({
      id, given_name: tidy(f.p || f.n) || '(name unknown)', surname: tidy(f.l), birth_surname: tidy(f.q),
      gender: (f.g || '')[0] && 'mfo'.includes(f.g[0]) ? f.g[0] : '',
      birth_year: yearOf(f.b), is_living: !dead,
      death_date: dead ? dateCore(f.d) : null, death_place: dead ? tidy(f.y) || null : null,
      sort_key: dateCore(f.b) || (f.O ? String(f.O) : null),
    });
    for (const [m, fa, v] of [['m', 'f', 'V'], ['X', 'Y', 'W'], ['K', 'L', 'Q']])
      for (const pid of [f[m], f[fa]]) if (pid && people.has(pid) && pid !== id && !f.R)
        links.push({ child_id: id, parent_id: pid, kind: parentKind(f[v]) });
    const add = (field, value, visibility) => { if (value && value.trim()) fields.push({ person_id: id, field, value: value.trim().slice(0, 4000), visibility }); };
    add('birth_date', exactDate(f.b), dead ? 'family' : 'close');
    add('birth_place', tidy(f.v), 'family');
    add('work', tidy(f.j), 'family');
    add('organisation', tidy(f.E), 'family');
    add('interests', [tidy(f.I), tidy(f.A)].filter(Boolean).join('; '), 'family');
    add('known_as', tidy(f.N), 'family');
    add('about', f.o, 'family');
  }
  // partnerships: from p lines, plus mutual current-partner (s) tags
  const seen = new Map();
  const put = (a, b, info) => { const k = [a, b].sort().join(' '); seen.set(k, Object.assign(seen.get(k) || { a, b }, info)); };
  for (const [k, f] of pairs) { const [a, b] = k.split(' '); if (f.e || f.g || f.m) put(a, b, { kind: partnerKind(f.g), current: f.e === '2' || undefined, start: dateCore(f.m || f.b), place: tidy(f.w) || null }); }
  for (const [id, f] of people) if (f.s && people.has(f.s) && people.get(f.s).s === id) put(id, f.s, { current: true });
  for (const p of seen.values()) partners.push({ person_a: p.a, person_b: p.b, kind: p.kind || 'married', is_current: !!p.current || (p.kind || 'married') === 'married', start_date: p.start || null, place: p.place || null });
  // Birth order without exposing birth dates: the tree is visible to every member, so sort_key
  // holds only the year and a rank within that year ("1983.002"). Full dates live in profile_fields.
  const order = persons.map((p) => ({ p, k: p.sort_key && /^\d{8}$/.test(p.sort_key) ? p.sort_key : (p.birth_year ? String(p.birth_year) + '9999' : null) }))
    .sort((a, b) => (a.k || '99999999').localeCompare(b.k || '99999999'));
  const perYear = new Map();
  for (const { p, k } of order) {
    if (!k) { p.sort_key = null; continue; }
    const y = k.slice(0, 4); const n = (perYear.get(y) || 0) + 1; perYear.set(y, n);
    p.sort_key = `${y}.${String(n).padStart(3, '0')}`;
  }
  const linkKeys = new Set();
  return { persons, links: links.filter((l) => !linkKeys.has(l.child_id + l.parent_id) && linkKeys.add(l.child_id + l.parent_id)), partners, fields };
}

export { toSQL } from './lib/sql.mjs';
import { toSQL } from './lib/sql.mjs';

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--') && !/^--/.test(args[args.indexOf(a) - 1] || ''));
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  if (!file) { console.error('Usage: node scripts/import-familyscript.mjs <export.txt> [--admin-email you@x.com --admin-person ID]'); process.exit(1); }
  const rec = toRecords(parseFamilyScript(readFileSync(file, 'utf8')));
  process.stdout.write(toSQL(rec, { adminEmail: opt('--admin-email'), adminPerson: opt('--admin-person') }));
  console.error(`${rec.persons.length} people, ${rec.links.length} parent links, ${rec.partners.length} partnerships, ${rec.fields.length} details (no contact details).`);
}
