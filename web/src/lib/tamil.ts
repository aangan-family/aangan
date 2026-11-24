import type { Family } from './family';
import { pathBetween } from './kinship';

/**
 * What `ego` calls `other` in Tamil, the way Iyer families say it: Periyappa,
 * Athai, Mama, Athimber, Manni, Sambandhi… Returns null when there is no
 * everyday word (the English relationship is always shown as well).
 *
 * Tamil kinship turns on two things English ignores: whether a relative is
 * older or younger (Periyappa vs Chithappa, Anna vs Thambi), and whether the
 * link runs through a same-sex or opposite-sex sibling (a father's brother's
 * son is a brother; a father's sister's son is Athai's son).
 */
export function tamilTerm(f: Family, other: string, ego: string): string | null {
  if (other === ego) return null;
  const path = pathBetween(f, ego, other);
  if (!path) return null;
  const ids = path.ids, pat = path.steps.join('');
  const g = (i: number) => f.byId.get(ids[i])?.gender || '';
  const male = (i: number) => g(i) === 'm', female = (i: number) => g(i) === 'f';
  const known = (i: number) => male(i) || female(i);
  const key = (id: string) => {
    const p = f.byId.get(id);
    if (p?.sort_key) return p.sort_key;
    return p?.birth_year ? String(p.birth_year) : '';
  };
  /** true if ids[a] is older than ids[b]; null if we can't tell */
  const older = (a: number, b: number): boolean | null => {
    const ka = key(ids[a]), kb = key(ids[b]);
    if (!ka || !kb || ka === kb) return null;
    return ka < kb;
  };
  const by = (i: number, m: string, w: string) => (male(i) ? m : female(i) ? w : null);
  const n = ids.length - 1; // index of `other`

  switch (pat) {
    case 'U': return by(n, 'Appa', 'Amma');
    case 'UU': return by(n, 'Thatha', 'Paati');
    case 'UUU': return by(n, 'Kollu thatha', 'Kollu paati');
    case 'D': return by(n, 'Magan', 'Magal');
    case 'DD': return by(n, 'Peran', 'Pethi');
    case 'DDD': return by(n, 'Kollu peran', 'Kollu pethi');
    case 'S': return by(n, 'Aathukaarar', 'Aathukaari');
    case 'SU': return by(n, 'Maamanar', 'Maamiyar');
    case 'SUU': return by(n, 'Thatha', 'Paati');
    case 'DS': return by(n, 'Maapillai', 'Marumagal');
    case 'DSU': return known(n) ? 'Sambandhi' : null;
    case 'UD': return sibling(n, 0);
    case 'UUD': return uncle();
    case 'UUDS': {
      const u = uncleAt(n - 1);
      return ({ Periyappa: 'Periyamma', Chithappa: 'Chithi', Athai: 'Athimber', Mama: 'Mami', Periyamma: 'Periyappa', Chithi: 'Chithappa' } as Record<string, string>)[u || ''] || null;
    }
    case 'UDD': {
      // a man's brother's child, or a woman's sister's child, is a son or daughter; across, Marumagan/Marumagal
      if (!known(0) || !known(2)) return null;
      return g(0) === g(2) ? by(n, 'Magan', 'Magal') : by(n, 'Marumagan', 'Marumagal');
    }
    case 'UUDD': {
      if (!known(1) || !known(3)) return null;
      if (g(1) === g(3)) return sibling(n, 0); // parallel cousins are brothers and sisters
      const who = male(3) ? 'Mama' : 'Athai';
      return by(n, `${who} paiyan`, `${who} ponnu`);
    }
    case 'UUUD': {
      if (female(n)) return 'Paati';
      if (!male(n)) return null;
      const o = older(n, 2);
      return o === null ? 'Thatha' : o ? 'Periya thatha' : 'Chinna thatha';
    }
    case 'SUD': {
      // the spouse's brothers and sisters
      if (female(0)) { // husband's family
        if (female(n)) return 'Naathanaar';
        if (male(n)) return older(n, 1) === false ? 'Kozhundhanar' : null;
      }
      if (male(0)) { // wife's family
        if (male(n)) return 'Machinan';
        if (female(n)) return older(n, 1) === false ? 'Machini' : null;
      }
      return null;
    }
    case 'UDS': {
      // a brother's wife or a sister's husband
      const o = older(2, 0);
      if (male(2) && female(n) && o) return 'Manni';
      if (female(2) && male(n) && o) return 'Athimber';
      return null;
    }
    case 'SUDS': {
      if (male(0) && female(3) && male(n)) return 'Sagalai';     // wife's sister's husband (co-brother)
      if (female(0) && male(3) && female(n)) return 'Ooragathi'; // husband's brother's wife (co-sister)
      return null;
    }
    default: return null;
  }

  function sibling(i: number, of: number): string | null {
    const o = older(i, of);
    if (male(i)) return o === null ? 'Anna / Thambi' : o ? 'Anna' : 'Thambi';
    if (female(i)) return o === null ? 'Akka / Thangai' : o ? 'Akka' : 'Thangai';
    return null;
  }
  function uncleAt(i: number): string | null {
    // ids[1] is ego's parent; ids[i] is that parent's brother or sister
    const o = older(i, 1);
    if (male(1)) { // father's side
      if (female(i)) return 'Athai';
      if (male(i)) return o === null ? 'Periyappa / Chithappa' : o ? 'Periyappa' : 'Chithappa';
    }
    if (female(1)) { // mother's side
      if (male(i)) return 'Mama';
      if (female(i)) return o === null ? 'Periyamma / Chithi' : o ? 'Periyamma' : 'Chithi';
    }
    return null;
  }
  function uncle() { return uncleAt(n); }
}
