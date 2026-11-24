import type { Family } from './family';
import { roleOf } from './kin/roles';
import { PACKS } from './community/packs';

/**
 * What `ego` calls `other` in Tamil (Periyappa, Athai, Mama, Athimber, Manni, Sambandhi…), as plain
 * English letters. Kept for the Tamil tests; the site uses lib/community (every language).
 */
export function tamilTerm(f: Family, other: string, ego: string): string | null {
  const r = roleOf(f, other, ego);
  return (r && PACKS.tamil.term(r)?.word) || null;
}
