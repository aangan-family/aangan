/**
 * Every email from the site goes through here, so they all look the same to mail servers:
 * one sender (site.config.json → emailFrom, which should forward replies to the admin), a plain-text part that
 * carries the same footer as the HTML, a unique X-Entity-Ref-ID (so Gmail doesn't fold different
 * notices into one thread), a List-Unsubscribe header on optional emails, and a Resend tag per kind.
 * No open or click tracking: links stay plain links to the site.
 */
import { borderForMember, DOMAIN, FAMILY, SITE, withBorder, type EmailBorder } from './brand';
import { EMAIL_FROM } from './site';

/** Each member's border by email address (lower case), loaded by the Worker from email_borders(); unknown → default. */
const borders = new Map<string, EmailBorder>();
export function setBorders(rows: { email: string; gender?: string; border: string }[]) {
  borders.clear();
  for (const r of rows) {
    const b = r.email ? borderForMember(r.gender || '', r.border || '') : null;
    if (b) borders.set(r.email.toLowerCase(), b);
  }
}
export const borderOf = (email?: string) => (email && borders.get(email.toLowerCase())) || undefined;

export interface MailEnv { RESEND_API_KEY?: string; EMAIL_FROM?: string }
export type Kind = 'welcome' | 'mention' | 'news' | 'weekly' | 'join' | 'invite' | 'digest' | 'alert';
export interface Mail { to: string[]; bcc?: string[]; subject: string; html: string; text: string }

export const DEFAULT_FROM = `${FAMILY} <${EMAIL_FROM}>`;
export const fromOf = (env: MailEnv) => env.EMAIL_FROM || DEFAULT_FROM;

/** The same footer the HTML layout shows, for the plain-text part. */
export const TEXT_FOOTER = `--\nSent by the ${FAMILY} family website, ${SITE}, a private site only for invited family.\nWe never ask for passwords, bank details or money. Our links only ever go to ${DOMAIN}, and we never ask you to install anything, prove you’re human or run a command.`;

/** Kinds a person can turn off in My privacy get a List-Unsubscribe header pointing there. */
const OPTIONAL: Kind[] = ['mention', 'news', 'weekly'];

export function payload(env: MailEnv, m: Mail, kind: Kind, ref: string = crypto.randomUUID()) {
  const text = m.text.includes('We never ask for passwords') ? m.text : `${m.text.trimEnd()}\n\n${TEXT_FOOTER}`;
  const headers: Record<string, string> = { 'X-Entity-Ref-ID': ref };
  if (OPTIONAL.includes(kind)) {
    headers['List-Unsubscribe'] = `<mailto:${EMAIL_FROM}?subject=Stop%20${kind}%20emails>, <${SITE}/#/privacy>`;
  }
  const html = withBorder(m.html, borderOf(m.to[0]));
  return {
    from: fromOf(env),
    to: m.to,
    ...(m.bcc?.length ? { bcc: m.bcc } : {}),
    subject: m.subject,
    html,
    text,
    headers,
    tags: [{ name: 'category', value: kind }],
  };
}

export async function sendEmail(env: MailEnv, m: Mail, kind: Kind): Promise<{ ok: boolean; status: number; body: string }> {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload(env, m, kind)),
  });
  return { ok: r.ok, status: r.status, body: r.ok ? '' : await r.text() };
}

/** Several separate emails in one request (Resend's batch endpoint, up to 100). */
export async function sendBatch(env: MailEnv, ms: Mail[], kind: Kind): Promise<{ ok: boolean; status: number; body: string }> {
  if (!ms.length) return { ok: true, status: 200, body: '' };
  const r = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(ms.slice(0, 100).map((m) => payload(env, m, kind))),
  });
  return { ok: r.ok, status: r.status, body: r.ok ? '' : await r.text() };
}
