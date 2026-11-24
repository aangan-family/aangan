import { isEngaged } from './family';
import type { Family } from './family';
import { daysUntil, fmtDay, nextAnniversary } from './format';
import { NAKSHATRAMS, TAMIL_MONTHS, nextShraddham, nextTamilBirthday, tithiName, unpackStar, unpackTithi } from './panchang';
import { MILESTONES, type FieldName, type ProfileField } from './types';

type Fields = Partial<Record<FieldName, ProfileField>>;

export const starLabel = (v?: string) => { const u = unpackStar(v); return u ? `${TAMIL_MONTHS[u.month]} · ${NAKSHATRAMS[u.star]}` : v || ''; };
export const tithiLabel = (v?: string) => { const u = unpackTithi(v); return u ? `${TAMIL_MONTHS[u.month]} · ${tithiName(u.tithi)}` : v || ''; };

export interface Upcoming { id: string; date: Date; kind: 'tamil-birthday' | 'birthday' | 'shraddham' | 'milestone' | 'remembrance' | 'anniversary'; title: string; sub: string; with?: string }

/** Birthdays (and milestone birthdays) vs remembrance days, for the Coming up lists. */
export const isRemembrance = (u: Upcoming) => u.kind === 'shraddham' || u.kind === 'remembrance';

/** Everything worth a reminder for one person within `days` days. */
export function upcomingFor(f: Family, id: string, fields: Fields, days = 60): Upcoming[] {
  const p = f.byId.get(id); if (!p) return [];
  const out: Upcoming[] = [];
  const within = (d: Date | null) => d && daysUntil(d) >= 0 && daysUntil(d) <= days;
  if (p.is_living) {
    const star = unpackStar(fields.janma_nakshatram?.value);
    if (star) {
      const d = nextTamilBirthday(star.month, star.star);
      if (d && within(d)) out.push({ id, date: d, kind: 'tamil-birthday', title: 'Tamil birthday', sub: `${TAMIL_MONTHS[star.month]} ${NAKSHATRAMS[star.star]}` });
    }
    const bd = fields.birth_date?.value;
    const d = bd ? nextAnniversary(bd) : null;
    if (d && within(d)) {
      const age = d.getUTCFullYear() - +bd!.slice(0, 4);
      const m = MILESTONES.find((x) => x.age === age);
      out.push({ id, date: d, kind: m ? 'milestone' : 'birthday', title: m ? `Turns ${age}` : 'Birthday', sub: m ? `${m.name} year` : `Turns ${age}` });
    }
  } else {
    const t = unpackTithi(fields.shraddha_tithi?.value);
    if (t) {
      const d = nextShraddham(t.month, t.tithi);
      if (d && within(d)) out.push({ id, date: d, kind: 'shraddham', title: 'Shraddham', sub: `${TAMIL_MONTHS[t.month]} ${tithiName(t.tithi)}` });
    }
    // the day they passed away, when the full date is known
    const dd = p.death_date && /^\d{4}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(p.death_date) ? nextAnniversary(p.death_date) : null;
    if (dd && within(dd)) {
      const yrs = dd.getUTCFullYear() - +p.death_date!.slice(0, 4);
      out.push({ id, date: dd, kind: 'remembrance', title: 'Remembrance day', sub: yrs > 0 ? `${yrs} ${yrs === 1 ? 'year' : 'years'} since they passed` : 'Passed away this year' });
    }
  }
  return out;
}

export { fmtDay };

/** Coming up, grouped by month and then into birthdays and remembrance. */
export function byMonth(items: Upcoming[]): { key: string; label: string; birthdays: Upcoming[]; remembrance: Upcoming[] }[] {
  const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const out: { key: string; label: string; birthdays: Upcoming[]; remembrance: Upcoming[] }[] = [];
  for (const u of [...items].sort((a, b) => a.date.getTime() - b.date.getTime())) {
    const key = `${u.date.getUTCFullYear()}-${u.date.getUTCMonth()}`;
    let g = out.find((x) => x.key === key);
    if (!g) { g = { key, label: LONG[u.date.getUTCMonth()], birthdays: [], remembrance: [] }; out.push(g); }
    (isRemembrance(u) ? g.remembrance : g.birthdays).push(u);
  }
  return out;
}

/**
 * Gothram, sutram, vedam and kuladeivam, the Iyer way:
 *  - a son, and an unmarried daughter, carry their father's;
 *  - a married woman takes her husband's (his own record, or what he carries from his father);
 *  - the founder of the line (family_info.roots_person_id) carries the family's, as recorded by the admins.
 * Anyone's own recorded value wins. This applies across every generation and every family in the tree,
 * so a daughter who married out never shows her father's gothram, and a wife who married in shows her husband's.
 */
export type TraditionKey = 'gothram' | 'sutram' | 'vedam' | 'kuladeivam';
export type TraditionSource = 'own' | 'family' | 'father' | 'husband';
export interface TraditionValue { value: string | null; source: TraditionSource; via?: string }

export function husbandOf(f: Family, id: string): string | null {
  const p = f.byId.get(id);
  if (!p || p.gender !== 'f') return null;
  return (f.spouses.get(id) || []).find((s) => f.byId.get(s)?.gender === 'm' && !isEngaged(f, id, s)) || null;   // engaged isn't married yet
}
export function fatherOf(f: Family, id: string): string | null {
  return (f.parents.get(id) || []).find((q) => f.byId.get(q)?.gender === 'm') || null;
}

/** What this person carries for one tradition, and where it comes from. null: nothing to say. */
export function tradition(f: Family, id: string, key: TraditionKey, own: (id: string) => string | undefined,
  rootId: string | null | undefined, familyValue: string | null | undefined): TraditionValue | null {
  const seen = new Set<string>();
  const walk = (x: string): TraditionValue | null => {
    if (seen.has(x) || seen.size > 60) return null;
    seen.add(x);
    const mine = own(x);
    if (mine) return { value: mine, source: 'own' };
    const husband = husbandOf(f, x);
    if (husband) {                                  // married: her husband's family, never her father's
      const h = walk(husband);
      return { value: h?.value ?? null, source: 'husband', via: husband };
    }
    if (x === rootId) return familyValue ? { value: familyValue, source: 'family' } : null;
    const father = fatherOf(f, x);
    if (!father) return null;
    const v = walk(father);
    return v?.value ? { value: v.value, source: 'father', via: father } : null;
  };
  return walk(id);
}

export const TRADITION_NOTE: Record<Exclude<TraditionSource, 'own'>, string> = {
  family: 'The family’s, as recorded',
  father: 'Carried from father',
  husband: 'From her husband’s family',
};

/** @deprecated kept for older callers: the line each person belongs to, relative to the founder. */
export type Inherit = 'line' | 'birth' | 'marriage';
export function inheritance(f: Family, id: string, rootId: string | null | undefined): Inherit | null {
  if (!rootId || !f.byId.has(rootId)) return null;
  const inLine = (x: string, d = 0): boolean => x === rootId || (d < 40 && !!fatherOf(f, x) && inLine(fatherOf(f, x)!, d + 1));
  const p = f.byId.get(id); if (!p) return null;
  const h = husbandOf(f, id);
  if (h) return inLine(h) ? 'marriage' : inLine(id) ? 'birth' : null;
  return inLine(id) ? 'line' : null;
}

/** Wedding anniversaries in the next `days` days (couples where every living partner may be shown). */
export function upcomingAnniversaries(f: Family, partners: { person_a: string; person_b: string; kind: string; start_date: string | null; place: string | null }[],
  canShow: (id: string) => boolean, days = 60): Upcoming[] {
  const out: Upcoming[] = [];
  for (const pt of partners) {
    if (pt.kind !== 'married' || !pt.start_date || !/^\d{4}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(pt.start_date)) continue;
    const a = f.byId.get(pt.person_a), b = f.byId.get(pt.person_b);
    if (!a || !b || !(a.is_living || b.is_living)) continue;
    if ((a.is_living && !canShow(a.id)) || (b.is_living && !canShow(b.id))) continue;
    const d = nextAnniversary(pt.start_date);
    if (!d || daysUntil(d) > days || daysUntil(d) < 0) continue;
    const yrs = d.getUTCFullYear() - +pt.start_date.slice(0, 4);
    if (yrs <= 0) continue;
    out.push({ id: a.id, with: b.id, date: d, kind: 'anniversary', title: 'Anniversary', sub: `${yrs} ${yrs === 1 ? 'year' : 'years'} married` });
  }
  return out;
}
