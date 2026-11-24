/**
 * Personal invitation links: #/invite/<random code> (0024). A signed-out visitor holding the link learns only a masked
 * email ("ra•••@gmail.com"), so a forwarded link doesn't reveal the address. Older links (#/join/<email, base64url>)
 * still work.
 */
import { FAMILY, SITE_URL } from './site';

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

export const siteUrl = () => (typeof location !== 'undefined' ? location.origin : SITE_URL);
export const inviteLink = (code: string) => `${siteUrl()}/#/invite/${code}`;
/** old-style link, only for tests and invitations without a code */
export const legacyInviteLink = (email: string) => `${siteUrl()}/#/join/${b64(email.trim().toLowerCase())}`;
export function inviteCode(hash: string): string | null {
  const m = hash.match(/^#\/invite\/([a-z0-9]{12})$/);
  return m ? m[1] : null;
}
/** "lakshmi@yahoo.co.in" → "la•••@yahoo.co.in" (what the link page shows) */
export function maskEmail(email: string): string {
  const [local, domain] = email.trim().toLowerCase().split('@');
  return `${local.slice(0, 2)}•••@${domain || ''}`;
}
export function joinEmail(hash: string): string | null {
  const m = hash.match(/^#\/join\/([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  try { const e = unb64(m[1]); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null; } catch { return null; }
}
export const isGmail = (email: string) => /@(gmail|googlemail)\.com$/i.test(email.trim());

export function inviteMessage(first: string, email: string, code?: string | null): string {
  const link = code ? inviteLink(code) : legacyInviteLink(email);
  return `Hi${first ? ' ' + first : ''} 🙏 You're invited to our family website, ${FAMILY}.\n\nTap this link to join: ${link}\n\n` +
    `Sign in with the email you were invited with (${maskEmail(email)}). ${isGmail(email) ? 'Tap "Continue with Google", or tap ' : 'Tap '}"Email me a sign-in link" and open the email we send (check Spam or Promotions if it isn't in your inbox).\n\n` +
    `It's private to invited family, and you choose who sees each of your details.`;
}

/**
 * When a sign-in link fails, Supabase sends people back with ?error=…&error_code=… (and the same in the #).
 * Turn that into a plain sentence for the sign-in page; null when there's no error.
 */
export function authLinkError(search: string, hash: string): string | null {
  const q = new URLSearchParams(search.replace(/^\?/, ''));
  const h = new URLSearchParams(hash.replace(/^#\/?/, ''));
  const code = q.get('error_code') || h.get('error_code') || '';
  const error = q.get('error') || h.get('error') || '';
  if (!code && !error) return null;
  if (/otp_expired/.test(code) || /expired|invalid/i.test(q.get('error_description') || h.get('error_description') || ''))
    return 'That sign-in link has expired or was already used. Links work once and only for a short while (some email apps open links to scan them, which uses them up). Enter your email below for a fresh one, or use Google, Microsoft or Yahoo.';
  if (code === 'provider_work_account') return 'That looks like a work or school Microsoft account. Please use a personal Outlook, Hotmail or Live address, or the email link below.';
  if (code === 'provider_cancelled') return 'Sign-in was cancelled. Please try again.';
  if (code === 'provider_not_ready') return 'That sign-in option isn’t ready yet. Please use the email link for now.';
  if (code.startsWith('provider_')) return 'Sign-in didn’t finish. Please try again, or use the email link below.';
  if (error === 'access_denied') return 'Sign-in was cancelled. Please try again.';
  return 'Sign-in didn’t finish. Please try again, or ask for a new email link below.';
}

/** The family model pieces the closeness order needs (lib/family.ts). */
interface Kin { parents: Map<string, string[]>; children: Map<string, string[]>; spouses: Map<string, string[]> }

/**
 * Relatives in order of closeness: husband or wife, parents, children, brothers and sisters, then in-laws
 * (the spouse's parents and siblings, siblings' and children's spouses), then nieces and nephews and grandchildren.
 * Used to suggest who to bring in next.
 */
export function closeRelatives(f: Kin, me: string): string[] {
  const out: string[] = [];
  const add = (ids?: string[]) => { for (const x of ids || []) if (x !== me && !out.includes(x)) out.push(x); };
  const g = (m: Map<string, string[]>, id: string) => m.get(id) || [];
  const sps = g(f.spouses, me), pars = g(f.parents, me), kids = g(f.children, me);
  const sibs = [...new Set(pars.flatMap((p) => g(f.children, p)))].filter((x) => x !== me);
  add(sps); add(pars); add(kids); add(sibs);
  for (const s of sps) { add(g(f.parents, s)); add([...new Set(g(f.parents, s).flatMap((p) => g(f.children, p)))]); }
  for (const x of [...sibs, ...kids]) add(g(f.spouses, x));
  for (const p of pars) add(g(f.spouses, p));
  for (const x of [...sibs, ...kids]) add(g(f.children, x));
  for (const p of pars) add(g(f.parents, p));
  return out;
}

/** A WhatsApp note asking someone to join by request (#/join), for relatives whose email you don't know. */
export function joinRequestMessage(first: string): string {
  return `Hi${first ? ' ' + first : ''} 🙏 Our family now has a private website, ${FAMILY}: the family tree, birthdays and festivals, old photos and family chats.\n\n` +
    `Tap here to join: ${siteUrl()}/#/join\n\nSign in with Google or your email, fill in the short form (your name and your parents' names), and someone in the family will let you in. Only family can see anything on it.`;
}

/** The invitation link for an elder's phone: opens with larger text (and menus in Tamil if asked), then the invitation. */
/** lang: menus in that language on the elder's phone ('hi', 'ta', 'bn'…; 'en' or empty for English) */
export const elderLink = (code: string, lang = '') => `${siteUrl()}/?elder=1${lang && lang !== 'en' ? `&lang=${lang}` : ''}#/invite/${code}`;
