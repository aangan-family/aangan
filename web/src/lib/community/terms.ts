import type { Role, Sex, Side } from '../kin/roles';

/** A family word: the everyday spelling in English letters, and the same word in its own script. */
export interface Term { word: string; native?: string }

/** 'Chacha|चाचा' → { word: 'Chacha', native: 'चाचा' } */
export const T = (s: string | null | undefined): Term | null => {
  if (!s) return null;
  const [word, native] = s.split('|');
  return native ? { word, native } : { word };
};

/**
 * The words of one community, role by role. Leave out what has no everyday word: the English
 * relationship is always shown as well. "e…/y…" are the elder/younger forms; the plain one is used
 * when we can't tell who is older (or when the language doesn't care).
 */
export interface KinTable {
  father?: string; mother?: string;
  gfP?: string; gmP?: string; gfM?: string; gmM?: string;          // father's / mother's parents
  ggf?: string; ggm?: string; ggfM?: string; ggmM?: string;
  son?: string; daughter?: string;
  sonSon?: string; sonDau?: string; dauSon?: string; dauDau?: string;
  ggson?: string; ggdau?: string;
  husband?: string; wife?: string;
  fil?: string; mil?: string;                                        // spouse's father / mother
  spGf?: string; spGm?: string;                                      // spouse's grandparents
  sonInLaw?: string; dauInLaw?: string;
  coParentM?: string; coParentF?: string;                            // child's spouse's father / mother
  eBro?: string; yBro?: string; bro?: string; eSis?: string; ySis?: string; sis?: string;
  fEBro?: string; fYBro?: string; fBro?: string; fSis?: string; fESis?: string; fYSis?: string;   // father's siblings
  mBro?: string; mEBro?: string; mYBro?: string; mESis?: string; mYSis?: string; mSis?: string;   // mother's siblings
  fEBroW?: string; fYBroW?: string; fBroW?: string; fSisH?: string;  // their spouses
  mBroW?: string; mESisH?: string; mYSisH?: string; mSisH?: string;
  broSon?: string; broDau?: string; sisSon?: string; sisDau?: string;
  /** cousins: [male, female] for father's brother's (fm), father's sister's (ff), mother's brother's (mm), mother's sister's (mf) children */
  cousin?: Partial<Record<'fm' | 'ff' | 'mm' | 'mf', [string, string]>>;
  gpBroP?: string; gpSisP?: string; gpBroM?: string; gpSisM?: string; // grandparents' brothers and sisters
  hEBro?: string; hYBro?: string; hBro?: string; hESis?: string; hYSis?: string; hSis?: string;    // husband's brothers and sisters
  wEBro?: string; wYBro?: string; wBro?: string; wESis?: string; wYSis?: string; wSis?: string;    // wife's
  eBroW?: string; yBroW?: string; broW?: string; eSisH?: string; ySisH?: string; sisH?: string;    // brother's wife, sister's husband
  hEBroW?: string; hYBroW?: string; hBroW?: string; hSisH?: string;  // husband's brother's wife, husband's sister's husband
  wSisH?: string; wBroW?: string;                                    // wife's sister's husband, wife's brother's wife
}

const age = (older: boolean | null, e?: string, y?: string, any?: string): string | undefined => {
  if (older === null) return any ?? (e && e === y ? e : undefined);
  return (older ? e : y) ?? any;
};

/** The word for a role from a table. */
export function fromTable(t: KinTable, r: Role): Term | null {
  const by = (m?: string, f?: string) => (r.sex === 'm' ? m : r.sex === 'f' ? f : undefined);
  const sideBy = (s: Side | undefined, f: string | undefined, m: string | undefined) => (s === 'P' ? f : s === 'M' ? m : undefined);
  let w: string | undefined;
  switch (r.key) {
    case 'parent': w = by(t.father, t.mother); break;
    case 'grandparent': w = r.side === 'P' ? by(t.gfP, t.gmP) : r.side === 'M' ? by(t.gfM, t.gmM) : undefined; break;
    case 'ggparent': w = r.side === 'M' ? by(t.ggfM ?? t.ggf, t.ggmM ?? t.ggm) : by(t.ggf, t.ggm); break;
    case 'child': w = by(t.son, t.daughter); break;
    case 'grandchild': w = r.via === 'm' ? by(t.sonSon, t.sonDau) : r.via === 'f' ? by(t.dauSon, t.dauDau) : undefined; break;
    case 'ggchild': w = by(t.ggson, t.ggdau); break;
    case 'spouse': w = by(t.husband, t.wife); break;
    case 'spouse_parent': w = by(t.fil, t.mil); break;
    case 'spouse_grandparent': w = by(t.spGf, t.spGm); break;
    case 'child_spouse': w = by(t.sonInLaw, t.dauInLaw); break;
    case 'co_parent_in_law': w = by(t.coParentM, t.coParentF); break;
    case 'sibling': w = by(age(r.older, t.eBro, t.yBro, t.bro), age(r.older, t.eSis, t.ySis, t.sis)); break;
    case 'parent_sibling':
      w = r.side === 'P' ? by(age(r.older, t.fEBro, t.fYBro, t.fBro), age(r.older, t.fESis, t.fYSis, t.fSis))
        : r.side === 'M' ? by(age(r.older, t.mEBro, t.mYBro, t.mBro), age(r.older, t.mESis, t.mYSis, t.mSis)) : undefined;
      break;
    case 'parent_sibling_spouse':
      if (r.side === 'P') w = r.via === 'm' ? age(r.older, t.fEBroW, t.fYBroW, t.fBroW) : r.via === 'f' ? t.fSisH : undefined;
      else if (r.side === 'M') w = r.via === 'm' ? t.mBroW : r.via === 'f' ? age(r.older, t.mESisH, t.mYSisH, t.mSisH) : undefined;
      break;
    case 'sibling_child': w = r.via === 'm' ? by(t.broSon, t.broDau) : r.via === 'f' ? by(t.sisSon, t.sisDau) : undefined; break;
    case 'cousin': {
      const k = r.side && r.via ? (`${r.side === 'P' ? 'f' : 'm'}${r.via}` as 'fm') : null;
      const pair = k ? t.cousin?.[k] : undefined;
      w = pair ? by(pair[0], pair[1]) : undefined;
      break;
    }
    case 'grandparent_sibling': w = sideBy(r.side, by(t.gpBroP, t.gpSisP), by(t.gpBroM, t.gpSisM)); break;
    case 'spouse_sibling':
      w = r.ego === 'f' ? by(age(r.older, t.hEBro, t.hYBro, t.hBro), age(r.older, t.hESis, t.hYSis, t.hSis))
        : r.ego === 'm' ? by(age(r.older, t.wEBro, t.wYBro, t.wBro), age(r.older, t.wESis, t.wYSis, t.wSis)) : undefined;
      break;
    case 'sibling_spouse':
      w = r.via === 'm' && r.sex !== 'm' ? age(r.older, t.eBroW, t.yBroW, t.broW) : r.via === 'f' && r.sex !== 'f' ? age(r.older, t.eSisH, t.ySisH, t.sisH) : undefined;
      break;
    case 'spouse_sibling_spouse':
      if (r.ego === 'f') w = r.via === 'm' ? age(r.older, t.hEBroW, t.hYBroW, t.hBroW) : r.via === 'f' ? t.hSisH : undefined;
      else if (r.ego === 'm') w = r.via === 'f' ? t.wSisH : r.via === 'm' ? t.wBroW : undefined;
      break;
  }
  return T(w);
}

/**
 * South Indian (Dravidian) kinship: a parent's same-sex sibling's children are brothers and sisters, and the
 * opposite-sex sibling's children are cross-cousins with their own words (the same words as for in-laws).
 * `cross(sex, older)` gives those words; anything else comes from the table.
 */
export function dravidian(t: KinTable, cross: (sex: Sex, older: boolean | null) => string | undefined,
  crossChild: [string, string] /* a man's sister's (or a woman's brother's) son, daughter */) {
  return (r: Role): Term | null => {
    if (r.key === 'cousin') {
      if (!r.side || !r.via) return null;
      if ((r.side === 'P' ? 'm' : 'f') === r.via) return fromTable(t, { ...r, key: 'sibling' }); // parallel cousins
      return T(cross(r.sex, r.older));
    }
    if (r.key === 'sibling_child') {
      if (!r.ego || !r.via) return null;
      if (r.ego === r.via) return fromTable(t, { ...r, key: 'child' });
      return T(r.sex === 'm' ? crossChild[0] : r.sex === 'f' ? crossChild[1] : undefined);
    }
    return fromTable(t, r);
  };
}
