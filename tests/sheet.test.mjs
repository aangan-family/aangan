// node --test tests/sheet.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseDate, readSheet, rowsToRecords } from '../scripts/import-sheet.mjs';
import { toSQL } from '../scripts/import-familyscript.mjs';

const H = ['ID', 'First name', 'Surname', 'Gender', 'Father', 'Mother', 'Spouse', 'Wedding date', 'Birth date or year', 'Living (Yes or No)', 'Date or year of passing', 'Phone', 'Gothram (gotra)'];
const rows = (...r) => r.map((x) => Object.fromEntries(H.map((h, i) => [h, x[i] ?? ''])));

test('reads dates the Indian way (day first), or just the year', () => {
  assert.equal(parseDate('14-07-1968').value, '19680714');
  assert.equal(parseDate('4/7/1968').value, '19680704');
  assert.equal(parseDate('1968').value, '19680000');
  assert.equal(parseDate('07-1968').value, '19680700');
  assert.equal(parseDate('1968-07-14').value, '19680714');
  assert.equal(parseDate('14 Jul 1968').value, '19680714');
  assert.ok(parseDate('next year').bad);
  assert.ok(parseDate('31-31-1968').bad);
});

test('links parents and spouses by ID or by name, and numbers rows without an ID', () => {
  const r = rowsToRecords(rows(
    ['', 'Seshadri', 'Iyer', 'Male', '', '', 'Kamakshi Iyer', '1953', '1930', 'No', '2008'],
    ['', 'Kamakshi', 'Iyer', 'Female'],
    ['', 'Ramesh', 'Seshadri', '', 'Seshadri', 'Kamakshi', '', '', '11-03-1956'],
  ));
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.persons.map((p) => p.id), ['P001', 'P002', 'P003']);
  assert.equal(r.links.length, 2);
  assert.equal(r.partners.length, 1);
  assert.equal(r.partners[0].start_date, '19530000');
  assert.equal(r.persons[0].is_living, false);
  assert.equal(r.persons[2].gender, ''); // not a parent, so not guessed
});

test('says in plain words what to fix', () => {
  const r = rowsToRecords(rows(
    ['A', 'Ravi', '', 'Male'],
    ['B', 'Ravi', '', 'Male'],
    ['C', 'Asha', '', 'Female', 'Ravi', 'Nobody Here', '', '', 'soon'],
    ['A', 'Uma'],
  ));
  const all = r.problems.join('\n');
  assert.match(all, /Row 4: Father "Ravi" could be 2 people \(rows 2, 3\)/);
  assert.match(all, /Mother "Nobody Here" isn't in the sheet/);
  assert.match(all, /couldn't read the birth date "soon"/);
  assert.match(all, /the ID "A" is used twice/);
});

test('never imports phone numbers, emails or addresses, and says so', () => {
  const r = rowsToRecords(rows(['', 'Asha', 'Rao', 'Female', '', '', '', '', '1990', 'Yes', '', '+91 98450 00000', 'Kashyap']));
  assert.match(r.notes.join(), /Skipped Phone/);
  const sql = toSQL(r);
  assert.ok(!sql.includes('98450'));
  assert.ok(sql.includes("'gothram', 'Kashyap', 'family'"));
});

test('full birth dates are close family only; the tree keeps only the year', () => {
  const r = rowsToRecords(rows(['', 'Asha', '', 'Female', '', '', '', '', '14-07-1990']));
  assert.equal(r.persons[0].birth_year, 1990);
  assert.equal(r.persons[0].sort_key, '1990.001');
  assert.deepEqual(r.fields.find((f) => f.field === 'birth_date'), { person_id: 'P001', field: 'birth_date', value: '19900714', visibility: 'close' });
});

test('guesses a blank gender only from being someone\'s father or mother', () => {
  const r = rowsToRecords(rows(['D', 'Dad'], ['M', 'Mum'], ['K', 'Kid', '', '', 'D', 'M']));
  assert.equal(r.persons.find((p) => p.id === 'D').gender, 'm');
  assert.equal(r.persons.find((p) => p.id === 'M').gender, 'f');
});

test('CSV works too', () => {
  const rs = parseCsv('First name,Surname,Father\r\nRamesh,"Seshadri, Jr",\nArjun,Ramesh,Ramesh\n');
  const r = rowsToRecords(rs);
  assert.deepEqual(r.problems, []);
  assert.equal(r.persons[0].surname, 'Seshadri, Jr');
  assert.equal(r.links.length, 1);
});

test('the sample family imports cleanly', async () => {
  const r = rowsToRecords(await readSheet(new URL('../templates/sample-family.xlsx', import.meta.url).pathname));
  assert.deepEqual(r.problems, []);
  assert.equal(r.persons.length, 29);
  assert.ok(r.persons.filter((p) => !p.is_living).length >= 3);
});
