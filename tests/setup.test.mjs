// node --test tests/setup.test.mjs — one-click setup (scripts/setup.mjs) against fake Supabase, Cloudflare and Resend.
// The fakes keep state, so a second run shows the setup is safe to repeat. Made-up family only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setup, pagesName, vapidKeys, workerName, checkSlug, hostedNames } from '../scripts/setup.mjs';

const REF = 'abcdefghijklmnopqrst';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

function world({ free = false, hosted = false, orgs = [{ id: 'org1', slug: 'rao' }] } = {}) {
  const s = {
    projects: [], tables: false, persons: 0, keys: [], auth: {}, zones: free ? [] : [{ id: 'z1', name: hosted ? 'aangan.family' : 'raokutumba.in' }], invites: [], progress: [],
    dns: [], workerSecrets: [], pages: [], pageDomains: [], resendDomains: [], resendKeys: 0, rules: [], addresses: [],
    calls: [], execs: [], files: {},
  };
  s.files['site.config.json'] = JSON.stringify({
    familyName: 'Rao Kutumba', appName: 'Raos', familyStoryHint: 'x',
    siteUrl: free ? 'https://raos.pages.dev' : 'https://raokutumba.in', apiUrl: free ? '' : 'https://api.raokutumba.in', otherSiteUrls: [],
    emailFrom: free ? '' : 'family@raokutumba.in', privacyEmail: free ? 'mohan@gmail.com' : 'privacy@raokutumba.in',
    admin: { name: 'Mohan Rao', shortName: 'Mohan', phone: '+91 98450 00000', whatsapp: '' },
    supabaseProjectUrl: 'https://YOUR-PROJECT.supabase.co', supabasePublishableKey: '', googleClientId: '', vapidPublicKey: '',
    community: 'kannada', emailSignIn: !free,
  });
  s.files['reminders/wrangler.toml'] = read('reminders/wrangler.toml');
  if (hosted) s.resendDomains.push({ id: 'd1', name: 'mail.aangan.family', records: [] });
  s.files['supabase/setup.sql'] = '-- setup';
  s.files['data/seed.sql'] = '-- seed';
  const reply = (status, body) => ({ ok: status < 400, status, statusText: String(status), text: async () => (body === undefined ? '' : JSON.stringify(body)) });
  const cfOk = (result) => reply(200, { success: true, errors: [], result });
  const fetch = async (url, { method, body, headers }) => {
    const u = new URL(url), p = u.pathname, b = body ? JSON.parse(body) : undefined;
    s.calls.push(`${method} ${u.host} ${p}`);
    if (u.host === 'api.supabase.com') {
      if (method === 'GET' && p === '/v1/projects') return reply(200, s.projects);
      if (method === 'GET' && p === '/v1/organizations') return reply(200, orgs);
      if (method === 'POST' && p === '/v1/projects') { const pr = { id: REF, name: b.name, status: 'COMING_UP', region: b.region }; s.projects.push(pr); s.created = b; return reply(201, pr); }
      let m;
      if ((m = /^\/v1\/projects\/(\w+)$/.exec(p))) { const pr = s.projects.find((x) => x.id === m[1]); if (pr) { const out = { ...pr }; pr.status = 'ACTIVE_HEALTHY'; return reply(200, out); } return reply(404, { message: 'not found' }); }
      if (p.endsWith('/database/query')) {
        const q = b.query;
        if (q.includes('to_regclass')) return reply(201, [{ ok: s.tables }]);
        if (q.includes('count(*)')) return reply(201, [{ n: s.persons }]);
        if (q === '-- setup') { s.tables = true; s.setupRuns = (s.setupRuns || 0) + 1; return reply(201, []); }
        if (q === '-- seed') { s.persons = 7; return reply(201, []); }
        if (q.startsWith('insert into public.invitations')) { s.inviteSql = q; if (s.invites.length) return reply(201, []); s.invites.push(q); return reply(201, [{ code: 'abc123def456' }]); }
      }
      if (p.endsWith('/api-keys') && method === 'GET') return reply(200, s.keys);
      if (p.endsWith('/api-keys') && method === 'POST') { s.keys.push({ type: b.type, name: b.name, api_key: b.type === 'secret' ? 'sb_secret_SHH' : 'sb_publishable_pub' }); return reply(201, s.keys.at(-1)); }
      if (p.endsWith('/config/auth') && method === 'GET') return reply(200, s.auth);
      if (p.endsWith('/config/auth') && method === 'PATCH') { Object.assign(s.auth, b); return reply(200, s.auth); }
    }
    if (u.host === 'api.cloudflare.com') {
      const q = p.replace('/client/v4', '');
      if (q === '/zones') return cfOk(s.zones.filter((z) => z.name === u.searchParams.get('name')));
      if (q === '/accounts/acc1/workers/subdomain') return cfOk({ subdomain: 'raos' });
      if (/^\/accounts\/acc1\/workers\/scripts\/[\w-]+\/secrets$/.test(q)) return s.deployed ? cfOk(s.workerSecrets.map((name) => ({ name }))) : reply(404, { success: false, errors: [{ message: 'no script' }] });
      if (q === '/zones/z1/dns_records' && method === 'GET') return cfOk(s.dns.filter((r) => (!u.searchParams.get('type') || r.type === u.searchParams.get('type')) && r.name === u.searchParams.get('name')));
      if (q === '/zones/z1/dns_records' && method === 'POST') { s.dns.push(b); return cfOk(b); }
      let m;
      if ((m = /^\/accounts\/acc1\/pages\/projects\/([\w-]+)$/.exec(q))) return s.pages.includes(m[1]) ? cfOk({ name: m[1] }) : reply(404, { success: false, errors: [{ message: 'not found' }] });
      if (q === '/accounts/acc1/pages/projects' && method === 'POST') { s.pages.push(b.name); return cfOk(b); }
      if (/\/domains$/.test(q) && method === 'GET') return cfOk(s.pageDomains.map((name) => ({ name })));
      if (/\/domains$/.test(q) && method === 'POST') { s.pageDomains.push(b.name); return cfOk(b); }
      if (q === '/zones/z1/email/routing/enable') return cfOk({});
      if (q === '/accounts/acc1/email/routing/addresses') { if (s.addresses.includes(b.email)) return reply(400, { success: false, errors: [{ message: 'address already exists' }] }); s.addresses.push(b.email); return cfOk(b); }
      if (q === '/zones/z1/email/routing/rules' && method === 'GET') return cfOk(s.rules);
      if (q === '/zones/z1/email/routing/rules' && method === 'POST') { s.rules.push(b); return cfOk(b); }
    }
    if (u.host === 'api.resend.com') {
      if (p === '/domains' && method === 'GET') return reply(200, { data: s.resendDomains });
      if (p === '/domains' && method === 'POST') { const d = { id: 'd1', name: b.name, records: [
        { record: 'DKIM', name: 'resend._domainkey', type: 'TXT', value: 'p=KEY' },
        { record: 'SPF', name: 'send', type: 'MX', value: 'feedback-smtp.ap-northeast-1.amazonses.com', priority: 10 },
        { record: 'SPF', name: 'send', type: 'TXT', value: 'v=spf1 include:amazonses.com ~all' },
      ] }; s.resendDomains.push(d); return reply(201, d); }
      if (p === '/domains/d1') return reply(200, s.resendDomains[0]);
      if (p === '/domains/d1/verify') return reply(200, {});
      if (p === '/api-keys') { s.resendKeys++; s.keyBody = b; return reply(201, { id: 'k', token: 're_SEND' + s.resendKeys }); }
    }
    if (u.host === 'ops.aangan.test') { s.progress.push({ auth: headers?.authorization, ...b }); return reply(200, {}); }
    return reply(599, { message: `fake has no ${method} ${url}` });
  };
  const exec = (cmd, args, opts = {}) => {
    s.execs.push([cmd, ...args].join(' ') + (opts.cwd ? ` @${opts.cwd}` : ''));
    if (args.join(' ') === 'run templates') { s.files['supabase/templates/subjects.txt'] = 'Confirm signup: You are invited\nMagic Link: Your link\n'; s.files['supabase/templates/confirm-signup.html'] = '<p>confirm</p>'; s.files['supabase/templates/magic-link.html'] = '<p>magic</p>'; }
    if (args[0] === 'wrangler' && args[1] === 'deploy') { s.deployed = true; s.deployEnv = opts.env; }
    if (args[1] === 'secret') s.secretsFile = JSON.parse(readFileSync(args[3], 'utf8'));
    if (s.secretsFile) for (const k of Object.keys(s.secretsFile)) if (!s.workerSecrets.includes(k)) s.workerSecrets.push(k);
    return { code: 0 };
  };
  const io = {
    env: { SUPABASE_ACCESS_TOKEN: 'sbp', CLOUDFLARE_API_TOKEN: 'cft', CLOUDFLARE_ACCOUNT_ID: 'acc1', REMINDER_EMAIL: hosted ? 'ops@aangan.family' : 'mohan@gmail.com', RESEND_API_KEY: free ? '' : 're_full',
      ...(hosted ? { AANGAN_HOSTED: '1', AANGAN_DOMAIN: 'aangan.family', AANGAN_MAIL_DOMAIN: 'mail.aangan.family', AANGAN_SLUG: 'rao-kutumba', AANGAN_ADMIN_EMAIL: 'Mohan.Rao@gmail.com',
        AANGAN_PROGRESS_URL: 'https://ops.aangan.test/progress', AANGAN_PROGRESS_TOKEN: 'tok' } : {}) },
    read: (p) => { if (!(p in s.files)) throw new Error('no file ' + p); return s.files[p]; },
    write: (p, t) => { s.files[p] = t; }, exists: (p) => p in s.files,
    fetch, exec, sleep: async () => {}, log: () => {},
  };
  return { s, io };
}

test('own domain, first run: creates everything and fills in the settings', async () => {
  const { s, io } = world();
  const { done, todo } = await setup(io);
  assert.equal(s.created.region, 'ap-south-1');
  assert.equal(s.created.organization_id, 'org1');
  assert.ok(s.created.db_pass.length >= 24);
  assert.equal(s.tables, true);
  const cfg = JSON.parse(s.files['site.config.json']);
  assert.equal(cfg.supabaseProjectUrl, `https://${REF}.supabase.co`);
  assert.equal(cfg.supabasePublishableKey, 'sb_publishable_pub');
  assert.ok(cfg.vapidPublicKey.length > 80);
  assert.ok(!s.files['site.config.json'].includes('sb_secret_'), 'the secret key never goes in a file');
  assert.ok(!s.files['reminders/wrangler.toml'].includes('sb_secret_'));
  assert.match(s.files['reminders/wrangler.toml'], new RegExp(`SUPABASE_URL = "https://${REF}.supabase.co"`));
  // sign-in settings
  assert.equal(s.auth.site_url, 'https://raokutumba.in');
  assert.equal(s.auth.uri_allow_list, 'https://raokutumba.in/**');
  assert.equal(s.auth.mailer_subjects_magic_link, 'Your link');
  assert.equal(s.auth.mailer_templates_confirmation_content, '<p>confirm</p>');
  assert.equal(s.auth.smtp_host, 'smtp.resend.com');
  assert.equal(s.auth.smtp_pass, 're_SEND1');
  assert.equal(s.auth.smtp_admin_email, 'family@raokutumba.in');
  assert.equal(s.keyBody.permission, 'sending_access');
  assert.equal(s.keyBody.domain_id, 'd1');
  // DNS: Resend records as full names, apex CNAME to Pages
  assert.ok(s.dns.some((r) => r.type === 'TXT' && r.name === 'resend._domainkey.raokutumba.in' && r.content === 'p=KEY'));
  assert.ok(s.dns.some((r) => r.type === 'MX' && r.name === 'send.raokutumba.in' && r.priority === 10 && r.proxied === false));
  assert.ok(s.dns.some((r) => r.type === 'CNAME' && r.name === 'raokutumba.in' && r.content === 'raokutumba-in.pages.dev' && r.proxied));
  // Worker and its secrets
  assert.deepEqual(s.deployEnv, { CLOUDFLARE_API_TOKEN: 'cft', CLOUDFLARE_ACCOUNT_ID: 'acc1' });
  assert.equal(s.secretsFile.SUPABASE_SERVICE_KEY, 'sb_secret_SHH');
  assert.equal(s.secretsFile.RESEND_API_KEY, 're_SEND1');
  assert.ok(s.secretsFile.VAPID_PRIVATE && s.secretsFile.PREVIEW_KEY);
  assert.equal(s.secretsFile.REMINDER_EMAIL, 'mohan@gmail.com');
  // website
  assert.deepEqual(s.pages, ['raokutumba-in']);
  assert.deepEqual(s.pageDomains, ['raokutumba.in']);
  assert.ok(s.execs.includes('npx wrangler pages deploy ../web/dist --project-name raokutumba-in --branch main --commit-dirty=true @reminders'));
  assert.ok(s.execs.indexOf('npm run build @web') < s.execs.findIndex((e) => e.includes('pages deploy')));
  // forwarding
  assert.deepEqual(s.rules.map((r) => r.matchers[0].value), ['family@raokutumba.in', 'privacy@raokutumba.in']);
  // what's left
  assert.ok(todo.some((t) => /seed\.sql/.test(t)), 'asks for the family file');
  assert.ok(todo.some((t) => /GOOGLE_CLIENT_ID/.test(t) && t.includes('https://api.raokutumba.in/oauth/google/callback')));
  assert.ok(todo.some((t) => /Reset database password/.test(t)));
  assert.ok(done.length >= 10);
});

test('running it again changes nothing that is already there', async () => {
  const { s, io } = world();
  await setup(io);
  const before = { projects: s.projects.length, keys: s.keys.length, dns: s.dns.length, rules: s.rules.length, pages: s.pages.length, resendKeys: s.resendKeys };
  s.calls = []; s.secretsFile = null;
  const { done } = await setup(io);
  assert.equal(s.projects.length, before.projects);
  assert.ok(!s.calls.includes('POST api.supabase.com /v1/projects'));
  assert.equal(s.setupRuns, 1, 'setup.sql ran only on the first run');
  assert.equal(s.keys.length, before.keys);
  assert.equal(s.dns.length, before.dns);
  assert.equal(s.rules.length, before.rules);
  assert.equal(s.pages.length, before.pages);
  assert.equal(s.resendKeys, before.resendKeys, 'no second email key');
  assert.equal(s.auth.smtp_pass, 're_SEND1', 'SMTP password kept');
  assert.ok(!('PREVIEW_KEY' in s.secretsFile), 'PREVIEW_KEY is not changed once set');
  assert.ok(!('VAPID_PRIVATE' in s.secretsFile), 'notification keys are not changed once set');
  assert.ok(done.some((d) => /already there/.test(d)));
});

test('free setup: workers.dev address, no domain, no email steps; Google is on the to-do list', async () => {
  const { s, io } = world({ free: true });
  const { todo } = await setup(io);
  const cfg = JSON.parse(s.files['site.config.json']);
  assert.equal(cfg.apiUrl, 'https://family-reminders.raos.workers.dev');
  assert.match(s.files['reminders/wrangler.toml'], /^# routes = /m);
  assert.deepEqual(s.pages, ['raos']);
  assert.deepEqual(s.pageDomains, []);
  assert.equal(s.dns.length, 0);
  assert.equal(s.auth.smtp_host, undefined);
  assert.ok(!s.calls.some((c) => c.includes('resend')));
  assert.ok(todo.some((t) => /^Needed on the free setup/.test(t)));
});

test('loads the family from a local seed file only into an empty tree', async () => {
  const { s, io } = world();
  await setup(io, { seed: 'data/seed.sql' });
  assert.equal(s.persons, 7);
  const r = await setup(io, { seed: 'data/seed.sql' });
  assert.ok(r.done.some((d) => /already has 7 people/.test(d)));
});

test('clear messages when something is missing', async () => {
  const a = world(); a.io.env.CLOUDFLARE_API_TOKEN = '';
  await assert.rejects(setup(a.io), /CLOUDFLARE_API_TOKEN/);
  const b = world({ orgs: [{ id: 'o1', slug: 'one' }, { id: 'o2', slug: 'two' }] });
  await assert.rejects(setup(b.io), /SUPABASE_ORG.*one, two/);
  const c = world(); c.s.zones = [];
  await assert.rejects(setup(c.io), /raokutumba\.in isn't in this Cloudflare account/);
  const d = world(); const cfg = JSON.parse(d.s.files['site.config.json']); cfg.familyName = 'Our Family'; d.s.files['site.config.json'] = JSON.stringify(cfg);
  await assert.rejects(setup(d.io), /familyName/);
});

test('helpers', () => {
  assert.equal(pagesName({ siteUrl: 'https://raos.pages.dev' }), 'raos');
  assert.equal(pagesName({ siteUrl: 'https://raokutumba.in' }), 'raokutumba-in');
  assert.equal(workerName(read('reminders/wrangler.toml')), 'family-reminders');
  const v = vapidKeys();
  assert.equal(Buffer.from(v.publicKey, 'base64url').length, 65);
  assert.equal(Buffer.from(v.privateKey, 'base64url').length, 32);
});

test('hosted: family addresses are checked strictly', () => {
  for (const ok of ['sharma', 'rao-kutumba', 'iyer2']) assert.equal(checkSlug(ok), null, ok);
  for (const bad of ['ab', 'Sharma', 'x--y', '9lives', 'sharma-', 'a b', "o'neil", 'api', 'admin', 'sharma-api', 'x'.repeat(31)]) assert.ok(checkSlug(bad), bad);
  assert.deepEqual(hostedNames('rao', 'aangan.family', 'mail.aangan.family'), { siteUrl: 'https://rao.aangan.family', apiUrl: 'https://rao-api.aangan.family', emailFrom: 'rao@mail.aangan.family', project: 'aangan-rao' });
});

test('hosted: makes the family\'s own site on Aangan\'s accounts, under Aangan\'s domain', async () => {
  const { s, io } = world({ hosted: true });
  const { todo } = await setup(io);
  await new Promise((r) => setTimeout(r, 0));   // progress reports are sent in the background
  assert.equal(s.created.name, 'aangan-rao-kutumba');
  const cfg = JSON.parse(s.files['site.config.json']);
  assert.equal(cfg.siteUrl, 'https://rao-kutumba.aangan.family');
  assert.equal(cfg.apiUrl, 'https://rao-kutumba-api.aangan.family');
  assert.equal(cfg.emailFrom, 'rao-kutumba@mail.aangan.family');
  assert.equal(cfg.emailSignIn, true);
  assert.match(s.files['reminders/wrangler.toml'], /^name = "aangan-rao-kutumba"$/m);
  assert.match(s.files['reminders/wrangler.toml'], /pattern = "rao-kutumba-api\.aangan\.family"/);
  // first admin: the person who signed up, lower-cased, once
  assert.match(s.inviteSql, /values|select 'mohan\.rao@gmail\.com', 'admin'/);
  // shared sending domain: no DNS records added for email, one send-only key per family
  assert.equal(s.keyBody.name, 'aangan-rao-kutumba');
  assert.equal(s.keyBody.permission, 'sending_access');
  assert.ok(!s.dns.some((r) => r.type === 'MX' || r.type === 'TXT'));
  assert.equal(s.auth.smtp_admin_email, 'rao-kutumba@mail.aangan.family');
  // website at the family's address
  assert.ok(s.pages.includes('aangan-rao-kutumba'));
  assert.ok(s.pageDomains.includes('rao-kutumba.aangan.family'));
  assert.ok(s.dns.some((r) => r.type === 'CNAME' && r.name === 'rao-kutumba.aangan.family' && r.content === 'aangan-rao-kutumba.pages.dev'));
  // no email forwarding on Aangan's domain
  assert.equal(s.rules.length, 0);
  // the secret key only ever goes to the Worker
  assert.equal(s.secretsFile.SUPABASE_SERVICE_KEY, 'sb_secret_SHH');
  assert.ok(!JSON.stringify(s.progress).includes('sb_secret_'));
  // progress reached Aangan's backend, ending in ready
  assert.ok(s.progress.length > 5);
  assert.equal(s.progress.at(-1).status, 'ready');
  assert.equal(s.progress[0].auth, 'Bearer tok');
  assert.equal(todo.length, 1);
});

test('hosted: running again changes nothing and doesn\'t invite a second admin', async () => {
  const { s, io } = world({ hosted: true });
  await setup(io);
  const keys = s.resendKeys, pages = s.pages.length, dns = s.dns.length;
  await setup(io);
  assert.equal(s.invites.length, 1);
  assert.equal(s.projects.length, 1);
  assert.equal(s.resendKeys, keys);
  assert.equal(s.pages.length, pages);
  assert.equal(s.dns.length, dns);
});

test('hosted: refuses a bad address or a missing setting before touching anything', async () => {
  for (const [k, v, msg] of [['AANGAN_SLUG', 'admin', /kept for Aangan/], ['AANGAN_SLUG', 'Bad Name', /small letters/], ['AANGAN_ADMIN_EMAIL', "x'; drop table persons; --@a.in", /not an email/], ['AANGAN_DOMAIN', '', /AANGAN_DOMAIN/]]) {
    const { s, io } = world({ hosted: true });
    io.env[k] = v;
    await assert.rejects(setup(io), msg);
    assert.equal(s.calls.length, 0, `${k}: nothing was called`);
  }
});
