/**
 * Writes the reminder messages. Pure functions, no network: easy to test.
 *
 * - Monthly digest (the 1st): every birthday, remembrance day, Tamil birthday and
 *   shraddham in the month, one line each.
 * - Daily: one ready-to-forward message per occasion today. People whose birth date
 *   isn't shared with the whole family get a private heads-up instead of a greeting.
 */
import { FAMILY as FAMILY_NAME } from './site';
import {
  NAKSHATRAMS, TAMIL_MONTHS, nextShraddham, nextTamilBirthday, tamilMonthOfDay, tithiName, unpackStar, unpackTithi,
} from '../../web/src/lib/panchang';

export interface FeedRow {
  id: string; name: string; given_name: string; gender: string; is_living: boolean; birth_year: number | null;
  birth_date: string | null; birth_shared: boolean; death_date: string | null;
  janma_nakshatram: string | null; shraddha_tithi: string | null; parents: string | null; partner: string | null;
}

/** A calendar day (UTC midnight of the IST date). */
export type Day = Date;
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = MONTHS.map((m) => m.slice(0, 3));
const SIGN = `— ${FAMILY_NAME} family`;

export const todayIST = (now = new Date()): Day => {
  const t = new Date(now.getTime() + 330 * 60000);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
};
const ymd = (d: Day) => d.toISOString().slice(0, 10);
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const isLeap = (y: number) => daysIn(y, 1) === 29;

interface MD { y: number | null; m: number; d: number }
/** "19830727" → month/day if both are known */
function md(s: string | null): MD | null {
  if (!s || !/^\d{8}$/.test(s)) return null;
  const y = +s.slice(0, 4), m = +s.slice(4, 6), d = +s.slice(6);
  if (!m || !d) return null;
  return { y: y || null, m: m - 1, d };
}
/** The day this year's anniversary falls on (29 Feb → 28 Feb in other years). */
function inYear(x: MD, year: number): Day {
  const d = x.m === 1 && x.d === 29 && !isLeap(year) ? 28 : x.d;
  return new Date(Date.UTC(year, x.m, d));
}

const pron = (g: string) => (g === 'f' ? 'her' : g === 'm' ? 'him' : 'them');
const pos = (g: string) => (g === 'f' ? 'her' : g === 'm' ? 'his' : 'their');
const who = (r: FeedRow) => (r.parents ? `${r.gender === 'f' ? 'daughter' : r.gender === 'm' ? 'son' : 'child'} of ${r.parents}` : r.partner ? `${r.gender === 'f' ? 'wife' : r.gender === 'm' ? 'husband' : 'partner'} of ${r.partner}` : '');

export type Kind = 'birthday' | 'born' | 'passed' | 'tamil' | 'shraddham';
export interface Occasion { day: Day; kind: Kind; row: FeedRow; approx: boolean; detail?: string }

/** Every occasion between `from` and `to` (inclusive). */
export function occasions(rows: FeedRow[], from: Day, to: Day): Occasion[] {
  const out: Occasion[] = [];
  const within = (d: Day | null) => !!d && d >= from && d <= to;
  const years = [...new Set([from.getUTCFullYear(), to.getUTCFullYear()])];
  for (const r of rows) {
    const b = md(r.birth_date);
    if (b) for (const y of years) {
      const d = inYear(b, y);
      if (within(d)) out.push({ day: d, kind: r.is_living ? 'birthday' : 'born', row: r, approx: false });
    }
    const dd = !r.is_living ? md(r.death_date) : null;
    if (dd) for (const y of years) {
      const d = inYear(dd, y);
      if (within(d) && (dd.y === null || dd.y < y)) out.push({ day: d, kind: 'passed', row: r, approx: false });
    }
    // Tamil calendar occasions: only worked out when the Tamil month is near, to keep this quick
    const near = new Set([tamilMonthOfDay(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
      tamilMonthOfDay(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())]);
    const star = r.is_living ? unpackStar(r.janma_nakshatram || undefined) : null;
    if (star && near.has(star.month)) {
      const d = nextTamilBirthday(star.month, star.star, new Date(from.getTime() - 330 * 60000));
      if (within(d)) out.push({ day: d!, kind: 'tamil', row: r, approx: true, detail: `${TAMIL_MONTHS[star.month]} ${NAKSHATRAMS[star.star]}` });
    }
    const t = !r.is_living ? unpackTithi(r.shraddha_tithi || undefined) : null;
    if (t && near.has(t.month)) {
      const d = nextShraddham(t.month, t.tithi, new Date(from.getTime() - 330 * 60000));
      if (within(d)) out.push({ day: d!, kind: 'shraddham', row: r, approx: true, detail: `${TAMIL_MONTHS[t.month]} ${tithiName(t.tithi)}` });
    }
  }
  return out.sort((a, b) => a.day.getTime() - b.day.getTime() || a.row.name.localeCompare(b.row.name));
}

/** Ready-to-forward messages for today, plus private heads-ups for the admin. */
export function dailyMessages(rows: FeedRow[], today: Day): string[] {
  const out: string[] = [];
  for (const o of occasions(rows, today, today)) {
    const r = o.row, n = r.name, g = r.gender;
    const year = (s: string | null) => md(s)?.y;
    switch (o.kind) {
      case 'birthday':
        out.push(r.birth_shared
          ? `🎂 Today is *${n}*'s birthday! 🎉\nLet's all wish ${pron(g)} a very happy birthday.\n${SIGN}`
          : `🔒 Just for you: today is *${n}*'s birthday${who(r) ? ` (${who(r)})` : ''}.\n${pos(g)[0].toUpperCase() + pos(g).slice(1)} birth date isn't shared with the whole family on the site yet, so please check before forwarding.`);
        break;
      case 'born':
        out.push(`🪔 Remembering *${n}*, born on this day${year(r.birth_date) ? ` in ${year(r.birth_date)}` : ''}.\nForever in our hearts. 🙏\n${SIGN}`);
        break;
      case 'passed':
        out.push(`🪔 Remembering *${n}*, who left us on this day${year(r.death_date) ? ` in ${year(r.death_date)}` : ''}.\nForever in our hearts. 🙏\n${SIGN}`);
        break;
      case 'tamil':
        out.push(`🌟 Today is *${n}*'s Tamil birthday (${o.detail}). 🎉\n${SIGN}\n\n_Worked out from the Tamil calendar; please confirm with the panchangam._`);
        break;
      case 'shraddham':
        out.push(`🙏 Just for you: today should be *${n}*'s shraddham (${o.detail}).\nWorked out from the Tamil calendar; please confirm with the panchangam.`);
        break;
    }
  }
  return out;
}

/** The digest sent on the 1st of the month. */
export function monthlyMessage(rows: FeedRow[], year: number, month: number, opts: { shareable?: boolean } = {}): string | null {
  const from = new Date(Date.UTC(year, month, 1)), to = new Date(Date.UTC(year, month, daysIn(year, month)));
  // the shareable version leaves out birthdays that aren't shared with the whole family
  const all = occasions(rows, from, to).filter((o) => !opts.shareable || o.kind !== 'birthday' || o.row.birth_shared);
  if (!all.length) return null;
  const day = (o: Occasion) => `${o.approx ? '~' : ''}${o.day.getUTCDate()} ${SHORT[month]}`;
  const line = (o: Occasion) => {
    const r = o.row;
    switch (o.kind) {
      case 'birthday': return `${day(o)} – ${r.name}${who(r) ? ` (${who(r)})` : ''}${r.birth_shared ? '' : ' 🔒'}`;
      case 'born': return `${day(o)} – ${r.name}, born on this day${md(r.birth_date)?.y ? ` in ${md(r.birth_date)!.y}` : ''}`;
      case 'passed': return `${day(o)} – ${r.name}, passed away${md(r.death_date)?.y ? ` in ${md(r.death_date)!.y}` : ''}`;
      default: return `${day(o)} – ${r.name} (${o.detail})`;
    }
  };
  const sec = (title: string, kinds: Kind[]) => {
    const xs = all.filter((o) => kinds.includes(o.kind));
    return xs.length ? `${title}\n${xs.map(line).join('\n')}` : '';
  };
  const parts = [
    `🗓️ *${MONTHS[month]} in our family*`,
    sec('🎂 *Birthdays*', ['birthday']),
    sec('🪔 *Remembering*', ['born', 'passed']),
    sec('🌟 *Tamil birthdays*', ['tamil']),
    sec('🙏 *Shraddham*', ['shraddham']),
    SIGN,
  ].filter(Boolean);
  const notes: string[] = [];
  if (all.some((o) => o.kind === 'birthday' && !o.row.birth_shared)) notes.push('🔒 = birth date not shared with the whole family yet. Please ask before forwarding those.');
  if (all.some((o) => o.approx)) notes.push('~ = from the Tamil calendar; please confirm with the panchangam.');
  return parts.join('\n\n') + (notes.length ? `\n\n_${notes.join('\n')}_` : '');
}

export { ymd };
