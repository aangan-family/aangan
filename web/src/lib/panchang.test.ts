import { describe, expect, it } from 'vitest';
import { tamilMonthOfDay, julianDay, moonLongitude, sunLongitude, panchangAt, nextShraddham, nextTamilBirthday, tithiName, NAKSHATRAMS, TAMIL_MONTHS } from './panchang';

const elong = (iso: string) => { const jd = julianDay(new Date(iso)); return ((moonLongitude(jd) - sunLongitude(jd)) % 360 + 360) % 360; };
const near = (x: number, target: number, tol: number) => Math.min(Math.abs(x - target), 360 - Math.abs(x - target)) < tol;

describe('panchang', () => {
  it('finds the 8 April 2024 new moon (eclipse, 18:21 UTC)', () => { expect(near(elong('2024-04-08T18:21:00Z'), 0, 0.3)).toBe(true); });
  it('finds the 18 Sep 2024 full moon (02:34 UTC)', () => { expect(near(elong('2024-09-18T02:34:00Z'), 180, 0.3)).toBe(true); });
  it('finds the 3 Jan 2026 full moon (10:03 UTC)', () => { expect(near(elong('2026-01-03T10:03:00Z'), 180, 0.3)).toBe(true); });
  it('Chithirai begins mid-April (Tamil new year 2024)', () => {
    expect(TAMIL_MONTHS[tamilMonthOfDay(2024, 3, 13)]).toBe('Panguni');
    expect(TAMIL_MONTHS[tamilMonthOfDay(2024, 3, 14)]).toBe('Chithirai');
  });
  it('Thai begins on Pongal (14 Jan 2026)', () => {
    expect(TAMIL_MONTHS[tamilMonthOfDay(2026, 0, 14)]).toBe('Thai');
    expect(TAMIL_MONTHS[tamilMonthOfDay(2026, 0, 13)]).toBe('Margazhi');
  });
  it('Onam 2024 (15 Sep) is Thiruvonam', () => { expect(NAKSHATRAMS[panchangAt(new Date('2024-09-15T00:45:00Z')).nakshatram]).toBe('Thiruvonam'); });
  it('names tithis', () => { expect(tithiName(0)).toBe('Shukla Prathamai'); expect(tithiName(14)).toBe('Pournami'); expect(tithiName(24)).toBe('Krishna Dasami'); expect(tithiName(29)).toBe('Amavasai'); });
  it('Mahalaya Amavasai 2025 (21 Sep) is Purattasi Amavasai', () => {
    const d = nextShraddham(TAMIL_MONTHS.indexOf('Purattasi'), 29, new Date('2025-09-01T00:00:00Z'))!;
    expect(d.toISOString().slice(0, 10)).toBe('2025-09-21');
  });
  // Krittika ran from the evening of 3 Dec (Deepam is lit then) to the afternoon of 4 Dec 2025,
  // so by the sunrise rule used for birthdays the Karthigai-star day is 4 Dec.
  it('Karthigai star in Karthigai 2025 falls on 4 Dec by the sunrise rule', () => {
    const d = nextTamilBirthday(TAMIL_MONTHS.indexOf('Karthigai'), NAKSHATRAMS.indexOf('Karthigai'), new Date('2025-11-17T00:00:00Z'))!;
    expect(d.toISOString().slice(0, 10)).toBe('2025-12-04');
  });
  it('finds a Tamil birthday within the next year, inside the right month', () => {
    const d = nextTamilBirthday(TAMIL_MONTHS.indexOf('Avani'), NAKSHATRAMS.indexOf('Moolam'), new Date('2026-11-13T00:00:00Z'))!;
    expect(d).not.toBeNull();
    expect(TAMIL_MONTHS[tamilMonthOfDay(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())]).toBe('Avani');
    expect(+d - +new Date('2026-11-13')).toBeLessThan(366 * 86400000);
  });
});
