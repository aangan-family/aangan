import { describe, expect, it } from 'vitest';
import { excerpt, groupByPerson, mentionEmail, type MentionRow } from './mentions';

const row = (o: Partial<MentionRow>): MentionRow => ({ id: 1, user_id: 'u1', email: 'a@b.c', given_name: 'Asha', by_name: 'Bala Iyer',
  thread_id: 't1', post_id: null, title: 'Help needed', body: 'Hi **@[Asha Iyer](person:A)**, can you add <your> kids?', at: '', ...o });

describe('mention emails', () => {
  it('shows mentions as names and drops formatting', () => {
    expect(excerpt('Hi **@[Asha Iyer](person:A)**, see [this](https://x.y)')).toBe('Hi @Asha Iyer, see this');
    expect(excerpt('word '.repeat(80)).length).toBeLessThanOrEqual(180);
    expect(excerpt('Look\n![Thatha 1985](photo:0f8fad5b-d9cb-469f-a165-70867728950e)\nlovely')).toBe('Look 📷 Thatha 1985 lovely');
  });
  it('one mention: says who, where, and links to it; escapes the text', () => {
    const m = mentionEmail([row({})]);
    expect(m.subject).toBe('Bala Iyer mentioned you in “Help needed”');
    expect(m.html).toContain('https://ourfamily.example/#/talk/t1');
    expect(m.html).toContain('&lt;your&gt;');
    expect(m.html).not.toContain('<your>');
    expect(m.text).toContain('Turn these emails off: https://ourfamily.example/#/privacy');
  });
  it('several mentions become one email per person', () => {
    const g = groupByPerson([row({ id: 1 }), row({ id: 2, user_id: 'u2' }), row({ id: 3, title: 'Diwali' })]);
    expect(g.map((x) => x.length)).toEqual([2, 1]);
    expect(mentionEmail(g[0]).subject).toBe('You were mentioned 2 times in Talk');
  });
});
