import { describe, expect, it } from 'vitest';
import { buildFamily, cutOffBy } from './family';
import type { Person } from './types';

const P = (id: string, birth_year = 1950): Person => ({
  id, given_name: id, surname: '', birth_surname: '', gender: 'm', birth_year, is_living: true, death_date: null, death_place: null, sort_key: null,
});
// V + M -> Son, Dau ; Son + SW -> GS ; SW's father SF
const persons = [P('V', 1900), P('M', 1905), P('Son', 1930), P('Dau', 1932), P('SW', 1935), P('GS', 1960), P('SF', 1905)];
const links = [['Son', 'V'], ['Son', 'M'], ['Dau', 'V'], ['Dau', 'M'], ['GS', 'Son'], ['GS', 'SW'], ['SW', 'SF']]
  .map(([c, p]) => ({ child_id: c, parent_id: p, kind: 'biological' }));
const partners = [['V', 'M'], ['Son', 'SW']].map(([a, b]) => ({ person_a: a, person_b: b, kind: 'married', is_current: true, start_date: null, place: null }));
const f = buildFamily(persons, links, partners);

describe('removing someone from the tree', () => {
  it('a leaf cuts nobody off', () => {
    expect(cutOffBy(f, 'GS')).toEqual([]);
    expect(cutOffBy(f, 'Dau')).toEqual([]);
  });
  it('a middle person warns about who would be left unconnected', () => {
    // Son's wife, her father and their son reach the tree only through Son
    expect(cutOffBy(f, 'Son').sort()).toEqual(['GS', 'SF', 'SW']);
  });
  it('removing the founder leaves the rest connected through his wife', () => {
    expect(cutOffBy(f, f.root!)).toEqual([]);
  });
});
