// The Aangan project site's backend (project/ in the repository): sign-ups, setup progress, daily page counts.
// Only what the person types into the sign-up form, step names and page names are ever sent. Never the family sheet.
// Goes through the Cloudflare helper (project/api, because some Indian providers block supabase.co), and straight to
// the Edge Function only if the helper can't be reached. VITE_AANGAN_API overrides the helper's address.

export const FUNCTION_URL = 'https://hpabuhhqdguxyfjwoxik.supabase.co/functions/v1/aangan';
export const HELPER_URL = 'https://api.aangan.family';
const OLD_HELPER = 'https://aangan-api.always4vicky.workers.dev';   // until api.aangan.family has settled everywhere
// served from aangan.family itself: talk to the same address (the helper Worker serves both)
const SAME = typeof location !== 'undefined' && /(^|\.)aangan\.family$/.test(location.hostname) ? location.origin : '';
export const API = (import.meta.env?.VITE_AANGAN_API || SAME || HELPER_URL).replace(/\/$/, '');
const ADDRESSES = [...new Set([API, OLD_HELPER, FUNCTION_URL])];

const KEY = 'aangan-signup';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
const write = (v) => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch { /* private mode */ } };

/** This browser's sign-up: { token, name, community, at, pending? } or null. */
export const me = () => read();
export const signedUp = () => !!read();

async function post(path, body, opts) {
  let last;
  for (const base of ADDRESSES) {
    try { return await postTo(base, path, body, opts); }
    catch (e) { if (e.status) throw e; last = e; }   // only a network failure tries the next address
  }
  throw last;
}

async function postTo(base, path, body, { timeout = 12000 } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal, credentials: 'omit' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || 'Something went wrong. Please try again.'); e.status = res.status; e.data = data; throw e; }
    return data;
  } finally { clearTimeout(t); }
}

/**
 * Sign up. If our server can't be reached (some networks block it), the sign-up is kept on this computer and sent
 * later, so nobody is stuck: { ok: true, pending: true }.
 */
export async function signup(form) {
  try {
    const r = await post('/signup', form);
    write({ token: r.token || null, name: form.name, community: form.community || '', at: Date.now() });
    return { ok: true, welcomeBack: !!r.welcome };
  } catch (e) {
    if (e.status) return { ok: false, error: e.message };
    write({ token: null, name: form.name, community: form.community || '', at: Date.now(), pending: form });
    return { ok: true, pending: true };
  }
}

/** Send a sign-up that couldn't be sent before (called on each page). */
export async function retryPending() {
  const s = read();
  if (!s?.pending) return;
  try {
    const r = await post('/signup', s.pending, { timeout: 8000 });
    write({ token: r.token || null, name: s.name, community: s.community, at: s.at });
  } catch (e) { if (e.status && e.status < 500 && e.status !== 429) write({ ...s, pending: undefined }); }
}

const sent = new Set();
/** A setup step reached (step names only), once per step per browser session. */
export function step(name) {
  const s = read();
  if (!s?.token || sent.has(name)) return;
  sent.add(name);
  post('/step', { token: s.token, step: name }, { timeout: 8000 }).catch(() => sent.delete(name));
}

/** One page view, counted per day; nothing about the visitor is sent. Once per page per visit. */
export function view(page) {
  let seen; try { seen = JSON.parse(sessionStorage.getItem('aangan-seen') || '[]'); } catch { seen = []; }
  if (seen.includes(page)) return;
  try { sessionStorage.setItem('aangan-seen', JSON.stringify([...seen, page])); } catch { /* fine */ }
  post('/view', { page }, { timeout: 8000 }).catch(() => {});
}

/** Delete this browser's sign-up from our server and from this computer. */
export async function forget() {
  const s = read();
  if (s?.token) await post('/forget', { token: s.token });
  write(null);
}

export const admin = {
  claim: (key, code) => post('/admin/claim', { key, code }),
  stats: (key) => post('/admin/stats', { key }, { timeout: 20000 }),
};
