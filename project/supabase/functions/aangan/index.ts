// Aangan project site API: sign-ups, setup progress, daily page counts, admin numbers.
// Public endpoints check their own input; no family data is ever accepted here.
// Reached from India through the Cloudflare helper (api/ in the repo), since supabase.co is blocked by some providers.
// Deployed to the `aangan` Supabase project with verify_jwt = false (it checks its own input and the admin password).
import { createClient } from 'npm:@supabase/supabase-js@2';

const ORIGINS = ['https://aangan-family.github.io', 'http://localhost:4179', 'http://localhost:5173'];
const STEPS = ['sheet_checked', 'settings_saved', 'seed_made', 'accounts_started', 'accounts_done', 'oneclick_chosen', 'byhand_chosen'];
const PAGES = ['home', 'signup', 'sheet', 'settings', 'database', 'accounts'];
const SIZES = ['under-50', '50-200', '200-plus'];
// hosted edition (docs/HOSTED.md): family addresses, the same rules as scripts/setup.mjs checkSlug()
const SLUG = /^[a-z](?:[a-z0-9]|-(?!-)){1,28}[a-z0-9]$/;
const RESERVED = new Set(['www', 'api', 'app', 'admin', 'mail', 'email', 'smtp', 'support', 'help', 'status', 'blog', 'docs',
  'aangan', 'privacy', 'legal', 'terms', 'billing', 'pay', 'login', 'signin', 'signup', 'account', 'accounts', 'ops', 'test', 'demo', 'dev', 'staging']);
const slugProblem = (s: string) => !SLUG.test(s) ? 'Use 3–30 small letters, numbers or hyphens, starting with a letter.' : (RESERVED.has(s) || s.endsWith('-api')) ? 'That address is kept for Aangan itself.' : null;
// the declaration the admin ticks (docs/legal/declaration.md); bump the version when the wording changes
const DECLARATION_VERSION = '0.1-draft';
const DECLARATION_KEYS = ['own_family', 'relatives_only', 'children', 'keep_signin_safe', 'accept_terms'];
const CONSENT = 'I agree that Aangan keeps these sign-up details to count who is setting up a family website and to contact me about it. I can delete them any time.';

const secret = (() => { try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default; } catch { return undefined; } })();
const db = createClient(Deno.env.get('SUPABASE_URL')!, secret || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const hits = new Map<string, number[]>();
function limited(key: string, max: number, ms = 60_000) {
  const now = Date.now(), list = (hits.get(key) || []).filter((t) => now - t < ms);
  list.push(now); hits.set(key, list);
  return list.length > max;
}
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/[\u0000-\u001f]/g, ' ').slice(0, max) : '');
async function sha256(s: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v);

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const cors: Record<string, string> = {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Vary': 'Origin',
  };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Not found' }, 404);
  if (origin && !ORIGINS.includes(origin)) return reply({ error: 'Not allowed' }, 403);
  const path = new URL(req.url).pathname.replace(/^.*\/aangan/, '') || '/';
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return reply({ error: 'Send JSON.' }, 400); }

  try {
    if (path === '/view') {
      const page = text(b.page, 20);
      if (!PAGES.includes(page) || limited('v' + ip, 60)) return reply({ ok: true });
      await db.rpc('count_view', { p: page });
      return reply({ ok: true });
    }

    if (path === '/signup') {
      if (limited('s' + ip, 5)) return reply({ error: 'Too many tries. Please wait a minute and try again.' }, 429);
      if (text(b.website, 100)) return reply({ token: null, welcome: true });   // honeypot: people never fill it
      const row = {
        name: text(b.name, 120), email: text(b.email, 200).toLowerCase(),
        family_name: text(b.family_name, 120) || null, community: text(b.community, 40) || null,
        city: text(b.city, 80) || null, country: text(b.country, 80) || null,
        family_size: SIZES.includes(text(b.family_size, 20)) ? text(b.family_size, 20) : null,
        consent_text: CONSENT,
      };
      if (!row.name) return reply({ error: 'Please write your name.' }, 400);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email)) return reply({ error: 'Please check your email address.' }, 400);
      if (b.consent !== true) return reply({ error: 'Please tick the box to agree, so we can keep your sign-up.' }, 400);
      const { data, error } = await db.from('signups').insert(row).select('id').single();
      if (error) {
        // already signed up: change nothing, and give nothing back that would let a stranger edit or delete it
        if (error.code === '23505') return reply({ token: null, welcome: true });
        throw error;
      }
      return reply({ token: data.id, welcome: false });
    }

    if (path === '/step') {
      const step = text(b.step, 30);
      if (!uuid(b.token) || !STEPS.includes(step) || limited('t' + ip, 60)) return reply({ ok: true });
      await db.from('setup_steps').upsert({ signup_id: b.token, step }, { onConflict: 'signup_id,step', ignoreDuplicates: true });
      await db.from('signups').update({ last_seen_at: new Date().toISOString() }).eq('id', b.token);
      return reply({ ok: true });
    }

    if (path === '/forget') {
      if (!uuid(b.token)) return reply({ error: 'Nothing to delete on this computer.' }, 400);
      await db.from('signups').delete().eq('id', b.token);
      return reply({ ok: true });
    }

    if (path === '/address') {
      // is this family address free? (no names or emails given back)
      if (limited('d' + ip, 30)) return reply({ error: 'Too many tries. Please wait a minute.' }, 429);
      const slug = text(b.slug, 40).toLowerCase();
      const problem = slugProblem(slug);
      if (problem) return reply({ available: false, problem });
      const { count } = await db.from('families').select('id', { count: 'exact', head: true }).eq('slug', slug).neq('status', 'deleted');
      return reply({ available: !count, problem: count ? 'Another family has that address. Try adding your town or a word, like sharma-jaipur.' : null });
    }

    if (path === '/family/start') {
      // the signed-up admin chooses the address and accepts the declaration; payment comes next
      if (!uuid(b.token)) return reply({ error: 'Please sign up first.' }, 400);
      if (limited('f' + ip, 5)) return reply({ error: 'Too many tries. Please wait a minute.' }, 429);
      const slug = text(b.slug, 40).toLowerCase(), problem = slugProblem(slug);
      if (problem) return reply({ error: problem }, 400);
      const answers = (b.declaration && typeof b.declaration === 'object') ? b.declaration as Record<string, unknown> : {};
      if (!DECLARATION_KEYS.every((k) => answers[k] === true)) return reply({ error: 'Please tick every box to continue.' }, 400);
      const { data: su } = await db.from('signups').select('id, email, family_name, community').eq('id', b.token).maybeSingle();
      if (!su) return reply({ error: 'Please sign up again: we could not find your sign-up.' }, 400);
      const familyName = text(b.family_name, 120) || su.family_name;
      if (!familyName) return reply({ error: 'Please write your family\'s name.' }, 400);
      const row = { signup_id: su.id, slug, family_name: familyName, community: su.community, admin_email: su.email,
        declaration_version: DECLARATION_VERSION, declaration: Object.fromEntries(DECLARATION_KEYS.map((k) => [k, true])) };
      const { error } = await db.from('families').insert(row);
      if (error) {
        if (error.code === '23505') return reply({ error: /slug/.test(error.message) ? 'Another family has just taken that address. Please choose another.' : 'You already have a family site on the way.' }, 409);
        throw error;
      }
      return reply({ ok: true, next: 'payment' });
    }

    if (path === '/family/status') {
      // the progress page: only for the browser that signed up (its token), and only status and plain messages
      if (!uuid(b.token) || limited('p' + ip, 60)) return reply({ status: null });
      const { data } = await db.rpc('family_progress', { p_signup: b.token });
      return reply(data || { status: null });
    }

    if (path === '/progress') {
      // reports from the setup run (scripts/setup.mjs report()); only with Aangan's operations token
      const want = Deno.env.get('PROVISION_TOKEN');
      if (!want) return reply({ error: 'Not set up yet.' }, 503);
      const got = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
      // compare fingerprints, so the check takes the same time however much of the token matches
      if (!got || await sha256(got) !== await sha256(want)) return reply({ error: 'Not allowed' }, 403);
      const status = text(b.status, 10);
      if (!['working', 'ready', 'failed'].includes(status)) return reply({ error: 'Unknown status.' }, 400);
      const { error } = await db.rpc('provision_report', { p_slug: text(b.slug, 40), p_status: status, p_step: Number.isInteger(b.step) ? b.step : null, p_message: text(b.message, 500) });
      if (error) return reply({ error: 'No family in setup with that address.' }, 404);
      return reply({ ok: true });
    }

    if (path === '/admin/claim') {
      const key = text(b.key, 200);
      if (limited('a' + ip, 5)) return reply({ error: 'Too many tries. Wait a minute.' }, 429);
      if (key.length < 12) return reply({ error: 'Choose a password of at least 12 characters.' }, 400);
      const { data: have } = await db.from('admin_key').select('id').maybeSingle();
      if (have) return reply({ error: 'An admin password is already set. Sign in with it.' }, 409);
      // only the owner can set it: a one-time setup code, kept only as a fingerprint and used up here
      const { data: used } = await db.from('admin_setup_code').delete().eq('hash', await sha256('aangan-setup:' + text(b.code, 100))).select('hash');
      if (!used?.length) return reply({ error: 'That setup code is not right. Check it, or ask for a new one.' }, 403);
      await db.from('admin_key').insert({ hash: await sha256('aangan-admin:' + key) });
      return reply({ ok: true });
    }

    if (path === '/admin/stats') {
      const key = text(b.key, 200);
      if (limited('a' + ip, 10)) return reply({ error: 'Too many tries. Wait a minute.' }, 429);
      const { data: have } = await db.from('admin_key').select('hash').maybeSingle();
      if (!have) return reply({ error: 'No admin password yet.', claim: true }, 401);
      if (have.hash !== await sha256('aangan-admin:' + key)) return reply({ error: 'That password is not right.' }, 401);
      const { data, error } = await db.rpc('stats');
      if (error) throw error;
      const { data: hosted } = await db.rpc('hosted_stats');
      return reply({ ...data, hosted: hosted || null });
    }

    return reply({ error: 'Not found' }, 404);
  } catch (e) {
    console.error(path, e);
    return reply({ error: 'Something went wrong on our side. Please try again.' }, 500);
  }
});
