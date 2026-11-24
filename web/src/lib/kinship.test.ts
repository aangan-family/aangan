import { describe as suite, expect, it } from 'vitest';
import { buildFamily } from './family';
import { describe, kinTerm } from './kinship';
import type { Person } from './types';

const P = (id: string, gender = 'm', birth_year = 1950, is_living = true): Person => ({
  id, given_name: id, surname: '', birth_surname: '', gender, birth_year, is_living, death_date: null, death_place: null, sort_key: String(birth_year) + '0101',
});
// G+GM → A(f), B(m) ; A+C → K ; B+W → D ; D+E → Z
const persons = [P('G', 'm', 1930, false), P('GM', 'f', 1935), P('A', 'f', 1960), P('B', 'm', 1962), P('C', 'm', 1958), P('W', 'f', 1964), P('K', 'm', 1990), P('D', 'f', 1992), P('E', 'm', 1990), P('Z', 'f', 2020)];
const links = [['A', 'G'], ['A', 'GM'], ['B', 'G'], ['B', 'GM'], ['K', 'A'], ['K', 'C'], ['D', 'B'], ['D', 'W'], ['Z', 'D'], ['Z', 'E']].map(([c, p]) => ({ child_id: c, parent_id: p, kind: 'biological' }));
const partners = [['G', 'GM'], ['A', 'C'], ['B', 'W'], ['D', 'E']].map(([a, b]) => ({ person_a: a, person_b: b, kind: 'married', is_current: true, start_date: null, place: null }));
const f = buildFamily(persons, links, partners);
const text = (id1: string, id2: string) => describe(f, id1, id2).sentence.map((s) => (s.t === 'name' ? s.id : s.s)).join('');

suite('family structure', () => {
  it('finds the founder and generations', () => {
    expect(f.root).toBe('G');
    expect(f.gen.get('Z')).toBe(4);
    expect(f.gen.get('C')).toBe(2); // spouse shares generation
    expect(f.blood.has('C')).toBe(false);
  });
});

suite('kinship', () => {
  it('names direct and collateral relatives', () => {
    expect(text('A', 'B')).toBe('A is B’s sister.');
    expect(text('K', 'D')).toBe('K is D’s first cousin.');
    expect(text('Z', 'K')).toBe('Z is K’s first cousin’s daughter.');
    expect(text('K', 'Z')).toBe('K is Z’s mother’s first cousin.');
    expect(text('A', 'Z')).not.toMatch(/removed/);
    expect(text('G', 'Z')).toBe('G is Z’s great-grandfather.');
    expect(text('A', 'D')).toBe('A is D’s aunt.');
  });
  it('handles in-laws', () => {
    expect(text('C', 'B')).toBe('C is B’s brother-in-law (married to B’s sister, A).');
    expect(text('GM', 'C')).toBe('GM is C’s mother-in-law (A’s mother).');
    expect(text('C', 'W')).toBe('C and W are married to siblings: A is B’s sister.');
  });
  it('builds the connecting chain through the common ancestor', () => {
    const r = describe(f, 'K', 'D');
    expect(r.chain).toEqual(['K', 'A', 'G', 'B', 'D']);
    expect(r.tops?.sort()).toEqual(['G', 'GM']);
  });
  it('kinTerm edge cases', () => {
    expect(kinTerm(3, 1, 'f')).toBe('grandniece');
    expect(kinTerm(1, 4, 'm')).toBe('great-great-uncle');
    expect(kinTerm(4, 2, 'm')).toBe('first cousin’s grandson');
    expect(kinTerm(2, 4, 'f', false, 'm')).toBe('grandfather’s first cousin');
    expect(kinTerm(3, 5, 'f')).toBe('grandparent’s second cousin');
  });
});

it('engaged couples are fiancé / fiancée, not husband / wife (0041)', () => {
  const ps = [{ id: 'S', given_name: 'Sucheta', gender: 'f' }, { id: 'D', given_name: 'Dwij', gender: 'm' }].map((p) => ({ surname: '', birth_surname: '', birth_year: 1995, is_living: true, sort_key: null, death_date: null, death_place: null, ...p })) as never[];
  const ef = buildFamily(ps, [], [{ person_a: 'S', person_b: 'D', kind: 'engaged', is_current: true, start_date: null, place: null }] as never[]);
  const words = (r: ReturnType<typeof describe>) => r.sentence.map((x) => (x.t === 'rel' ? x.s : x.t === 'text' ? (x as { s: string }).s : '')).join('');
  expect(words(describe(ef, 'D', 'S'))).toContain('fiancé');
  expect(words(describe(ef, 'S', 'D'))).toContain('fiancée');
});

it('an engaged in-law is a fiancé(e) and a future in-law (0041)', () => {
  const ps = [P('PA', 'm', 1960), P('S', 'f', 1995), P('D', 'm', 1994)];
  const ef = buildFamily(ps, [{ child_id: 'S', parent_id: 'PA', kind: 'biological' }] as never[], [{ person_a: 'S', person_b: 'D', kind: 'engaged', is_current: true, start_date: null, place: null }] as never[]);
  const words = (r: ReturnType<typeof describe>) => r.sentence.map((x) => (x.t === 'name' ? '' : (x as { s: string }).s)).join('');
  expect(words(describe(ef, 'PA', 'D'))).toContain('future father-in-law');
  expect(words(describe(ef, 'D', 'PA'))).toContain('future son-in-law');
  expect(words(describe(ef, 'D', 'PA'))).toContain('engaged to');
});
