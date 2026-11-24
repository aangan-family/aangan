import { describe, expect, it } from 'vitest';
import { buildFamily } from './family';
import { byMonth, tradition, type Upcoming } from './traditions';
import { unreadCount, updatesFor } from './updates';
import type { Person, Snapshot } from './types';

const P = (id: string, gender: string, birth_year = 1950): Person => ({
  id, given_name: id, surname: '', birth_surname: '', gender, birth_year, is_living: true, death_date: null, death_place: null, sort_key: null,
});
// V + M -> Son(m), Dau(f) ; Son + SW(f) -> GS(m), GD(f) ; Dau + DH(m) -> DC(m)
const persons = [P('V', 'm', 1900), P('M', 'f', 1905), P('Son', 'm', 1930), P('Dau', 'f', 1932), P('SW', 'f', 1935), P('DH', 'm', 1928),
  P('GS', 'm', 1960), P('GD', 'f', 1962), P('DC', 'm', 1958)];
const links = [['Son', 'V'], ['Son', 'M'], ['Dau', 'V'], ['Dau', 'M'], ['GS', 'Son'], ['GS', 'SW'], ['GD', 'Son'], ['GD', 'SW'], ['DC', 'Dau'], ['DC', 'DH']]
  .map(([c, p]) => ({ child_id: c, parent_id: p, kind: 'biological' }));
const partners = [['V', 'M'], ['Son', 'SW'], ['Dau', 'DH']].map(([a, b]) => ({ person_a: a, person_b: b, kind: 'married', is_current: true, start_date: null, place: null }));
const f = buildFamily(persons, links, partners);

describe('gothram and the other traditions', () => {
  const none = () => undefined;
  const g = (id: string, own: (x: string) => string | undefined = none) => tradition(f, id, 'gothram', own, 'V', 'Atreya');
  it('passes from father to son, and to unmarried daughters', () => {
    expect(g('V')).toEqual({ value: 'Atreya', source: 'family' });
    expect(g('Son')).toEqual({ value: 'Atreya', source: 'father', via: 'V' });
    expect(g('GS')).toEqual({ value: 'Atreya', source: 'father', via: 'Son' });
    expect(g('GD')).toEqual({ value: 'Atreya', source: 'father', via: 'Son' });
  });
  it('wives take their husband’s: wives who married in carry the family’s', () => {
    expect(g('M')).toEqual({ value: 'Atreya', source: 'husband', via: 'V' });
    expect(g('SW')).toEqual({ value: 'Atreya', source: 'husband', via: 'Son' });
  });
  it('a married daughter never shows her father’s: her husband’s, or nothing yet', () => {
    expect(g('Dau')).toEqual({ value: null, source: 'husband', via: 'DH' });
    const own = (x: string) => (x === 'DH' ? 'Bharadwaja' : undefined);
    expect(g('Dau', own)).toEqual({ value: 'Bharadwaja', source: 'husband', via: 'DH' });
    expect(g('DC', own)).toEqual({ value: 'Bharadwaja', source: 'father', via: 'DH' });
    expect(g('DC')).toBeNull();
  });
  it('anyone’s own record wins', () => {
    expect(g('Dau', (x) => (x === 'Dau' ? 'Kaushika' : undefined))).toEqual({ value: 'Kaushika', source: 'own' });
  });
  it('needs a known founder for the family’s own value', () => {
    expect(tradition(f, 'Son', 'gothram', none, null, 'Atreya')).toBeNull();
  });
});

describe('coming up by month', () => {
  const u = (id: string, m: number, d: number, kind: Upcoming['kind']): Upcoming => ({ id, date: new Date(Date.UTC(2026, m, d)), kind, title: '', sub: '' });
  it('groups by month, then birthdays and remembrance', () => {
    const g = byMonth([u('a', 11, 3, 'shraddham'), u('b', 10, 20, 'birthday'), u('c', 10, 25, 'remembrance'), u('d', 11, 1, 'tamil-birthday'), u('e', 10, 21, 'milestone')]);
    expect(g.map((x) => x.label)).toEqual(['November', 'December']);
    expect(g[0].birthdays.map((x) => x.id)).toEqual(['b', 'e']);
    expect(g[0].remembrance.map((x) => x.id)).toEqual(['c']);
    expect(g[1].birthdays.map((x) => x.id)).toEqual(['d']);
    expect(g[1].remembrance.map((x) => x.id)).toEqual(['a']);
  });
});

describe('bell', () => {
  const now = new Date().toISOString();
  const old = new Date(Date.now() - 90 * 86400000).toISOString();
  const snap = {
    persons, links, partners, joined: [], consents: [], policy: null, info: null,
    me: { user_id: 'me', person_id: 'GS', role: 'member', status: 'active' },
    joins: [{ person_id: 'GD', joined_at: now }, { person_id: 'GS', joined_at: now }, { person_id: 'Son', joined_at: old }],
    fields: [
      { person_id: 'GD', field: 'city', value: 'Chennai', visibility: 'family', updated_by: 'u2', updated_at: now },
      { person_id: 'GS', field: 'city', value: 'Pune', visibility: 'family', updated_by: 'me', updated_at: now },
    ],
    photos: [{ id: 'p1', path: 'album/a.jpg', caption: 'Wedding', taken_year: null, uploaded_by: 'u2', created_at: now }],
    tags: [{ photo_id: 'p1', person_id: 'GS', status: 'pending', tagged_by: 'u2', created_at: now, decided_at: null }],
    prefs: { theme: 'blue', updates_seen_at: null },
    threads: [], recentPosts: [],
  } as unknown as Snapshot;
  const items = updatesFor(snap, f, (id) => id === 'GS');
  it('shows joins, others’ new details, new photos and tag requests, not my own activity', () => {
    expect(items[0].kind).toBe('tag-request');
    expect(items.map((x) => x.kind).sort()).toEqual(['details', 'join', 'photo', 'tag-request']);
    expect(items.find((x) => x.kind === 'details')!.text).toBe('GD’s page has new details: lives in.');
  });
  it('counts unread since the bell was last opened; requests always count', () => {
    expect(unreadCount(items, null)).toBe(4);
    expect(unreadCount(items, new Date(Date.now() + 1000).toISOString())).toBe(1);
  });
});
