// Collects the interface's English phrases from the website's code (JSX text and the usual text props) into
// src/lib/i18n/phrases.json, most used first. `npm run phrases`; a test fails when the list is stale.
// Translations live in src/lib/i18n/<lang>.json, keyed by these phrases; anything missing shows in English.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../src/', import.meta.url).pathname;
const files = [];
(function walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx$/.test(n) && !/\.test\.tsx$/.test(n)) files.push(p); } })(ROOT);

const count = new Map();
const add = (s) => {
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length < 2 || s.length > 160) return;
  if (!/[A-Za-z]{2}/.test(s)) return;                   // needs words
  if (/[{}<>]|=>|\$\{|^[a-z][a-zA-Z0-9]*$|^[a-z-]+(\s[a-z-]+)*$/.test(s) && !/[A-Z]/.test(s[0])) return; // code-ish
  if (/^(https?:|#\/|\/|\.)/.test(s)) return;
  count.set(s, (count.get(s) || 0) + 1);
};
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  // JSX text between tags: >Some words<
  for (const m of src.matchAll(/>([^<>{}\n]*[A-Za-z][^<>{}\n]*)</g)) add(m[1]);
  // common text props
  for (const m of src.matchAll(/\b(?:title|placeholder|aria-label|label|alt)=["']([^"'{}]{2,160})["']/g)) add(m[1]);
  // string literals that start with a capital and read like a sentence or label (button text in arrays, notes…)
  for (const m of src.matchAll(/(['"`])([A-Z][^'"`\n{}$<>]{1,158})\1/g)) if (/\s/.test(m[2]) || /^[A-Z][a-z]+\.?$/.test(m[2])) add(m[2]);
}
const list = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([s]) => s);
const out = new URL('../src/lib/i18n/phrases.json', import.meta.url);
const text = JSON.stringify(list, null, 0).replace(/","/g, '",\n"') + '\n';
if (process.argv.includes('--check')) { const old = readFileSync(out, 'utf8'); process.exit(old === text ? 0 : 1); }
writeFileSync(out, text);
console.log(`${list.length} phrases`);
