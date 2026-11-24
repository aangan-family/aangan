// Admin numbers: who signs up, how far they get, how many visit. Behind a password set once (stored as a hash on the server).
// The password lives only in this tab (sessionStorage). Charts: one series each, one hue, a tooltip on every bar, a table view.
import { h, download } from './ui.js';
import { admin } from './api.js';
import { TRADITIONS } from './landing.js';

const NAME = Object.fromEntries(TRADITIONS.map(([id, n]) => [id, n]));
const STEPS = [['signed', 'Signed up'], ['sheet_checked', 'Checked their family sheet'], ['settings_saved', 'Saved their settings'],
  ['seed_made', 'Made their family file'], ['accounts_started', 'Started the accounts'], ['accounts_done', 'Finished the accounts']];
const SIZE = { 'under-50': 'Under 50', '50-200': '50 to 200', '200-plus': 'More than 200' };
const fmt = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const KEY = 'aangan-admin';

export function adminPage() {
  const root = h('section', { class: 'admin' });
  let key = ''; try { key = sessionStorage.getItem(KEY) || ''; } catch { /* fine */ }
  const show = async () => {
    root.replaceChildren(h('p', { class: 'muted' }, 'Loading the numbers…'));
    try { const s = await admin.stats(key); try { sessionStorage.setItem(KEY, key); } catch { /* fine */ } root.replaceChildren(dashboard(s, () => { try { sessionStorage.removeItem(KEY); } catch { /* fine */ } key = ''; login(); })); }
    catch (e) { login(e.data?.claim ? 'claim' : 'signin', e.data?.claim ? '' : e.message); }
  };
  const login = (mode = 'signin', error = '') => {
    const input = h('input', { type: 'password', autocomplete: mode === 'claim' ? 'new-password' : 'current-password', 'aria-label': 'Admin password' });
    const err = h('p', { class: 'bad', role: 'alert' }, error);
    root.replaceChildren(h('div', { class: 'card narrow' },
      h('h2', {}, mode === 'claim' ? 'Choose the admin password.' : 'Admin numbers.'),
      h('p', {}, mode === 'claim' ? 'This is the first time. Choose a password of at least 12 characters and keep it safe: it is stored only as a fingerprint, so nobody can tell you what it was.' : 'Sign in with the admin password.'),
      h('form', { onsubmit: async (e) => {
        e.preventDefault(); err.textContent = '';
        if (mode === 'claim') { try { await admin.claim(input.value); } catch (x) { err.textContent = x.message; return; } }
        key = input.value; show();
      } }, h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Password'), input), err,
        h('div', { class: 'row' }, h('button', { class: 'btn', type: 'submit' }, mode === 'claim' ? 'Set it and open the numbers' : 'Open the numbers'),
          mode === 'signin' ? h('button', { class: 'link', type: 'button', onclick: () => login('claim') }, 'First time here?') : null))));
    setTimeout(() => input.focus(), 0);
  };
  key ? show() : login();
  return root;
}

function dashboard(s, signOut) {
  const viewsToday = s.views_by_day.filter((v) => v.day === new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })).reduce((a, v) => a + v.n, 0);
  const viewsByDay = Object.entries(s.views_by_day.reduce((m, v) => ((m[v.day] = (m[v.day] || 0) + v.n), m), {})).map(([day, n]) => ({ day, n }));
  const funnel = STEPS.map(([k, label]) => [label, k === 'signed' ? s.signups : (s.steps[k] || 0)]);
  return h('div', {},
    h('div', { class: 'row spread' }, h('h2', {}, 'Who’s using Aangan.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost', onclick: () => download(`aangan-signups-${new Date().toISOString().slice(0, 10)}.csv`, csv(s.recent), 'text/csv') }, 'Download sign-ups (CSV)'),
        h('button', { class: 'link', onclick: signOut }, 'Sign out'))),
    h('div', { class: 'stats' }, tile(s.signups, 'sign-ups'), tile(s.last7, 'in the last 7 days'), tile(s.active7, 'active in the last 7 days'), tile(viewsToday, 'page views today')),
    h('div', { class: 'grid2' },
      h('div', { class: 'card' }, h('h3', {}, 'Sign-ups per day'), h('p', { class: 'muted' }, 'Last 60 days'), bars(fill60(s.by_day), 'sign-ups')),
      h('div', { class: 'card' }, h('h3', {}, 'Page views per day'), h('p', { class: 'muted' }, 'Last 60 days, all pages'), bars(fill60(viewsByDay), 'views'))),
    h('div', { class: 'card' }, h('h3', {}, 'How far people get'), h('p', { class: 'muted' }, 'People who reached each setup step on the site (one-click setups finish on GitHub, so the last step can look low).'), hbars(funnel, s.signups || 1)),
    h('div', { class: 'grid3' },
      breakdown('Traditions', s.community, (k) => NAME[k] || k),
      breakdown('Country', s.country), breakdown('City', s.city),
      breakdown('Family size', s.family_size, (k) => SIZE[k] || k), breakdown('Heard about us', s.heard_from)),
    h('div', { class: 'card' }, h('h3', {}, 'Latest sign-ups'),
      s.recent.length ? h('div', { class: 'tablewrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['When', 'Name', 'Email', 'Family', 'Traditions', 'Place', 'Size', 'Heard', 'Got to'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, s.recent.map((r) => h('tr', {},
          h('td', {}, fmt(r.created_at)), h('td', {}, r.name), h('td', {}, h('a', { href: `mailto:${r.email}` }, r.email)), h('td', {}, r.family_name || ''),
          h('td', {}, NAME[r.community] || r.community || ''), h('td', {}, [r.city, r.country].filter(Boolean).join(', ')), h('td', {}, SIZE[r.family_size] || ''),
          h('td', {}, r.heard_from || ''), h('td', {}, (STEPS.filter(([k]) => r.steps.includes(k)).pop() || STEPS[0])[1])))))) : h('p', { class: 'muted' }, 'No sign-ups yet.')),
  );
}

const tile = (n, label) => h('div', { class: 'stat' }, h('b', {}, Number(n).toLocaleString('en-IN')), h('span', {}, label));

function fill60(rows) {
  const by = Object.fromEntries(rows.map((r) => [String(r.day).slice(0, 10), r.n]));
  const out = []; const today = new Date();
  for (let i = 59; i >= 0; i--) { const d = new Date(today.getTime() - i * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); out.push({ day: d, n: by[d] || 0 }); }
  return out;
}

/** Vertical bars, one series, one hue; a tooltip on each bar; the table view is the hidden list. */
function bars(rows, unit) {
  const max = Math.max(1, ...rows.map((r) => r.n)), W = 600, H = 140, bw = W / rows.length;
  const tip = h('div', { class: 'tip', role: 'status' });
  const svg = h('svg', { viewBox: `0 0 ${W} ${H + 18}`, class: 'chart', role: 'img', 'aria-label': `${unit} per day` },
    h('line', { x1: 0, x2: W, y1: H, y2: H, class: 'axis' }),
    rows.map((r, i) => {
      const bh = r.n ? Math.max(3, (r.n / max) * (H - 8)) : 0;
      const g = h('g', { class: 'barhit', tabindex: r.n ? '0' : null },
        h('rect', { x: i * bw, y: 0, width: bw, height: H, class: 'hit' }),
        bh ? h('rect', { x: i * bw + 1, y: H - bh, width: Math.max(1, bw - 2), height: bh, rx: Math.min(4, (bw - 2) / 2), class: 'bar' }) : null);
      const say = () => { tip.textContent = `${fmt(r.day)}: ${r.n} ${unit}`; };
      g.addEventListener('mouseenter', say); g.addEventListener('focus', say);
      return g;
    }),
    h('text', { x: 0, y: H + 14, class: 'ticks' }, fmt(rows[0].day)), h('text', { x: W, y: H + 14, class: 'ticks', 'text-anchor': 'end' }, 'today'),
    h('text', { x: W, y: 10, class: 'ticks', 'text-anchor': 'end' }, `max ${max}`));
  const total = rows.reduce((a, r) => a + r.n, 0);
  tip.textContent = `${total} ${unit} in 60 days. Point at a bar for its day.`;
  return h('div', {}, svg, tip,
    h('details', { class: 'tableview' }, h('summary', {}, 'Show as a table'),
      h('table', {}, h('tbody', {}, rows.filter((r) => r.n).map((r) => h('tr', {}, h('td', {}, fmt(r.day)), h('td', {}, String(r.n))))))));
}

/** Horizontal bars with the label and number written beside each (no colour-only meaning). */
function hbars(entries, max) {
  return h('div', { class: 'hbars' }, entries.map(([label, n]) => h('div', { class: 'hbar' },
    h('span', { class: 'hl' }, label), h('span', { class: 'track' }, h('span', { class: 'fill', 'data-w': Math.round((n / max) * 100) })), h('span', { class: 'hn' }, String(n)))));
}

function breakdown(title, obj, label = (k) => k) {
  const entries = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => [label(k), n]);
  return h('div', { class: 'card' }, h('h3', {}, title), entries.length ? hbars(entries, Math.max(1, ...entries.map((e) => e[1]))) : h('p', { class: 'muted' }, 'Nothing yet.'));
}

function csv(rows) {
  const cols = ['created_at', 'name', 'email', 'family_name', 'community', 'city', 'country', 'family_size', 'heard_from', 'last_seen_at', 'steps'];
  const cell = (v) => { const s = Array.isArray(v) ? v.join(' ') : v == null ? '' : String(v); const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
  return '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}
