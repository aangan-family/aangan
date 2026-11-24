import { describe, expect, it } from 'vitest';
import { mentionIds, plainText } from './richtext';
import { mentionMatches, mentionQuery, mentionToken } from '../components/MentionMenu';
import { buildFamily } from './family';
import { orderForBell, updatesFor } from './updates';
import type { Person, Snapshot } from './types';

const P = (id: string, given_name: string, extra: Partial<Person> = {}): Person => ({ id, given_name, surname: 'Iyer', birth_surname: '', gender: 'm', birth_year: 1970, is_living: true, death_date: null, death_place: null, sort_key: null, ...extra });
const persons = [P('A', 'Asha', { gender: 'f' }), P('B', 'Bala'), P('R', 'Radha', { gender: 'f' }), P('RJ', 'Rajesh'), P('OLD', 'Raman', { is_living: false })];

describe('mentions', () => {
  it('finds who is mentioned, once each', () => {
    expect(mentionIds('Hi @[Bala Iyer](person:B) and @[Asha](person:A), @[Bala](person:B)')).toEqual(['B', 'A']);
    expect(mentionIds('email me @ home, [x](https://a.b)')).toEqual([]);
  });
  it('makes previews readable', () => {
    expect(plainText('**Hi** @[Bala Iyer](person:B), see [this](https://x.y)')).toBe('Hi @Bala Iyer, see this');
  });
  it('notices an @ being typed', () => {
    expect(mentionQuery('Hello @Rag', 10)).toEqual({ at: 6, query: 'Rag' });
    expect(mentionQuery('@', 1)).toEqual({ at: 0, query: '' });
    expect(mentionQuery('mail me at a@b', 14)).toBeNull();
    expect(mentionQuery('Hi @[Bala](person:B) ', 21)).toBeNull();
  });
  it('suggests people who have joined first, never yourself', () => {
    const m = mentionMatches(persons, new Set(['RJ']), 'Ra', 'A');
    expect(m.map((p) => p.id)).toEqual(['RJ', 'R', 'OLD']);
    expect(mentionMatches(persons, new Set(), '', 'A').some((p) => p.id === 'A')).toBe(false);
  });
  it('writes a safe token', () => {
    expect(mentionToken(P('X', 'Ra[j]u'))).toBe('@[Raju Iyer](person:X) ');
  });
});

describe('the bell', () => {
  const f = buildFamily(persons, [], []);
  const snap = {
    me: { user_id: 'ua', person_id: 'A', role: 'member' }, joins: [], persons: [], fields: [], photos: [], tags: [],
    threads: [{ id: 't1', title: 'Help', body: '', category: 'general', author: 'ub', author_person: 'B', pinned: false, locked: false, reply_count: 2,
      created_at: new Date().toISOString(), edited_at: null, last_activity_at: new Date().toISOString(), mentions: ['A'] }],
    recentPosts: [
      { id: 'p1', thread_id: 't1', author: 'ua', author_person: 'A', created_at: new Date(Date.now() - 3000).toISOString() },
      { id: 'p2', thread_id: 't1', author: 'ur', author_person: 'R', created_at: new Date(Date.now() - 2000).toISOString(), reply_to: 'p1' },
      { id: 'p3', thread_id: 't1', author: 'ub', author_person: 'B', created_at: new Date(Date.now() - 1000).toISOString(), mentions: ['A'] },
    ],
  } as unknown as Snapshot;
  const items = updatesFor(snap, f, () => false);
  it('tells you when you are mentioned or replied to', () => {
    expect(items.filter((u) => u.kind === 'mention').map((u) => u.text)).toEqual(['Bala mentioned you in “Help”.', 'Bala mentioned you in “Help”.']);
    expect(items.find((u) => u.kind === 'reply-to-you')?.text).toBe('Radha replied to you in “Help”.');
    expect(items.find((u) => u.postId === 'p3')?.personal).toBe(true);
  });
  it('does not count the same reply twice', () => {
    expect(items.some((u) => u.kind === 'reply')).toBe(false);
  });
  it('puts unread personal items first', () => {
    const plain = { key: 'x', at: new Date(Date.now() + 5000).toISOString(), kind: 'join' as const, text: 'x' };
    expect(orderForBell([plain, ...items], null)[0].personal).toBe(true);
  });
});
