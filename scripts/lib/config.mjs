// The settings check for site.config.json. Pure: used by `npm run check` and by the setup wizard.

export const COMMUNITIES = ['hindi', 'punjabi', 'bengali', 'marathi', 'gujarati', 'urdu', 'tamil', 'telugu', 'kannada', 'malayalam', 'english'];

const url = (u) => { try { return new URL(u); } catch { return null; } };

/** Returns { ok: [lines], todo: [lines], free } — todo lines containing "optional" don't block. */
export function checkConfig(cfg, { communities = COMMUNITIES } = {}) {
  const todo = [], ok = [];
  const check = (good, yes, no) => (good ? ok : todo).push(good ? yes : no);
  const site = url(cfg.siteUrl), api = url(cfg.apiUrl);
  const free = !!(site && site.host.endsWith('.pages.dev'));
  check(cfg.familyName && cfg.familyName !== 'Our Family', `Family name: ${cfg.familyName}`, 'familyName: write your family\'s name (e.g. "Sharma Parivar").');
  check(communities.includes(cfg.community), `Family traditions: ${cfg.community} (each member can still pick their own)`, `community: one of ${communities.join(', ')}.`);
  check(cfg.appName && cfg.appName.length <= 14, `App name: ${cfg.appName}`, 'appName: a short name (up to 14 letters) for the phone\'s home screen.');
  check(site && site.protocol === 'https:' && !site.host.endsWith('.example'), `Website: ${cfg.siteUrl}`, 'siteUrl: your website address, e.g. https://sharmafamily.in');
  check(api && api.protocol === 'https:' && !api.host.endsWith('.example') && site && (api.host.endsWith(site.host) || (free && api.host.endsWith('.workers.dev'))), `API address: ${cfg.apiUrl}`, free ? 'apiUrl: your Worker\'s workers.dev address, e.g. https://family-reminders.yourname.workers.dev' : 'apiUrl: "https://api." + your domain, e.g. https://api.sharmafamily.in');
  if (free) check(cfg.emailSignIn === false, 'Free setup: sign-in with Google only (no emails)', 'emailSignIn: set to false on the free setup (email needs your own domain).');
  else check(/@/.test(cfg.emailFrom || '') && !cfg.emailFrom.endsWith('.example') && site && cfg.emailFrom.endsWith('@' + site.host), `Emails come from: ${cfg.emailFrom}`, 'emailFrom: an address at your domain, e.g. family@sharmafamily.in');
  check(/@/.test(cfg.privacyEmail || '') && !cfg.privacyEmail.endsWith('.example'), `Privacy questions go to: ${cfg.privacyEmail}`, 'privacyEmail: where relatives write about their data.');
  check(cfg.admin?.name && cfg.admin.name !== 'Family Admin', `Admin: ${cfg.admin?.name}`, 'admin.name: your full name, so relatives know who runs the site.');
  check(/\d{10}/.test((cfg.admin?.phone || '').replace(/\D/g, '')), `Admin phone: ${cfg.admin?.phone}`, 'admin.phone: your mobile with country code, e.g. +91 98450 12345. It goes on the emails so relatives know they are genuine.');
  check(/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(cfg.supabaseProjectUrl || ''), 'Supabase project: set', 'supabaseProjectUrl: from Supabase → Project Settings → Data API (https://xxxx.supabase.co).');
  check(/^sb_publishable_/.test(cfg.supabasePublishableKey || ''), 'Supabase publishable key: set', 'supabasePublishableKey: from Supabase → Project Settings → API Keys (starts sb_publishable_).');
  check(/\.apps\.googleusercontent\.com$/.test(cfg.googleClientId || ''), 'Google sign-in: set', free ? 'googleClientId: needed on the free setup (it is the only way to sign in). See docs/SETUP.md, Optional extras.' : 'googleClientId: optional but recommended (Continue with Google). See docs/SETUP.md, Optional extras.');
  check((cfg.vapidPublicKey || '').length > 60, 'Phone notifications: set', 'vapidPublicKey: optional, for phone notifications. See docs/SETUP.md, Optional extras.');
  return { ok, todo, free, blocking: todo.filter((l) => !/optional/.test(l)) };
}

/** Copies the API address, sender and public keys into reminders/wrangler.toml text. */
export function applyToWrangler(toml, cfg) {
  const api = url(cfg.apiUrl);
  const set = (name, value) => { toml = toml.replace(new RegExp(`^${name} = ".*"$`, 'm'), `${name} = ${JSON.stringify(value)}`); };
  // own domain: api.<domain> as a custom domain; free setup: the Worker's own workers.dev address (no route)
  if (api && api.host.endsWith('.workers.dev')) toml = toml.replace(/^routes = .*$/m, (l) => (l.startsWith('# ') ? l : `# ${l}`));
  else if (api) toml = toml.replace(/^(# )?routes = \[\{ pattern = "[^"]*"/m, `routes = [{ pattern = "${api.host}"`);
  if (/supabase\.co$/.test(cfg.supabaseProjectUrl || '')) set('SUPABASE_URL', cfg.supabaseProjectUrl);
  set('EMAIL_FROM', `${cfg.familyName} <${cfg.emailFrom}>`);
  if (cfg.googleClientId) set('GOOGLE_CLIENT_ID', cfg.googleClientId);
  if (cfg.vapidPublicKey) set('VAPID_PUBLIC', cfg.vapidPublicKey);
  return toml;
}
