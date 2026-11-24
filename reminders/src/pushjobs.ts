/**
 * What the 7 am run tells everyone by phone notification. Pure functions: easy to test.
 *
 * Only what every member can already see on the site: birthdays whose date is shared with the whole family
 * (and, for the living, with consent), and remembrance days (death dates are tree facts). Tamil birthdays and
 * shraddhams are left out here: their stars and tithis can be close-family or private.
 */
import { occasions, type Day, type FeedRow } from './messages';
import { findDay, shownFor } from '../../web/src/lib/calendar';
import { PACK } from './tradition.ts';

export interface DailyPush { kind: 'occasion' | 'festival'; title: string; body: string; url: string; tag: string }

const first = (r: FeedRow) => (r.given_name || r.name || '').trim().split(/\s+/)[0] || r.name;
const ymd = (d: Day) => d.toISOString().slice(0, 10);

export function dailyPushes(rows: FeedRow[], today: Day): DailyPush[] {
  const out: DailyPush[] = [];
  const bits: string[] = [];
  for (const o of occasions(rows, today, today)) {
    if ((o.kind === 'birthday' || o.kind === 'born') && o.row.birth_shared) bits.push(o.kind === 'birthday' ? `🎂 ${first(o.row)}’s birthday` : `🪔 ${first(o.row)}’s birth anniversary`);
    else if (o.kind === 'passed') bits.push(`🪔 Remembering ${first(o.row)}`);
  }
  if (bits.length) {
    let body = '';
    for (const [i, b] of bits.entries()) {
      const next = body ? `${body} · ${b}` : b;
      if (next.length > 200) { body += ` · and ${bits.length - i} more`; break; }
      body = next;
    }
    out.push({ kind: 'occasion', title: 'Today in the family', body, url: '#/', tag: `occasion-${ymd(today)}` });
  }
  // festivals of the family's traditions (site.config.json community); members' own choices live on their devices
  const fest = (findDay(ymd(today))?.events || []).filter((e) => e.kind === 'festival' && shownFor(e, PACK.festivals));
  if (fest.length) {
    const names = fest.map((e) => e.title);
    out.push({ kind: 'festival', title: `Today: ${names[0]}`, body: names.length > 1 ? `${names.join(' · ')}. See the calendar for the day.` : 'See the calendar for the day.', url: `#/calendar/${ymd(today)}`, tag: `festival-${ymd(today)}` });
  }
  return out;
}
