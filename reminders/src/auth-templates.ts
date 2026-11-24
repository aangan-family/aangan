/**
 * The sign-in emails Supabase sends (Authentication → Emails → Templates), in the website's look.
 * `npm run templates` writes them to supabase/templates/; paste each into the dashboard.
 * {{ .ConfirmationURL }} is filled in by Supabase.
 */
import { box, button, C, DOMAIN, FAMILY, layout, p, signature, SIGNER, withBorder } from './brand.ts';
import { EMAIL_FROM } from './site.ts';

// Links come to our own site (not supabase.co, which some Indian providers block); the site verifies the token.
// Email scanners that merely open the link don't use it up, because nothing happens until the page runs.
const LINK = '{{ .SiteURL }}/#/auth?token_hash={{ .TokenHash }}&type=email';

const safety = (what: string) => box([
  `<b>Is this genuine?</b> Yes. It comes from <b>${EMAIL_FROM}</b>, and the button opens <b>${DOMAIN}</b>, our family website. Check that address in your browser after you tap.`,
  `We will never ask for a password, bank details, an OTP or money.`,
  `Weren’t expecting this? Just ignore it. Nothing happens unless you tap ${what}. Not sure? Call or WhatsApp me before you tap: <a href="tel:${SIGNER.tel}" style="color:${C.link};text-decoration:none">${SIGNER.phone}</a>.`,
].map((t, i, a) => `<p style="margin:0 0 ${i === a.length - 1 ? 0 : 10}px">${t}</p>`).join(''));

const fallback = `<p style="margin:0 0 4px;font-size:13px;line-height:1.5;color:${C.light}">If the button doesn’t work, copy this link into your browser:</p>
<p style="margin:0 0 8px;font-size:12px;line-height:1.4;color:${C.light};word-break:break-all"><a href="${LINK}" style="color:${C.light}">${LINK}</a></p>`;

/** "Confirm signup": the first email a newly invited relative gets. */
export const CONFIRM_SUBJECT = `You're invited to the ${FAMILY} family website`;
export function confirmSignup(): string {
  return withBorder(layout({
    preheader: 'Confirm your email to join our private family website: the family tree, calendar and photos.',
    headline: 'You’re invited.',
    body: [
      p('Hello,'),
      p(`I’m <b>${SIGNER.who}</b>, and I look after our family website, <b>${DOMAIN}</b>. You’re getting this email because you, or a relative on your behalf, asked to join it with this address.`),
      p(`It’s a private home online for the ${FAMILY} family: our family tree going back seven generations, a family calendar with Tamil dates, birthdays and remembrance days, family photos, and conversations about our traditions, recipes and news. It’s only for family, and nothing on it is public.`),
      p('All you need to do is confirm this is your email address:'),
      button(LINK, 'Confirm my email and join'),
      p(`<b>What happens next:</b> you’ll land on the website, find your place in the family tree, and read a short privacy note. You decide who sees each detail about you, and you can change your mind any time.`),
      safety('the button'),
      fallback,
      signature(),
    ].join('\n'),
  }));
}

/** "Magic Link": the sign-in link for someone who has already joined. */
export const MAGIC_SUBJECT = `Your sign-in link for ${DOMAIN}`;
export function magicLink(): string {
  return withBorder(layout({
    preheader: 'Tap to sign in to our family website. The link works once.',
    headline: 'Sign in.',
    body: [
      p('Hello,'),
      p(`Here’s your link to sign in to <b>${DOMAIN}</b>, our family website. It works once and expires soon.`),
      button(LINK, 'Sign in to the family website'),
      safety('the button'),
      fallback,
      signature(),
    ].join('\n'),
  }));
}
