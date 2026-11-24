import { describe, expect, it } from 'vitest';
import { buildFamily } from './family';
import { suggestMatches } from '../components/JoinRequests';
import type { Person } from './types';

const P = (id: string, given_name: string, gender: string, birth_year = 1960): Person => ({
  id, given_name, surname: '', birth_surname: '', gender, birth_year, is_living: true, death_date: null, death_place: null, sort_key: null,
});
const persons = [P('R', 'Ramesh', 'm', 1955), P('U', 'Uma', 'f', 1958), P('J', 'Janaki', 'f', 1990), P('J2', 'Janaki', 'f', 1992), P('S', 'Suresh', 'm', 1960)];
const f = buildFamily(persons, [{ child_id: 'J', parent_id: 'R', kind: 'biological' }, { child_id: 'J', parent_id: 'U', kind: 'biological' }], []);

describe('matching a request to the tree', () => {
  it('puts the person whose parents match first, and skips people who can’t be chosen', () => {
    const m = suggestMatches({ full_name: 'Janaki R', father_name: 'Ramesh', mother_name: 'Uma', spouse_name: '' }, persons,
      (id) => f.parents.get(id) || [], (id) => f.spouses.get(id) || [], (id) => f.byId.get(id), (id) => id !== 'S');
    expect(m.map((p) => p.id)).toEqual(['J', 'J2']);
  });
  it('suggests nobody when the name doesn’t match', () => {
    expect(suggestMatches({ full_name: 'Zed', father_name: '', mother_name: '', spouse_name: '' }, persons, () => [], () => [], (id) => f.byId.get(id), () => true)).toEqual([]);
  });
});
