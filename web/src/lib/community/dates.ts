import { hijri, LUNAR, type CalDay } from '../calendar';
import { TAMIL_MONTHS } from '../panchang';
import type { DateStyle } from './packs';

/** Month names for each regional calendar (solar months by the sun's sign, so they line up with the Tamil ones). */
const MALAYALAM = ['Medam', 'Edavam', 'Mithunam', 'Karkidakam', 'Chingam', 'Kanni', 'Thulam', 'Vrischikam', 'Dhanu', 'Makaram', 'Kumbham', 'Meenam'];
const BENGALI = ['Boishakh', 'Joishtho', 'Asharh', 'Srabon', 'Bhadro', 'Ashwin', 'Kartik', 'Ogrohayon', 'Poush', 'Magh', 'Falgun', 'Choitro'];
const NORTH = ['Chaitra', 'Vaishakh', 'Jyeshtha', 'Ashadh', 'Shravan', 'Bhadrapad', 'Ashwin', 'Kartik', 'Margashirsha', 'Paush', 'Magh', 'Phalgun'];
const TITHI = ['Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi', 'Saptami', 'Ashtami', 'Navami', 'Dashami', 'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi'];

export const tithiText = (t: number) => (t === 14 ? 'Purnima' : t === 29 ? 'Amavasya' : `${t < 15 ? 'Shukla' : 'Krishna'} ${TITHI[t % 15]}`);

/** The lunar month of a day: amanta (ends at new moon: South and West India) or purnimanta (ends at full moon: North India). */
function lunarMonth(d: CalDay, style: 'amanta' | 'purnimanta'): string {
  if (d.lunar < 0) return '';
  const i = style === 'purnimanta' && d.tithi >= 15 ? (d.lunar + 1) % 12 : d.lunar; // the dark half (and the new moon) belongs to the next month
  return (style === 'purnimanta' ? NORTH : LUNAR)[i] + (d.adhika ? ' (adhik)' : '');
}

/** The day in the family's own calendar, e.g. "Thai 1", "Kartik Shukla Panchami", "Shawwal 1, 1447". */
export function regionalDate(d: CalDay, style: DateStyle): string {
  switch (style) {
    case 'tamil': return `${TAMIL_MONTHS[d.tamilMonth]} ${d.tamilDay}`;
    case 'malayalam': return `${MALAYALAM[d.tamilMonth]} ${d.tamilDay}`;
    case 'bengali': return `${BENGALI[d.tamilMonth]} ${d.tamilDay}`;
    case 'amanta': case 'purnimanta': { const m = lunarMonth(d, style); return m ? `${m} ${tithiText(d.tithi)}` : tithiText(d.tithi); }
    case 'hijri': { const h = hijri(d.date); return h ? `${h.month} ${h.d}, ${h.y}` : ''; }
    default: return '';
  }
}

/** The small number in a calendar cell: the day of the regional month (its name on the 1st), or the tithi. */
export function regionalCell(d: CalDay, style: DateStyle): string {
  switch (style) {
    case 'tamil': case 'malayalam': case 'bengali': {
      const names = style === 'tamil' ? TAMIL_MONTHS : style === 'malayalam' ? MALAYALAM : BENGALI;
      return d.tamilDay === 1 ? names[d.tamilMonth] : String(d.tamilDay);
    }
    case 'amanta': case 'purnimanta': return d.tithi === 14 ? '🌕' : d.tithi === 29 ? '🌑' : `${d.tithi < 15 ? 'S' : 'K'}${(d.tithi % 15) + 1}`;
    case 'hijri': { const h = hijri(d.date); return h ? (h.d === 1 ? h.month : String(h.d)) : ''; }
    default: return '';
  }
}

/** The regional months a Gregorian month spans, for the calendar's title. */
export function regionalSpan(days: CalDay[], style: DateStyle): string {
  const names = days.map((d) => {
    if (style === 'tamil') return TAMIL_MONTHS[d.tamilMonth];
    if (style === 'malayalam') return MALAYALAM[d.tamilMonth];
    if (style === 'bengali') return BENGALI[d.tamilMonth];
    if (style === 'amanta' || style === 'purnimanta') return lunarMonth(d, style).replace(' (adhik)', '');
    if (style === 'hijri') return hijri(d.date)?.month || '';
    return '';
  }).filter(Boolean);
  return [...new Set(names)].join(' – ');
}

export const REGIONAL_NAME: Record<DateStyle, string> = {
  tamil: 'Tamil months', malayalam: 'Malayalam months', bengali: 'Bengali months', amanta: 'Lunar months',
  purnimanta: 'Lunar months (Purnimanta)', hijri: 'Hijri months', none: '',
};
