import { describe, expect, it } from 'vitest';
import { dailyMessages, monthlyMessage, occasions, type FeedRow } from './messages';
import { emailHtml, messagesFor, messagesWithShares, subjectFor } from './index';

const row = (o: Partial<FeedRow>): FeedRow => ({
  id: 'X', name: 'X', given_name: 'X', gender: 'm', is_living: true, birth_year: null, birth_date: null, birth_shared: true,
  death_date: null, janma_nakshatram: null, shraddha_tithi: null, parents: null, partner: null, ...o,
});
const rows: FeedRow[] = [
  row({ id: 'P', name: 'Priya', gender: 'f', birth_date: '19891203', parents: 'Ramanathan & Kamala' }),
  row({ id: 'V', name: 'Vikram Sharma', birth_date: '19831203', birth_shared: false, partner: 'Kavya' }),
  row({ id: 'H', name: 'Raghunath Sharma', is_living: false, birth_date: '19391212', death_date: '20150420' }),
  row({ id: 'L', name: 'Leapling', gender: 'f', birth_date: '20000229' }),
  row({ id: 'S', name: 'Shraddha Test', is_living: false, death_date: '20100000', shraddha_tithi: 'Purattasi|Amavasai' }),
];
const D = (s: string) => new Date(s + 'T00:00:00Z');

describe('reminders', () => {
  it('writes a forwardable greeting for shared birthdays and a private note otherwise', () => {
    const m = dailyMessages(rows, D('2026-12-03'));
    expect(m).toHaveLength(2);
    expect(m[0]).toContain("Today is *Priya*'s birthday");
    expect(m[0]).toContain('wish her');
    expect(m[1]).toMatch(/^🔒 Just for you/);
    expect(m.join()).not.toContain('1989'); // ages and years of the living are never sent
  });
  it('remembers late relatives on their birthday and on the day they passed', () => {
    expect(dailyMessages(rows, D('2026-12-12'))[0]).toContain('Remembering *Raghunath Sharma*, born on this day in 1939');
    expect(dailyMessages(rows, D('2027-04-20'))[0]).toContain('who left us on this day in 2015');
  });
  it('moves 29 Feb birthdays to 28 Feb in ordinary years', () => {
    expect(dailyMessages(rows, D('2027-02-28'))[0]).toContain('Leapling');
    expect(dailyMessages(rows, D('2028-02-29'))[0]).toContain('Leapling');
  });
  it('finds the shraddham from the Tamil calendar (Mahalaya Amavasai 2025 was 21 Sep)', () => {
    const o = occasions(rows, D('2025-09-01'), D('2025-09-30')).filter((x) => x.kind === 'shraddham');
    expect(o.map((x) => x.day.toISOString().slice(0, 10))).toEqual(['2025-09-21']);
  });
  it('builds the monthly digest with sections, locks and no living ages', () => {
    const m = monthlyMessage(rows, 2026, 11)!;
    expect(m).toContain('🗓️ *December in our family*');
    expect(m).toContain('3 Dec – Priya (daughter of Ramanathan & Kamala)');
    expect(m).toContain('3 Dec – Vikram Sharma (husband of Kavya) 🔒');
    expect(m).toContain('12 Dec – Raghunath Sharma, born on this day in 1939');
    expect(m).toContain('🔒 = birth date not shared');
    expect(m).not.toContain('1983');
    expect(monthlyMessage([], 2026, 11)).toBeNull();
  });
  it('emails each message with a WhatsApp button, except private notes', () => {
    const msgs = messagesFor(rows, D('2026-12-03'));
    const html = emailHtml(messagesWithShares(rows, D('2026-12-03')), '2026-12-03');
    expect(html.match(/Send on WhatsApp/g)).toHaveLength(1);
    expect(html).toContain('https://wa.me/?text=' + encodeURIComponent(msgs[0]));
    expect(html).toContain('<b>Priya</b>');
    expect(html).toContain('Just for you, not for forwarding.');
    expect(subjectFor(msgs, D('2026-12-03'))).toBe('🎂 2 family occasions today');
    expect(subjectFor(messagesFor(rows, D('2026-12-01')), D('2026-12-01'))).toBe('🗓️ December in our family');
  });
  it('the monthly forward button leaves out locked birthdays', () => {
    const [m] = messagesWithShares(rows, D('2026-12-01'));
    expect(m.text).toContain('Vikram Sharma');
    expect(m.share).not.toContain('Vikram Sharma');
    expect(m.share).not.toContain('🔒');
    expect(m.share).toContain('Priya');
    expect(emailHtml([m], 'x')).toContain('The button leaves out the 🔒 birthdays.');
  });
});
