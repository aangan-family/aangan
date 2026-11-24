#!/usr/bin/env node
// One-click setup: creates or finds everything your family website needs, through each service's API.
// Safe to run again: every step first checks what is already there.
//
//   In GitHub: Actions → "Set up my site" → Run workflow   (.github/workflows/setup.yml)
//   In a Codespace: put the secrets in your shell, then  npm run setup [-- --seed data/seed.sql]
//
// Needs (GitHub → Settings → Secrets and variables → Actions):
//   SUPABASE_ACCESS_TOKEN   supabase.com → Account → Access Tokens
//   CLOUDFLARE_API_TOKEN    Cloudflare → My Profile → API Tokens (permissions in docs/SETUP.md)
//   CLOUDFLARE_ACCOUNT_ID   Cloudflare → Workers & Pages (right-hand side)
//   REMINDER_EMAIL          your Gmail: reminders and health alerts
// Optional: RESEND_API_KEY (full access; own domain only), GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET,
//   PREVIEW_KEY, SUPABASE_DB_PASSWORD (only used when the project is created), SUPABASE_ORG (org slug, if you have several),
//   SUPABASE_REGION (default ap-south-1, Mumbai).
//
// Family data never goes through GitHub: the tree (seed.sql, from the setup wizard) is pasted into Supabase by you,
// or loaded with --seed from a Codespace (data/ is git-ignored).

import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkConfig, applyToWrangler } from './lib/config.mjs';

const host = (u) => { try { return new URL(u).host; } catch { return ''; } };
const placeholder = (u) => !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(u || '');
export const workerName = (toml) => (/^name = "([^"]+)"/m.exec(toml) || [])[1] || 'family-reminders';
/** Cloudflare Pages project name: the .pages.dev name on the free setup, otherwise the domain with dashes. */
export const pagesName = (cfg) => { const h = host(cfg.siteUrl); return h.endsWith('.pages.dev') ? h.slice(0, -'.pages.dev'.length) : h.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 58); };
export const password = (n = 24) => randomBytes(n).toString('base64url');

// ---- hosted edition (docs/HOSTED.md): Aangan runs the site on its own accounts ------------------------------
/** Addresses that can't be a family's: they're Aangan's own, or would confuse people. */
export const RESERVED = new Set(['www', 'api', 'app', 'admin', 'mail', 'email', 'smtp', 'support', 'help', 'status', 'blog', 'docs',
  'aangan', 'privacy', 'legal', 'terms', 'billing', 'pay', 'login', 'signin', 'signup', 'account', 'accounts', 'ops', 'test', 'demo', 'dev', 'staging']);
/** A family's address: 3–30 lowercase letters, digits and single hyphens, starting with a letter, not ending in -api. */
export function checkSlug(slug) {
  if (typeof slug !== 'string' || !/^[a-z](?:[a-z0-9]|-(?!-)){1,28}[a-z0-9]$/.test(slug)) return 'Use 3–30 small letters, numbers or hyphens, starting with a letter (for example sharma or rao-kutumba).';
  if (RESERVED.has(slug) || slug.endsWith('-api')) return 'That address is kept for Aangan itself. Please choose another.';
  return null;
}
/** Everything a hosted family's addresses and names are made from. */
export function hostedNames(slug, domain, mailDomain) {
  return {
    siteUrl: `https://${slug}.${domain}`,
    apiUrl: `https://${slug}-api.${domain}`,   // one level under the domain, so the free certificate covers it
    emailFrom: `${slug}@${mailDomain}`,
    project: `aangan-${slug}`,                 // Supabase project, Worker and Pages project all share this name
  };
}
const EMAIL = /^[^@\s'"\\;]+@[^@\s'"\\;]+\.[a-z]{2,}$/i;

/** VAPID key pair for phone notifications: public = base64url uncompressed point, private = base64url d (reminders/src/push.ts). */
export function vapidKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = publicKey.export({ format: 'jwk' }), priv = privateKey.export({ format: 'jwk' });
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]);
  return { publicKey: raw.toString('base64url'), privateKey: priv.d };
}

class StepError extends Error {}

/** JSON API client. unwrap: Cloudflare's { success, result, errors } envelope. */
function client(io, name, base, token, { unwrap = false } = {}) {
  return async (method, path, body) => {
    const res = await io.fetch(base + path, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'aangan-setup' },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (res.status === 404 && method === 'GET') return null;
    if (!res.ok || (unwrap && data && data.success === false)) {
      const msg = (data && (data.message || data.error || (data.errors || []).map((e) => e.message).join('; '))) || text || res.statusText;
      const err = new StepError(`${name} said: ${String(msg).slice(0, 300)} (${method} ${path.split('?')[0]}, ${res.status})`);
      err.status = res.status; throw err;
    }
    return unwrap ? data?.result : data;
  };
}

/**
 * The whole setup. io: { env, read(path), write(path, text), exists(path), fetch, exec(cmd, args, {cwd, env}), sleep(ms), log(line) }.
 * Paths are relative to the repository root. Returns { done: [...], todo: [...] }.
 */
export async function setup(io, { seed } = {}) {
  const env = io.env, done = [], todo = [];
  const hosted = env.AANGAN_HOSTED === '1';
  // hosted: tell Aangan's backend how far we've got, so the family's progress page can show it (best effort)
  const report = (status, message) => {
    if (!hosted || !env.AANGAN_PROGRESS_URL) return;
    Promise.resolve().then(() => io.fetch(env.AANGAN_PROGRESS_URL, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.AANGAN_PROGRESS_TOKEN || ''}` },
      body: JSON.stringify({ slug: env.AANGAN_SLUG, status, message, step: done.length }) })).catch(() => {});
  };
  const ok = (s) => { done.push(s); io.log('✓ ' + s); report('working', s); };
  const mask = (v) => { if (v && env.GITHUB_ACTIONS === 'true') io.log(`::add-mask::${v}`); return v; };

  // ---- 0. what we have ---------------------------------------------------------------------------------
  const missing = ['SUPABASE_ACCESS_TOKEN', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'REMINDER_EMAIL',
    ...(hosted ? ['AANGAN_DOMAIN', 'AANGAN_MAIL_DOMAIN', 'AANGAN_SLUG', 'AANGAN_ADMIN_EMAIL', 'RESEND_API_KEY'] : [])].filter((k) => !env[k]);
  if (missing.length) throw new StepError(`Add ${missing.join(', ')} as ${env.GITHUB_ACTIONS === 'true' ? 'repository secrets (Settings → Secrets and variables → Actions)' : 'environment variables'}, then run this again. docs/SETUP.md, "One-click setup", says where each comes from.`);
  const cfg = JSON.parse(io.read('site.config.json'));
  const names = hosted ? hostedNames(env.AANGAN_SLUG, env.AANGAN_DOMAIN, env.AANGAN_MAIL_DOMAIN) : null;
  if (hosted) {
    const bad = checkSlug(env.AANGAN_SLUG);
    if (bad) throw new StepError(`Family address "${env.AANGAN_SLUG}": ${bad}`);
    if (!EMAIL.test(env.AANGAN_ADMIN_EMAIL)) throw new StepError('AANGAN_ADMIN_EMAIL is not an email address.');
    // the addresses are Aangan's to choose, never the sheet's
    Object.assign(cfg, { siteUrl: names.siteUrl, apiUrl: names.apiUrl, emailFrom: names.emailFrom, otherSiteUrls: [], emailSignIn: true,
      privacyEmail: env.AANGAN_PRIVACY_EMAIL || cfg.privacyEmail || `privacy@${env.AANGAN_DOMAIN}` });
  }
  const free = !hosted && host(cfg.siteUrl).endsWith('.pages.dev');
  // hosted: the addresses and sender are Aangan's (different domains on purpose); the admin's phone is optional
  const hostedSkip = (l) => hosted && /^(apiUrl|emailFrom|admin\.phone)/.test(l);
  const early = checkConfig(cfg).blocking.filter((l) => !/^(supabaseProjectUrl|supabasePublishableKey|googleClientId)/.test(l) && !(free && /^apiUrl/.test(l)) && !hostedSkip(l));
  if (early.length) throw new StepError('First fill in site.config.json (the setup wizard writes it for you):\n  • ' + early.join('\n  • '));
  const domain = host(cfg.siteUrl);
  const acct = env.CLOUDFLARE_ACCOUNT_ID;
  const sb = client(io, 'Supabase', 'https://api.supabase.com', env.SUPABASE_ACCESS_TOKEN);
  const cf = client(io, 'Cloudflare', 'https://api.cloudflare.com/client/v4', env.CLOUDFLARE_API_TOKEN, { unwrap: true });
  const rs = env.RESEND_API_KEY ? client(io, 'Resend', 'https://api.resend.com', env.RESEND_API_KEY) : null;
  let toml = io.read('reminders/wrangler.toml');
  if (hosted) toml = toml.replace(/^name = "[^"]*"/m, `name = "${names.project}"`);
  const worker = workerName(toml);
  const projectName = hosted ? names.project : cfg.familyName;

  // ---- 1. Supabase project -----------------------------------------------------------------------------
  let ref = placeholder(cfg.supabaseProjectUrl) ? null : host(cfg.supabaseProjectUrl).split('.')[0];
  let project = ref ? await sb('GET', `/v1/projects/${ref}`) : null;
  if (ref && !project) throw new StepError(`site.config.json points to Supabase project ${ref}, but this access token can't see it. Check the token's account, or clear supabaseProjectUrl to make a new project.`);
  if (!project) {
    project = ((await sb('GET', '/v1/projects')) || []).find((p) => p.name === projectName) || null;
    if (project) ok(`Found your Supabase project "${project.name}"`);
  } else ok(`Found your Supabase project "${project.name}"`);
  if (!project) {
    const orgs = (await sb('GET', '/v1/organizations')) || [];
    const org = env.SUPABASE_ORG ? orgs.find((o) => o.slug === env.SUPABASE_ORG || o.id === env.SUPABASE_ORG) : orgs.length === 1 ? orgs[0] : null;
    if (!org) throw new StepError(orgs.length ? `You have ${orgs.length} Supabase organisations. Add a SUPABASE_ORG secret with one of: ${orgs.map((o) => o.slug || o.id).join(', ')}.` : 'Your Supabase account has no organisation yet. Open supabase.com once and create one (free).');
    const dbPass = mask(env.SUPABASE_DB_PASSWORD || password());
    project = await sb('POST', '/v1/projects', { name: projectName, organization_id: org.id, db_pass: dbPass, region: env.SUPABASE_REGION || 'ap-south-1' });
    ok(`Created the Supabase project "${projectName}" (${env.SUPABASE_REGION || 'ap-south-1'})`);
    if (!env.SUPABASE_DB_PASSWORD) todo.push('Backups need the database password, which was made up and not shown. Set a new one in Supabase → Database → Settings → Reset database password, and keep it safe.');
  }
  ref = project.id || project.ref;
  for (let i = 0; project.status !== 'ACTIVE_HEALTHY'; i++) {
    if (i >= 90) throw new StepError('The Supabase project is still starting after 15 minutes. Run this again in a while.');
    if (i === 0) io.log('… waiting for the database to start (usually 2–3 minutes)');
    await io.sleep(10_000);
    project = (await sb('GET', `/v1/projects/${ref}`)) || project;
  }
  const projectUrl = `https://${ref}.supabase.co`;
  const sql = (query) => sb('POST', `/v1/projects/${ref}/database/query`, { query });

  // ---- 2. tables and privacy rules ---------------------------------------------------------------------
  const has = await sql("select to_regclass('public.persons') is not null as ok");
  if (has?.[0]?.ok) ok('The tables and privacy rules are already there');
  else {
    io.log('… creating the tables and privacy rules (supabase/setup.sql)');
    await sql(io.read('supabase/setup.sql'));
    const again = await sql("select to_regclass('public.persons') is not null as ok");
    if (!again?.[0]?.ok) throw new StepError('setup.sql ran but the tables are not there. Open Supabase → SQL Editor and run supabase/setup.sql by hand to see the error.');
    ok('Created the tables and privacy rules');
  }
  if (hosted) {
    // the first admin: the person who signed up, as the site's own Family Admin login (0051, 0036)
    const e = env.AANGAN_ADMIN_EMAIL.toLowerCase().replace(/'/g, "''");
    const r = await sql(`insert into public.invitations (email, role) select '${e}', 'admin' where not exists (select 1 from public.members where role = 'admin') and not exists (select 1 from public.invitations where role = 'admin' and accepted_at is null) returning code`);
    ok(r?.length ? `Invited ${env.AANGAN_ADMIN_EMAIL} as the first admin` : 'The first admin is already invited');
  }
  const people = (await sql('select count(*)::int as n from public.persons'))?.[0]?.n || 0;
  if (seed) {
    if (people) ok(`The tree already has ${people} people; not loading ${seed} again`);
    else { await sql(io.read(seed)); ok(`Loaded your family from ${seed}`); }
  } else if (!people && hosted) todo.push('The family loads its tree on its own site: Admin → Import family.');
  else if (!people) todo.push('Load your family: in the setup wizard (Database step) download seed.sql, then Supabase → SQL Editor → New query → paste → Run. Then delete the file.');
  else ok(`The tree has ${people} people`);

  // ---- 3. API keys ---------------------------------------------------------------------------------------
  let keys = (await sb('GET', `/v1/projects/${ref}/api-keys?reveal=true`)) || [];
  for (const type of ['publishable', 'secret']) if (!keys.some((k) => k.type === type)) {
    await sb('POST', `/v1/projects/${ref}/api-keys?reveal=true`, { type, name: 'default' });
    keys = (await sb('GET', `/v1/projects/${ref}/api-keys?reveal=true`)) || [];
  }
  const publishable = keys.find((k) => k.type === 'publishable')?.api_key;
  const secretKey = mask(keys.find((k) => k.type === 'secret')?.api_key);
  if (!publishable || !secretKey) throw new StepError('Could not read the Supabase API keys. Open Project Settings → API Keys once, then run this again.');
  ok('Read the Supabase keys (the secret key goes only into the Worker)');

  // ---- 4. Cloudflare: domain or workers.dev ------------------------------------------------------------
  let zone = null;
  const zoneName = hosted ? env.AANGAN_DOMAIN : domain;
  if (!free) {
    zone = ((await cf('GET', `/zones?name=${encodeURIComponent(zoneName)}&account.id=${acct}`)) || [])[0] || null;
    if (!zone) throw new StepError(`${zoneName} isn't in this Cloudflare account yet. Add it (Cloudflare → Add a domain) or buy it there, then run this again.`);
    ok(`Found ${zoneName} in Cloudflare`);
  }
  if (free) {
    const sub = (await cf('GET', `/accounts/${acct}/workers/subdomain`))?.subdomain;
    if (!sub) throw new StepError('Your Cloudflare account has no workers.dev name yet. Open Workers & Pages once in the dashboard to choose one, then run this again.');
    cfg.apiUrl = `https://${worker}.${sub}.workers.dev`;
  }

  // ---- 5. settings files -------------------------------------------------------------------------------
  let vapidPrivate = null;
  if (!cfg.vapidPublicKey) { const v = vapidKeys(); cfg.vapidPublicKey = v.publicKey; vapidPrivate = mask(v.privateKey); ok('Made the phone-notification keys'); }
  cfg.supabaseProjectUrl = projectUrl;
  cfg.supabasePublishableKey = publishable;
  if (env.GOOGLE_CLIENT_ID) cfg.googleClientId = env.GOOGLE_CLIENT_ID;
  io.write('site.config.json', JSON.stringify(cfg, null, 2) + '\n');
  toml = applyToWrangler(toml, cfg);
  io.write('reminders/wrangler.toml', toml);
  ok('Wrote site.config.json and reminders/wrangler.toml');
  const left = checkConfig(cfg);
  left.blocking = left.blocking.filter((l) => !/^googleClientId/.test(l) && !hostedSkip(l));   // Google comes later: it is on the to-do list
  if (left.blocking.length) throw new StepError('site.config.json still needs:\n  • ' + left.blocking.join('\n  • '));

  // ---- 6. sign-in email templates in the family's name -------------------------------------------------
  const run = (cmd, args, opts) => { const r = io.exec(cmd, args, opts); if (r.code !== 0) throw new StepError(`${cmd} ${args.join(' ')} failed${opts?.cwd ? ` in ${opts.cwd}` : ''}. The lines above say why.`); return r; };
  run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: 'reminders' });
  run('npm', ['run', 'templates'], { cwd: 'reminders' });
  const subjects = Object.fromEntries(io.read('supabase/templates/subjects.txt').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]));

  // ---- 7. Worker secrets already set? ------------------------------------------------------------------
  const existing = new Set(((await cf('GET', `/accounts/${acct}/workers/scripts/${worker}/secrets`)) || []).map((s) => s.name));
  const auth = (await sb('GET', `/v1/projects/${ref}/config/auth`)) || {};

  // ---- 8. emails (Resend), own domain only -------------------------------------------------------------
  let resendKey = null;
  if (hosted) {
    const d = ((await rs('GET', '/domains'))?.data || []).find((x) => x.name === env.AANGAN_MAIL_DOMAIN);
    if (!d) throw new StepError(`Aangan's sending domain ${env.AANGAN_MAIL_DOMAIN} isn't in Resend. Add and verify it once (operations), then run this again.`);
    if (!existing.has('RESEND_API_KEY') || !auth.smtp_host) {
      // one send-only key per family, so one family's key can be withdrawn without touching the others
      resendKey = mask((await rs('POST', '/api-keys', { name: names.project, permission: 'sending_access', domain_id: d.id }))?.token);
      ok(`Emails will come from "${cfg.familyName}" <${cfg.emailFrom}>`);
    }
  } else if (!free && rs) {
    let d = ((await rs('GET', '/domains'))?.data || []).find((x) => x.name === domain);
    if (!d) { d = await rs('POST', '/domains', { name: domain }); ok(`Added ${domain} to Resend`); } else ok(`${domain} is in Resend`);
    const full = (await rs('GET', `/domains/${d.id}`)) || d;
    for (const r of full.records || []) {
      const name = r.name === '@' || r.name === domain ? domain : r.name.endsWith('.' + domain) ? r.name : `${r.name}.${domain}`;
      const there = (await cf('GET', `/zones/${zone.id}/dns_records?type=${r.type}&name=${encodeURIComponent(name)}`)) || [];
      if (there.some((x) => x.content.replace(/^"|"$/g, '') === r.value.replace(/^"|"$/g, ''))) continue;
      if (r.type === 'TXT' && /spf1/.test(r.value) && there.some((x) => /spf1/.test(x.content))) { todo.push(`${name} already has an SPF record; check it includes Resend's (${r.value}).`); continue; }
      await cf('POST', `/zones/${zone.id}/dns_records`, { type: r.type, name, content: r.value, ttl: 1, proxied: false, ...(r.priority !== undefined ? { priority: Number(r.priority) } : {}) });
    }
    await rs('POST', `/domains/${d.id}/verify`);
    ok('Added the email records to your DNS and asked Resend to verify them (takes a few minutes)');
    if (!existing.has('RESEND_API_KEY') || !auth.smtp_host) {
      resendKey = mask((await rs('POST', '/api-keys', { name: `${cfg.familyName} website`.slice(0, 50), permission: 'sending_access', domain_id: d.id }))?.token);
      ok('Made a send-only email key for the website');
    }
  } else if (free && !(env.GMAIL_USER && env.GMAIL_APP_PASSWORD)) todo.push('Emails (optional on the free setup): to send sign-in links and reminders without a domain, use the admin\'s Gmail. Google account → Security → 2-Step Verification → App passwords → make one, then add GMAIL_USER (the Gmail address) and GMAIL_APP_PASSWORD secrets and run this again. Up to 500 emails a day.');
  else if (!free) todo.push('Emails: add a RESEND_API_KEY secret (resend.com → API Keys → Full access) and run this again. Until then sign-in emails come from Supabase\'s own sender, which allows only a few an hour.');

  // ---- 9. Supabase sign-in settings --------------------------------------------------------------------
  const authPatch = {
    site_url: cfg.siteUrl,
    uri_allow_list: [cfg.siteUrl, ...(cfg.otherSiteUrls || [])].map((u) => u.replace(/\/$/, '') + '/**').join(','),
    mailer_subjects_confirmation: subjects['Confirm signup'],
    mailer_templates_confirmation_content: io.read('supabase/templates/confirm-signup.html'),
    mailer_subjects_magic_link: subjects['Magic Link'],
    mailer_templates_magic_link_content: io.read('supabase/templates/magic-link.html'),
  };
  if (resendKey) Object.assign(authPatch, { smtp_host: 'smtp.resend.com', smtp_port: '465', smtp_user: 'resend', smtp_pass: resendKey, smtp_admin_email: cfg.emailFrom, smtp_sender_name: cfg.familyName });
  // free setup: sign-in emails through the admin's Gmail (app password), from that Gmail address
  else if (env.GMAIL_USER && env.GMAIL_APP_PASSWORD) Object.assign(authPatch, { smtp_host: 'smtp.gmail.com', smtp_port: '465', smtp_user: env.GMAIL_USER, smtp_pass: mask(env.GMAIL_APP_PASSWORD), smtp_admin_email: env.GMAIL_USER, smtp_sender_name: cfg.familyName });
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) Object.assign(authPatch, { external_google_enabled: true, external_google_client_id: env.GOOGLE_CLIENT_ID, external_google_secret: env.GOOGLE_CLIENT_SECRET });
  await sb('PATCH', `/v1/projects/${ref}/config/auth`, authPatch);
  ok(`Set the sign-in settings: site address, emails in your family's name${resendKey ? ', sender' : env.GMAIL_APP_PASSWORD ? ', Gmail sender' : ''}${authPatch.external_google_enabled ? ', Google' : ''}`);
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) todo.push(`${free ? 'Needed on the free setup: ' : 'Recommended: '}Continue with Google. In Google Cloud make an OAuth client (Web): origin ${cfg.siteUrl}, redirect ${cfg.apiUrl}/oauth/google/callback. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET secrets and run this again.`);

  // ---- 10. the helper service (Worker) -----------------------------------------------------------------
  const cfEnv = { CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID: acct };
  run('npx', ['wrangler', 'deploy'], { cwd: 'reminders', env: cfEnv });
  const secrets = { SUPABASE_SERVICE_KEY: secretKey, REMINDER_EMAIL: env.REMINDER_EMAIL };
  if (env.PREVIEW_KEY) secrets.PREVIEW_KEY = env.PREVIEW_KEY;
  else if (!existing.has('PREVIEW_KEY')) { secrets.PREVIEW_KEY = mask(password()); todo.push('A PREVIEW_KEY (for the health page) was made up and not shown. To use the health page, set your own: Worker → Settings → Variables and Secrets.'); }
  if (resendKey) secrets.RESEND_API_KEY = resendKey;
  else if (env.GMAIL_USER && env.GMAIL_APP_PASSWORD) { secrets.GMAIL_USER = env.GMAIL_USER; secrets.GMAIL_APP_PASSWORD = mask(env.GMAIL_APP_PASSWORD); }
  if (env.GOOGLE_CLIENT_SECRET) secrets.GOOGLE_CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET;
  if (vapidPrivate) secrets.VAPID_PRIVATE = vapidPrivate;
  const dir = mkdtempSync(join(tmpdir(), 'aangan-'));
  try {
    const file = join(dir, 'secrets.json');
    writeFileSync(file, JSON.stringify(secrets), { mode: 0o600 });
    run('npx', ['wrangler', 'secret', 'bulk', file], { cwd: 'reminders', env: cfEnv });
  } finally { rmSync(dir, { recursive: true, force: true }); }
  ok(`Put the helper service online at ${cfg.apiUrl} with its secrets (${Object.keys(secrets).join(', ')})`);

  // ---- 11. the website (Pages) -------------------------------------------------------------------------
  const pages = hosted ? names.project : pagesName(cfg);
  if (!(await cf('GET', `/accounts/${acct}/pages/projects/${pages}`))) {
    try { await cf('POST', `/accounts/${acct}/pages/projects`, { name: pages, production_branch: 'main' }); }
    catch (e) { throw new StepError(free ? `The name ${pages}.pages.dev is taken. Choose another website name in the setup wizard (Settings), update site.config.json, and run this again.` : e.message); }
    ok(`Created the website project "${pages}"`);
  }
  run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: 'web' });
  run('npm', ['run', 'build'], { cwd: 'web' });
  run('npx', ['wrangler', 'pages', 'deploy', '../web/dist', '--project-name', pages, '--branch', 'main', '--commit-dirty=true'], { cwd: 'reminders', env: cfEnv });
  if (!free) {
    const doms = (await cf('GET', `/accounts/${acct}/pages/projects/${pages}/domains`)) || [];
    // own domain: the apex; hosted: the family's address under Aangan's domain
    if (!doms.some((d) => d.name === domain)) await cf('POST', `/accounts/${acct}/pages/projects/${pages}/domains`, { name: domain });
    const apex = (await cf('GET', `/zones/${zone.id}/dns_records?name=${encodeURIComponent(domain)}`)) || [];
    if (!apex.some((r) => ['A', 'AAAA', 'CNAME'].includes(r.type))) await cf('POST', `/zones/${zone.id}/dns_records`, { type: 'CNAME', name: domain, content: `${pages}.pages.dev`, proxied: true, ttl: 1 });
  }
  ok(`Put the website online at ${cfg.siteUrl}${free ? '' : ' (the certificate can take up to 15 minutes)'}`);

  // ---- 12. replies to family@ and privacy@ reach you (best effort; own domain only) ---------------------
  if (!free && !hosted) {
    try {
      await cf('POST', `/zones/${zone.id}/email/routing/enable`, {}).catch(() => null);
      await cf('POST', `/accounts/${acct}/email/routing/addresses`, { email: env.REMINDER_EMAIL }).catch((e) => { if (!/exist/i.test(e.message)) throw e; });
      const rules = (await cf('GET', `/zones/${zone.id}/email/routing/rules`)) || [];
      for (const box of [cfg.emailFrom, cfg.privacyEmail].filter((a) => a && a.endsWith('@' + domain)))
        if (!rules.some((r) => (r.matchers || []).some((m) => m.value === box)))
          await cf('POST', `/zones/${zone.id}/email/routing/rules`, { name: `Forward ${box}`, enabled: true, matchers: [{ type: 'literal', field: 'to', value: box }], actions: [{ type: 'forward', value: [env.REMINDER_EMAIL] }] });
      ok(`Forwarding ${cfg.emailFrom} and ${cfg.privacyEmail} to ${env.REMINDER_EMAIL}`);
      todo.push(`Cloudflare emailed ${env.REMINDER_EMAIL} a link to confirm forwarding. Open it once.`);
    } catch (e) { todo.push(`Email forwarding couldn't be set up (${e.message}). Do it by hand: Cloudflare → ${domain} → Email → Email Routing.`); }
  }

  // ---- 13. what's left ---------------------------------------------------------------------------------
  if (hosted) {
    report('ready', `${cfg.siteUrl} is ready`);
    return { done, todo: [`${env.AANGAN_ADMIN_EMAIL} signs in at ${cfg.siteUrl}, turns on 2-step sign-in and imports the family.`], cfg };
  }
  todo.push(`In about 10 minutes, open ${cfg.siteUrl} and sign in with the admin email from your seed.sql. Turn on 2-step sign-in within 7 days (My privacy).`);
  todo.push('Backups (recommended): repository → Settings → Secrets and variables → Actions → add SUPABASE_DB_URL (Supabase → Connect → Session pooler), SUPABASE_SERVICE_KEY and BACKUP_PASSPHRASE.');
  return { done, todo, cfg };
}

// ---- command line / GitHub Actions ---------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const root = new URL('../', import.meta.url).pathname;
  const args = process.argv.slice(2);
  if (args[0] === '--pages-name') { console.log(pagesName(JSON.parse(readFileSync(join(root, 'site.config.json'), 'utf8')))); process.exit(0); }
  const seedArg = args.includes('--seed') ? args[args.indexOf('--seed') + 1] : undefined;
  if (seedArg && process.env.GITHUB_ACTIONS === 'true') { console.error('--seed is for a Codespace only: family data never goes through GitHub.'); process.exit(1); }
  const io = {
    env: process.env,
    read: (p) => readFileSync(join(root, p), 'utf8'),
    write: (p, t) => writeFileSync(join(root, p), t),
    exists: (p) => existsSync(join(root, p)),
    fetch: (...a) => fetch(...a),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (l) => console.log(l),
    exec: (cmd, a, { cwd, env } = {}) => {
      console.log(`$ ${[cmd, ...a].join(' ')}${cwd ? `   (in ${cwd})` : ''}`);
      const r = spawnSync(cmd, a, { cwd: cwd ? join(root, cwd) : root, stdio: 'inherit', env: { ...process.env, ...env } });
      return { code: r.status ?? 1 };
    },
  };
  try {
    const { done, todo } = await setup(io, { seed: seedArg });
    const md = ['## Your family website is set up.', '', ...done.map((d) => `- ✓ ${d}`), '', '### Still to do', '', ...todo.map((t) => `- [ ] ${t}`), ''].join('\n');
    console.log('\n' + md);
    if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, md, { flag: 'a' });
  } catch (e) {
    const msg = e instanceof StepError ? e.message : `Something unexpected went wrong: ${e.stack || e}`;
    console.error('\n✗ ' + msg + '\n\nEverything done so far is kept. Fix this and run the setup again: it carries on from here.');
    if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `## Setup stopped\n\n${msg}\n\nEverything done so far is kept. Fix this and run **Set up my site** again.\n`, { flag: 'a' });
    process.exit(1);
  }
}
