import { describe, expect, it } from 'vitest';
import { dailyPushes } from './pushjobs';
import type { FeedRow } from './messages';

const row = (o: Partial<FeedRow>): FeedRow => ({
  id: 'X', name: 'Test Person', given_name: 'Test', gender: 'm', is_living: true, birth_year: 1980, birth_date: null, birth_shared: true,
  death_date: null, janma_nakshatram: null, shraddha_tithi: null, parents: null, partner: null, ...o,
});
const day = (s: string) => new Date(`${s}T00:00:00Z`);

describe('7 am notifications', () => {
  it('names shared birthdays and remembrance days', () => {
    const p = dailyPushes([row({ given_name: 'Ravi', birth_date: '19661211' }), row({ id: 'Y', given_name: 'Meenakshi', is_living: false, death_date: '19931211' })], day('2026-12-11'));
    const o = p.find((x) => x.kind === 'occasion')!;
    expect(o.body).toContain('🎂 Ravi’s birthday');
    expect(o.body).toContain('Remembering Meenakshi');
    expect(o.url).toBe('#/');
  });
  it('leaves out birthdays not shared with the whole family, and never says an age', () => {
    const p = dailyPushes([row({ given_name: 'Private', birth_date: '19661211', birth_shared: false })], day('2026-12-11'));
    expect(p.filter((x) => x.kind === 'occasion')).toEqual([]);
    const q = dailyPushes([row({ given_name: 'Ravi', birth_date: '19661211' })], day('2026-12-11'));
    expect(q[0].body).not.toMatch(/\d/);
  });
  it('leaves out Tamil birthdays and shraddhams (their stars can be private)', () => {
    const p = dailyPushes([row({ janma_nakshatram: 'Karthigai|Anusham' }), row({ id: 'Z', is_living: false, shraddha_tithi: 'Karthigai|Dashami' })], day('2026-12-11'));
    expect(p.filter((x) => x.kind === 'occasion')).toEqual([]);
  });
  it('announces Karthigai Deepam on its day', () => {
    const f = dailyPushes([], day('2026-11-24')).find((x) => x.kind === 'festival');
    expect(f?.title).toMatch(/Karthigai/);
    expect(f?.url).toBe('#/calendar/2026-11-24');
  });
});
