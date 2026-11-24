// Setup wizard. Runs entirely in the browser: the page's CSP refuses connections to any other site,
// the family sheet is read in memory and never stored, and only the settings and ticks are kept
// (in this browser's localStorage) so a refresh doesn't lose them.
import { rowsToRecords } from '../../scripts/lib/sheet.mjs';
import { toSQL } from '../../scripts/lib/sql.mjs';
import { checkConfig, applyToWrangler, COMMUNITIES } from '../../scripts/lib/config.mjs';
import wranglerToml from '../../reminders/wrangler.toml?raw';
import { readSheetFile } from './read.js';
import { buildPreview, fullName } from './tree.js';
import { accountSteps } from './steps.js';

// ---- tiny DOM helper: text is always set as text, never as HTML ------------------------------------------
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

// ---- saved state (settings and ticks only; never the family sheet) ---------------------------------------
const KEY = 'aangan-wizard';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const saved = load();
const state = {
  s: Object.assign({ level: 'domain', community: 'hindi' }, saved.s || {}),   // settings form
  done: saved.done || {},                                                       // ticked account steps
  sheet: null,                                                                  // { name, rec, preview } — memory only
  adminEmail: '', adminPerson: '',
};
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ s: state.s, done: state.done })); } catch { /* private mode: fine */ } };

const LABELS = { hindi: 'Hindi', punjabi: 'Punjabi', bengali: 'Bengali', marathi: 'Marathi', gujarati: 'Gujarati', urdu: 'Urdu', tamil: 'Tamil', telugu: 'Telugu', kannada: 'Kannada', malayalam: 'Malayalam', english: 'English only' };

/** The settings form → site.config.json */
function config() {
  const s = state.s, free = s.level === 'free';
  const domain = (s.domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const pages = (s.pagesName || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  const worker = (s.workerUrl || '').trim().replace(/\/$/, '');
  return {
    _help: 'Your family\'s settings. The setup guide (docs/SETUP.md) tells you what to put in each line. Nothing here is secret. Made with the setup wizard.',
    familyName: (s.familyName || '').trim() || 'Our Family',
    appName: (s.appName || s.familyName || '').trim().slice(0, 14) || 'Our Family',
    familyStoryHint: (s.familyStoryHint || '').trim() || 'Our family began with…',
    siteUrl: free ? (pages ? `https://${pages}.pages.dev` : '') : (domain ? `https://${domain}` : ''),
    apiUrl: free ? (worker ? (/^https?:\/\//.test(worker) ? worker : `https://${worker}`) : '') : (domain ? `https://api.${domain}` : ''),
    otherSiteUrls: [],
    emailFrom: free ? '' : (domain ? `family@${domain}` : ''),
    privacyEmail: free ? (s.privacyEmail || '').trim() : (domain ? `privacy@${domain}` : ''),
    admin: { name: (s.adminName || '').trim(), shortName: (s.adminShort || s.adminName || '').trim(), phone: (s.adminPhone || '').trim(), whatsapp: (s.adminWhatsapp || s.adminPhone || '').trim() },
    supabaseProjectUrl: (s.supabaseUrl || '').trim().replace(/\/$/, ''),
    supabasePublishableKey: (s.publishableKey || '').trim(),
    googleClientId: (s.googleClientId || '').trim(),
    vapidPublicKey: (s.vapidPublicKey || '').trim(),
    community: s.community || 'hindi',
    emailSignIn: !free,
  };
}

function download(name, content, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function copy(text, btn) {
  try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; }
  catch { btn.textContent = 'Select and copy'; }
  setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
}

// ---- pages -----------------------------------------------------------------------------------------------
const PAGES = [
  { id: 'sheet', n: 1, title: 'Family sheet' },
  { id: 'settings', n: 2, title: 'Settings' },
  { id: 'database', n: 3, title: 'Database' },
  { id: 'accounts', n: 4, title: 'Accounts' },
];
const current = () => PAGES.find((p) => '#' + p.id === location.hash)?.id || 'sheet';
const go = (id) => { location.hash = id; };

function render() {
  const app = document.getElementById('app');
  const page = current();
  app.replaceChildren(
    h('header', { class: 'top' },
      h('p', { class: 'brand' }, 'Aangan'),
      h('h1', {}, 'Set up your family website.'),
      h('p', { class: 'lead' }, 'Four steps. Your family sheet is checked here, on this computer. This page can\'t send anything anywhere: your browser blocks it.'),
    ),
    h('nav', { class: 'steps', 'aria-label': 'Steps' },
      PAGES.map((p) => h('a', { href: '#' + p.id, class: p.id === page ? 'on' : '', 'aria-current': p.id === page ? 'step' : null },
        h('span', { class: 'n' }, stepMark(p.id) ? '✓' : p.n), p.title))),
    h('main', {}, { sheet: sheetPage, settings: settingsPage, database: databasePage, accounts: accountsPage }[page]()),
    h('footer', {},
      h('p', {}, 'Prefer the command line? Everything here is also in docs/SETUP.md.'),
      h('button', { class: 'link', onclick: () => { if (confirm('Forget your settings and ticks on this computer?')) { localStorage.removeItem(KEY); location.reload(); } } }, 'Clear everything on this computer')),
  );
  document.title = `${PAGES.find((p) => p.id === page).title} · Set up your family website`;
}

function stepMark(id) {
  if (id === 'sheet') return !!state.sheet && !state.sheet.rec.problems.length;
  if (id === 'settings') return !checkConfig(config()).blocking.length;
  if (id === 'accounts') { const steps = accountSteps(config()); return steps.every((s) => state.done[s.id]); }
  return false;
}

// 1. Family sheet ------------------------------------------------------------------------------------------
function sheetPage() {
  const input = h('input', { type: 'file', accept: '.xlsx,.csv', class: 'hidden', onchange: (e) => e.target.files[0] && openSheet(e.target.files[0]) });
  const drop = h('label', { class: 'drop', ondragover: (e) => { e.preventDefault(); drop.classList.add('over'); }, ondragleave: () => drop.classList.remove('over'),
    ondrop: (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) openSheet(f); } },
    input, h('strong', {}, state.sheet ? `Checked: ${state.sheet.name}` : 'Drop your family sheet here'), h('span', {}, state.sheet ? 'Drop a newer copy to check it again.' : 'or click to choose it (.xlsx or .csv)'));
  return h('section', {},
    h('h2', {}, 'Your family sheet.'),
    h('p', {}, 'One row per person, with their father, mother and spouse. Start from the template; the Start here tab explains each column.'),
    h('div', { class: 'row' },
      h('a', { class: 'btn', href: 'files/family-tree-template.xlsx', download: 'family-tree-template.xlsx' }, 'Download the template'),
      h('a', { class: 'btn ghost', href: 'files/sample-family.xlsx', download: 'sample-family.xlsx' }, 'See a made-up example'),
      h('button', { class: 'btn ghost', onclick: trySample }, 'Try the wizard with the example')),
    drop,
    state.sheetError ? h('p', { class: 'bad' }, state.sheetError) : null,
    state.sheet ? sheetResult() : null,
  );
}

async function openSheet(file) {
  state.sheetError = '';
  try {
    const rec = rowsToRecords(await readSheetFile(file));
    state.sheet = { name: file.name, rec, preview: buildPreview(rec) };
    if (!rec.persons.some((p) => p.id === state.adminPerson)) state.adminPerson = '';
  } catch (e) { state.sheet = null; state.sheetError = e.message || String(e); }
  render();
}

async function trySample() {
  const res = await fetch('files/sample-family.xlsx');
  openSheet(new File([await res.blob()], 'sample-family.xlsx'));
}

function sheetResult() {
  const { rec, preview } = state.sheet;
  return h('div', {},
    h('div', { class: 'stats' },
      stat(rec.persons.length, 'people'), stat(preview.generations, 'generations'), stat(rec.partners.length, 'couples'),
      stat(preview.living, 'living'), stat(preview.passed, 'passed away')),
    rec.problems.length
      ? h('div', { class: 'card bad' }, h('h3', {}, `Please fix ${rec.problems.length === 1 ? 'this' : `these ${rec.problems.length} things`} in the sheet, then drop it here again.`), h('ul', {}, rec.problems.map((p) => h('li', {}, p))))
      : h('div', { class: 'card good' }, h('h3', {}, 'The sheet looks good.'), h('p', {}, 'Next: your settings.'), h('button', { class: 'btn', onclick: () => go('settings') }, 'Continue')),
    rec.notes.length ? h('div', { class: 'card' }, h('h3', {}, 'Good to know'), h('ul', {}, rec.notes.map((p) => h('li', {}, p)))) : null,
    h('div', { class: 'card' }, h('h3', {}, 'Your tree, at a glance'),
      h('p', { class: 'muted' }, 'Tap a name to fold its family. Only names are shown; nothing from the sheet is kept after you close this page.'),
      h('ul', { class: 'tree' }, preview.roots.map(treeNode)),
      preview.loose.length ? h('div', { class: 'loose' }, h('h4', {}, `Not linked to anyone yet (${preview.loose.length})`), h('p', { class: 'muted' }, 'Fine for now, but they won\'t appear in the tree until you fill in a father, mother or spouse.'), h('p', {}, preview.loose.map(fullName).join(', '))) : null),
  );
}

const stat = (n, label) => h('div', { class: 'stat' }, h('b', {}, n), h('span', {}, label));

function treeNode(node) {
  const label = h('span', { class: 'who' },
    h('span', { class: node.person.is_living ? '' : 'late' }, fullName(node.person)),
    node.person.birth_year ? h('span', { class: 'yr' }, ` ${node.person.birth_year}`) : null,
    node.spouses.map((s) => h('span', { class: 'sp' }, ' & ', h('span', { class: s.person.is_living ? '' : 'late' }, fullName(s.person)), s.ownFamily ? h('span', { class: 'yr', title: 'Also shown with their own parents' }, ' ↗') : null)));
  if (!node.children.length) return h('li', {}, label);
  return h('li', {}, h('details', { open: node.depth < 2 }, h('summary', {}, label, h('span', { class: 'yr' }, ` · ${node.children.length}`)), h('ul', {}, node.children.map(treeNode))));
}

// 2. Settings ----------------------------------------------------------------------------------------------
function settingsPage() {
  const s = state.s, free = s.level === 'free';
  const field = (key, label, hint, attrs = {}) => h('label', { class: 'field' },
    h('span', { class: 'lbl' }, label),
    h('input', { value: s[key] || '', oninput: (e) => { s[key] = e.target.value; save(); refreshCheck(); }, autocomplete: 'off', spellcheck: 'false', ...attrs }),
    hint ? h('span', { class: 'hint' }, hint) : null);
  const checkBox = h('div', { class: 'card', id: 'check' });
  const refreshCheck = () => {
    const cfg = config(), { ok, todo, blocking } = checkConfig(cfg);
    checkBox.replaceChildren(
      h('h3', {}, blocking.length ? 'Still to fill in' : 'All set.'),
      h('ul', { class: 'checks' }, ok.map((l) => h('li', { class: 'ok' }, l)), todo.map((l) => h('li', { class: /optional/.test(l) ? 'opt' : 'todo' }, l))),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => download('site.config.json', JSON.stringify(cfg, null, 2) + '\n', 'application/json') }, 'Download site.config.json'),
        h('button', { class: 'btn ghost', onclick: () => download('wrangler.toml', applyToWrangler(wranglerToml, cfg)) }, 'Download wrangler.toml')),
      h('p', { class: 'muted' }, 'Both files go into your GitHub copy (the Accounts step shows where). You can download them now and again later, once the Supabase keys are in.'));
  };
  refreshCheck();
  return h('section', {},
    h('h2', {}, 'Your settings.'),
    h('p', {}, 'Fill in what you know now. The Supabase and Google lines come later, from the Accounts step. Nothing here is secret.'),
    h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Which setup' },
      h('button', { role: 'radio', 'aria-checked': String(!free), class: free ? '' : 'on', onclick: () => { s.level = 'domain'; save(); render(); } }, h('b', {}, 'Own domain'), h('span', {}, '₹500–900 a year. Email sign-in, reminders, weekly email.')),
      h('button', { role: 'radio', 'aria-checked': String(free), class: free ? 'on' : '', onclick: () => { s.level = 'free'; save(); render(); } }, h('b', {}, 'Free'), h('span', {}, 'A .pages.dev address, Google sign-in only, no emails.'))),
    h('div', { class: 'grid' },
      h('fieldset', {}, h('legend', {}, 'Your family'),
        field('familyName', 'Family name', 'e.g. Sharma Parivar'),
        field('appName', 'Short name for the phone', 'Up to 14 letters', { maxlength: 14 }),
        field('familyStoryHint', 'First words of your family story', 'e.g. Our family comes from…'),
        h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Family traditions'),
          h('select', { onchange: (e) => { s.community = e.target.value; save(); refreshCheck(); } },
            COMMUNITIES.map((c) => h('option', { value: c, selected: s.community === c ? true : null }, LABELS[c] || c))),
          h('span', { class: 'hint' }, 'Family words, menus, calendar and festivals. Each relative can still choose their own.'))),
      h('fieldset', {}, h('legend', {}, 'Address'),
        free
          ? [field('pagesName', 'Website name', 'Your address will be name.pages.dev, e.g. sharma-family'),
             field('workerUrl', 'Helper service address', 'From the Accounts step: the Worker\'s …workers.dev address'),
             field('privacyEmail', 'Where relatives write about their data', 'Your Gmail is fine', { type: 'email' })]
          : [field('domain', 'Your domain', 'e.g. sharmaparivar.in. Emails come from family@ and privacy@ this domain.')]),
      h('fieldset', {}, h('legend', {}, 'You, the admin'),
        field('adminName', 'Your full name', 'Relatives see it on the family\'s emails'),
        field('adminShort', 'What the family calls you', 'e.g. Ravi Mama'),
        field('adminPhone', 'Your mobile', 'With country code, e.g. +91 98450 12345', { type: 'tel' }),
        field('adminWhatsapp', 'WhatsApp number', 'If different', { type: 'tel' })),
      h('fieldset', {}, h('legend', {}, 'From the Accounts step'),
        field('supabaseUrl', 'Supabase Project URL', 'https://xxxx.supabase.co'),
        field('publishableKey', 'Supabase publishable key', 'Starts sb_publishable_. Never the secret key.'),
        field('googleClientId', 'Google client ID', free ? 'Needed on the free setup' : 'Optional, recommended'),
        field('vapidPublicKey', 'Phone notifications key (public)', 'Optional'))),
    checkBox,
  );
}

// 3. Database ----------------------------------------------------------------------------------------------
function databasePage() {
  const sheet = state.sheet;
  const ready = sheet && !sheet.rec.problems.length;
  const makeBtn = h('button', { class: 'btn', onclick: () => download('seed.sql', toSQL(sheet.rec, { adminEmail: state.adminEmail.trim(), adminPerson: state.adminPerson }).replace('Generated from a Family Echo export', 'Generated from your family spreadsheet by the setup wizard')) }, 'Download seed.sql');
  const sync = () => { makeBtn.disabled = !(ready && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((state.adminEmail || '').trim()) && state.adminPerson); };
  sync();
  return h('section', {},
    h('h2', {}, 'Your database files.'),
    h('p', {}, 'Two files you paste into Supabase\'s SQL editor, once each. The Accounts step says when.'),
    h('div', { class: 'card' },
      h('h3', {}, '1. The setup (same for every family)'),
      h('p', {}, 'All the tables and privacy rules.'),
      h('a', { class: 'btn', href: 'files/setup.sql', download: 'setup.sql' }, 'Download setup.sql')),
    h('div', { class: 'card' },
      h('h3', {}, '2. Your family'),
      !ready ? h('p', { class: 'bad' }, sheet ? 'First fix the sheet (step 1).' : 'First check your family sheet (step 1).', ' ', h('button', { class: 'link', onclick: () => go('sheet') }, 'Go to step 1')) : [
        h('p', {}, 'Your tree, plus an invitation for you as the admin. Phone numbers, emails and addresses are never included: each relative adds their own after they join.'),
        h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Your Gmail (your admin sign-in)'),
          h('input', { type: 'email', value: state.adminEmail, autocomplete: 'off', oninput: (e) => { state.adminEmail = e.target.value; sync(); } })),
        h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Which one is you?'),
          h('select', { onchange: (e) => { state.adminPerson = e.target.value; sync(); } },
            h('option', { value: '' }, 'Choose yourself'),
            sheet.rec.persons.filter((p) => p.is_living).map((p) => h('option', { value: p.id, selected: p.id === state.adminPerson ? true : null }, `${fullName(p)}${p.birth_year ? ` (${p.birth_year})` : ''} · ${p.id}`)))),
        makeBtn,
        h('p', { class: 'warn' }, 'seed.sql holds your family\'s names. Paste it into Supabase, then delete it. Never upload it to GitHub.'),
      ]),
  );
}

// 4. Accounts ----------------------------------------------------------------------------------------------
function accountsPage() {
  const steps = accountSteps(config());
  const done = steps.filter((s) => state.done[s.id]).length;
  return h('section', {},
    h('h2', {}, 'Your accounts, one at a time.'),
    h('p', {}, 'About an afternoon. Tick each one off; your ticks stay on this computer.'),
    h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': steps.length, 'aria-valuenow': done }, h('div', { class: 'fill', 'data-w': Math.round((done / steps.length) * 100) })),
    h('p', { class: 'muted' }, `${done} of ${steps.length} done`),
    steps.map((st, i) => h('details', { class: 'acct' + (state.done[st.id] ? ' done' : ''), open: !state.done[st.id] && steps.findIndex((x) => !state.done[x.id]) === i ? true : null },
      h('summary', {}, h('span', { class: 'n' }, state.done[st.id] ? '✓' : i + 1), h('span', {}, h('b', {}, st.title), h('span', { class: 'site' }, st.site))),
      h('p', { class: 'muted' }, st.why),
      h('ol', {}, st.items.map((it) => h('li', {},
        typeof it === 'string' ? it
          : it.copy ? [it.text, ' ', h('code', {}, it.copy), ' ', h('button', { class: 'copy', onclick: (e) => copy(it.copy, e.target) }, 'Copy')]
          : [it.text, ' ', h('button', { class: 'link', onclick: () => go(it.go) }, `Open ${PAGES.find((p) => p.id === it.go).title}`)]))),
      h('label', { class: 'tick' }, h('input', { type: 'checkbox', checked: !!state.done[st.id], onchange: (e) => { state.done[st.id] = e.target.checked; save(); render(); } }), 'Done'))),
    h('p', { class: 'muted' }, 'A button has moved since this was written? Look for the nearest match, or ask in the project\'s Discussions on GitHub.'),
  );
}

window.addEventListener('hashchange', () => { render(); document.querySelector('main')?.scrollTo(0, 0); });
render();
// progress bar width without inline styles (CSP: style-src 'self')
new MutationObserver(() => document.querySelectorAll('.fill[data-w]').forEach((el) => { el.style.width = el.dataset.w + '%'; })).observe(document.getElementById('app'), { childList: true, subtree: true });
document.querySelectorAll('.fill[data-w]').forEach((el) => { el.style.width = el.dataset.w + '%'; });
