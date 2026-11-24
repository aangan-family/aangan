// node --test tests/wizard.test.mjs — the setup wizard's pure parts (wizard/src) and the shared settings check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rowsToRecords } from '../scripts/lib/sheet.mjs';
import { checkConfig, applyToWrangler } from '../scripts/lib/config.mjs';
import { buildPreview, fullName } from '../wizard/src/tree.js';
import { accountSteps, oneClickSteps } from '../wizard/src/steps.js';
import { PICTURES } from '../wizard/src/pictures.js';

// made-up people only
const COLS = { ID: '', 'First name': '', Surname: '', Gender: '', Father: '', Mother: '', Spouse: '', Living: '', Born: '' };
const sheet = (list) => list.map((r) => ({ ...COLS, ...r }));   // like a real sheet: every row has every column
const rows = sheet([
  { ID: 'A', 'First name': 'Gopal', Surname: 'Rao', Gender: 'M', Living: 'No', Born: '1930' },
  { ID: 'B', 'First name': 'Sita', Surname: 'Rao', Gender: 'F', Spouse: 'A', Born: '1935' },
  { ID: 'C', 'First name': 'Mohan', Surname: 'Rao', Father: 'A', Mother: 'B', Spouse: 'D', Born: '1960' },
  { ID: 'D', 'First name': 'Leela', Surname: 'Rao', Father: 'E', Born: '1962' },
  { ID: 'E', 'First name': 'Hari', Surname: 'Nair', Gender: 'M', Born: '1938' },
  { ID: 'F', 'First name': 'Tara', Surname: 'Rao', Father: 'C', Mother: 'D', Born: '1990' },
  { ID: 'G', 'First name': 'Lone', Surname: 'Person', Born: '1970' },
]);

test('tree preview: families, married-in spouses under their own parents, loose people', () => {
  const rec = rowsToRecords(rows);
  assert.deepEqual(rec.problems, []);
  const pv = buildPreview(rec);
  assert.equal(pv.generations, 3);
  assert.equal(pv.passed, 1);
  const names = (n) => [fullName(n.person), ...n.spouses.map((s) => fullName(s.person))];
  const rao = pv.roots.find((r) => r.person.id === 'A');
  assert.deepEqual(names(rao), ['Gopal Rao', 'Sita Rao']);
  assert.equal(rao.children[0].person.id, 'C');
  assert.equal(rao.children[0].spouses[0].ownFamily, true);               // Leela has her own father in the sheet
  assert.equal(rao.children[0].children[0].person.id, 'F');
  const nair = pv.roots.find((r) => r.person.id === 'E');
  assert.ok(nair, 'Hari Nair still gets his own family');
  assert.equal(nair.children[0].person.id, 'D');                          // Leela under her father
  assert.equal(nair.children[0].children.length, 0);                      // Tara is listed once, not twice
  assert.ok(!pv.roots.some((r) => r.person.id === 'B'), 'Sita is beside Gopal, not a second family');
  assert.deepEqual(pv.loose.map((p) => p.id), ['G']);
});

test('tree preview survives a loop in the sheet', () => {
  const rec = rowsToRecords(sheet([
    { ID: 'X', 'First name': 'Ek', Father: 'Y' },
    { ID: 'Y', 'First name': 'Do', Father: 'X' },
  ]));
  const pv = buildPreview(rec);
  assert.equal(pv.roots.length, 1);
  assert.equal(pv.loose.length, 0);
});

const good = {
  familyName: 'Rao Kutumba', appName: 'Raos', siteUrl: 'https://raokutumba.in', apiUrl: 'https://api.raokutumba.in',
  emailFrom: 'family@raokutumba.in', privacyEmail: 'privacy@raokutumba.in', admin: { name: 'Mohan Rao', phone: '+91 98450 00000' },
  supabaseProjectUrl: 'https://abcdefghijklmnopqrst.supabase.co', supabasePublishableKey: 'sb_publishable_x', community: 'kannada', emailSignIn: true,
};

test('settings check: own domain passes without the optional lines; free setup needs Google', () => {
  const r = checkConfig(good);
  assert.deepEqual(r.blocking, []);
  assert.equal(r.todo.length, 2); // Google and phone notifications: optional
  const free = checkConfig({ ...good, siteUrl: 'https://raos.pages.dev', apiUrl: 'https://family-reminders.raos.workers.dev', emailSignIn: false, emailFrom: '' });
  assert.equal(free.free, true);
  assert.equal(free.blocking.length, 1);
  assert.match(free.blocking[0], /googleClientId/);
  assert.match(checkConfig({ ...good, community: 'klingon' }).blocking[0], /community/);
});

test('settings are copied into the Worker config', () => {
  const toml = applyToWrangler(readFileSync(new URL('../reminders/wrangler.toml', import.meta.url), 'utf8'), good);
  assert.match(toml, /^routes = \[\{ pattern = "api\.raokutumba\.in", custom_domain = true \}\]$/m);
  assert.match(toml, /^SUPABASE_URL = "https:\/\/abcdefghijklmnopqrst\.supabase\.co"$/m);
  assert.match(toml, /^EMAIL_FROM = "Rao Kutumba <family@raokutumba\.in>"$/m);
  const free = applyToWrangler(toml, { ...good, apiUrl: 'https://family-reminders.raos.workers.dev' });
  assert.match(free, /^# routes = /m);
});

test('account walkthrough: free setup skips domain and email steps; values are filled in', () => {
  const own = accountSteps(good);
  assert.ok(own.find((s) => s.id === 'domain') && own.find((s) => s.id === 'email'));
  const google = own.find((s) => s.id === 'google');
  assert.ok(google.items.some((i) => i.copy === 'https://api.raokutumba.in/oauth/google/callback'));
  assert.ok(own.find((s) => s.id === 'family').items.some((i) => i.copy === 'https://raokutumba.in/#/join'));
  const free = accountSteps({ ...good, siteUrl: 'https://raos.pages.dev', apiUrl: 'https://w.raos.workers.dev' });
  assert.ok(!free.find((s) => s.id === 'domain') && !free.find((s) => s.id === 'email'));
  assert.match(free.find((s) => s.id === 'google').title, /needed/);
  for (const s of own) for (const i of s.items) if (i.go) assert.ok(['sheet', 'settings', 'database', 'accounts'].includes(i.go));
});

test('one-click walkthrough: secrets to copy, the button, then loading the family locally', () => {
  const own = oneClickSteps(good);
  const ids = own.map((s) => s.id);
  assert.deepEqual(ids, ['github', 'domain', 'keys', 'google', 'run', 'load', 'signin', 'family', 'extras']);
  const names = own.find((s) => s.id === 'keys').items.filter((i) => i.copy).map((i) => i.copy);
  assert.deepEqual(names, ['SUPABASE_ACCESS_TOKEN', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'REMINDER_EMAIL', 'RESEND_API_KEY']);
  // every secret the setup workflow reads is either listed here or optional
  const wf = readFileSync(new URL('../.github/workflows/setup.yml', import.meta.url), 'utf8');
  for (const n of names) assert.ok(wf.includes(`secrets.${n}`), n);
  const free = oneClickSteps({ ...good, siteUrl: 'https://raos.pages.dev', apiUrl: '' });
  assert.ok(!free.find((s) => s.id === 'domain'));
  assert.ok(!free.find((s) => s.id === 'keys').items.some((i) => i.copy === 'RESEND_API_KEY'));
  for (const s of own) assert.ok(s && s.title && s.items.length, 'no empty steps');
});

test('every account step has a where-to-click picture, using the step\'s own words', () => {
  const cfgs = [good, { ...good, siteUrl: 'https://raos.pages.dev', apiUrl: 'https://w.raos.workers.dev' }];
  for (const cfg of cfgs) for (const st of [...accountSteps(cfg), ...oneClickSteps(cfg)]) {
    const p = PICTURES[st.id];
    assert.ok(p, `picture for ${st.id}`);
    const text = st.items.map((i) => (typeof i === 'string' ? i : i.text)).join(' ');
    // the highlighted menu item (or, with no menu, the button) is named in the step, so they can't drift apart
    const named = p.on >= 0 && p.nav.length ? p.nav[p.on] : p.button;
    if (!(st.id === 'signin' && !cfg.siteUrl.endsWith('.pages.dev'))) assert.ok(text.includes(named), `${st.id}: "${named}" in the step text`);
  }
});
