/**
 * The family calendar: Tamil dates, panchangam basics, key Hindu (Iyer) festivals and
 * observances, plus the family's own days. Everything is calculated (Lahiri ayanamsa, IST),
 * so a festival can occasionally differ by a day from a printed panchangam.
 */
import { NAKSHATRAMS, TAMIL_MONTHS, panchangAt, tithiName } from './panchang';

const IST = 330;
const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(Date.UTC(y, m, d, h, min) - IST * 60000);
const SUNRISE = [6, 15] as const, APARAHNA = [14, 30] as const, SUNSET = [18, 15] as const;

/** Lunar (amanta) months, named by the solar month at the new moon that begins them. */
export const LUNAR = ['Chaitra', 'Vaishakha', 'Jyeshtha', 'Ashadha', 'Shravana', 'Bhadrapada', 'Ashvin', 'Kartika', 'Margashira', 'Pausha', 'Magha', 'Phalguna'] as const;

export type EventKind = 'festival' | 'observance' | 'month' | 'birthday' | 'tamil-birthday' | 'remembrance' | 'shraddham' | 'anniversary';
export interface CalEvent { kind: EventKind; title: string; sub?: string; ids?: string[]; icon?: string; major?: boolean }
export interface CalDay {
  key: string;            // YYYY-MM-DD
  date: Date;             // the IST day, at UTC midnight
  y: number; m: number; d: number;
  tamilMonth: number;     // 0 = Chithirai
  tamilDay: number;       // 1-based day of the Tamil month
  star: number;           // nakshatram at sunrise
  tithi: number;          // tithi at sunrise (0..29)
  stars: number[];        // stars that "belong" to this day (sunrise star, plus any that start and end before the next sunrise)
  tithis: number[];       // likewise for tithis
  afternoonTithi: number; // for shraddham
  midnightTithi: number;  // for Shivaratri
  lunar: number;          // lunar month index (LUNAR), -1 if unknown
  adhika: boolean;        // an extra lunar month: festivals are not kept in it
  events: CalEvent[];
}

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const between = (a: number, b: number, n: number) => { const out = [a]; if (a === b) return out; let x = a; while ((x = (x + 1) % n) !== b && out.length < 4) out.push(x); return out; };

const cache = new Map<number, CalDay[]>();

/** Every day from 1 Dec of the year before to 31 Jan of the year after, with festivals marked. */
export function yearDays(year: number): CalDay[] {
  if (cache.has(year)) return cache.get(year)!;
  const start = Date.UTC(year - 1, 10, 1), end = Date.UTC(year + 1, 1, 15);
  const out: CalDay[] = [];
  let prevRise = null as null | ReturnType<typeof panchangAt>;
  for (let t = start; t <= end; t += 86400000) {
    const g = new Date(t); const y = g.getUTCFullYear(), m = g.getUTCMonth(), d = g.getUTCDate();
    const rise = prevRise || panchangAt(at(y, m, d, ...SUNRISE));
    const next = panchangAt(at(y, m, d + 1, ...SUNRISE));
    prevRise = next;
    out.push({
      key: dayKey(y, m, d), date: g, y, m, d,
      tamilMonth: panchangAt(at(y, m, d, ...SUNSET)).month, tamilDay: 0,
      star: rise.nakshatram, tithi: rise.tithi,
      stars: between(rise.nakshatram, next.nakshatram, 27), tithis: between(rise.tithi, next.tithi, 30),
      afternoonTithi: panchangAt(at(y, m, d, ...APARAHNA)).tithi,
      midnightTithi: panchangAt(at(y, m, d, 23, 45)).tithi,
      lunar: -1, adhika: false, events: [],
    });
  }
  // Tamil day numbers
  let n = 0;
  for (let i = 0; i < out.length; i++) { n = i > 0 && out[i].tamilMonth === out[i - 1].tamilMonth ? n + 1 : 1; out[i].tamilDay = n; }
  // lunar months: each begins the day after a new moon (Amavasai)
  const newMoons = out.map((x, i) => (x.tithis.includes(29) ? i : -1)).filter((i) => i >= 0);
  for (let k = 0; k < newMoons.length; k++) {
    const i = newMoons[k], solar = out[i].tamilMonth;
    const nextSolar = k + 1 < newMoons.length ? out[newMoons[k + 1]].tamilMonth : -1;
    const lunar = (solar + 1) % 12; // Amavasai in Panguni (11) begins Chaitra (0)
    const adhika = nextSolar === solar;
    const stop = k + 1 < newMoons.length ? newMoons[k + 1] : out.length - 1;
    for (let j = i + 1; j <= stop; j++) { out[j].lunar = lunar; out[j].adhika = adhika; }
  }
  // the new-moon day itself closes the previous lunar month
  for (let i = 1; i < out.length; i++) if (out[i].tithis.includes(29) && out[i - 1].lunar >= 0) { out[i].lunar = out[i - 1].lunar; out[i].adhika = out[i - 1].adhika; }
  mark(out);
  cache.set(year, out);
  return out;
}

function add(day: CalDay | undefined, e: CalEvent) { if (day && !day.events.some((x) => x.title === e.title)) day.events.push(e); }

function mark(days: CalDay[]) {
  const firstIn = (pred: (x: CalDay) => boolean, from = 0) => { for (let i = from; i < days.length; i++) if (pred(days[i])) return i; return -1; };
  const each = (pred: (x: CalDay) => boolean, f: (i: number) => void) => days.forEach((x, i) => { if (pred(x)) f(i); });
  // in a solar month: the first day with this star (or tithi), once per occurrence of that month
  const solarStar = (month: number, star: number, e: CalEvent, nearFull = false) => {
    let last = -99;
    const hits: number[] = [];
    each((x) => x.tamilMonth === month && x.stars.includes(star), (i) => { if (i - last > 20) hits.push(i); last = i; });
    if (!nearFull) { hits.forEach((i) => add(days[i], e)); return; }
    // festivals of the full moon: of the star's days in this month, the one nearest Pournami
    const dist = (i: number) => Math.min(...days[i].tithis.map((t) => Math.abs(t - 14)));
    const groups: number[][] = [];  // star days within one occurrence of the month (< 40 days apart)
    hits.forEach((i) => { const g = groups[groups.length - 1]; if (g && i - g[0] < 40) g.push(i); else groups.push([i]); });
    for (const g of groups) { const near = g.filter((i) => dist(i) <= 2); const best = near.length ? near[near.length - 1] : g.sort((a, b) => dist(a) - dist(b))[0]; if (dist(best) <= 3) add(days[best], e); }
  };
  const solarTithi = (month: number, tithi: number, e: CalEvent) => {
    let last = -99;
    each((x) => x.tamilMonth === month && x.tithis.includes(tithi), (i) => { if (i - last > 20) add(days[i], e); last = i; });
  };
  const lunarTithi = (lunar: number, tithi: number, e: CalEvent) => {
    let last = -99;
    each((x) => x.lunar === lunar && !x.adhika && x.tithis.includes(tithi), (i) => { if (i - last > 20) { add(days[i], e); last = i; } });
  };
  const F = (title: string, icon: string, sub?: string): CalEvent => ({ kind: 'festival', title, icon, sub, major: true });
  const O = (title: string, icon: string, sub?: string): CalEvent => ({ kind: 'observance', title, icon, sub });

  // Tamil months begin; Pongal, New Year and other solar days
  for (let i = 1; i < days.length; i++) {
    const x = days[i];
    if (x.tamilDay === 1) add(x, { kind: 'month', title: `${TAMIL_MONTHS[x.tamilMonth]} begins`, icon: '☀️', sub: 'Tamil month' });
    if (x.tamilMonth === 9 && x.tamilDay === 1) { add(x, F('Thai Pongal', '🍚', 'Makara Sankranti')); add(days[i - 1], F('Bhogi', '🔥')); add(days[i + 1], F('Mattu Pongal', '🐄')); add(days[i + 2], O('Kaanum Pongal', '👨‍👩‍👧')); }
    if (x.tamilMonth === 0 && x.tamilDay === 1) { add(x, F('Tamil New Year', '🌼', 'Puthandu')); add(x, F('Vishu', '🪔', 'Kerala new year')); }
    if (x.tamilMonth === 3 && x.tamilDay === 18) add(x, F('Aadi Perukku', '🌊'));
    if (x.tamilMonth === 11 && x.tamilDay === 1) add(x, F('Karadaiyan Nombu', '🧵', 'Savitri vratam'));
  }
  // by star in a solar month
  solarStar(9, 7, F('Thai Poosam', '🔱'), true);
  solarStar(10, 9, F('Masi Magam', '🌊'), true);
  solarStar(11, 11, F('Panguni Uthiram', '💐'), true);
  solarStar(4, 21, F('Onam', '🌸', 'Thiruvonam'));
  solarStar(7, 2, F('Karthigai Deepam', '🪔'), true);
  solarStar(8, 5, F('Arudra Darshanam', '💃', 'Thiruvathirai'), true);
  solarTithi(8, 10, F('Vaikunta Ekadasi', '🛕'));
  solarTithi(9, 29, F('Thai Amavasai', '🌑', 'Tarpanam for ancestors'));
  solarTithi(3, 29, F('Aadi Amavasai', '🌑', 'Tarpanam for ancestors'));
  // by lunar month and tithi
  lunarTithi(0, 8, F('Sri Rama Navami', '🏹'));
  solarTithi(0, 14, F('Chitra Pournami', '🌕'));
  lunarTithi(4, 14, F('Avani Avittam', '🧶', 'Yajur Upakarma: the sacred thread is changed'));
  lunarTithi(4, 22, F('Krishna Jayanthi', '🦚', 'Gokulashtami'));
  lunarTithi(5, 3, F('Vinayaka Chaturthi', '🐘'));
  lunarTithi(5, 29, F('Mahalaya Amavasai', '🌑', 'Tarpanam for ancestors'));
  lunarTithi(6, 0, F('Navaratri begins', '🎎', 'Golu'));
  { // Vijayadasami: Dasami in the afternoon; Saraswati Pooja the day before
    let last = -99;
    each((x) => x.lunar === 6 && !x.adhika && x.afternoonTithi === 9, (i) => { if (i - last > 20) { add(days[i], F('Vijayadasami', '✨')); add(days[i - 1], F('Saraswati Pooja', '📚', 'Ayudha Pooja')); last = i; } });
  }
  lunarTithi(6, 28, F('Deepavali', '🪔', 'Naraka Chaturdasi'));
  { let last = -99; each((x) => x.lunar === 10 && !x.adhika && x.midnightTithi === 28, (i) => { if (i - last > 20) { add(days[i], F('Maha Shivaratri', '🔱')); last = i; } }); }
  // Gayatri Japam is the day after Avani Avittam; Varalakshmi Vratam the Friday before it
  each((x) => x.events.some((e) => e.title === 'Avani Avittam'), (i) => {
    add(days[i + 1], F('Gayatri Japam', '📿'));
    for (let j = i - 1; j >= i - 7 && j >= 0; j--) if (days[j].date.getUTCDay() === 5) { add(days[j], F('Varalakshmi Vratam', '🪷')); break; }
  });
  // every month
  each((x) => x.tithis.includes(29), (i) => add(days[i], O('Amavasai', '🌑', 'New moon · tarpanam')));
  each((x) => x.tithis.includes(14), (i) => add(days[i], O('Pournami', '🌕', 'Full moon')));
  each((x) => x.tithis.includes(10) || x.tithis.includes(25), (i) => add(days[i], O('Ekadasi', '🙏', 'Fasting day')));
  each((x) => x.tithis.includes(12) || x.tithis.includes(27), (i) => add(days[i], O('Pradosham', '🕉️')));
  each((x) => x.tithis.includes(5), (i) => add(days[i], O('Sashti', '🦚', 'For Murugan')));
  each((x) => x.tithis.includes(18), (i) => add(days[i], O('Sankatahara Chathurthi', '🐘')));
  each((x) => x.stars.includes(2) && x.tamilMonth !== 7, (i) => add(days[i], O('Kiruthigai', '🔥', 'For Murugan')));
  void firstIn;
}

/** The days of one Gregorian month (with the festivals and observances already marked). */
export function monthDays(year: number, month: number): CalDay[] {
  return yearDays(year).filter((x) => x.y === year && x.m === month);
}
export const findDay = (key: string) => { const y = +key.slice(0, 4); return yearDays(y).find((x) => x.key === key); };

export const tamilDate = (x: CalDay) => `${TAMIL_MONTHS[x.tamilMonth]} ${x.tamilDay}`;
export const starName = (i: number) => NAKSHATRAMS[i];
export { tithiName };
