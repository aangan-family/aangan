import { describe, expect, it } from 'vitest';
import { dayLabel, hasNews, subjectFor, upcoming, weeklyEmail, type WeeklyData } from './weekly';
import { payload } from './mail';
import type { FeedRow } from './messages';

const row = (o: Partial<FeedRow>): FeedRow => ({ id: 'X', name: 'Asha Iyer', given_name: 'Asha', gender: 'f', is_living: true, birth_year: 1980,
  birth_date: '19801126', birth_shared: true, death_date: null, janma_nakshatram: 'Karthigai|2', shraddha_tithi: null, parents: null, partner: null, ...o });
const day = (s: string) => new Date(s + 'T00:00:00Z');
const empty: WeeklyData = { recipients: [], joined: [], threads: [], photos: 0, notices: [], members: 49, living: 122 };

describe('This week in the family', () => {
  const sun = day('2026-11-22');
  it('lists shared birthdays, remembrance days and festivals for the coming 7 days', () => {
    const up = upcoming([row({}), row({ id: 'D', name: 'Ramaswamy Iyer', is_living: false, birth_date: '19200000', death_date: '19951125' })], sun);
    const texts = up.map((u) => u.text);
    expect(texts).toContain('Asha Iyer’s birthday');
    expect(texts).toContain('Remembering Ramaswamy Iyer');
    expect(texts.some((t) => /Karthigai/.test(t))).toBe(false);   // a Tamil festival; the sample settings are Hindi
    expect(upcoming([], day('2026-11-01')).map((u) => u.text)).toContain('Dhanteras');   // the family's own festivals are listed
    expect(up.map((u) => u.day.getTime())).toEqual([...up.map((u) => u.day.getTime())].sort((a, b) => a - b));
  });
  it('leaves out birthdays not shared with the whole family, Tamil birthdays, and anything after the week', () => {
    const up = upcoming([row({ name: 'Private Person', birth_shared: false }), row({ name: 'Later Person', birth_date: '19801205' })], sun);
    expect(up.some((u) => /Private|Later/.test(u.text))).toBe(false);
    expect(up.some((u) => /Tamil/.test(u.text))).toBe(false);
  });
  it('never says an age or a birth year', () => {
    const m = weeklyEmail(empty, upcoming([row({})], sun), 'Bala', sun);
    expect(m.html).not.toMatch(/1980|46/);
    expect(m.text).not.toMatch(/1980|46/);
  });
  it('shows joins, conversations, photos and notices, all linking inside the site', () => {
    const w = { ...empty, joined: ['Balasubramanian K K'], threads: [{ id: 'bfa17a0d-120b-4485-bd12-6b3915c54f99', title: 'Karthigai <Deepam>', new: true, replies: 2 }], photos: 3, notices: [{ title: 'Hello', url: 'https://evil.example' }] };
    const m = weeklyEmail(w, [], 'Bala', sun);
    expect(m.html).toContain('Hi Bala');
    expect(m.html).toContain('Balasubramanian K K');
    expect(m.html).toContain('Karthigai &lt;Deepam&gt;');
    expect(m.html).toContain('new, 2 replies');
    expect(m.html).toContain('3 new photos');
    expect(m.html).not.toContain('evil.example');
    for (const href of m.html.match(/href="[^"]+"/g) || []) expect(href).toMatch(/^href="(https:\/\/ourfamily\.example|tel:|https:\/\/wa\.me)/);
    expect(m.html).toContain('49 of 122 relatives');
  });
  it('does not repeat a notice that points at a listed conversation', () => {
    const m = weeklyEmail({ ...empty, threads: [{ id: 't1', title: 'Deepam', new: true, replies: 0 }], notices: [{ title: 'Deepam is in Talk', url: '#/talk/t1' }] }, [], 'A', sun);
    expect(m.html).not.toContain('Deepam is in Talk');
  });
  it('subject names the week’s highlights', () => {
    expect(subjectFor(empty, [])).toBe('This week in the family');
    expect(subjectFor({ ...empty, joined: ['A'] }, [{ day: sun, icon: '🎂', text: 'Asha Iyer’s birthday' }, { day: sun, icon: '🌼', text: 'Karthigai Deepam' }]))
      .toBe('This week in the family: Asha Iyer’s birthday, Karthigai Deepam and 1 more');
  });
  it('skips a week with nothing to say', () => {
    expect(hasNews(empty, [])).toBe(false);
    expect(hasNews({ ...empty, photos: 1 }, [])).toBe(true);
  });
  it('labels days and can be turned off', () => {
    expect(dayLabel(sun)).toBe('Sun 22 Nov');
    expect(payload({}, { to: ['a@x.in'], ...weeklyEmail(empty, [], 'A', sun) }, 'weekly').headers['List-Unsubscribe']).toContain('/#/privacy');
  });
});
