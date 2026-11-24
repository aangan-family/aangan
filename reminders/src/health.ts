import { probeProvider } from './oauth';
import { emailReady } from './mail';
/**
 * Health checks and alert emails (0022). Runs on the 10-minute cron after the email jobs.
 *
 * Each check is a small request to one part of the site. Problems go to ops_alerts_sync(), which says
 * which ones are new (email now), still open after 24 hours (reminder) or cleared (all-clear email).
 * Status is machine data only: job names, counts, short error text. No family data is read or sent.
 *
 * GET /ops/health?key=<PREVIEW_KEY> shows the same checks as JSON, sending nothing.
 */
import { proxyToken, serverHeaders, sha256Hex } from './keys';
import { C, DOMAIN, esc, layout, p, SITE } from './brand';
import { API_HOST } from './site';
import { sendEmail } from './mail';

export interface HealthEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  RESEND_API_KEY?: string;
  GMAIL_USER?: string; GMAIL_APP_PASSWORD?: string;
  REMINDER_EMAIL?: string;
  EMAIL_FROM?: string;
  AI?: Ai;
  MS_CLIENT_ID?: string;
  MS_CLIENT_SECRET?: string;
  YAHOO_CLIENT_ID?: string;
  YAHOO_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

export interface Check { key: string; name: string; ok: boolean; detail: string; skipped?: boolean }
export interface Problem { key: string; summary: string }
interface Run { last_run_at: string; last_ok_at: string | null; ok: boolean; detail: string | null }
interface Queues { welcome_stuck: number; mentions_stuck: number; joins_stuck: number; members: number; runs: Record<string, Run> }

/** What to do for each kind of problem; the handbook's "When something breaks" section says the same. */
export const FIX: Record<string, string> = {
  site: 'Open Cloudflare → Workers & Pages → your Pages project → Deployments. If the latest deploy broke it, use Rollback on the one before. Also check cloudflarestatus.com.',
  database: 'Open the Supabase dashboard. If the project is paused, click Restore. Otherwise check status.supabase.com; the site comes back by itself when Supabase does.',
  auth: 'Sign-in is affected. Check status.supabase.com and Supabase → Authentication → Logs.',
  storage: 'Photos may not load. Check Supabase → Storage (the photos bucket must exist and stay private) and status.supabase.com.',
  ai: 'Only Help me write and Speak are affected. Check Cloudflare → AI → Workers AI for usage limits or errors.',
  emails: 'Emails are waiting. Check resend.com → Emails/Logs. If the key was revoked, create a new one and paste it into Cloudflare → family-reminders → Settings → Variables → RESEND_API_KEY.',
  digest: `The 7 am reminder digest didn’t go out. Open https://${API_HOST}/ops/health?key=… for the error, and check resend.com logs.`,
  jobs: 'The 10-minute email job failed. The detail shows the error; Cloudflare → family-reminders → Logs has more.',
  reading: 'Someone read the site unusually fast and was slowed down. If it was not you testing, check who it was (Supabase → Authentication → Users, search the id), suspend them in Admin → Members & roles if needed, and see the breach plan in the handbook.',
  signin_ms: 'Continue with Microsoft is failing. In portal.azure.com → App registrations → your app → Certificates & secrets, create a new client secret, copy its Value (not the Secret ID) and paste it into Cloudflare → family-reminders → Settings → Variables and Secrets → MS_CLIENT_SECRET. Note the new expiry date in the handbook.',
  signin_yahoo: 'Continue with Yahoo is failing. In developer.yahoo.com → My Apps → your app, check the Client Secret and paste it into Cloudflare → family-reminders → Settings → Variables and Secrets → YAHOO_CLIENT_SECRET.',
  signin_google: 'Google\'s full-page sign-in (used when Google\'s button can\'t load) is failing. In console.cloud.google.com → APIs & Services → Credentials → the web client used for sign-in, add a new client secret and paste it into Cloudflare → family-reminders → Settings → Variables and Secrets → GOOGLE_CLIENT_SECRET. Google\'s normal button keeps working meanwhile.',
  setup: 'A secret is missing. Add it in Cloudflare → family-reminders → Settings → Variables and Secrets.',
};

const H = 3600_000;

async function timed(fn: () => Promise<string>): Promise<{ ok: boolean; detail: string }> {
  try { return { ok: true, detail: await fn() }; } catch (e) { return { ok: false, detail: String((e as Error)?.message || e).slice(0, 300) }; }
}

async function expectOk(url: string, init?: RequestInit, must?: string): Promise<string> {
  const t0 = Date.now();
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  const body = await r.text();
  if (!r.ok) throw new Error(`answered ${r.status}`);
  if (must && !body.includes(must)) throw new Error('answered, but not with the app');
  return `ok in ${Date.now() - t0} ms`;
}

export async function rpcAs<T>(env: HealthEnv, fn: string, args: object = {}): Promise<T> {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', signal: AbortSignal.timeout(10_000),
    headers: serverHeaders(env.SUPABASE_SERVICE_KEY, true),
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${(await r.text()).slice(0, 160)}`);
  const t = await r.text();
  return (t ? JSON.parse(t) : null) as T;
}

/** Sign-in secret checks run hourly; in between, the last saved result (ops_runs) stands, so an alert doesn't open and close every hour. */
function signinCheck(key: string, name: string, fresh: { ok: boolean; detail: string } | null, queues: Queues | null): Check[] {
  if (fresh) return [{ key, name, ...fresh }];
  const last = (queues as Queues | null)?.runs?.[key];
  return last ? [{ key, name, ok: last.ok, detail: last.detail || (last.ok ? 'secret accepted' : 'failed'), skipped: last.ok }] : [];
}

/** Runs every check. `withAi` adds the Workers AI test (every 6 hours, it costs a little). */
export async function runChecks(env: HealthEnv, now: Date, withAi: boolean, withSignin = withAi): Promise<{ checks: Check[]; queues: Queues | null }> {
  const svc = serverHeaders(env.SUPABASE_SERVICE_KEY);
  let queues: Queues | null = null;
  const [site, db, auth, storage, ai, ms, yahoo, google] = await Promise.all([
    timed(() => expectOk(SITE + '/', undefined, 'id="root"')),
    timed(async () => { queues = await rpcAs<Queues>(env, 'ops_queues'); return `ok, ${queues.members} active members`; }),
    timed(() => expectOk(`${env.SUPABASE_URL}/auth/v1/health`, { headers: svc })),
    timed(() => expectOk(`${env.SUPABASE_URL}/storage/v1/bucket/photos`, { headers: svc })),
    withAi && env.AI
      ? timed(async () => { const r = await env.AI!.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast' as Parameters<Ai['run']>[0], { messages: [{ role: 'user', content: 'Reply with the word ok.' }], max_tokens: 5 } as never) as { response?: string }; if (!r?.response) throw new Error('no answer'); return 'ok'; })
      : Promise.resolve(null),
    withSignin && env.MS_CLIENT_ID ? probeProvider('azure', env) : Promise.resolve(null),
    withSignin && env.YAHOO_CLIENT_ID ? probeProvider('yahoo', env) : Promise.resolve(null),
    withSignin && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? probeProvider('google', env) : Promise.resolve(null),
  ]);
  // email is set up either with Resend (own domain) or with the admin's Gmail (free setup)
  const missing = [...(['SUPABASE_SERVICE_KEY', 'REMINDER_EMAIL'] as const).filter((k) => !env[k]), ...(emailReady(env) ? [] : ['RESEND_API_KEY or GMAIL_APP_PASSWORD'])];
  const checks: Check[] = [
    { key: 'site', name: 'Website', ...site },
    { key: 'database', name: 'Database', ...db },
    { key: 'auth', name: 'Sign-in service', ...auth },
    { key: 'storage', name: 'Photo storage', ...storage },
    ai ? { key: 'ai', name: 'Writing help (AI)', ...ai } : { key: 'ai', name: 'Writing help (AI)', ok: !!env.AI, detail: env.AI ? 'tested every 6 hours' : 'AI binding missing', skipped: !!env.AI },
    ...signinCheck('signin_ms', 'Microsoft sign-in', ms, queues),
    ...signinCheck('signin_yahoo', 'Yahoo sign-in', yahoo, queues),
    ...signinCheck('signin_google', 'Google full-page sign-in', google, queues),
    { key: 'setup', name: 'Secrets', ok: missing.length === 0, detail: missing.length ? `missing: ${missing.join(', ')}` : `all present; server key: ${env.SUPABASE_SERVICE_KEY.startsWith('sb_secret_') ? 'new secret key' : 'legacy service_role'}` },
  ];
  checks.push(...jobChecks(queues, now));
  return { checks, queues };
}

/** Email queues and scheduled jobs, from ops_queues(). */
export function jobChecks(q: Queues | null, now: Date): Check[] {
  if (!q) return [];
  const stuck = q.welcome_stuck + q.mentions_stuck + q.joins_stuck;
  const parts = [q.welcome_stuck && `${q.welcome_stuck} welcome`, q.mentions_stuck && `${q.mentions_stuck} @-mention`, q.joins_stuck && `${q.joins_stuck} join-request`].filter(Boolean).join(', ');
  const out: Check[] = [{ key: 'emails', name: 'Emails going out', ok: stuck === 0, detail: stuck ? `${parts} email(s) waiting over 30 minutes` : 'nothing waiting' }];
  const d = q.runs.digest;
  if (d) {
    const age = d.last_ok_at ? now.getTime() - Date.parse(d.last_ok_at) : Infinity;
    out.push({ key: 'digest', name: 'Morning digest (7 am)', ok: age < 26 * H,
      detail: age < 26 * H ? `last sent ${d.last_ok_at!.slice(0, 16).replace('T', ' ')} UTC` : `no good run for over 26 hours${d.detail ? ` (last: ${d.detail})` : ''}` });
  } else out.push({ key: 'digest', name: 'Morning digest (7 am)', ok: true, detail: 'waiting for its first run', skipped: true });
  const rd = q.runs.reading;
  if (rd && now.getTime() - Date.parse(rd.last_run_at) < H) out.push({ key: 'reading', name: 'Unusual reading', ok: false, detail: rd.detail || 'someone made too many requests' });
  const j = q.runs.emails;
  if (j) out.push({ key: 'jobs', name: '10-minute email job', ok: j.ok, detail: j.ok ? 'last run ok' : (j.detail || 'failed') });
  return out;
}

export const problemsOf = (checks: Check[]): Problem[] => checks.filter((c) => !c.ok).map((c) => ({ key: c.key, summary: `${c.name}: ${c.detail}` }));

interface Sync { started: Problem[]; still: (Problem & { since: string })[]; cleared: (Problem & { since: string })[] }

export function alertEmail(s: Sync): { subject: string; html: string; text: string } | null {
  const bad = [...s.started, ...s.still];
  if (!bad.length && !s.cleared.length) return null;
  const subject = bad.length
    ? `⚠️ ${DOMAIN}: ${bad.length === 1 ? bad[0].summary.split(':')[0] + ' needs attention' : `${bad.length} problems`}`
    : `✅ ${DOMAIN}: all working again`;
  const item = (x: Problem, note: string) => `<div style="border:1px solid ${C.line};border-radius:12px;padding:14px 16px;margin:0 0 12px">
<p style="margin:0 0 6px;font-weight:600;color:${C.ink}">${esc(x.summary)}</p>
<p style="margin:0 0 6px;color:${C.grey};font-size:14px">${esc(note)}</p>
${FIX[x.key] ? `<p style="margin:0;color:${C.ink};font-size:14px"><b>What to do:</b> ${esc(FIX[x.key])}</p>` : ''}</div>`;
  const since = (t: string) => `Since ${t.slice(0, 16).replace('T', ' ')} UTC.`;
  const body = [
    ...s.started.map((x) => item(x, 'Just started.')),
    ...s.still.map((x) => item(x, `Still happening. ${since(x.since)}`)),
    s.cleared.length ? p(`<b style="color:${C.green}">Fixed:</b> ${s.cleared.map((x) => esc(x.summary.split(':')[0])).join(', ')}.`) : '',
    p(`<span style="color:${C.light};font-size:13px">Checked automatically every 10 minutes. Full status: ${API_HOST}/ops/health?key=… (PREVIEW_KEY).</span>`),
  ].join('\n');
  const html = layout({ preheader: subject, headline: bad.length ? 'Something needs attention.' : 'All working again.', body });
  const text = [subject, '',
    ...s.started.map((x) => `NEW: ${x.summary}\nWhat to do: ${FIX[x.key] || ''}`),
    ...s.still.map((x) => `STILL: ${x.summary} (${since(x.since)})\nWhat to do: ${FIX[x.key] || ''}`),
    ...s.cleared.map((x) => `FIXED: ${x.summary.split(':')[0]}`)].join('\n\n');
  return { subject, html, text };
}

async function send(env: HealthEnv, m: { subject: string; html: string; text: string }): Promise<string> {
  if (!emailReady(env) || !env.REMINDER_EMAIL) return 'alert: email not set up';
  const r = await sendEmail(env, { ...m, to: env.REMINDER_EMAIL.split(',').map((x) => x.trim()).filter(Boolean) }, 'alert');
  return r.ok ? `alert sent: ${m.subject}` : `alert failed: ${r.status}`;
}

/** The 10-minute health pass: check, decide, email. */
export async function healthPass(env: HealthEnv, now: Date): Promise<string[]> {
  const withAi = now.getUTCHours() % 6 === 0 && now.getUTCMinutes() < 10;
  const withSignin = now.getUTCMinutes() < 10;   // hourly: one tiny request to each provider
  const { checks } = await runChecks(env, now, withAi, withSignin);
  // keep the latest sign-in check results in ops_runs (machine status only), so they can be read any time
  // 0047: (re)register the pass-through's proof header with the database (only its hash)
  await rpcAs(env, 'proxy_token_set', { h: await sha256Hex(await proxyToken(env.SUPABASE_SERVICE_KEY)) }).catch(() => null);
  // which kind of server key is in use (type only, never the key), so the legacy-key switch-off can be checked
  await rpcAs(env, 'ops_record', { job: 'server_key', ok: env.SUPABASE_SERVICE_KEY.startsWith('sb_secret_'), detail: env.SUPABASE_SERVICE_KEY.startsWith('sb_secret_') ? 'new secret key' : 'legacy service_role' }).catch(() => null);
  for (const c of checks) if (c.key === 'signin_ms' || c.key === 'signin_yahoo' || c.key === 'signin_google') await rpcAs(env, 'ops_record', { job: c.key, ok: c.ok, detail: c.detail }).catch(() => null);
  const problems = problemsOf(checks);
  let sync: Sync;
  try {
    sync = await rpcAs<Sync>(env, 'ops_alerts_sync', { problems });
  } catch {
    // the database itself is down, so it can't remember what was sent: email at most every 6 hours (per data centre)
    const cache = (caches as unknown as { default: Cache }).default;
    const k = new Request('https://health.family.internal/db-down');
    if (await cache.match(k)) return ['database down; alert already sent'];
    await cache.put(k, new Response('1', { headers: { 'Cache-Control': 'max-age=21600' } }));
    sync = { started: problems, still: [], cleared: [] };
  }
  const m = alertEmail(sync);
  return m ? [await send(env, m)] : [];
}
