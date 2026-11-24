// node --test tests/importer.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFamilyScript, toRecords, toSQL } from '../scripts/import-familyscript.mjs';

const sample = [
  'iA\tpMary Alice\tlSmith\tqJones\tgf\tb19680714\tsB\temary@smith.org\tu555 1234\ta1 Main St',
  'iB\tpJOHN\tlSmith\tgm\tb19650327\tsA',
  'iC\tpTodd\tgm\tb19141000\tz1\td20020805\tmA\tfB',
  'iA\tvChicago',
  'pA D\te1\tga\tm19940214',
  'iD\tpPeter',
  'iX\tfNOBODY',
].join('\n');

test('parses, keeps the last value, links only known people', () => {
  const r = toRecords(parseFamilyScript(sample));
  assert.equal(r.persons.length, 5);
  const a = r.persons.find((p) => p.id === 'A');
  assert.equal(a.given_name, 'Mary Alice');
  assert.equal(r.persons.find((p) => p.id === 'B').given_name, 'John'); // ALL CAPS tidied
  assert.equal(r.persons.find((p) => p.id === 'C').is_living, false);
  assert.equal(r.links.length, 2);
  assert.ok(!r.links.some((l) => l.parent_id === 'NOBODY'));
  assert.ok(r.fields.some((f) => f.person_id === 'A' && f.field === 'birth_place' && f.value === 'Chicago'));
});

test('never imports contact details', () => {
  const sql = toSQL(toRecords(parseFamilyScript(sample)));
  assert.ok(!/smith\.org|555 1234|Main St/.test(sql));
});

test('late relatives get family-visible birth dates; living get close family', () => {
  const r = toRecords(parseFamilyScript(sample));
  assert.equal(r.fields.find((f) => f.person_id === 'A' && f.field === 'birth_date').visibility, 'close');
  assert.equal(r.fields.find((f) => f.person_id === 'C' && f.field === 'birth_date'), undefined); // month-only date: year only
});

test('partnerships from mutual s tags and p lines', () => {
  const r = toRecords(parseFamilyScript(sample));
  const pairs = r.partners.map((p) => [p.person_a, p.person_b].sort().join('-')).sort();
  assert.deepEqual(pairs, ['A-B', 'A-D']);
});
