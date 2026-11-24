import { describe as group, expect, it } from 'vitest';
import { buildFamily } from './family';
import { addressAs, relationToMe, wishRecipient, wishText } from './wishes';
import type { Person } from './types';
import type { Upcoming } from './traditions';

// these tests use Tamil family words: pick the Tamil traditions on this 'device'
const store: Record<string, string> = { 'fam-community': 'tamil' };
(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };

const P = (id: string, given_name: string, gender: string, birth_year: number): Person => ({ id, given_name, surname: 'Iyer', birth_surname: '', gender, birth_year, is_living: true, death_date: null, death_place: null, sort_key: null });
// Dad + Mom -> Ananya (1975, f), Arjun (1980, m), Kavi (1985, f); Ananya married Ravi
const persons = [P('DAD', 'Hari', 'm', 1945), P('MOM', 'Saraswathi', 'f', 1950), P('RAG', 'Ananya', 'f', 1975), P('ME', 'Arjun', 'm', 1980), P('KAV', 'Kavi', 'f', 1985), P('RAV', 'Ravi', 'm', 1972)];
const links = ['RAG', 'ME', 'KAV'].flatMap((c) => [{ child_id: c, parent_id: 'DAD', kind: 'biological' }, { child_id: c, parent_id: 'MOM', kind: 'biological' }]);
const partners = [{ person_a: 'DAD', person_b: 'MOM', kind: 'married', is_current: true, start_date: null, place: null }, { person_a: 'RAG', person_b: 'RAV', kind: 'married', is_current: true, start_date: '19990610', place: null }];
const f = buildFamily(persons, links, partners);
const today = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));

group('who they are to me', () => {
  it('names the relationship', () => {
    expect(relationToMe(f, 'RAG', 'ME')).toBe('your sister');
    expect(relationToMe(f, 'DAD', 'ME')).toBe('your father');
    expect(relationToMe(f, 'RAV', 'ME')).toBe('your brother-in-law');
    expect(relationToMe(f, 'ME', 'ME')).toBeNull();
  });
  it('writes to elders with the Tamil word, to younger ones by name', () => {
    expect(addressAs(f, 'RAG', 'ME')).toBe('Akka');
    expect(addressAs(f, 'KAV', 'ME')).toBe('Kavi');
  });
});

group('send a wish', () => {
  it('drafts a birthday wish', () => {
    const u: Upcoming = { id: 'RAG', date: today, kind: 'birthday', title: 'Birthday', sub: 'Turns 51' };
    expect(wishText(f, u, 'RAG', 'ME')).toBe('Hi Akka, wishing you a very happy birthday today! 🎂🎉 Have a wonderful year ahead. 🙏');
  });
  it('sends an anniversary wish to the partner you are related to, if they have joined', () => {
    const u: Upcoming = { id: 'RAG', with: 'RAV', date: today, kind: 'anniversary', title: 'Anniversary', sub: '27 years married' };
    expect(wishRecipient(f, u, 'ME', new Set(['RAG', 'RAV']))).toBe('RAG');
    expect(wishRecipient(f, u, 'ME', new Set(['RAV']))).toBe('RAV');
    expect(wishRecipient(f, u, 'ME', new Set())).toBeNull();
    expect(wishText(f, u, 'RAG', 'ME')).toContain('to you and Ravi');
  });
  it('offers no wish for remembrance days', () => {
    expect(wishRecipient(f, { id: 'DAD', date: today, kind: 'remembrance', title: '', sub: '' }, 'ME', new Set(['DAD']))).toBeNull();
  });
});
group('in-laws', () => {
  it('names a cousin’s husband', () => {
    const ps = [P('GP', 'Gopal', 'm', 1920), P('A1', 'Anand', 'm', 1945), P('B1', 'Bala', 'm', 1948), P('ME2', 'Arjun', 'm', 1980), P('CZ', 'Ananya', 'f', 1976), P('HZ', 'Chander', 'm', 1969)];
    const ls = [['A1', 'GP'], ['B1', 'GP'], ['ME2', 'A1'], ['CZ', 'B1']].map(([c, p]) => ({ child_id: c, parent_id: p, kind: 'biological' }));
    const ff = buildFamily(ps, ls, [{ person_a: 'CZ', person_b: 'HZ', kind: 'married', is_current: true, start_date: null, place: null }]);
    expect(relationToMe(ff, 'CZ', 'ME2')).toBe('your first cousin');
    expect(relationToMe(ff, 'HZ', 'ME2')).toBe('your first cousin’s husband');
  });
});
