import type { Person } from './types';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const fullName = (p?: Person | null) => (p ? `${p.given_name}${p.surname ? ' ' + p.surname : ''}`.trim() : '');
export const firstName = (p?: Person | null) => (p ? p.given_name.replace(/\s*\(.*\)/, '').trim() : '');

/** YYYYMMDD with 00 for unknown parts → "27 Jul 1983" / "Jul 1983" / "1983" */
export function fmtDate(s?: string | null): string {
  if (!s || !/^\d{8}$/.test(s)) return '';
  const y = s.slice(0, 4), m = +s.slice(4, 6), d = +s.slice(6, 8);
  return [d || '', m ? MONTHS[m - 1] : '', y !== '0000' ? y : ''].filter(Boolean).join(' ');
}
export const monthYear = (s: string) => { const m = +s.slice(4, 6); return `${m ? LONG[m - 1] + ' ' : ''}${s.slice(0, 4)}`; };
export const yearOf = (s?: string | null) => (s && /^\d{4}/.test(s) && !s.startsWith('0000') ? s.slice(0, 4) : '');

export function lifespan(p: Person): string {
  const b = p.birth_year ? String(p.birth_year) : '';
  if (!p.is_living) return `${b || '?'} – ${yearOf(p.death_date) || '?'}`;
  return b ? `b. ${b}` : '';
}

export function ageFrom(birth: string | null | undefined, birthYear: number | null, living: boolean, now = new Date()): number | null {
  if (!living) return null;
  if (birth && /^\d{8}$/.test(birth) && !birth.startsWith('0000')) {
    let a = now.getFullYear() - +birth.slice(0, 4);
    const m = +birth.slice(4, 6), d = +birth.slice(6, 8);
    if (m && (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && d && now.getDate() < d))) a--;
    return a;
  }
  return null;
}

export function initials(p: Person): string {
  const g = p.given_name.replace(/\(.*?\)/g, '').trim();
  return ((g[0] || '?') + ((p.surname || '').replace(/[^A-Za-z]/g, '')[0] || '')).toUpperCase();
}

/** "16 Nov, 1:47 pm" (with the year when it isn't this year), in the viewer's time zone. */
export function when(iso?: string | null): string {
  const t = iso ? Date.parse(iso) : NaN; if (!t) return '';
  const d = new Date(t), now = new Date();
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
  return `${day}, ${d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(' ', '\u202f')}`;
}

export function ago(iso?: string | null): string {
  const t = iso ? Date.parse(iso) : NaN; if (!t) return '';
  const d = Math.floor((Date.now() - t) / 86400000);
  if (d < 1) return 'today'; if (d === 1) return 'yesterday'; if (d < 30) return `${d} days ago`;
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "1983-07-27" ⇄ "19830727" */
export const toInputDate = (s?: string) => (s && /^\d{8}$/.test(s) && !/^0000|^\d{4}00|00$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : '');
export const fromInputDate = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s.replace(/-/g, '') : '');

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** A UTC calendar date (as returned by the panchang) → "Thu 4 Dec" */
export const fmtDay = (d: Date) => `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
/** Today as a UTC calendar date in India */
export const todayIST = () => { const n = new Date(Date.now() + 330 * 60000); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())); };
export const daysUntil = (d: Date) => Math.round((d.getTime() - todayIST().getTime()) / 86400000);
/** Next yearly occurrence of a YYYYMMDD date (month and day known) */
export function nextAnniversary(s: string): Date | null {
  if (!/^\d{8}$/.test(s) || s.slice(4, 6) === '00' || s.slice(6) === '00') return null;
  const t = todayIST(); const m = +s.slice(4, 6) - 1, d = +s.slice(6);
  let n = new Date(Date.UTC(t.getUTCFullYear(), m, d));
  if (n < t) n = new Date(Date.UTC(t.getUTCFullYear() + 1, m, d));
  return n;
}
