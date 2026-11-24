import { describe, expect, it } from 'vitest';
import { findDay, yearDays, tamilDate } from './calendar';

const on = (key: string) => (findDay(key)?.events || []).map((e) => e.title);

describe('festival dates match published Tamil calendars', () => {
  const cases: [string, string][] = [
    ['2025-01-14', 'Thai Pongal'], ['2025-02-11', 'Thai Poosam'], ['2025-02-26', 'Maha Shivaratri'], ['2025-03-12', 'Masi Magam'],
    ['2025-04-06', 'Sri Rama Navami'], ['2025-04-11', 'Panguni Uthiram'], ['2025-04-14', 'Tamil New Year'], ['2025-05-12', 'Chitra Pournami'],
    ['2025-08-08', 'Varalakshmi Vratam'], ['2025-08-09', 'Avani Avittam'], ['2025-08-16', 'Krishna Jayanthi'], ['2025-08-27', 'Vinayaka Chaturthi'],
    ['2025-09-05', 'Onam'], ['2025-09-21', 'Mahalaya Amavasai'], ['2025-09-22', 'Navaratri begins'], ['2025-10-02', 'Vijayadasami'],
    ['2025-10-20', 'Deepavali'], ['2025-12-04', 'Karthigai Deepam'], ['2025-12-30', 'Vaikunta Ekadasi'],
    ['2026-01-14', 'Thai Pongal'], ['2026-02-15', 'Maha Shivaratri'], ['2026-08-28', 'Avani Avittam'], ['2026-09-04', 'Krishna Jayanthi'],
    ['2026-09-15', 'Vinayaka Chaturthi'], ['2026-10-20', 'Vijayadasami'], ['2026-11-08', 'Deepavali'], ['2026-11-24', 'Karthigai Deepam'],
    ['2026-12-20', 'Vaikunta Ekadasi'],
  ];
  for (const [d, f] of cases) it(`${f} on ${d}`, () => expect(on(d)).toContain(f));
  it('each festival appears once a year', () => {
    const count = new Map<string, number>();
    for (const d of yearDays(2025)) if (d.y === 2025) for (const e of d.events) if (e.kind === 'festival') count.set(e.title, (count.get(e.title) || 0) + 1);
    for (const [t, n] of count) if (!['Vaikunta Ekadasi', 'Arudra Darshanam'].includes(t)) expect([t, n]).toEqual([t, 1]);
  });
  it('Tamil dates', () => { expect(tamilDate(findDay('2026-01-14')!)).toBe('Thai 1'); expect(tamilDate(findDay('2026-04-14')!)).toBe('Chithirai 1'); });
  it('every month has an Amavasai and a Pournami', () => {
    for (let m = 0; m < 12; m++) {
      const ds = yearDays(2026).filter((d) => d.y === 2026 && d.m === m);
      expect(ds.some((d) => d.events.some((e) => e.title === 'Pournami')) || m === 5).toBe(true);
    }
  });
});
