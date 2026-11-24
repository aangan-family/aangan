import type { Family } from '../family';
import { pathBetween } from '../kinship';

/**
 * Who `other` is to `ego`, in a form every Indian language can name.
 *
 * Indian kinship words turn on things English ignores: which side of the family (father's or mother's),
 * whether a relative is older or younger, and the sex of the person the link runs through (a father's
 * brother is Chacha/Kaka/Chithappa, a father's sister is Bua/Atya/Athai). A role carries all of that;
 * each community pack (lib/community/packs) turns a role into its own word.
 */
export type Sex = 'm' | 'f' | '';
/** P = through the father, M = through the mother */
export type Side = 'P' | 'M' | '';
export type RoleKey =
  | 'parent' | 'grandparent' | 'ggparent'
  | 'child' | 'grandchild' | 'ggchild'
  | 'spouse' | 'spouse_parent' | 'spouse_grandparent' | 'child_spouse' | 'co_parent_in_law'
  | 'sibling' | 'sibling_child' | 'sibling_spouse'
  | 'parent_sibling' | 'parent_sibling_spouse' | 'cousin' | 'grandparent_sibling'
  | 'spouse_sibling' | 'spouse_sibling_spouse';

export interface Role {
  key: RoleKey;
  /** the relative's sex */
  sex: Sex;
  /** the speaker's sex (Tamil, Telugu, Kannada and the in-law words depend on it) */
  ego: Sex;
  /** P = father's side, M = mother's side (grandparents, uncles and aunts, cousins) */
  side?: Side;
  /**
   * the sex of the relative the link runs through: the sibling (sibling_child, sibling_spouse), the parent's
   * sibling (cousin, parent_sibling_spouse), the child (grandchild), the spouse's sibling (spouse_sibling_spouse)
   */
  via?: Sex;
  /**
   * older or younger, where it matters; null if the birth years don't tell us.
   * sibling, cousin, spouse_sibling: than ego (spouse_sibling: than the spouse)
   * parent_sibling(_spouse), grandparent_sibling: than the parent / grandparent
   * sibling_spouse: the sibling than ego · spouse_sibling_spouse: the spouse's sibling than the spouse
   */
  older: boolean | null;
}

export function roleOf(f: Family, other: string, ego: string): Role | null {
  if (other === ego) return null;
  const path = pathBetween(f, ego, other);
  if (!path) return null;
  const ids = path.ids, pat = path.steps.join('');
  const sexAt = (i: number): Sex => { const g = f.byId.get(ids[i])?.gender; return g === 'm' || g === 'f' ? g : ''; };
  const key = (id: string) => { const p = f.byId.get(id); if (p?.sort_key) return p.sort_key; return p?.birth_year ? String(p.birth_year) : ''; };
  const older = (a: number, b: number): boolean | null => {
    const ka = key(ids[a]), kb = key(ids[b]);
    if (!ka || !kb || ka === kb) return null;
    return ka < kb;
  };
  const n = ids.length - 1;
  const side = (): Side => (sexAt(1) === 'm' ? 'P' : sexAt(1) === 'f' ? 'M' : '');
  const r = (k: RoleKey, extra: Partial<Role> = {}): Role => ({ key: k, sex: sexAt(n), ego: sexAt(0), older: null, ...extra });

  switch (pat) {
    case 'U': return r('parent');
    case 'UU': return r('grandparent', { side: side() });
    case 'UUU': return r('ggparent', { side: side() });
    case 'D': return r('child');
    case 'DD': return r('grandchild', { via: sexAt(1) });
    case 'DDD': return r('ggchild', { via: sexAt(1) });
    case 'S': return r('spouse');
    case 'SU': return r('spouse_parent', { via: sexAt(1) });
    case 'SUU': return r('spouse_grandparent', { via: sexAt(1) });
    case 'DS': return r('child_spouse', { via: sexAt(1) });
    case 'DSU': return r('co_parent_in_law');
    case 'UD': return r('sibling', { older: older(n, 0) });
    case 'UUD': return r('parent_sibling', { side: side(), older: older(n, 1) });
    case 'UUDS': return r('parent_sibling_spouse', { side: side(), via: sexAt(n - 1), older: older(n - 1, 1) });
    case 'UDD': return r('sibling_child', { via: sexAt(2) });
    case 'UUDD': return r('cousin', { side: side(), via: sexAt(3), older: older(n, 0) });
    case 'UUUD': return r('grandparent_sibling', { side: side(), older: older(n, 2) });
    case 'SUD': return r('spouse_sibling', { via: sexAt(1), older: older(n, 1) });
    case 'UDS': return r('sibling_spouse', { via: sexAt(2), older: older(2, 0) });
    case 'SUDS': return r('spouse_sibling_spouse', { via: sexAt(3), older: older(3, 1) });
    default: return null;
  }
}
