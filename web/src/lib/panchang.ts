/**
 * A small Tamil panchangam: Tamil solar month, nakshatram and tithi, from
 * low-precision sun and moon positions (Meeus, "Astronomical Algorithms",
 * ch. 25 and 47) with the Lahiri ayanamsa. Accurate to well under an hour for
 * these purposes, which is enough to suggest the day of a Tamil birthday or a
 * shraddham. The website always says "confirm with your panchangam": a family
 * vadhyar's almanac has the final word.
 */

export const TAMIL_MONTHS = ['Chithirai', 'Vaikasi', 'Aani', 'Aadi', 'Avani', 'Purattasi', 'Aippasi', 'Karthigai', 'Margazhi', 'Thai', 'Maasi', 'Panguni'] as const;
export const NAKSHATRAMS = [
  'Ashwini', 'Bharani', 'Karthigai', 'Rohini', 'Mirugasirisham', 'Thiruvathirai', 'Punarpoosam', 'Poosam', 'Ayilyam',
  'Magam', 'Pooram', 'Uthiram', 'Hastham', 'Chithirai', 'Swathi', 'Visakam', 'Anusham', 'Kettai',
  'Moolam', 'Pooradam', 'Uthiradam', 'Thiruvonam', 'Avittam', 'Sadhayam', 'Poorattathi', 'Uthirattathi', 'Revathi',
] as const;
export const TITHIS = ['Prathamai', 'Dwitiyai', 'Tritiyai', 'Chathurthi', 'Panchami', 'Shashti', 'Saptami', 'Ashtami', 'Navami', 'Dasami', 'Ekadasi', 'Dwadasi', 'Trayodasi', 'Chathurdasi'] as const;
export const PAKSHAMS = ['Shukla', 'Krishna'] as const; // valarpirai (waxing), theipirai (waning)
/** 15th tithi of each paksham */
export const FULL_MOON = 'Pournami', NEW_MOON = 'Amavasai';

const rad = Math.PI / 180;
const norm = (x: number) => ((x % 360) + 360) % 360;
const sin = (d: number) => Math.sin(d * rad);

export const julianDay = (d: Date) => d.getTime() / 86400000 + 2440587.5;

/** Apparent geocentric longitude of the sun, degrees (tropical). */
export function sunLongitude(jd: number): number {
  const T = (jd - 2451545) / 36525;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M) + (0.019993 - 0.000101 * T) * sin(2 * M) + 0.000289 * sin(3 * M);
  const om = 125.04 - 1934.136 * T;
  return norm(L0 + C - 0.00569 - 0.00478 * sin(om));
}

// [D, M, M', F, coefficient in 1e-6 degrees] — the largest terms of Meeus table 47.A
const MOON: [number, number, number, number, number][] = [
  [0, 0, 1, 0, 6288774], [2, 0, -1, 0, 1274027], [2, 0, 0, 0, 658314], [0, 0, 2, 0, 213618], [0, 1, 0, 0, -185116],
  [0, 0, 0, 2, -114332], [2, 0, -2, 0, 58793], [2, -1, -1, 0, 57066], [2, 0, 1, 0, 53322], [2, -1, 0, 0, 45758],
  [0, 1, -1, 0, -40923], [1, 0, 0, 0, -34720], [0, 1, 1, 0, -30383], [2, 0, 0, -2, 15327], [0, 0, 1, 2, -12528],
  [0, 0, 1, -2, 10980], [4, 0, -1, 0, 10675], [0, 0, 3, 0, 10034], [4, 0, -2, 0, 8548], [2, 1, -1, 0, -7888],
  [2, 1, 0, 0, -6766], [1, 0, -1, 0, -5163], [1, 1, 0, 0, 4987], [2, -1, 1, 0, 4036], [2, 0, 2, 0, 3994],
  [4, 0, 0, 0, 3861], [2, 0, -3, 0, 3665], [0, 1, -2, 0, -2689], [2, 0, -1, 2, -2602], [2, -1, -2, 0, 2390],
  [1, 0, 1, 0, -2348], [2, -2, 0, 0, 2236], [0, 1, 2, 0, -2120], [0, 2, 0, 0, -2069], [2, -2, -1, 0, 2048],
  [2, 0, 1, -2, -1773], [2, 0, 0, 2, -1595], [4, -1, -1, 0, 1215], [0, 0, 2, 2, -1110], [3, 0, -1, 0, -892],
];

/** Apparent geocentric longitude of the moon, degrees (tropical). */
export function moonLongitude(jd: number): number {
  const T = (jd - 2451545) / 36525;
  const Lp = 218.3164477 + 481267.88123421 * T;
  const D = 297.8501921 + 445267.1114034 * T;
  const M = 357.5291092 + 35999.0502909 * T;
  const Mp = 134.9633964 + 477198.8675055 * T;
  const F = 93.272095 + 483202.0175233 * T;
  const E = 1 - 0.002516 * T;
  let s = 0;
  for (const [d, m, mp, f, c] of MOON) s += c * Math.pow(E, Math.abs(m)) * sin(d * D + m * M + mp * Mp + f * F);
  s += 3958 * sin(119.75 + 131.849 * T) + 1962 * sin(Lp - F) + 318 * sin(53.09 + 479264.29 * T);
  const om = 125.04 - 1934.136 * T;
  return norm(Lp + s / 1e6 - 0.00478 * sin(om));
}

/** Lahiri (Chitrapaksha) ayanamsa, degrees. */
export const ayanamsa = (jd: number) => 23.853 + ((jd - 2451545) / 365.25) * 0.013969;

export interface Panchang { month: number; nakshatram: number; tithi: number /* 0..29 */ }
export function panchangAt(d: Date): Panchang {
  const jd = julianDay(d), ay = ayanamsa(jd);
  const sun = sunLongitude(jd), moon = moonLongitude(jd);
  return {
    month: Math.floor(norm(sun - ay) / 30),
    nakshatram: Math.floor(norm(moon - ay) / (360 / 27)),
    tithi: Math.floor(norm(moon - sun) / 12),
  };
}

/** "Shukla Dasami", "Krishna Chathurdasi", "Pournami", "Amavasai" */
export function tithiName(i: number): string {
  if (i === 14) return FULL_MOON;
  if (i === 29) return NEW_MOON;
  return `${PAKSHAMS[i < 15 ? 0 : 1]} ${TITHIS[i % 15]}`;
}
export const TITHI_OPTIONS = Array.from({ length: 30 }, (_, i) => tithiName(i));

// Times are Indian Standard Time, where the family's almanacs are set.
const IST = 330; // minutes
const atIST = (y: number, m: number, d: number, h: number, min = 0) => new Date(Date.UTC(y, m, d, h, min) - IST * 60000);
const SUNRISE = [6, 15] as const;   // a fair average for Bengaluru and Chennai
const APARAHNA = [14, 30] as const; // afternoon, when shraddham is performed
const SUNSET = [18, 15] as const;

/** Tamil month of a civil day: a month begins on the day of the sankranti if it falls before sunset. */
export const tamilMonthOfDay = (y: number, m: number, d: number) => panchangAt(atIST(y, m, d, ...SUNSET)).month;

function* days(from: Date, count: number) {
  const ist = new Date(from.getTime() + IST * 60000);
  for (let i = 0; i < count; i++) yield [ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + i] as const;
}
const dayOf = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
/** Groups consecutive matching days into runs that belong to one Tamil month. */
function pick(matches: { date: Date; month: number }[], prefer: 'first' | 'second'): Date | null {
  if (!matches.length) return null;
  const firstMonth = matches[0].month;
  const run = matches.filter((m, i) => m.month === firstMonth && (i === 0 || (m.date.getTime() - matches[0].date.getTime()) < 32 * 86400000));
  return (prefer === 'second' && run.length > 1 ? run[1] : run[0]).date;
}

/**
 * Next Tamil birthday: the day in the Tamil month `month` whose sunrise
 * nakshatram is `nakshatram`. When the star rises twice in that month, the
 * second day is taken, as most families do. Returns a UTC date (the IST day).
 */
export function nextTamilBirthday(month: number, nakshatram: number, from = new Date()): Date | null {
  const hits: { date: Date; month: number }[] = [];
  for (const [y, m, d] of days(from, 400)) {
    const p = panchangAt(atIST(y, m, d, ...SUNRISE)), mo = tamilMonthOfDay(y, m, d);
    if (mo === month && p.nakshatram === nakshatram) hits.push({ date: dayOf(y, m, d), month: mo });
    else if (hits.length) break;
  }
  if (!hits.length) return null;
  // two occurrences ~27 days apart can both fall in one solar month
  const more: { date: Date; month: number }[] = [...hits];
  const last = hits[hits.length - 1].date;
  for (const [y, m, d] of days(new Date(last.getTime() + 20 * 86400000 - IST * 60000), 12)) {
    const p = panchangAt(atIST(y, m, d, ...SUNRISE)), mo = tamilMonthOfDay(y, m, d);
    if (mo === month && p.nakshatram === nakshatram) more.push({ date: dayOf(y, m, d), month: mo });
  }
  return pick(more, 'second');
}

/**
 * Next shraddham: the day in Tamil month `month` on which tithi `tithi`
 * (0–29, see tithiName) prevails in the afternoon. If it falls on two days
 * of that month, the second is taken.
 */
export function nextShraddham(month: number, tithi: number, from = new Date()): Date | null {
  const hits: { date: Date; month: number }[] = [];
  let started = false;
  for (const [y, m, d] of days(from, 400)) {
    const mo = tamilMonthOfDay(y, m, d);
    if (mo === month) {
      started = true;
      const a = panchangAt(atIST(y, m, d, ...APARAHNA));
      if (a.tithi === tithi) hits.push({ date: dayOf(y, m, d), month: mo });
    } else if (started) break;
  }
  if (!hits.length) return null;
  return hits.length > 1 ? hits[1].date : hits[0].date;
}

// Stored as "Avani|Moolam" and "Aippasi|Krishna Dasami" so a person can read the raw value too.
export const packStar = (month: number, star: number) => `${TAMIL_MONTHS[month]}|${NAKSHATRAMS[star]}`;
export function unpackStar(v?: string): { month: number; star: number } | null {
  const [m, s] = (v || '').split('|');
  const month = TAMIL_MONTHS.indexOf(m as never), star = NAKSHATRAMS.indexOf(s as never);
  return month >= 0 && star >= 0 ? { month, star } : null;
}
export const packTithi = (month: number, tithi: number) => `${TAMIL_MONTHS[month]}|${tithiName(tithi)}`;
export function unpackTithi(v?: string): { month: number; tithi: number } | null {
  const [m, t] = (v || '').split('|');
  const month = TAMIL_MONTHS.indexOf(m as never), tithi = TITHI_OPTIONS.indexOf(t);
  return month >= 0 && tithi >= 0 ? { month, tithi } : null;
}
