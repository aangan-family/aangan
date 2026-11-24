/** "Notify everyone" by email (0048): the admin's own notice, one email per person, sent in Resend batches. */
import { button, esc, layout, p, SITE } from './brand.ts';
import { excerpt } from './mentions.ts';

export interface NewsRow { id: number; email: string; given_name: string; by_name: string | null; title: string; body: string; url: string }

/** Only links inside the site: the notice's own `#/…` page, else Home. */
export const newsLink = (url: string) => `${SITE}/${/^#\/[\w\-/]*$/.test(url) ? url : '#/'}`;

export function newsEmail(r: NewsRow) {
  const who = r.by_name || 'The family website';
  const link = newsLink(r.url);
  const talk = /^#\/talk\//.test(r.url);
  const body = excerpt(r.body || '', 400);
  const subject = r.title;
  const html = layout({
    preheader: body ? excerpt(r.body, 90) : `${who} shared a notice on the family website.`,
    headline: r.title.replace(/[.!?…]?$/, (m) => m || '.'),
    body: [
      p(`Hi ${esc(r.given_name)}, ${esc(who)} shared this on the family website.`),
      body ? p(esc(body), 'font-size:17px') : '',
      button(link, talk ? 'Open the conversation' : 'Have a look'),
      p(`Don’t want these emails? Turn off “Family news by email” in <a href="${SITE}/#/privacy" style="color:#6e6e73">My privacy</a>. Notices still show in your bell.`, 'font-size:13px;color:#6e6e73'),
    ].join('\n'),
  });
  const text = [`Hi ${r.given_name}, ${who} shared this on the family website:`, '', r.title, ...(body ? [body] : []), '', link, '', `Turn these emails off: ${SITE}/#/privacy`].join('\n');
  return { subject, html, text };
}
