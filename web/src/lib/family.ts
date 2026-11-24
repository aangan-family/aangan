import type { ParentLink, Partnership, Person } from './types';

export interface Family {
  byId: Map<string, Person>;
  parents: Map<string, string[]>;
  children: Map<string, string[]>;
  spouses: Map<string, string[]>;
  /** couples recorded as engaged, not married (0041): pair keys from coupleKey() */
  engaged: Set<string>;
  /** each couple's recorded status (married or engaged), by coupleKey() */
  coupleKind: Map<string, string>;
  root: string | null;
  branchRoot: string | null;
  blood: Set<string>;
  /** tree children: each descendant hangs under one blood parent */
  kids: Map<string, string[]>;
  gen: Map<string, number>;
  branch: Map<string, string>;
  /** married-in families: everyone reached through a spouse who married into the main tree */
  sides: Side[];
  /** for people on a side: the married-in person they are connected through */
  via: Map<string, string>;
  /** the person each row hangs under in the tree list (main tree and sides) */
  hangs: Map<string, string>;
  others: string[];
  maxGen: number;
}

export interface Side {
  /** the person who married into the main tree */
  through: string;
  /** everyone on this side, not counting `through` */
  members: string[];
  /** the top rows of this side's tree */
  tops: string[];
}

const birthKey = (p?: Person) => (p?.sort_key && !p.sort_key.startsWith('0000') ? p.sort_key : p?.birth_year ? String(p.birth_year) + '0000' : '99999999');

export const coupleKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
/** true when the two are recorded as engaged rather than married */
export const isEngaged = (f: { engaged?: Set<string> }, a: string, b: string) => !!f.engaged?.has(coupleKey(a, b));

/** the couple's recorded status: 'married' or 'engaged' */
export const kindOf = (f: { coupleKind?: Map<string, string> }, a: string, b: string) => f.coupleKind?.get(coupleKey(a, b)) || 'married';

export function buildFamily(persons: Person[], links: ParentLink[], partners: Partnership[]): Family {
  const byId = new Map(persons.map((p) => [p.id, p]));
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  const spouses = new Map<string, string[]>();
  const engaged = new Set<string>();
  const coupleKind = new Map<string, string>();
  const push = (m: Map<string, string[]>, k: string, v: string) => {
    const a = m.get(k); if (a) { if (!a.includes(v)) a.push(v); } else m.set(k, [v]);
  };
  for (const l of links) {
    if (!byId.has(l.child_id) || !byId.has(l.parent_id)) continue;
    push(parents, l.child_id, l.parent_id);
    push(children, l.parent_id, l.child_id);
  }
  for (const p of partners) {
    if (!byId.has(p.person_a) || !byId.has(p.person_b)) continue;
    push(spouses, p.person_a, p.person_b);
    push(spouses, p.person_b, p.person_a);
    if (p.kind === 'engaged') engaged.add(coupleKey(p.person_a, p.person_b));
    coupleKind.set(coupleKey(p.person_a, p.person_b), p.kind);
  }
  const byBirth = (a: string, b: string) => birthKey(byId.get(a)).localeCompare(birthKey(byId.get(b)));
  for (const arr of children.values()) arr.sort(byBirth);

  const countDesc = (id: string, seen = new Set<string>()): number => {
    let c = 0;
    for (const k of children.get(id) || []) if (!seen.has(k)) { seen.add(k); c += 1 + countDesc(k, seen); }
    return c;
  };
  // the founder: a person with no recorded parents and the most descendants
  let root: string | null = null, best = -1;
  for (const p of persons) {
    if (parents.has(p.id)) continue;
    const n = countDesc(p.id);
    if (n > best || (n === best && p.gender === 'm')) { best = n; root = p.id; }
  }
  const blood = new Set<string>();
  if (root) (function walk(i: string) { if (blood.has(i)) return; blood.add(i); for (const k of children.get(i) || []) walk(k); })(root);

  const kids = new Map<string, string[]>();
  for (const id of blood) {
    if (id === root) continue;
    const ps = (parents.get(id) || []).filter((x) => blood.has(x));
    const host = ps.find((x) => byId.get(x)?.gender === 'm') || ps[0];
    if (host) push(kids, host, id);
  }
  for (const arr of kids.values()) arr.sort(byBirth);

  const gen = new Map<string, number>();
  if (root) (function g(i: string, n: number) {
    gen.set(i, n);
    for (const s of spouses.get(i) || []) if (!gen.has(s)) gen.set(s, n);
    for (const k of kids.get(i) || []) g(k, n + 1);
  })(root, 1);

  // the generation where the family first branches out (e.g. a founding couple's ten children)
  let branchRoot = root;
  while (branchRoot && (kids.get(branchRoot) || []).length === 1) branchRoot = kids.get(branchRoot)![0];
  const branch = new Map<string, string>();
  for (const c of (branchRoot && kids.get(branchRoot)) || []) {
    (function w(i: string) {
      branch.set(i, c);
      for (const s of spouses.get(i) || []) if (!blood.has(s)) branch.set(s, c);
      for (const k of kids.get(i) || []) w(k);
    })(c);
  }
  const hangs = new Map<string, string>();
  for (const [host, ks] of kids) for (const k of ks) hangs.set(k, host);

  // Married-in families. Start from each person who married into the main tree and walk
  // outwards through parents, children and spouses, without re-entering the main tree.
  const main = new Set<string>(blood);
  for (const b of blood) for (const sp of spouses.get(b) || []) main.add(sp);
  const via = new Map<string, string>();
  const sides: Side[] = [];
  const marriedIn = [...main].filter((x) => !blood.has(x)).sort((a, b) => (gen.get(a) ?? 99) - (gen.get(b) ?? 99) || byBirth(a, b));
  for (const m of marriedIn) {
    const members: string[] = [];
    const q: string[] = [m];
    while (q.length) {
      const c = q.shift()!;
      const g = gen.get(c) ?? 0;
      const step = (ids: string[] | undefined, dg: number) => {
        for (const n of ids || []) {
          if (main.has(n) || via.has(n)) continue;
          via.set(n, m); members.push(n); gen.set(n, g + dg); q.push(n);
        }
      };
      step(parents.get(c), -1); step(children.get(c), 1); step(spouses.get(c), 0);
    }
    if (!members.length) continue;
    const inSide = new Set([...members, m]);
    // tree rows: each person hangs under a parent on the same side (father first, as in the main tree)
    for (const x of inSide) {
      const ps = (parents.get(x) || []).filter((y) => inSide.has(y));
      const host = ps.find((y) => byId.get(y)?.gender === 'm') || ps[0];
      if (host) { push(kids, host, x); hangs.set(x, host); }
    }
    for (const arr of kids.values()) arr.sort(byBirth);
    const hasRow = (x: string) => hangs.has(x) && inSide.has(hangs.get(x)!);
    const tops: string[] = [];
    for (const x of members) {
      if (hasRow(x)) continue;
      // a spouse without parents here is shown next to their partner, not as a row of their own
      if ((spouses.get(x) || []).some((y) => inSide.has(y) && (hasRow(y) || tops.includes(y)))) continue;
      tops.push(x);
    }
    tops.sort((a, b) => (gen.get(a)! - gen.get(b)!) || byBirth(a, b));
    sides.push({ through: m, members, tops });
  }

  const others = persons.filter((p) => !gen.has(p.id)).map((p) => p.id);
  let maxGen = 0; for (const [id, v] of gen) if (!via.has(id)) maxGen = Math.max(maxGen, v);
  return { byId, parents, children, spouses, engaged, coupleKind, root, branchRoot, blood, kids, gen, branch, sides, via, hangs, others, maxGen };
}

/** The row a person appears on in the tree list: their own, or their partner's. */
export function rowOf(f: Family, id: string): string | null {
  // someone who married into the main tree is found next to their partner there
  const bloodPartner = f.blood.has(id) ? null : (f.spouses.get(id) || []).find((x) => f.blood.has(x));
  if (bloodPartner) return rowOf(f, bloodPartner);
  const isRow = (x: string) => x === f.root || f.hangs.has(x) || f.sides.some((s) => s.tops.includes(x));
  if (isRow(id)) return id;
  return (f.spouses.get(id) || []).find(isRow) || null;
}

export const hostOf = (f: Family, id: string) =>
  f.blood.has(id) ? id : (f.spouses.get(id) || []).find((s) => f.blood.has(s)) || null;

export function siblingsOf(f: Family, id: string): string[] {
  const ps = f.parents.get(id) || [];
  const out = new Set<string>();
  for (const p of ps) for (const c of f.children.get(p) || []) if (c !== id) out.add(c);
  return [...out].sort((a, b) => birthKey(f.byId.get(a)).localeCompare(birthKey(f.byId.get(b))));
}

export function lineageOf(f: Family, id: string): string[] {
  const chain: string[] = [];
  let cur: string | undefined = id;
  const guard = new Set<string>();
  while (cur && !guard.has(cur)) {
    guard.add(cur); chain.unshift(cur);
    cur = (f.parents.get(cur) || []).find((x) => f.blood.has(x));
  }
  return chain;
}

export function countDescendants(f: Family, id: string): number {
  let c = 0; (function w(i: string) { for (const k of f.kids.get(i) || []) { c++; w(k); } })(id); return c;
}

/**
 * Who would lose their connection to the founder if `id` were removed from the tree
 * (walking parents, children and spouses). Used to warn admins before a removal.
 */
export function cutOffBy(f: Family, id: string): string[] {
  const start = !f.root ? null : f.root !== id ? f.root : (f.spouses.get(id) || [])[0] || (f.children.get(id) || [])[0] || null;
  const seen = new Set<string>([id]);
  if (start) {
    const q = [start]; seen.add(start);
    while (q.length) {
      const x = q.pop()!;
      for (const y of [...(f.parents.get(x) || []), ...(f.children.get(x) || []), ...(f.spouses.get(x) || [])]) {
        if (!seen.has(y)) { seen.add(y); q.push(y); }
      }
    }
  }
  return [...f.byId.keys()].filter((x) => !seen.has(x));
}
