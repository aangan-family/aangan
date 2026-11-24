import { isEngaged } from './family';
import type { Family } from './family';

/** A sentence made of plain text, person names and the highlighted relationship. */
export type Seg = { t: 'text'; s: string } | { t: 'name'; id: string } | { t: 'rel'; s: string };
export interface Relation {
  sentence: Seg[];
  reverse?: Seg[];
  chain?: string[];      // the people linking the two, through the closest common ancestor
  tops?: string[];       // the closest common ancestor(s)
  marriedStart?: boolean; // first person reaches the chain through marriage
  marriedEnd?: boolean;
}

const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
const word = (g: string, m: string, f: string, n: string) => (g === 'm' ? m : g === 'f' ? f : n);
const great = (n: number) => (n <= 0 ? '' : n === 1 ? 'great-' : n === 2 ? 'great-great-' : `${n}× great-`);

const kid = (n: number, g: string) => (n === 1 ? word(g, 'son', 'daughter', 'child') : great(n - 2) + word(g, 'grandson', 'granddaughter', 'grandchild'));
const elder = (n: number, g: string) => (n === 1 ? word(g, 'father', 'mother', 'parent') : great(n - 2) + word(g, 'grandfather', 'grandmother', 'grandparent'));

/**
 * A is `a` generations below the common ancestor, B is `b` below. Names A relative to B.
 * Cousins in different generations are named by the link, not "once removed":
 * "first cousin’s son", or "father’s first cousin" (`upGender` is the gender of
 * B's parent or grandparent on that side, when known).
 */
export function kinTerm(a: number, b: number, g: string, half = false, upGender = ''): string {
  if (a === 0 && b === 0) return 'self';
  if (a === 0) return b === 1 ? word(g, 'father', 'mother', 'parent') : great(b - 2) + word(g, 'grandfather', 'grandmother', 'grandparent');
  if (b === 0) return a === 1 ? word(g, 'son', 'daughter', 'child') : great(a - 2) + word(g, 'grandson', 'granddaughter', 'grandchild');
  if (a === 1 && b === 1) return (half ? 'half-' : '') + word(g, 'brother', 'sister', 'sibling');
  if (a === 1) return great(b - 2) + word(g, 'uncle', 'aunt', 'uncle/aunt');
  if (b === 1) return (a === 2 ? '' : a === 3 ? 'grand' : great(a - 3) + 'grand') + word(g, 'nephew', 'niece', 'nephew/niece');
  const deg = Math.min(a, b) - 1, rem = Math.abs(a - b);
  const cousin = `${ORD[deg] || deg + 'th'} cousin`;
  if (!rem) return cousin;
  return a > b ? `${cousin}’s ${kid(rem, g)}` : `${elder(rem, upGender)}’s ${cousin}`;
}

function ancestors(f: Family, id: string): Map<string, number> {
  const m = new Map([[id, 0]]); const q = [id];
  while (q.length) { const c = q.shift()!; for (const p of f.parents.get(c) || []) if (!m.has(p)) { m.set(p, m.get(c)! + 1); q.push(p); } }
  return m;
}

interface Blood { a: number; b: number; s: number; tops: string[]; term: string }
export function bloodRelation(f: Family, A: string, B: string): Blood | null {
  const ma = ancestors(f, A), mb = ancestors(f, B);
  let best: { a: number; b: number; s: number } | null = null;
  for (const [c, da] of ma) if (mb.has(c)) { const s = da + mb.get(c)!; if (!best || s < best.s) best = { a: da, b: mb.get(c)!, s }; }
  if (!best) return null;
  const tops = [...ma].filter(([c, da]) => mb.has(c) && da === best!.a && mb.get(c) === best!.b).map(([c]) => c);
  let half = false;
  if (best.a === 1 && best.b === 1) {
    const pa = f.parents.get(A) || [], pb = f.parents.get(B) || [];
    half = !(pa.length === 2 && pb.length === 2 && pa.every((x) => pb.includes(x)));
  }
  // for "father’s cousin": which of B's parents (or grandparents) the link runs through
  let upGender = '';
  if (best.b > best.a && best.a > 1) {
    const up = upPath(f, B, tops[0], best.b);
    upGender = (up && f.byId.get(up[best.b - best.a])?.gender) || '';
  }
  return { ...best, tops, term: kinTerm(best.a, best.b, f.byId.get(A)?.gender || '', half, upGender) };
}

function upPath(f: Family, from: string, to: string, len: number): string[] | null {
  if (len === 0) return from === to ? [from] : null;
  for (const p of f.parents.get(from) || []) { const r = upPath(f, p, to, len - 1); if (r) return [from, ...r]; }
  return null;
}
function chainOf(f: Family, s: string, t: string, r: Blood): string[] {
  const top = r.tops[0];
  const up = upPath(f, s, top, r.a) || [s];
  const down = (upPath(f, t, top, r.b) || [t]).reverse();
  return [...up, ...down.slice(1)];
}

const T = (s: string): Seg => ({ t: 'text', s });
const N = (id: string): Seg => ({ t: 'name', id });
const R = (s: string): Seg => ({ t: 'rel', s });

export function describe(f: Family, A: string, B: string): Relation {
  if (A === B) return { sentence: [T('That’s the same person.')] };
  const g = (id: string) => f.byId.get(id)?.gender || '';
  const spw = (id: string, other?: string) => (other && isEngaged(f, id, other) ? word(g(id), 'fiancé', 'fiancée', 'fiancé(e)') : word(g(id), 'husband', 'wife', 'spouse'));
  const r = bloodRelation(f, A, B);
  if (r) {
    const back = bloodRelation(f, B, A)!;
    return {
      sentence: [N(A), T(' is '), N(B), T('’s '), R(r.term), T('.')],
      reverse: [N(B), T(' is '), N(A), T('’s ' + back.term + '.')],
      chain: chainOf(f, A, B, r), tops: r.tops,
    };
  }
  if ((f.spouses.get(A) || []).includes(B)) return { sentence: [N(A), T(' is '), N(B), T('’s '), R(spw(A, B)), T('.')] };

  type Opt = { s: number; rel: Relation };
  const opts: Opt[] = [];
  for (const s of f.spouses.get(B) || []) {
    const x = bloodRelation(f, A, s); if (!x) continue;
    let sentence: Seg[];
    const fut = isEngaged(f, B, s) ? 'future ' : '';
    if (x.a === 0 && x.b === 1) sentence = [N(A), T(' is '), N(B), T('’s '), R(fut + word(g(A), 'father', 'mother', 'parent') + '-in-law'), T(' ('), N(s), T(`’s ${x.term}).`)];
    else if (x.a === 1 && x.b === 1) sentence = [N(A), T(' is '), N(B), T('’s '), R(fut + word(g(A), 'brother', 'sister', 'sibling') + '-in-law'), T(' ('), N(s), T(`’s ${x.term}).`)];
    else sentence = [N(A), T(' is the '), R(x.term), T(' of '), N(B), T(`’s ${spw(s, B)}, `), N(s), T('.')];
    opts.push({ s: x.s + 1, rel: { sentence, chain: chainOf(f, A, s, x), tops: x.tops, marriedEnd: true } });
  }
  for (const s of f.spouses.get(A) || []) {
    const x = bloodRelation(f, s, B); if (!x) continue;
    let sentence: Seg[];
    const eng = isEngaged(f, A, s), fut = eng ? 'future ' : '', wed = eng ? ' (engaged to ' : ' (married to ';
    if (x.a === 1 && x.b === 0) sentence = [N(A), T(' is '), N(B), T('’s '), R(fut + word(g(A), 'son', 'daughter', 'child') + '-in-law'), T(wed), N(B), T(`’s ${x.term}, `), N(s), T(').')];
    else if (x.a === 1 && x.b === 1) sentence = [N(A), T(' is '), N(B), T('’s '), R(fut + word(g(A), 'brother', 'sister', 'sibling') + '-in-law'), T(wed), N(B), T(`’s ${x.term}, `), N(s), T(').')];
    else sentence = [N(A), T(' is the '), R(spw(A, s)), T(' of '), N(B), T(`’s ${x.term}, `), N(s), T('.')];
    opts.push({ s: x.s + 1, rel: { sentence, chain: chainOf(f, s, B, x), tops: x.tops, marriedStart: true } });
  }
  for (const sa of f.spouses.get(A) || []) for (const sb of f.spouses.get(B) || []) {
    const x = bloodRelation(f, sa, sb); if (!x) continue;
    const sentence: Seg[] = x.a === 1 && x.b === 1
      ? [N(A), T(' and '), N(B), T(isEngaged(f, A, sa) || isEngaged(f, B, sb) ? ' are married or engaged to siblings: ' : ' are married to siblings: '), N(sa), T(' is '), N(sb), T(`’s ${x.term}.`)]
      : [N(A), T(`’s ${spw(sa, A)} `), N(sa), T(' is the '), R(x.term), T(' of '), N(B), T(`’s ${spw(sb, B)}, `), N(sb), T('.')];
    opts.push({ s: x.s + 2, rel: { sentence, chain: chainOf(f, sa, sb, x), tops: x.tops, marriedStart: true, marriedEnd: true } });
  }
  if (!opts.length) {
    // further out (e.g. through an in-law's family): spell out the path, step by step
    const path = pathBetween(f, B, A);
    if (!path) return { sentence: [T('These two aren’t connected in this tree.')] };
    return { sentence: [N(A), T(' is '), N(B), T('’s '), R(chainWords(f, path)), T('.')], chain: [...path.ids].reverse() };
  }
  opts.sort((x, y) => x.s - y.s);
  return opts[0].rel;
}

export type Step = 'U' | 'D' | 'S';
export interface Path { ids: string[]; steps: Step[] }

/** Shortest route from one person to another through parents (U), children (D) and spouses (S). */
export function pathBetween(f: Family, from: string, to: string): Path | null {
  if (from === to) return { ids: [from], steps: [] };
  // Dijkstra with marriages costing a little more, so blood routes win ties
  const cost = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, [string, Step]>();
  const open = new Set([from]);
  while (open.size) {
    let cur = ''; let best = Infinity;
    for (const x of open) { const c = cost.get(x)!; if (c < best) { best = c; cur = x; } }
    open.delete(cur);
    if (cur === to) break;
    const edges: [string[] | undefined, Step, number][] = [[f.parents.get(cur), 'U', 1], [f.children.get(cur), 'D', 1], [f.spouses.get(cur), 'S', 1.1]];
    for (const [ids, st, w] of edges) for (const n of ids || []) {
      const c = best + w;
      if (c < (cost.get(n) ?? Infinity)) { cost.set(n, c); prev.set(n, [cur, st]); open.add(n); }
    }
  }
  if (!prev.has(to)) return null;
  const ids = [to]; const steps: Step[] = [];
  for (let x = to; x !== from;) { const [p, st] = prev.get(x)!; ids.unshift(p); steps.unshift(st); x = p; }
  return { ids, steps };
}

/** "wife’s sister’s husband": the path from ego, in words. */
export function chainWords(f: Family, p: Path): string {
  const g = (id: string) => f.byId.get(id)?.gender || '';
  const words: string[] = [];
  for (let i = 0; i < p.steps.length; i++) {
    const id = p.ids[i + 1];
    if (p.steps[i] === 'U' && p.steps[i + 1] === 'D') { const sib = p.ids[i + 2]; words.push(word(g(sib), 'brother', 'sister', 'sibling')); i++; continue; }
    words.push(p.steps[i] === 'U' ? word(g(id), 'father', 'mother', 'parent') : p.steps[i] === 'D' ? word(g(id), 'son', 'daughter', 'child') : isEngaged(f, p.ids[i], id) ? word(g(id), 'fiancé', 'fiancée', 'fiancé(e)') : word(g(id), 'husband', 'wife', 'spouse'));
  }
  return words.join('’s ');
}
