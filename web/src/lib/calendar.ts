/**
 * The family calendar: panchang basics (Tamil solar months, lunar months, stars, tithis), festivals of every
 * community (each tagged with the groups that keep it: see FESTIVAL_GROUPS in lib/community), plus the family's own days. Everything is calculated (Lahiri ayanamsa, IST),
 * so a festival can occasionally differ by a day from a printed panchangam.
 */
import { NAKSHATRAMS, TAMIL_MONTHS, panchangAt, tithiName } from './panchang';

const IST = 330;
const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(Date.UTC(y, m, d, h, min) - IST * 60000);
const SUNRISE = [6, 15] as const, APARAHNA = [14, 30] as const, SUNSET = [18, 15] as const;

/** Lunar (amanta) months, named by the solar month at the new moon that begins them. */
export const LUNAR = ['Chaitra', 'Vaishakha', 'Jyeshtha', 'Ashadha', 'Shravana', 'Bhadrapada', 'Ashvin', 'Kartika', 'Margashira', 'Pausha', 'Magha', 'Phalguna'] as const;

export type EventKind = 'festival' | 'observance' | 'month' | 'birthday' | 'tamil-birthday' | 'remembrance' | 'shraddham' | 'anniversary';
export interface CalEvent { kind: EventKind; title: string; sub?: string; ids?: string[]; icon?: string; major?: boolean;
  /** festival groups that keep this day (lib/community FestivalGroup); none = everyone */
  groups?: string[] }

/** Is this event for someone who follows these festival groups? */
export const shownFor = (e: CalEvent, groups: readonly string[]) => !e.groups || e.groups.some((g) => groups.includes(g));
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
  eveningTithi: number;   // at sunset (pradosh): Diwali, Dhanteras, Karva Chauth
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
    const dusk = panchangAt(at(y, m, d, ...SUNSET));
    out.push({
      key: dayKey(y, m, d), date: g, y, m, d,
      tamilMonth: dusk.month, tamilDay: 0, eveningTithi: dusk.tithi,
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
  // a tithi at a time of day (afternoon or sunset), for festivals kept then
  const lunarAt = (lunar: number, tithi: number, when: 'afternoonTithi' | 'eveningTithi', e: CalEvent | ((i: number) => void)) => {
    let last = -99;
    each((x) => x.lunar === lunar && !x.adhika && x[when] === tithi, (i) => { if (i - last > 20) { if (typeof e === 'function') e(i); else add(days[i], e); last = i; } });
  };
  // the first day of a lunar month: the day whose sunrise follows the new moon, even when a short Pratipada never meets a sunrise
  const firstOf = (lunar: number, e: CalEvent) => {
    let last = -99;
    each((x) => x.tithis.includes(0) && !x.adhika && (x.lunar === lunar || days[days.indexOf(x) + 1]?.lunar === lunar), (i) => {
      if (i - last > 20) { add(days[i], e); last = i; }
    });
  };
  const F = (title: string, icon: string, sub?: string, groups: string[] = ['hindu']): CalEvent => ({ kind: 'festival', title, icon, sub, major: true, groups });
  const O = (title: string, icon: string, sub?: string, groups: string[] = ['hindu']): CalEvent => ({ kind: 'observance', title, icon, sub, groups });
  const TA = ['tamil'], SOUTH = ['tamil', 'kerala', 'telugu', 'karnataka'], NORTH = ['north', 'punjab', 'gujarat', 'maharashtra'];

  // Tamil months begin; Pongal, New Year and other solar days
  for (let i = 1; i < days.length; i++) {
    const x = days[i];
    if (x.tamilDay === 1) add(x, { kind: 'month', title: `${TAMIL_MONTHS[x.tamilMonth]} begins`, icon: '☀️', sub: 'Tamil month' });
    if (x.tamilMonth === 9 && x.tamilDay === 1) {
      add(x, F('Thai Pongal', '🍚', 'Makara Sankranti', TA)); add(days[i - 1], F('Bhogi', '🔥', undefined, ['tamil', 'telugu'])); add(days[i + 1], F('Mattu Pongal', '🐄', undefined, TA)); add(days[i + 2], O('Kaanum Pongal', '👨‍👩‍👧', undefined, TA));
      add(x, F('Makar Sankranti', '🪁', 'Uttarayan · Sankranti · Poush Sankranti', ['north', 'gujarat', 'maharashtra', 'telugu', 'karnataka', 'bengal', 'kerala']));
      add(days[i - 1], F('Lohri', '🔥', undefined, ['punjab', 'sikh']));
    }
    if (x.tamilMonth === 0 && x.tamilDay === 1) {
      add(x, F('Tamil New Year', '🌼', 'Puthandu', TA)); add(x, F('Vishu', '🪔', 'Kerala new year', ['kerala']));
      add(x, F('Vaisakhi', '🌾', 'Harvest and Khalsa day', ['punjab', 'sikh'])); add(x, F('Pohela Boishakh', '🎊', 'Bengali new year (date may differ by a day)', ['bengal']));
    }
    if (x.tamilMonth === 3 && x.tamilDay === 18) add(x, F('Aadi Perukku', '🌊', undefined, TA));
    if (x.tamilMonth === 11 && x.tamilDay === 1) add(x, F('Karadaiyan Nombu', '🧵', 'Savitri vratam', TA));
  }
  // by star in a solar month
  solarStar(9, 7, F('Thai Poosam', '🔱', undefined, TA), true);
  solarStar(10, 9, F('Masi Magam', '🌊', undefined, TA), true);
  solarStar(11, 11, F('Panguni Uthiram', '💐', undefined, TA), true);
  solarStar(4, 21, F('Onam', '🌸', 'Thiruvonam', ['kerala', 'tamil']));
  solarStar(7, 2, F('Karthigai Deepam', '🪔', undefined, TA), true);
  solarStar(8, 5, F('Arudra Darshanam', '💃', 'Thiruvathirai', ['tamil', 'kerala']), true);
  solarTithi(8, 10, F('Vaikunta Ekadasi', '🛕', undefined, SOUTH));
  solarTithi(9, 29, F('Thai Amavasai', '🌑', 'Tarpanam for ancestors', TA));
  solarTithi(3, 29, F('Aadi Amavasai', '🌑', 'Tarpanam for ancestors', TA));
  // by lunar month and tithi
  lunarTithi(0, 8, F('Sri Rama Navami', '🏹'));
  solarTithi(0, 14, F('Chitra Pournami', '🌕', undefined, TA));
  lunarTithi(4, 14, F('Avani Avittam', '🧶', 'Yajur Upakarma: the sacred thread is changed', SOUTH));
  lunarTithi(4, 14, F('Raksha Bandhan', '🪢', 'Rakhi', [...NORTH, 'bengal']));
  lunarTithi(4, 22, F('Krishna Jayanthi', '🦚', 'Janmashtami · Gokulashtami'));
  lunarTithi(5, 3, F('Vinayaka Chaturthi', '🐘', 'Ganesh Chaturthi'));
  lunarTithi(5, 29, F('Mahalaya Amavasai', '🌑', 'Mahalaya · tarpan for ancestors'));
  lunarTithi(6, 0, F('Navaratri begins', '🎎', 'Golu · Garba · Durga Puja season'));
  { // Vijayadasami: Dasami in the afternoon; Saraswati Pooja the day before
    let last = -99;
    each((x) => x.lunar === 6 && !x.adhika && x.afternoonTithi === 9, (i) => { if (i - last > 20) { add(days[i], F('Vijayadasami', '✨', 'Dussehra · Dasara · Bijoya Dashami')); add(days[i - 1], F('Saraswati Pooja', '📚', 'Ayudha Pooja', SOUTH)); last = i; } });
  }
  lunarTithi(6, 28, F('Deepavali', '🪔', 'Naraka Chaturdasi', SOUTH));
  { let last = -99; each((x) => x.lunar === 10 && !x.adhika && x.midnightTithi === 28, (i) => { if (i - last > 20) { add(days[i], F('Maha Shivaratri', '🔱')); last = i; } }); }
  // Gayatri Japam is the day after Avani Avittam; Varalakshmi Vratam the Friday before it
  each((x) => x.events.some((e) => e.title === 'Avani Avittam'), (i) => {
    add(days[i + 1], F('Gayatri Japam', '📿', undefined, SOUTH));
    for (let j = i - 1; j >= i - 7 && j >= 0; j--) if (days[j].date.getUTCDay() === 5) { add(days[j], F('Varalakshmi Vratam', '🪷', undefined, ['tamil', 'telugu', 'karnataka'])); break; }
  });
  // every month
  each((x) => x.tithis.includes(29), (i) => add(days[i], O('Amavasai', '🌑', 'New moon · tarpanam')));
  each((x) => x.tithis.includes(14), (i) => add(days[i], O('Pournami', '🌕', 'Full moon')));
  each((x) => x.tithis.includes(10) || x.tithis.includes(25), (i) => add(days[i], O('Ekadasi', '🙏', 'Fasting day')));
  each((x) => x.tithis.includes(12) || x.tithis.includes(27), (i) => add(days[i], O('Pradosham', '🕉️')));
  each((x) => x.tithis.includes(5), (i) => add(days[i], O('Sashti', '🦚', 'For Murugan', TA)));
  each((x) => x.tithis.includes(18), (i) => add(days[i], O('Sankatahara Chathurthi', '🐘', 'Sankashti')));
  each((x) => x.stars.includes(2) && x.tamilMonth !== 7, (i) => add(days[i], O('Kiruthigai', '🔥', 'For Murugan', TA)));
  // ------------------------------------------------------------------ all-India and regional lunar festivals
  firstOf(0, F('Ugadi', '🌿', 'Telugu and Kannada new year', ['telugu', 'karnataka']));
  firstOf(0, F('Gudi Padwa', '🚩', 'Marathi new year', ['maharashtra']));
  firstOf(0, F('Chaitra Navratri begins', '🪔', undefined, ['north']));
  lunarTithi(0, 12, F('Mahavir Jayanti', '🙏', undefined, ['jain']));
  lunarTithi(0, 14, F('Hanuman Jayanti', '🐒', undefined, ['north', 'maharashtra']));
  lunarTithi(1, 2, F('Akshaya Tritiya', '✨', 'Akha Teej', ['hindu', 'jain']));
  lunarTithi(1, 14, F('Buddha Purnima', '☸️', undefined, ['buddhist']));
  lunarTithi(3, 1, F('Rath Yatra', '🛕', undefined, ['bengal']));
  lunarTithi(3, 14, F('Guru Purnima', '🙏', undefined, ['hindu', 'buddhist', 'jain']));
  lunarTithi(4, 2, F('Hariyali Teej', '🌿', undefined, ['north']));
  lunarTithi(4, 4, F('Nag Panchami', '🐍', undefined, ['north', 'maharashtra']));
  lunarTithi(6, 5, F('Durga Puja · Shashthi', '🪷', 'Durga Puja begins', ['bengal']));
  lunarTithi(6, 7, F('Durga Ashtami', '🪷', 'Maha Ashtami', ['bengal', 'north']));
  lunarTithi(6, 14, F('Kojagari Lakshmi Puja', '🌕', 'Sharad Purnima', ['bengal']));
  lunarAt(6, 18, 'eveningTithi', F('Karva Chauth', '🌙', 'Time of moonrise varies by city', ['north', 'punjab']));
  lunarAt(6, 27, 'eveningTithi', F('Dhanteras', '🪙', undefined, ['north', 'gujarat', 'maharashtra']));
  lunarAt(6, 29, 'eveningTithi', F('Diwali', '🪔', 'Lakshmi Puja', [...NORTH, 'jain']));
  lunarAt(6, 29, 'eveningTithi', F('Kali Puja', '🌑', undefined, ['bengal']));
  lunarAt(6, 29, 'eveningTithi', F('Bandi Chhor Divas', '🪔', undefined, ['sikh']));
  firstOf(7, F('Govardhan Puja', '⛰️', 'Annakut', ['north', 'gujarat']));
  firstOf(7, F('Gujarati New Year', '🎊', 'Bestu Varas', ['gujarat']));
  lunarTithi(7, 1, F('Bhai Dooj', '🧿', 'Bhau Beej · Bhai Phonta', [...NORTH, 'bengal']));
  lunarTithi(7, 5, F('Chhath Puja', '🌅', undefined, ['north']));
  lunarTithi(7, 14, F('Guru Nanak Gurpurab', '☬', 'Kartik Purnima', ['sikh', 'punjab']));
  lunarTithi(9, 6, F('Guru Gobind Singh Jayanti', '☬', undefined, ['sikh']));
  lunarAt(10, 4, 'afternoonTithi', F('Vasant Panchami', '🌼', 'Saraswati Puja', ['north', 'bengal', 'punjab']));
  { // Holi: Holika Dahan on Phalguna Purnima, colours the next day
    let last = -99;
    each((x) => x.lunar === 11 && !x.adhika && x.afternoonTithi === 14, (i) => {
      if (i - last > 20) { add(days[i], F('Holika Dahan', '🔥', undefined, [...NORTH, 'bengal'])); add(days[i], F('Dol Jatra', '🎨', undefined, ['bengal'])); add(days[i + 1], F('Holi', '🎨', undefined, NORTH)); add(days[i + 1], F('Hola Mohalla', '☬', undefined, ['sikh'])); last = i; }
    });
  }
  // ------------------------------------------------------------------ fixed dates: national, Christian
  for (const x of days) {
    if (x.m === 0 && x.d === 26) add(x, F('Republic Day', '🇮🇳', undefined, ['national']));
    if (x.m === 7 && x.d === 15) add(x, F('Independence Day', '🇮🇳', undefined, ['national']));
    if (x.m === 9 && x.d === 2) add(x, F('Gandhi Jayanti', '🕊️', undefined, ['national']));
    if (x.m === 11 && x.d === 25) add(x, F('Christmas', '🎄', undefined, ['christian']));
  }
  { // Easter (Western, as kept by most Indian churches) and Good Friday
    const ys = new Set(days.map((x) => x.y));
    for (const y of ys) {
      const e = easter(y), i = days.findIndex((x) => x.y === y && x.m === e.m && x.d === e.d);
      if (i >= 0) { add(days[i], F('Easter', '✝️', undefined, ['christian'])); if (i >= 2) add(days[i - 2], F('Good Friday', '✝️', undefined, ['christian'])); }
    }
  }
  // ------------------------------------------------------------------ Islamic (Hijri) days
  const H: [number, number, string, string, string?][] = [
    [1, 1, 'Islamic New Year', '🌙'], [1, 10, 'Muharram (Ashura)', '🌙'], [3, 12, 'Milad-un-Nabi', '🌙'], [8, 15, 'Shab-e-Barat', '🌙'],
    [9, 1, 'Ramzan begins', '🌙'], [10, 1, 'Eid al-Fitr', '🌙', 'Eid ul-Fitr'], [12, 10, 'Eid al-Adha', '🐐', 'Bakrid'],
  ];
  for (const x of days) {
    const h = hijri(x.date);
    if (!h) break; // this browser has no Islamic calendar
    for (const [mo, d, title, icon, alt] of H) if (h.m === mo && h.d === d) add(x, F(title, icon, `${alt ? alt + ' · ' : ''}date depends on the moon; may differ by a day`, ['muslim']));
  }
  void firstIn;
}

/** Western Easter Sunday (anonymous Gregorian algorithm). */
export function easter(y: number): { m: number; d: number } {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return { m: month - 1, d: day };
}

let hijriFmt: Intl.DateTimeFormat | null | undefined;
/** The Hijri (Umm al-Qura) date of a day, or null if the browser can't tell. */
export function hijri(date: Date): { y: number; m: number; d: number; month: string } | null {
  if (hijriFmt === undefined) {
    try { hijriFmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' }); if (hijriFmt.resolvedOptions().calendar.indexOf('islamic') < 0) hijriFmt = null; } catch { hijriFmt = null; }
  }
  if (!hijriFmt) return null;
  const parts = Object.fromEntries(hijriFmt.formatToParts(date).map((p) => [p.type, p.value]));
  const m = +parts.month, d = +parts.day, y = parseInt(parts.year, 10);
  if (!m || !d) return null;
  return { y, m, d, month: HIJRI_MONTHS[m - 1] };
}
export const HIJRI_MONTHS = ['Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani', 'Jumada al-Ula', 'Jumada al-Akhirah', 'Rajab', "Sha'ban", 'Ramzan', 'Shawwal', "Dhu al-Qa'dah", 'Dhu al-Hijjah'];

/** The days of one Gregorian month (with the festivals and observances already marked). */
export function monthDays(year: number, month: number): CalDay[] {
  return yearDays(year).filter((x) => x.y === year && x.m === month);
}
export const findDay = (key: string) => { const y = +key.slice(0, 4); return yearDays(y).find((x) => x.key === key); };

export const tamilDate = (x: CalDay) => `${TAMIL_MONTHS[x.tamilMonth]} ${x.tamilDay}`;
export const starName = (i: number) => NAKSHATRAMS[i];
export { tithiName };
