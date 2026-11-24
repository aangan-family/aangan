/** The welcome email sent once, when someone joins the family website. */
import { box, button, C, DOMAIN, esc, FAMILY, feature, features, h2, layout, p, signature, SIGNER, SITE } from './brand.ts';
import { calendarDays, kinExamples, ownDays, PACK } from './tradition.ts';

export interface WelcomeRow {
  user_id: string;
  email: string;
  given_name: string;
  invited_by_name: string | null;
  admins: string | null;
  people: number;
}

export function welcomeEmail(r: Pick<WelcomeRow, 'given_name' | 'invited_by_name' | 'admins' | 'people'>) {
  const name = (r.given_name || '').trim();
  const hi = name ? esc(name) : 'and welcome';
  const people = r.people > 0 ? `${r.people} people` : 'everyone';
  const invited = r.invited_by_name ? ` ${esc(r.invited_by_name)} invited you, and` : '';
  const admins = (r.admins || '').split(',').map((a) => a.trim()).filter(Boolean);
  const kin = kinExamples(), cal = calendarDays();
  const related = kin ? `Pick any two people and see how they’re related, in English and with the ${esc(PACK.name)} word: ${esc(kin)} and the rest.` : 'Pick any two people and see how they’re related, in plain words.';
  const calendar = `${cal ? `${cal} for every day, ` : ''}the festivals you choose, and our own days: ${ownDays()}.`;

  const body = [
    p(`Hello ${hi},`),
    p(`You’re now part of <b>${DOMAIN}</b>, the private home online for our ${FAMILY} family.${invited} we’re so glad you’re here.`),
    p(`It’s our family tree, with ${people} in it so far, and a place to keep in touch. Only invited family can sign in. Nothing on it is public or searchable.`),
    button(SITE, 'Open the family website'),

    h2('What you can do.'),
    features([
      feature('🌳', 'Find yourself in the family tree', 'See your line back through the generations. Tap anyone to open their profile; <i>Show me</i> takes you straight to you.'),
      feature('🔗', 'How are we related?', related),
      feature('📅', 'Family calendar', calendar[0].toUpperCase() + calendar.slice(1)),
      feature('💬', 'Talk', 'Conversations about traditions, recipes, festivals and family news. Start one, reply, or react with a 🙏.'),
      feature('📷', 'Photos', 'Share family photos, old and new, and tag who’s in them. Nobody is tagged without saying yes.'),
      feature('👤', 'Your profile', 'Add your birthday, star, work, city, phone and a photo, and tell us your wedding date. You choose who sees each one.'),
      feature('🔔', 'Coming up and the bell', 'The Family page shows the birthdays and remembrance days coming up; the bell tells you what’s new.'),
      feature('✉️', 'Invite family', 'Know a relative who isn’t on yet? Invite them from the website by email or a WhatsApp link.'),
      feature('📱', 'Keep it on your phone', `Open ${DOMAIN} in Chrome or Safari and choose <i>Add to Home screen</i>. It opens like an app.`),
    ]),

    h2('Your privacy comes first.'),
    box([
      `<b>You decide who sees what.</b> Every detail has its own setting: <i>Family</i>, <i>Close family</i>, or <i>Only me</i>.`,
      `<b>Your details show only while you agree.</b> You can change a setting or withdraw your consent at any time from <i>My privacy</i>.`,
      `<b>Children are protected.</b> No phone numbers, emails or addresses are kept for anyone under 18.`,
      `<b>No passwords.</b> You sign in with a link sent to your email, or with Google, Microsoft or Yahoo.`,
    ].map((t, i, a) => `<p style="margin:0 0 ${i === a.length - 1 ? 0 : 10}px">${t}</p>`).join('')),

    h2('Need a hand?'),
    p(admins.length
      ? `Our family admins are happy to help: <b>${admins.map(esc).join('</b>, <b>')}</b>. They can add missing relatives, fix a name or a date, and answer questions.`
      : 'Our family admins are happy to help: they can add missing relatives, fix a name or a date, and answer questions.'),
    p(`Or reach me directly. I put this website together and I’d love to hear from you, whether it’s a question, a correction, or a family story we should keep: <a href="tel:${SIGNER.tel}" style="color:${C.link};text-decoration:none">${SIGNER.phone}</a> (call or WhatsApp).`),
    signature(),
  ].join('\n');

  const subject = name ? `Welcome to the family website, ${name}.` : 'Welcome to the family website.';
  const html = layout({ preheader: 'Your place in the family tree, the calendar, photos, and how your privacy works.', headline: name ? `Welcome home, ${esc(name)}.` : 'Welcome home.', body });
  const text = [
    `Hello ${name || 'and welcome'},`,
    '',
    `You're now part of ${DOMAIN}, the private home online for our ${FAMILY} family.${r.invited_by_name ? ` ${r.invited_by_name} invited you, and` : ''} we're so glad you're here.`,
    `It's our family tree, with ${people} in it so far, and a place to keep in touch. Only invited family can sign in.`,
    '',
    `Open it: ${SITE}`,
    '',
    'What you can do:',
    '- Find yourself in the family tree',
    kin ? `- How are we related? Any two people, with the ${PACK.name} word` : '- How are we related? Any two people, in plain words',
    `- Family calendar: ${cal ? cal + ', ' : ''}festivals, ${ownDays()}`,
    '- Talk: traditions, recipes, festivals, family news',
    '- Photos: share and tag (nobody is tagged without saying yes)',
    '- Your profile: you choose who sees each detail',
    '- Invite family by email or WhatsApp',
    '- Add to Home screen to keep it on your phone',
    '',
    'Your privacy: every detail is Family, Close family or Only me. Change it or withdraw consent any time from My privacy. No phone numbers, emails or addresses are kept for under-18s. No passwords.',
    '',
    admins.length ? `Family admins: ${admins.join(', ')}.` : '',
    `Questions? Call or WhatsApp me: ${SIGNER.phone}`,
    '',
    `With love,`,
    SIGNER.who,
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
  return { subject, html, text };
}
