import type { Role, RoleKey, Sex, Side } from '../kin/roles';
import type { Pack } from './packs';

/**
 * The review sheet for a native speaker: every relationship the site can name, asked of a pack in the same
 * order, with that pack's current word. Written to docs/review/<community>.csv by `npm run review-kit`
 * (and checked by review.test.ts, so the sheets never fall behind the packs).
 */
export interface ReviewRow { id: string; english: string; speaker: string; role: Role }

const r = (key: RoleKey, sex: Sex, opts: { ego?: Sex; side?: Side; via?: Sex; older?: boolean | null } = {}): Role =>
  ({ key, sex, ego: opts.ego ?? 'm', side: opts.side, via: opts.via, older: opts.older ?? null });
const who = (ego: Sex) => (ego === 'f' ? 'a woman' : ego === 'm' ? 'a man' : 'anyone');

function rows(): ReviewRow[] {
  const out: ReviewRow[] = [];
  const add = (id: string, english: string, role: Role, speakerMatters = false) =>
    out.push({ id, english, speaker: speakerMatters ? who(role.ego) : 'anyone', role });
  const age = (o: boolean) => (o ? 'elder' : 'younger');

  add('father', 'Father', r('parent', 'm')); add('mother', 'Mother', r('parent', 'f'));
  for (const [side, s] of [['P', "Father's"], ['M', "Mother's"]] as const) {
    add(`gf${side}`, `${s} father`, r('grandparent', 'm', { side })); add(`gm${side}`, `${s} mother`, r('grandparent', 'f', { side }));
    add(`ggf${side}`, `${s} grandfather`, r('ggparent', 'm', { side })); add(`ggm${side}`, `${s} grandmother`, r('ggparent', 'f', { side }));
  }
  add('son', 'Son', r('child', 'm')); add('daughter', 'Daughter', r('child', 'f'));
  for (const [via, s] of [['m', "Son's"], ['f', "Daughter's"]] as const) {
    add(`${via}Son`, `${s} son`, r('grandchild', 'm', { via })); add(`${via}Dau`, `${s} daughter`, r('grandchild', 'f', { via }));
  }
  add('ggson', 'Great-grandson', r('ggchild', 'm')); add('ggdau', 'Great-granddaughter', r('ggchild', 'f'));
  add('husband', 'Husband', r('spouse', 'm', { ego: 'f' }), true); add('wife', 'Wife', r('spouse', 'f', { ego: 'm' }), true);
  for (const ego of ['f', 'm'] as const) {
    const sp = ego === 'f' ? "Husband's" : "Wife's";
    add(`fil-${ego}`, `${sp} father`, r('spouse_parent', 'm', { ego }), true); add(`mil-${ego}`, `${sp} mother`, r('spouse_parent', 'f', { ego }), true);
    add(`spgf-${ego}`, `${sp} grandfather`, r('spouse_grandparent', 'm', { ego }), true); add(`spgm-${ego}`, `${sp} grandmother`, r('spouse_grandparent', 'f', { ego }), true);
  }
  add('sonInLaw', "Daughter's husband", r('child_spouse', 'm')); add('dauInLaw', "Son's wife", r('child_spouse', 'f'));
  add('coParentM', "Son's or daughter's father-in-law", r('co_parent_in_law', 'm')); add('coParentF', "Son's or daughter's mother-in-law", r('co_parent_in_law', 'f'));
  for (const ego of ['m', 'f'] as const) for (const o of [true, false]) {
    add(`bro-${age(o)}-${ego}`, `${age(o) === 'elder' ? 'Elder' : 'Younger'} brother`, r('sibling', 'm', { ego, older: o }), true);
    add(`sis-${age(o)}-${ego}`, `${age(o) === 'elder' ? 'Elder' : 'Younger'} sister`, r('sibling', 'f', { ego, older: o }), true);
  }
  for (const [side, s] of [['P', "Father's"], ['M', "Mother's"]] as const) for (const o of [true, false]) {
    add(`${side}bro-${age(o)}`, `${s} ${age(o)} brother`, r('parent_sibling', 'm', { side, older: o }));
    add(`${side}sis-${age(o)}`, `${s} ${age(o)} sister`, r('parent_sibling', 'f', { side, older: o }));
    add(`${side}broW-${age(o)}`, `${s} ${age(o)} brother's wife`, r('parent_sibling_spouse', 'f', { side, via: 'm', older: o }));
    add(`${side}sisH-${age(o)}`, `${s} ${age(o)} sister's husband`, r('parent_sibling_spouse', 'm', { side, via: 'f', older: o }));
  }
  for (const ego of ['m', 'f'] as const) for (const [via, s] of [['m', "Brother's"], ['f', "Sister's"]] as const) {
    add(`${via}sibSon-${ego}`, `${s} son`, r('sibling_child', 'm', { ego, via }), true);
    add(`${via}sibDau-${ego}`, `${s} daughter`, r('sibling_child', 'f', { ego, via }), true);
  }
  for (const ego of ['m', 'f'] as const) for (const o of [true, false]) {
    add(`broW-${age(o)}-${ego}`, `${age(o) === 'elder' ? 'Elder' : 'Younger'} brother's wife`, r('sibling_spouse', 'f', { ego, via: 'm', older: o }), true);
    add(`sisH-${age(o)}-${ego}`, `${age(o) === 'elder' ? 'Elder' : 'Younger'} sister's husband`, r('sibling_spouse', 'm', { ego, via: 'f', older: o }), true);
  }
  const cousinOf: [Side, Sex, string][] = [['P', 'm', "Father's brother's"], ['P', 'f', "Father's sister's"], ['M', 'm', "Mother's brother's"], ['M', 'f', "Mother's sister's"]];
  for (const [side, via, s] of cousinOf) for (const o of [true, false]) for (const ego of ['m', 'f'] as const) {
    add(`cousin-${side}${via}-son-${age(o)}-${ego}`, `${s} son (${age(o)} than you)`, r('cousin', 'm', { side, via, ego, older: o }), true);
    add(`cousin-${side}${via}-dau-${age(o)}-${ego}`, `${s} daughter (${age(o)} than you)`, r('cousin', 'f', { side, via, ego, older: o }), true);
  }
  for (const [side, s] of [['P', "Father's"], ['M', "Mother's"]] as const) {
    add(`${side}gpBro`, `${s} parent's brother`, r('grandparent_sibling', 'm', { side })); add(`${side}gpSis`, `${s} parent's sister`, r('grandparent_sibling', 'f', { side }));
  }
  for (const o of [true, false]) {
    add(`hBro-${age(o)}`, `Husband's ${age(o)} brother`, r('spouse_sibling', 'm', { ego: 'f', older: o }), true);
    add(`hSis-${age(o)}`, `Husband's ${age(o)} sister`, r('spouse_sibling', 'f', { ego: 'f', older: o }), true);
    add(`wBro-${age(o)}`, `Wife's ${age(o)} brother`, r('spouse_sibling', 'm', { ego: 'm', older: o }), true);
    add(`wSis-${age(o)}`, `Wife's ${age(o)} sister`, r('spouse_sibling', 'f', { ego: 'm', older: o }), true);
    add(`hBroW-${age(o)}`, `Husband's ${age(o)} brother's wife`, r('spouse_sibling_spouse', 'f', { ego: 'f', via: 'm', older: o }), true);
  }
  add('hSisH', "Husband's sister's husband", r('spouse_sibling_spouse', 'm', { ego: 'f', via: 'f' }), true);
  add('wSisH', "Wife's sister's husband", r('spouse_sibling_spouse', 'm', { ego: 'm', via: 'f' }), true);
  add('wBroW', "Wife's brother's wife", r('spouse_sibling_spouse', 'f', { ego: 'm', via: 'm' }), true);
  return out;
}

export const REVIEW_ROWS: ReviewRow[] = rows();

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const line = (cells: string[]) => cells.map(csvCell).join(',');

export const REVIEW_COLUMNS = [
  'Row', 'Relationship', 'Who is speaking', 'Our word (English letters)', 'Our word (own script)',
  'Correct? (Yes / No / Depends)', 'Better word (English letters)', 'Better word (own script)', 'Where or who says it differently', 'Notes',
];

/** CSV for one pack: family words, then menus and labels. UTF-8 with a BOM so Excel shows every script. */
export function reviewSheet(p: Pack): string {
  const out: string[] = [line(REVIEW_COLUMNS)];
  let n = 0;
  const key = (t: ReturnType<Pack['term']>) => (t?.word ?? '') + '|' + (t?.native ?? '');
  const skip = new Set<string>();
  for (const row of REVIEW_ROWS) {
    if (skip.has(row.id)) continue;
    const t = p.term(row.role);
    let speaker = row.speaker;
    // the same relationship asked for a man and a woman speaking: one row ("anyone") when the word is the same
    const twin = /-(m|f)$/.test(row.id) ? REVIEW_ROWS.find((x) => x.id === row.id.slice(0, -1) + (row.id.endsWith('m') ? 'f' : 'm') && x.english === row.english) : undefined;
    if (twin && key(p.term(twin.role)) === key(t)) { speaker = 'anyone'; skip.add(twin.id); }
    out.push(line([String(++n), row.english, speaker, t?.word ?? '', t?.native ?? '', '', '', '', '', t?.word ? '' : 'No word yet: the English is shown. Add one if families use it.']));
  }
  out.push('');
  out.push(line(['', 'Menus and labels', '', 'English', 'Our translation', 'Correct? (Yes / No / Depends)', '', 'Better translation', '', 'Notes']));
  const extra: [string, string][] = [
    ['Greeting used in wishes', p.hello],
    ['What the family line is called (gotra)', p.labels.gothram],
    ['What the family deity is called', p.labels.kuladeivam],
  ];
  for (const [what, v] of extra) out.push(line([String(++n), what, '', '', v, '', '', '', '', '']));
  for (const [en, tr] of Object.entries(p.menus)) out.push(line([String(++n), 'Menu', '', en, tr, '', '', '', '', '']));
  return '﻿' + out.join('\n') + '\n';
}
