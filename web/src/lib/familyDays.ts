import type { Family } from './family';
import { firstName, fullName } from './format';
import { unpackStar, unpackTithi } from './panchang';
import { dayKey, yearDays, type CalDay, type CalEvent } from './calendar';
import type { Partnership, ProfileField } from './types';

type Fields = Partial<Record<string, ProfileField>>;
const full = (s?: string | null) => !!s && /^\d{4}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(s);
const MILESTONE: Record<number, string> = { 60: 'Shashtiabdapoorthi', 70: 'Bhimaratha Shanti', 80: 'Sathabhishekam', 100: 'Poornabhishekam' };

/** The days in Tamil month `month` matching `ok`, grouped by occurrence; the second day is taken when there are two (as families do). */
function inTamilMonth(days: CalDay[], year: number, month: number, ok: (d: CalDay) => boolean): CalDay[] {
  const hits = days.filter((d) => d.tamilMonth === month && ok(d));
  const groups: CalDay[][] = [];
  for (const h of hits) { const g = groups[groups.length - 1]; if (g && h.date.getTime() - g[0].date.getTime() < 40 * 86400000) g.push(h); else groups.push([h]); }
  return groups.map((g) => (g.length > 1 ? g[1] : g[0])).filter((d) => d.y === year);
}

/**
 * The family's own days in a year: birthdays (and milestone birthdays), Tamil birthdays by
 * janma nakshatram, remembrance days and shraddhams, and wedding anniversaries.
 * Only what the viewer can already see is used (the database filters profile details).
 */
export function familyDays(year: number, f: Family, fieldsOf: (id: string) => Fields, partners: Partnership[],
  canShow: (id: string) => boolean): Map<string, CalEvent[]> {
  const out = new Map<string, CalEvent[]>();
  const put = (key: string, e: CalEvent) => out.set(key, [...(out.get(key) || []), e]);
  const days = yearDays(year);
  for (const p of f.byId.values()) {
    const fl = fieldsOf(p.id);
    const name = firstName(p);
    if (p.is_living) {
      const bd = fl.birth_date?.value;
      if (full(bd)) {
        const age = year - +bd!.slice(0, 4);
        const m = MILESTONE[age];
        put(dayKey(year, +bd!.slice(4, 6) - 1, +bd!.slice(6, 8)), {
          kind: 'birthday', title: `${name}’s birthday`, ids: [p.id], icon: m ? '🌟' : '🎂', major: !!m,
          sub: m ? `${m} · turns ${age}` : age > 0 && age < 120 ? `Turns ${age}` : undefined,
        });
      }
      const star = unpackStar(fl.janma_nakshatram?.value);
      if (star) for (const d of inTamilMonth(days, year, star.month, (x) => x.star === star.star)) {
        put(d.key, { kind: 'tamil-birthday', title: `${name}’s Tamil birthday`, ids: [p.id], icon: '✨', sub: 'By janma nakshatram' });
      }
    } else {
      if (full(p.death_date)) {
        const yrs = year - +p.death_date!.slice(0, 4);
        if (yrs > 0) put(dayKey(year, +p.death_date!.slice(4, 6) - 1, +p.death_date!.slice(6, 8)), {
          kind: 'remembrance', title: `Remembering ${name}`, ids: [p.id], icon: '🕯️', sub: `${yrs} ${yrs === 1 ? 'year' : 'years'} since they passed`,
        });
      }
      const t = unpackTithi(fl.shraddha_tithi?.value);
      if (t) for (const d of inTamilMonth(days, year, t.month, (x) => x.afternoonTithi === t.tithi)) {
        put(d.key, { kind: 'shraddham', title: `${name}’s shraddham`, ids: [p.id], icon: '🪔', sub: 'By tithi' });
      }
    }
  }
  for (const pt of partners) {
    if (pt.kind !== 'married' || !full(pt.start_date)) continue;
    const a = f.byId.get(pt.person_a), b = f.byId.get(pt.person_b);
    if (!a || !b || !(a.is_living || b.is_living)) continue;
    if ((a.is_living && !canShow(a.id)) || (b.is_living && !canShow(b.id))) continue;
    const yrs = year - +pt.start_date!.slice(0, 4);
    if (yrs <= 0) continue;
    const both = a.is_living && b.is_living;
    put(dayKey(year, +pt.start_date!.slice(4, 6) - 1, +pt.start_date!.slice(6, 8)), {
      kind: 'anniversary', title: `${firstName(a)} & ${firstName(b)}’s anniversary`, ids: [a.id, b.id], icon: both ? '💍' : '💐',
      major: yrs % 25 === 0, sub: `${yrs} ${yrs === 1 ? 'year' : 'years'}${yrs === 25 ? ' · Silver jubilee' : yrs === 50 ? ' · Golden jubilee' : ''}${both ? '' : ' · in memory'}${pt.place ? ` · married in ${pt.place}` : ''}`,
    });
  }
  return out;
}
export { fullName };
