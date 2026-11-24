/**
 * Family website reminders and welcome emails.
 *
 * Every 10 minutes: sends a welcome email to anyone who has just joined (welcome_due()),
 * and an email to anyone who was @-mentioned in Talk (mentions_due(), 0017).
 *
 * Every day at 7:00 India time (01:30 UTC):
 * On the 1st it sends the month's digest; every day it sends one ready-to-forward
 * message per occasion:
 *   - by email (Resend), each message with a "Send on WhatsApp" button that opens
 *     WhatsApp with the text filled in, ready to send to the family group;
 *   - and straight to the admin's WhatsApp via CallMeBot, once its keys are set.
 *
 * Secrets (Cloudflare dashboard → this Worker → Settings → Variables and secrets):
 *   SUPABASE_SERVICE_KEY  server key, used only to call reminder_feed(), welcome_due()/welcome_sent(), join_requests_due(), mentions_due()/mentions_sent() and news_due()/news_sent()
 *   RESEND_API_KEY        Resend key with sending access
 *   REMINDER_EMAIL        where the email goes (comma-separate for more than one)
 *   PREVIEW_KEY           any long random word; lets you preview at /?key=…
 *   MS_CLIENT_SECRET      Microsoft app secret (Azure → App registrations), for Microsoft sign-in (src/oauth.ts)
 *   YAHOO_CLIENT_SECRET   Yahoo app secret (developer.yahoo.com/apps), for Yahoo sign-in
 *   GOOGLE_CLIENT_SECRET  Google web client secret (console.cloud.google.com → Credentials), for Google's full-page sign-in
 *   CALLMEBOT_PHONE       optional: admin's WhatsApp number with country code
 *   CALLMEBOT_APIKEY      optional: the key CallMeBot sends on WhatsApp
 */
import { proxyToken, serverHeaders } from './keys';
import { dailyMessages, monthlyMessage, todayIST, ymd, type FeedRow } from './messages';
import { welcomeEmail, type WelcomeRow } from './welcome';
import { groupByPerson, mentionEmail, type MentionRow } from './mentions';
import { newsEmail, type NewsRow } from './news';
import { hasNews, upcoming, weeklyEmail, type WeeklyData } from './weekly';
import { proxy, PROXY_HOST } from './proxy';
import { oauth } from './oauth';
import { ai } from './ai';
import { healthPass, rpcAs, runChecks } from './health';
import { checkApi, checkKeyTries, tooMany, type LimitEnv } from './limits';
import { inviteNotice, joinNotice, type InviteRow, type JoinRow } from './joins';
import { sendBatch, sendEmail, setBorders } from './mail';
import { withBorder } from './brand';
import { sendPush, vapidHeader } from './push';
import { dailyPushes } from './pushjobs';
import { layout } from './brand';

export interface Env extends LimitEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  CALLMEBOT_PHONE?: string;
  CALLMEBOT_APIKEY?: string;
  PREVIEW_KEY?: string;
  RESEND_API_KEY?: string;
  REMINDER_EMAIL?: string;
  EMAIL_FROM?: string;
  MS_CLIENT_ID?: string;
  MS_CLIENT_SECRET?: string;
  YAHOO_CLIENT_ID?: string;
  YAHOO_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Workers AI, for writing help (src/ai.ts) */
  AI?: Ai;
  /** Phone notifications (src/push.ts): public key in wrangler.toml, private key a secret */
  VAPID_PUBLIC?: string;
  VAPID_PRIVATE?: string;
}

async function rpc<T>(env: Env, fn: string, args: object = {}): Promise<T> {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: serverHeaders(env.SUPABASE_SERVICE_KEY, true),
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`${fn} failed: ${r.status} ${await r.text()}`);
  const t = await r.text();
  return (t ? JSON.parse(t) : null) as T;
}
const feed = (env: Env) => rpc<FeedRow[]>(env, 'reminder_feed');

interface PushRow { qid: number; sub_id: string; endpoint: string; p256dh: string; auth: string; title: string; body: string; url: string; tag: string; kind: string }
/** Send every queued phone notification (0030): one per device, then mark them sent. */
export async function sendPushes(env: Env): Promise<string[]> {
  if (!env.VAPID_PUBLIC || !env.VAPID_PRIVATE) return [];
  const keys = { VAPID_PUBLIC: env.VAPID_PUBLIC, VAPID_PRIVATE: env.VAPID_PRIVATE };
  const rows = await rpc<PushRow[]>(env, 'push_due', { lim: 200 });
  if (!rows?.length) return [];
  const auths = new Map<string, string>(); // one VAPID token per push service
  let ok = 0, gone = 0, failed = 0;
  await Promise.all(rows.map(async (r) => {
    const origin = new URL(r.endpoint).origin;
    if (!auths.has(origin)) auths.set(origin, await vapidHeader(keys, r.endpoint));
    try {
      const res = await sendPush(keys, r, { title: r.title, body: r.body, url: r.url, tag: r.tag }, auths.get(origin), r.kind === 'message');
      if (res.outcome === 'ok') ok++; else if (res.outcome === 'gone') gone++; else { failed++; console.error('push failed', res.status, origin); }
      await rpc(env, 'push_result', { sid: r.sub_id, ok: res.outcome === 'ok', gone: res.outcome === 'gone' });
    } catch (e) { failed++; console.error('push error', String(e)); await rpc(env, 'push_result', { sid: r.sub_id, ok: false, gone: false }).catch(() => {}); }
  }));
  await rpc(env, 'push_done', { ids: [...new Set(rows.map((r) => r.qid))] });
  return [`push: ${ok} sent${gone ? `, ${gone} devices gone` : ''}${failed ? `, ${failed} failed` : ''}`];
}

/** The 7 am phone notifications: today's birthdays and remembrance days, and festivals. */
async function queueDailyPushes(env: Env, rows: FeedRow[], day: Date): Promise<string> {
  if (!env.VAPID_PUBLIC || !env.VAPID_PRIVATE) return 'push: not set up';
  const items = dailyPushes(rows, day);
  const n = await Promise.all(items.map((i) => rpc<number>(env, 'push_daily', { k: i.kind, t: i.title, b: i.body, u: i.url, g: i.tag })));
  return `push: ${items.length} daily item(s) for ${n.reduce((a, b) => a + b, 0)} device owner(s)`;
}

/** One email per steward/admin (no long BCC lists, which mail filters treat as bulk), in one Resend batch call. */
const sendEach = (env: Env, m: { subject: string; html: string; text: string }, to: string[], kind: 'join' | 'invite') =>
  sendBatch(env, [...new Set(to.map((x) => x.toLowerCase()))].map((addr) => ({ ...m, to: [addr] })), kind);

/** Tell the stewards and admins about new requests to join (names only; the phone stays on the site). */
export async function sendJoinNotices(env: Env): Promise<string[]> {
  if (!env.RESEND_API_KEY) return [];
  const due = await rpc<JoinRow[]>(env, 'join_requests_due');
  const log: string[] = [];
  for (const row of due) {
    const to = (row.approvers || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (!to.length) continue;
    const m = joinNotice(row);
    const r = await sendEach(env, m, to, 'join');
    if (!r.ok) { console.error('join notice failed', r.status, r.body); continue; }
    await rpc(env, 'join_request_notified', { rid: row.id });
    log.push(`join notice sent for ${row.full_name}`);
  }
  // invitations sent by members, waiting for a steward or admin (0024)
  const invites = await rpc<InviteRow[]>(env, 'invites_due').catch(() => [] as InviteRow[]);
  for (const row of invites) {
    const to = (row.approvers || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (!to.length) continue;
    const m = inviteNotice(row);
    const r = await sendEach(env, m, to, 'invite');
    if (!r.ok) { console.error('invite notice failed', r.status, r.body); log.push(`invite notice failed: ${r.status}`); continue; }
    await rpc(env, 'invite_notified', { inv: row.id });
    log.push(`invite notice sent for ${row.person_name}`);
  }
  return log;
}

/** Notify everyone by email (0048): separate emails in one Resend batch, rows deleted only after Resend accepts them. */
export async function sendNews(env: Env): Promise<string[]> {
  if (!env.RESEND_API_KEY) return [];
  const due = await rpc<NewsRow[]>(env, 'news_due');
  if (!due.length) return [];
  const r = await sendBatch(env, due.map((x) => ({ ...newsEmail(x), to: [x.email] })), 'news');
  if (!r.ok) { console.error('news emails failed', r.status, r.body); return [`news emails failed: ${r.status}`]; }
  await rpc(env, 'news_sent', { ids: due.map((x) => x.id) });
  return [`news emailed to ${due.length}`];
}

/** Each member's veshti/saree border for their emails (0050); on failure the emails use the default border. */
let bordersAt = 0;
async function loadBorders(env: Env) {
  if (Date.now() - bordersAt < 9 * 60000) return;
  try { setBorders(await rpc<{ email: string; border: string }[]>(env, 'email_borders')); bordersAt = Date.now(); } catch (e) { console.error('email_borders', String(e)); }
}

/** "This week in the family" (0049): Sundays after the 7 am run. Each week goes out once; recorded only after Resend accepts it. */
export async function sendWeekly(env: Env, day: Date, force = false): Promise<string> {
  if (!env.RESEND_API_KEY) return 'weekly: email not set up';
  if (day.getUTCDay() !== 0 && !force) return 'weekly: not Sunday';
  const wk = ymd(day);
  const w = await rpc<WeeklyData | null>(env, 'weekly_digest', { wk });
  if (!w) return 'weekly: already sent';
  const up = upcoming(await feed(env), day);
  if (!hasNews(w, up)) { await rpc(env, 'weekly_sent', { wk, n: 0 }); return 'weekly: nothing to say this week'; }
  let sent = 0;
  for (let i = 0; i < w.recipients.length; i += 100) {
    const chunk = w.recipients.slice(i, i + 100);
    const r = await sendBatch(env, chunk.map((x) => ({ ...weeklyEmail(w, up, x.given_name, day), to: [x.email] })), 'weekly');
    if (!r.ok) { console.error('weekly failed', r.status, r.body); if (sent) await rpc(env, 'weekly_sent', { wk, n: sent }); return `weekly failed after ${sent}: ${r.status}`; }
    sent += chunk.length;
  }
  await rpc(env, 'weekly_sent', { wk, n: sent });
  return `weekly: sent to ${sent}`;
}

/** "You were mentioned": one email per person, marked sent only after Resend accepts it. */
export async function sendMentions(env: Env): Promise<string[]> {
  if (!env.RESEND_API_KEY) return [];
  const due = await rpc<MentionRow[]>(env, 'mentions_due');
  const log: string[] = [];
  for (const rows of groupByPerson(due)) {
    const m = mentionEmail(rows);
    const r = await sendEmail(env, { ...m, to: [rows[0].email] }, 'mention');
    if (!r.ok) { console.error('mention email failed', r.status, r.body); continue; }
    await rpc(env, 'mentions_sent', { ids: rows.map((x) => x.id) });
    log.push(`mention email sent to ${rows[0].given_name} (${rows.length})`);
  }
  return log;
}


/** Send each pending welcome email once. Marked sent only after Resend accepts it. */
export async function sendWelcomes(env: Env): Promise<string[]> {
  if (!env.RESEND_API_KEY) return ['welcome: email not set up'];
  const due = await rpc<WelcomeRow[]>(env, 'welcome_due');
  const log: string[] = [];
  for (const row of due) {
    const m = welcomeEmail(row);
    const r = await sendEmail(env, { ...m, to: [row.email] }, 'welcome');
    if (!r.ok) { console.error('welcome failed', r.status, r.body); log.push(`welcome failed for ${row.given_name}: ${r.status}`); continue; }
    await rpc(env, 'welcome_sent', { uid: row.user_id });
    log.push(`welcome sent to ${row.given_name}`);
  }
  return log;
}

/** Today's messages: the monthly digest first (on the 1st, or when asked), then today's occasions. */
export function messagesFor(rows: FeedRow[], day: Date, forceMonthly = false): string[] {
  return messagesWithShares(rows, day, forceMonthly).map((m) => m.text);
}
/** Each message, and the version that is fine to forward (null: don't forward). */
export function messagesWithShares(rows: FeedRow[], day: Date, forceMonthly = false): { text: string; share: string | null }[] {
  const out: { text: string; share: string | null }[] = [];
  if (day.getUTCDate() === 1 || forceMonthly) {
    const m = monthlyMessage(rows, day.getUTCFullYear(), day.getUTCMonth());
    if (m) out.push({ text: m, share: monthlyMessage(rows, day.getUTCFullYear(), day.getUTCMonth(), { shareable: true }) });
  }
  for (const t of dailyMessages(rows, day)) out.push({ text: t, share: isPrivate(t) ? null : t });
  return out;
}

async function whatsapp(env: Env, text: string): Promise<string> {
  const u = new URL('https://api.callmebot.com/whatsapp.php');
  u.searchParams.set('phone', env.CALLMEBOT_PHONE!);
  u.searchParams.set('text', text);
  u.searchParams.set('apikey', env.CALLMEBOT_APIKEY!);
  const r = await fetch(u);
  const body = (await r.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!r.ok || /error|invalid/i.test(body)) throw new Error(`CallMeBot: ${r.status} ${body}`);
  return body;
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** WhatsApp's *bold* and _italic_ → HTML, for reading in the email */
const fmt = (t: string) => esc(t).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/(^|\s)_([^_\n]+)_/g, '$1<i>$2</i>').replace(/\n/g, '<br>');
const isPrivate = (m: string) => /^(🔒|🙏) Just for you/u.test(m);

export function emailHtml(items: { text: string; share: string | null }[], day: string): string {
  const cards = items.map(({ text: m, share }) => {
    const note = share && share !== m ? '<p style="margin:12px 0 0;color:#6e6e73;font-size:13px">The button leaves out the 🔒 birthdays.</p>' : '';
    const button = !share ? '<p style="margin:12px 0 0;color:#6e6e73;font-size:13px">Just for you, not for forwarding.</p>'
      : `${note}<p style="margin:14px 0 0"><a href="https://wa.me/?text=${encodeURIComponent(share)}" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:999px">Send on WhatsApp</a></p>`;
    return `<div style="background:#f5f5f7;border-radius:16px;padding:18px 20px;margin:0 0 14px;font-size:16px;line-height:1.5;color:#1d1d1f">${fmt(m)}${button}</div>`;
  }).join('');
  return layout({
    preheader: `Today's family messages, ready to forward on WhatsApp (${day}).`,
    headline: 'Family reminders.',
    body: `${cards}<p style="margin:20px 0 0;color:#86868b;font-size:13px;line-height:1.5">Tap a green button on your phone: WhatsApp opens with the message ready. Choose the family group and send. (${day})</p>`,
  });
}

async function email(env: Env, subject: string, items: { text: string; share: string | null }[], day: string) {
  if (!env.RESEND_API_KEY || !env.REMINDER_EMAIL) return 'email: not set up';
  const to = env.REMINDER_EMAIL.split(',').map((x) => x.trim()).filter(Boolean);
  const r = await sendEmail(env, { to, subject, html: emailHtml(items, day), text: items.map((i) => i.text).join('\n\n────────\n\n') }, 'digest');
  if (!r.ok) { console.error('email failed', r.status, r.body); return `email failed: ${r.status} ${r.body.slice(0, 200)}`; }
  return 'email sent';
}

export function subjectFor(msgs: string[], day: Date): string {
  const monthly = msgs.find((m) => m.startsWith('🗓️'));
  const today = msgs.filter((m) => !m.startsWith('🗓️')).length;
  if (monthly) return `🗓️ ${monthly.match(/\*(.+?) in our family\*/)?.[1] || 'This month'} in our family${today ? ` + ${today} today` : ''}`;
  return today === 1 ? '🎂 One family occasion today' : `🎂 ${today} family occasions today`;
}

async function run(env: Env, day: Date, opts: { send: boolean; forceMonthly?: boolean }) {
  const rows = await feed(env);
  const items = messagesWithShares(rows, day, opts.forceMonthly);
  const msgs = items.map((i) => i.text);
  const log: string[] = [];
  if (opts.send && msgs.length) {
    log.push(await email(env, subjectFor(msgs, day), items, ymd(day)));
    if (env.CALLMEBOT_PHONE && env.CALLMEBOT_APIKEY) {
      for (let i = 0; i < msgs.length; i++) {
        if (i) await new Promise((r) => setTimeout(r, 6000)); // CallMeBot asks for a gap between messages
        try { log.push(await whatsapp(env, msgs[i])); } catch (e) { log.push(String(e)); console.error(e); }
      }
    } else log.push('whatsapp: not set up (email only)');
  }
  if (opts.send) { try { log.push(await queueDailyPushes(env, rows, day)); } catch (e) { log.push(`push daily failed: ${e}`); } }
  return { day: ymd(day), count: msgs.length, messages: msgs, log };
}

/** Someone was stopped by the rate limit: tell the health check (at most once per person per 10 minutes). */
async function noteStopped(env: Env, key: string, req: Request) {
  const cache = (caches as unknown as { default: Cache }).default;
  const k = new Request('https://limits.family.internal/' + encodeURIComponent(key));
  if (await cache.match(k)) return;
  await cache.put(k, new Response('1', { headers: { 'Cache-Control': 'max-age=600' } }));
  const who = key.startsWith('u:') ? `login ${key.slice(2, 10)}…` : `a signed-out visitor (${req.headers.get('cf-ipcountry') || '?'})`;
  console.log('rate limited', key);
  const what = key.startsWith('mail:') ? 'asked for more than 5 sign-in emails in a minute' : 'made over 300 requests in a minute';
  await rpcAs(env, 'ops_record', { job: 'reading', ok: false, detail: `${who} ${what}` }).catch(() => {});
}

/** Must match the daily cron in wrangler.toml; any other cron sends welcomes. */
export const DAILY = '30 1 * * *';
/** Every minute: phone notifications only (must match wrangler.toml). */
export const PUSH = '* * * * *';

const same = (a: string, b: string) => a.length === b.length && [...a].reduce((x, c, i) => x | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;

export default {
  async scheduled(c: ScheduledController, env: Env, ctx: ExecutionContext) {
    const record = (job: string, ok: boolean, detail: string) => rpcAs(env, 'ops_record', { job, ok, detail }).catch((e) => console.error('ops_record', String(e)));
    if (c.cron === PUSH) { ctx.waitUntil(sendPushes(env).then((l) => { if (l.length) console.log(l.join('; ')); }).catch((e) => console.error('push job', String(e)))); return; }
    if (c.cron === DAILY) ctx.waitUntil(loadBorders(env).then(() => run(env, todayIST(), { send: true }))
      .then(async (r) => { console.log(`sent ${r.count} for ${r.day}`); const bad = r.log.filter((l) => /failed/i.test(l)); await record('digest', !bad.length, bad.join('; ') || `${r.count} message(s)`); })
      .catch(async (e) => { console.error(e); await record('digest', false, String(e)); })
      // Sundays: This week in the family (0049)
      .then(() => sendWeekly(env, todayIST()))
      .then(async (l) => { console.log(l); if (l !== 'weekly: not Sunday') await record('weekly', !/failed/.test(l), l); })
      .catch(async (e) => { console.error('weekly', e); await record('weekly', false, String(e)); })
      // then the nightly clean-up (0023): old join requests, unused invitations, sent queues, old audit entries
      .then(() => rpcAs<Record<string, number>>(env, 'retention_run'))
      .then(async (r) => { console.log('retention', JSON.stringify(r)); await record('retention', true, JSON.stringify(r)); })
      .catch(async (e) => { console.error('retention', e); await record('retention', false, String(e)); }));
    else ctx.waitUntil((async () => {
      await loadBorders(env);
      const ls = await Promise.all([sendWelcomes(env).catch((e) => [`welcome job failed: ${e}`]), sendJoinNotices(env).catch((e) => [`join notices failed: ${e}`]), sendMentions(env).catch((e) => [`mentions failed: ${e}`]), sendNews(env).catch((e) => [`news emails failed: ${e}`]),
        // admins without 2-step sign-in: daily messages from the Family Admin account, admin removed after 7 days (0046)
        rpc<{ sent: number; removed: number }>(env, 'admin_mfa_run').then((r) => (r.sent || r.removed ? [`2-step: ${r.sent} message(s), ${r.removed} admin(s) removed`] : [])).catch((e) => [`2-step job failed: ${e}`])]);
      const l = ls.flat();
      if (l.length) console.log(l.join('; '));
      const bad = l.filter((x) => /failed/i.test(x));
      await record('emails', !bad.length, bad.join('; ').slice(0, 400) || 'ok');
      const h = await healthPass(env, new Date(c.scheduledTime)).catch((e) => [`health check failed: ${e}`]);
      if (h.length) console.log(h.join('; '));
    })());
  },
  /**
   * For trying it out: GET /?key=<PREVIEW_KEY>&date=2026-12-01[&monthly=1][&send=1]
   * Without send=1 it only shows the messages. Without the right key it shows nothing.
   *   /welcome?key=…[&name=Ragini]  shows the welcome email with sample details
   *   /welcome?key=…&send=1         sends any pending welcomes now
   *   /weekly?key=…[&date=…]        shows This week in the family with live data
   */
  async fetch(req: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const u = new URL(req.url);
    if (u.hostname === PROXY_HOST && !u.pathname.startsWith('/ops/')) {
      if (u.pathname.startsWith('/oauth/')) return oauth(req, env);
      if (u.pathname.startsWith('/ai/')) return ai(req, env);
      const stopped = await checkApi(req, env);
      if (stopped) { ctx?.waitUntil(noteStopped(env, stopped, req)); return tooMany(req.headers.get('origin')); }
      return proxy(req, env.SUPABASE_URL, await proxyToken(env.SUPABASE_SERVICE_KEY));
    }
    if (!(await checkKeyTries(req, env))) return new Response('Too many tries. Wait a minute.', { status: 429 });
    const key = u.searchParams.get('key') || '';
    const secret = env.PREVIEW_KEY || env.CALLMEBOT_APIKEY || '';
    if (secret.length < 12 || !same(key, secret)) return new Response('Not found', { status: 404 });
    if (u.pathname === '/ops/health') {
      const r = await runChecks(env, new Date(), u.searchParams.get('ai') === '1', true);
      const allOk = r.checks.every((x) => x.ok);
      return new Response(JSON.stringify({ allOk, at: new Date().toISOString(), checks: r.checks, runs: r.queues?.runs ?? null }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
    }
    if (u.pathname === '/weekly') {
      // /weekly?key=…[&name=Asha][&date=2026-11-29] shows this week's email with live data (sends nothing)
      const d = u.searchParams.get('date');
      const day = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T00:00:00Z') : todayIST();
      const w = await rpc<WeeklyData | null>(env, 'weekly_digest', { wk: '1900-01-01' });
      if (!w) return new Response('Not found', { status: 404 });
      const m = weeklyEmail(w, upcoming(await feed(env), day), u.searchParams.get('name') || 'Asha', day);
      return new Response(`<!-- ${m.subject.replace(/--/g, '')} -->\n${withBorder(m.html, u.searchParams.get('border'))}`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
    }
    if (u.pathname === '/welcome') {
      if (u.searchParams.get('send') === '1') return new Response(JSON.stringify(await sendWelcomes(env), null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
      const m = welcomeEmail({ given_name: u.searchParams.get('name') || 'Ragini', invited_by_name: 'Meera Iyer', admins: 'Arjun Sharma', people: 42 });
      return new Response(withBorder(m.html, u.searchParams.get('border')), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
    }
    const d = u.searchParams.get('date');
    const day = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T00:00:00Z') : todayIST();
    const r = await run(env, day, { send: u.searchParams.get('send') === '1', forceMonthly: u.searchParams.get('monthly') === '1' });
    return new Response(JSON.stringify(r, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  },
};
