/**
 * The family website's look, for email: white page, quiet greys, one blue accent, system font,
 * big headline ending in a full stop. Inline styles only (Gmail drops <style> blocks).
 * The sign-in emails in supabase/templates/ use the same look by hand.
 */

import { TEXTILES, borderFor } from '../../web/src/lib/textiles';
import { PACK } from './tradition.ts';
import { SITE_URL, FAMILY as FAMILY_NAME, ADMIN, DOMAIN } from './site.ts';
export const SITE = SITE_URL;
export const FAMILY = FAMILY_NAME;
export { DOMAIN };
/** Who signs the emails (site.config.json → admin), so relatives know they're genuine. */
export const SIGNER = ADMIN;

export const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Every email carries the family's traditions at the top, as on the website: a woven border from the reader's own
 * traditions' dress (web/src/lib/heritage.ts: the South's veshti for men and saree for women, phulkari, bandhani,
 * paithani, laal paar…; their own choice from Theme if they made one) with the mango-leaf thoranam under it.
 * The pictures are PNGs drawn from web/src/components (npm run email-art) and served from the site's /email/
 * folder (no family data in them). layout() writes BORDER_TOKEN; mail.ts swaps it for each recipient's border.
 * A family whose traditions have no border (English) gets none.
 */
export type EmailBorder = string;
export const BORDERS: EmailBorder[] = TEXTILES.map((t) => t.id);
/** The border for someone we know nothing about: the family's traditions' default (none for English). */
export const DEFAULT_BORDER: EmailBorder | null = borderFor('', null, PACK.id);
export const BORDER_TOKEN = '__FAMILY_BORDER__';
export const ART = `${SITE}/email`;
/** The border for a member: same rule as the website (their choice if allowed, else their traditions' default). */
export const borderForMember = (gender: string, pref: string) => borderFor(gender, pref, PACK.id);
/** Put a border in place of the token (unknown names fall back to the default; no default = no border row). */
export function withBorder(html: string, b?: string | null): string {
  const use = b && BORDERS.includes(b) ? b : DEFAULT_BORDER;
  if (!use) return html.replace(/<!--border-->[\s\S]*?<!--\/border-->/g, '');
  return html.split(BORDER_TOKEN).join(use);
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
export const C = { ink: '#1d1d1f', grey: '#6e6e73', light: '#86868b', soft: '#f5f5f7', line: '#e5e5ea', blue: '#0071e3', link: '#0066cc', green: '#1d8a3c' };

export const p = (html: string, extra = '') =>
  `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:${C.ink};${extra}">${html}</p>`;
export const h2 = (t: string) =>
  `<h2 style="margin:30px 0 12px;font-size:21px;line-height:1.25;font-weight:700;letter-spacing:-.01em;color:${C.ink}">${t}</h2>`;
export const button = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 22px"><tr><td style="border-radius:980px;background:${C.blue}">
<a href="${href}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:17px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:980px">${label}</a>
</td></tr></table>`;
/** A row with an emoji, a bold title and a line of text. */
export const feature = (icon: string, title: string, text: string) =>
  `<tr><td valign="top" style="width:40px;padding:0 0 14px;font-size:22px;line-height:1.2">${icon}</td>
<td valign="top" style="padding:0 0 14px;font-size:15px;line-height:1.5;color:${C.ink}"><b>${title}</b><br><span style="color:${C.grey}">${text}</span></td></tr>`;
export const features = (rows: string[]) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:4px 0 6px">${rows.join('')}</table>`;
export const box = (html: string) =>
  `<div style="background:${C.soft};border-radius:16px;padding:18px 20px;margin:8px 0 20px;font-size:15px;line-height:1.55;color:${C.ink}">${html}</div>`;

export function signature(): string {
  return `<div style="margin:28px 0 0;padding:20px 0 0;border-top:1px solid ${C.line};font-size:15px;line-height:1.55;color:${C.ink}">
With love,<br><b>${SIGNER.who}</b><br>
<span style="color:${C.grey}">for the ${FAMILY} family</span><br>
<span style="color:${C.grey}">Call or WhatsApp:</span> <a href="tel:${SIGNER.tel}" style="color:${C.link};text-decoration:none">${SIGNER.phone}</a>
· <a href="https://wa.me/${SIGNER.wa}" style="color:${C.link};text-decoration:none">WhatsApp me</a>
</div>`;
}

/** The whole email around some content. `preheader` is the grey line inboxes show after the subject. */
export function layout(o: { preheader: string; headline: string; body: string; border?: EmailBorder }): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(FAMILY)}</title></head>
<body style="margin:0;padding:0;background:${C.soft};font-family:${FONT};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(o.preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.soft}"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:580px;background:#ffffff;border-radius:22px">
<!--border--><tr><td style="padding:0;font-size:0;line-height:0;border-radius:22px 22px 0 0;overflow:hidden"><img src="${ART}/${o.border || BORDER_TOKEN}.png" width="580" alt="" style="display:block;width:100%;max-width:580px;height:auto;border:0;border-radius:22px 22px 0 0"></td></tr><!--/border-->
<tr><td style="padding:0 0 0;font-size:0;line-height:0"><img src="${ART}/thoranam.png" width="580" alt="" style="display:block;width:100%;max-width:580px;height:auto;border:0"></td></tr>
<tr><td style="padding:14px 30px 34px;font-family:${FONT}">
<p style="margin:0 0 6px;font-size:14px;font-weight:600;color:${C.blue}">${FAMILY}</p>
<h1 style="margin:0 0 20px;font-size:34px;line-height:1.1;font-weight:700;letter-spacing:-.02em;color:${C.ink}">${o.headline}</h1>
${o.body}
</td></tr></table>
<p style="max-width:540px;margin:18px auto 0;font-size:12px;line-height:1.5;color:${C.light};text-align:center">
Sent by the ${FAMILY} family website, <a href="${SITE}" style="color:${C.light}">${DOMAIN}</a>, a private site only for invited family.
We never ask for passwords, bank details or money. Our links only ever go to ${DOMAIN}, and we never ask you to install anything, prove you’re human or run a command.</p>
</td></tr></table></body></html>`;
}
