import { describe, expect, it } from 'vitest';
import { easter, findDay, shownFor, yearDays } from './calendar';

const on = (key: string, title: string) => findDay(key)!.events.some((e) => e.title === title);

// Checked against published 2025 and 2026 calendars for India.
describe('festivals of every community', () => {
  it('North Indian dates', () => {
    expect(on('2025-03-13', 'Holika Dahan') && on('2025-03-14', 'Holi')).toBe(true);
    expect(on('2026-03-03', 'Holika Dahan') && on('2026-03-04', 'Holi')).toBe(true);
    expect(on('2025-10-20', 'Diwali') && on('2026-11-08', 'Diwali')).toBe(true);
    expect(on('2025-10-18', 'Dhanteras') && on('2025-10-22', 'Govardhan Puja') && on('2025-10-23', 'Bhai Dooj')).toBe(true);
    expect(on('2025-08-09', 'Raksha Bandhan') && on('2026-08-28', 'Raksha Bandhan')).toBe(true);
    expect(on('2025-10-10', 'Karva Chauth') && on('2026-10-29', 'Karva Chauth')).toBe(true);
    expect(on('2025-10-27', 'Chhath Puja') && on('2026-11-15', 'Chhath Puja')).toBe(true);
    expect(on('2025-02-02', 'Vasant Panchami') && on('2026-01-23', 'Vasant Panchami')).toBe(true);
  });
  it('regional new years and harvests', () => {
    expect(on('2025-03-30', 'Ugadi') && on('2026-03-19', 'Ugadi') && on('2026-03-19', 'Gudi Padwa')).toBe(true);
    expect(on('2026-04-14', 'Vaisakhi') && on('2026-04-14', 'Vishu') && on('2026-04-14', 'Tamil New Year')).toBe(true);
    expect(on('2026-01-13', 'Lohri') && on('2026-01-14', 'Makar Sankranti') && on('2026-01-14', 'Thai Pongal')).toBe(true);
    expect(on('2025-09-30', 'Durga Ashtami') && on('2026-10-19', 'Durga Ashtami')).toBe(true);
  });
  it('Sikh, Jain, Buddhist, Christian, national', () => {
    expect(on('2025-11-05', 'Guru Nanak Gurpurab') && on('2026-11-24', 'Guru Nanak Gurpurab')).toBe(true);
    expect(on('2025-04-10', 'Mahavir Jayanti') && on('2025-05-12', 'Buddha Purnima')).toBe(true);
    expect(easter(2025)).toEqual({ m: 3, d: 20 });
    expect(easter(2026)).toEqual({ m: 3, d: 5 });
    expect(on('2026-04-03', 'Good Friday') && on('2026-12-25', 'Christmas')).toBe(true);
    expect(on('2026-01-26', 'Republic Day') && on('2026-08-15', 'Independence Day')).toBe(true);
  });
  it('Islamic days come from the Hijri calendar (may differ by a day with the moon)', () => {
    const near = (key: string, title: string) => { const t = Date.parse(key); return yearDays(+key.slice(0, 4)).some((d) => Math.abs(d.date.getTime() - t) <= 864e5 && d.events.some((e) => e.title === title)); };
    expect(near('2025-03-31', 'Eid al-Fitr')).toBe(true);
    expect(near('2026-05-27', 'Eid al-Adha')).toBe(true);
  });
  it('shows each person only the festivals they keep', () => {
    const holi = findDay('2026-03-04')!.events.find((e) => e.title === 'Holi')!;
    expect(shownFor(holi, ['north'])).toBe(true);
    expect(shownFor(holi, ['tamil'])).toBe(false);
    expect(shownFor({ kind: 'birthday', title: 'x' }, [])).toBe(true);
  });
});
