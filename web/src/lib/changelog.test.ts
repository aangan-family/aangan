import { describe as group, expect, it } from 'vitest';
import { buildFamily } from './family';
import { byWhom, describe, verbOf } from './changelog';
import type { LogEntry, Person } from './types';

const P = (id: string, given_name: string): Person => ({ id, given_name, surname: 'Iyer', birth_surname: '', gender: 'm', birth_year: 1950, is_living: true, death_date: null, death_place: null, sort_key: null });
const f = buildFamily([P('A', 'Asha'), P('B', 'Bala')], [], []);
const E = (o: Partial<LogEntry>): LogEntry => ({ at: '2026-11-01T00:00:00Z', action: 'update', kind: 'detail', field: null, old_value: null, new_value: null, other: null, by_person: null, by_role: null, ...o });

group('profile change log', () => {
  it('says Add, Modify or Delete', () => {
    expect(verbOf(E({ action: 'insert' }))).toBe('Add');
    expect(verbOf(E({ action: 'update' }))).toBe('Modify');
    expect(verbOf(E({ action: 'delete' }))).toBe('Delete');
    expect(verbOf(E({ kind: 'withdrawn' }))).toBe('Modify');
  });
  it('describes detail changes with their values', () => {
    expect(describe(E({ field: 'city', old_value: 'Bengaluru', new_value: 'Mysuru' }), f)).toBe('Changed Lives in from Bengaluru to Mysuru');
    expect(describe(E({ action: 'insert', field: 'birth_date', new_value: '19830615' }), f)).toBe('Added Date of birth: 15 Jun 1983');
    expect(describe(E({ action: 'delete', field: 'phone', old_value: '+91 1' }), f)).toBe('Removed Phone (was +91 1)');
    expect(describe(E({ action: 'insert', field: 'janma_nakshatram', new_value: 'Avani|Moolam' }), f)).toContain('Moolam');
    expect(describe(E({ kind: 'visibility', field: 'address', old_value: 'private', new_value: 'close' }), f)).toBe('Changed who sees Address: Only me → Close family');
  });
  it('never names a hidden detail', () => {
    expect(describe(E({ kind: 'hidden' }), f)).toBe('Changed a detail you can’t see');
  });
  it('describes tree and relationship changes', () => {
    expect(describe(E({ kind: 'tree', field: 'birth_year', old_value: '1987', new_value: '1989' }), f)).toBe('Changed Birth year from 1987 to 1989');
    expect(describe(E({ kind: 'tree', action: 'insert', field: 'given_name' }), f)).toBe('Added to the family tree');
    expect(describe(E({ kind: 'tree', field: 'is_living', new_value: 'false' }), f)).toBe('Recorded as passed away');
    expect(describe(E({ kind: 'spouse', action: 'insert', other: 'B' }), f)).toBe('Added marriage to Bala Iyer');
    expect(describe(E({ kind: 'parent', action: 'delete', other: 'GONE' }), f)).toBe('Removed the link to parent someone no longer in the tree');
  });
  it('names who made the change', () => {
    expect(byWhom(E({ by_person: 'A', by_role: 'member' }), f)).toBe('Asha Iyer');
    expect(byWhom(E({}), f)).toBe('Family records');
  });
});
