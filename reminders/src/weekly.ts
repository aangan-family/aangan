/**
 * "This week in the family" (0049): the Sunday-morning email to every member. Pure functions: easy to test.
 *
 * Coming up: the next 7 days' birthdays shared with the whole family, birth anniversaries and remembrance days of
 * those who have passed, and festivals (the same rule as the 7 am phone notifications: never Tamil birthdays,
 * shraddhams or birthdays that aren't shared). Then what happened on the site in the last 7 days, from
 * weekly_digest(): who joined, conversation titles and reply counts, how many new photos, notices to everyone.
 */
import { box, button, C, esc, h2, layout, p, SITE } from './brand.ts';
import { occasions, type Day, type FeedRow } from './messages.ts';
import { findDay } from '../../web/src/lib/calendar';

export interface WeeklyData {
  recipients: { email: string; given_name: string }[];
  joined: string[];
  threads: { id: string; title: string; new: boolean; replies: number }[];
  photos: number;
  notices: { title: string; url: string }[];
  members: number;
  living: number;
}
export interface Upcoming { day: Day; icon: string; text: string }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ymd = (d: Day) => d.toISOString().slice(0, 10);
const addDays = (d: Day, n: number) => new Date(d.getTime() + n * 86400000);
export const dayLabel = (d: Day) => `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
const link = (url: string) => `${SITE}/${/^#\/[\w\-/]*$/.test(url) ? url : '#/'}`;
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** The coming week (today and the 6 days after), in date order. */
export function upcoming(rows: FeedRow[], today: Day): Upcoming[] {
  const end = addDays(today, 6);
  const out: Upcoming[] = [];
  for (const o of occasions(rows, today, end)) {
    if (o.kind === 'birthday' && o.row.birth_shared) out.push({ day: o.day, icon: '🎂', text: `${o.row.name}’s birthday` });
    else if (o.kind === 'born' && o.row.birth_shared) out.push({ day: o.day, icon: '🪔', text: `${o.row.name}’s birth anniversary` });
    else if (o.kind === 'passed') out.push({ day: o.day, icon: '🪔', text: `Remembering ${o.row.name}` });
  }
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    for (const e of findDay(ymd(d))?.events || []) if (e.kind === 'festival') out.push({ day: d, icon: '🌼', text: e.title });
  }
  return out.sort((a, b) => a.day.getTime() - b.day.getTime());
}

/** Is there anything worth an email this week? */
export const hasNews = (w: WeeklyData, up: Upcoming[]) =>
  up.length > 0 || w.joined.length > 0 || w.threads.length > 0 || w.photos > 0 || w.notices.length > 0;

/** "🎂 Asha’s birthday, Karthigai Deepam and 3 more" */
export function subjectFor(w: WeeklyData, up: Upcoming[]): string {
  const bits = [
    ...up.filter((u) => u.icon === '🎂').map((u) => u.text),
    ...up.filter((u) => u.icon === '🌼').map((u) => u.text),
    ...(w.joined.length ? [`${plural(w.joined.length, 'new face')} on the site`] : []),
    ...(w.threads.length ? [`${plural(w.threads.length, 'conversation')} in Talk`] : []),
  ];
  if (!bits.length) return 'This week in the family';
  const head = bits.slice(0, 2).join(', ');
  return `This week in the family: ${head}${bits.length > 2 ? ` and ${bits.length - 2} more` : ''}`;
}

const row = (left: string, right: string) =>
  `<tr><td valign="top" style="width:96px;padding:0 10px 10px 0;font-size:14px;line-height:1.5;color:${C.grey};white-space:nowrap">${left}</td><td valign="top" style="padding:0 0 10px;font-size:16px;line-height:1.5;color:${C.ink}">${right}</td></tr>`;
const table = (rows: string[]) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 8px">${rows.join('')}</table>`;
const a = (href: string, t: string) => `<a href="${href}" style="color:${C.link};text-decoration:none">${t}</a>`;

export function weeklyEmail(w: WeeklyData, up: Upcoming[], given: string, today: Day) {
  const subject = subjectFor(w, up);
  const parts: string[] = [p(`Hi ${esc(given)}, here’s what’s coming up in the family and what happened on the website this week.`)];
  const txt: string[] = [`Hi ${given}, here’s what’s coming up in the family and what happened on the website this week.`, ''];

  if (up.length) {
    parts.push(h2('Coming up.'), table(up.map((u) => row(dayLabel(u.day), `${u.icon} ${esc(u.text)}`))));
    if (up.some((u) => u.icon === '🎂')) parts.push(p(`Send a wish: open <b>Coming up</b> on the website and tap <b>Send a wish</b>.`, `font-size:14px;color:${C.grey}`));
    parts.push(button(`${SITE}/#/calendar/${ymd(today).slice(0, 7)}`, 'Open the calendar'));
    txt.push('COMING UP', ...up.map((u) => `${dayLabel(u.day)}  ${u.icon} ${u.text}`), `${SITE}/#/calendar`, '');
  }

  const news: string[] = [];
  const ntxt: string[] = [];
  if (w.joined.length) {
    const names = w.joined.slice(0, 8).map(esc).join(', ') + (w.joined.length > 8 ? ` and ${w.joined.length - 8} more` : '');
    news.push(row('Joined', `👋 ${names}. Say hello in ${a(`${SITE}/#/chat`, 'Messages')}.`));
    ntxt.push(`👋 Joined: ${w.joined.join(', ')}`);
  }
  for (const t of w.threads) {
    const what = t.new ? (t.replies ? `new, ${plural(t.replies, 'reply', 'replies')}` : 'new conversation') : plural(t.replies, 'new reply', 'new replies');
    news.push(row('Talk', `💬 ${a(`${SITE}/#/talk/${t.id}`, esc(t.title))} <span style="color:${C.grey}">· ${what}</span>`));
    ntxt.push(`💬 ${t.title} (${what}): ${SITE}/#/talk/${t.id}`);
  }
  if (w.photos) {
    news.push(row('Photos', `📷 ${a(`${SITE}/#/photos`, plural(w.photos, 'new photo'))}. Can you name everyone in them?`));
    ntxt.push(`📷 ${plural(w.photos, 'new photo')}: ${SITE}/#/photos`);
  }
  // a notice that only points at a conversation already listed would say the same thing twice
  for (const n of w.notices.filter((x) => !w.threads.some((t) => x.url === `#/talk/${t.id}`))) {
    news.push(row('Notice', `📣 ${a(link(n.url), esc(n.title))}`));
    ntxt.push(`📣 ${n.title}: ${link(n.url)}`);
  }
  if (news.length) {
    parts.push(h2('New on the website.'), table(news));
    txt.push('NEW ON THE WEBSITE', ...ntxt, '');
  }

  if (w.living > w.members) {
    const left = w.living - w.members;
    parts.push(box(`<b>${w.members} of ${w.living} relatives are on the website.</b> ${left} still aren’t. Know one of them? Open their profile in the ${a(`${SITE}/#/tree`, 'Family tree')} and tap <b>Invite</b>. It takes a minute.`));
    txt.push(`${w.members} of ${w.living} relatives are on the website. Invite one: open their profile in the Family tree and tap Invite. ${SITE}/#/tree`, '');
  }
  parts.push(button(SITE, 'Open the family website'));
  parts.push(p(`Don’t want this weekly email? Turn off <b>This week in the family</b> in ${a(`${SITE}/#/privacy`, 'My privacy')}.`, `font-size:13px;color:${C.grey}`));
  txt.push(SITE, '', `Turn this weekly email off: ${SITE}/#/privacy`);

  const first = up[0] ? `${up[0].icon} ${up[0].text}, ${dayLabel(up[0].day)}` : w.joined.length ? `${plural(w.joined.length, 'new face')} on the website` : 'What’s new in the family';
  return { subject, html: layout({ preheader: first, headline: 'This week in the family.', body: parts.join('\n') }), text: txt.join('\n') };
}
