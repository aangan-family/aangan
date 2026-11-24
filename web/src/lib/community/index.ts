import { useSyncExternalStore } from 'react';
import type { Family } from '../family';
import { roleOf } from '../kin/roles';
import { COMMUNITY } from '../site';
import { FESTIVAL_GROUPS, isCommunity, PACKS, type CommunityId, type FestivalGroup, type Pack } from './packs';
import type { Term } from './terms';

export * from './packs';
export type { Term } from './terms';

/**
 * Which traditions this person sees: their own choice on this device (Theme → Traditions), else the
 * family's default (site.config.json → community). Married-in relatives often pick their own.
 */
const KEY = 'fam-community', FKEY = 'fam-festivals', EVT = 'fam-community';
export const FAMILY_DEFAULT: CommunityId = isCommunity(COMMUNITY) ? COMMUNITY : 'english';

export function savedCommunity(): CommunityId {
  try { const v = localStorage.getItem(KEY); return isCommunity(v) ? v : FAMILY_DEFAULT; } catch { return FAMILY_DEFAULT; }
}
export function setCommunity(id: CommunityId) {
  try { localStorage.setItem(KEY, id); localStorage.removeItem(FKEY); } catch { /* storage off */ }
  if (typeof dispatchEvent !== 'undefined') dispatchEvent(new Event(EVT));
}
const subscribe = (f: () => void) => { addEventListener(EVT, f); return () => removeEventListener(EVT, f); };
export const useCommunityId = () => useSyncExternalStore(subscribe, savedCommunity, () => FAMILY_DEFAULT);
export const usePack = (): Pack => PACKS[useCommunityId()];
export const currentPack = (): Pack => PACKS[savedCommunity()];

/** Festival groups shown in the calendar: the person's own choice, else their pack's. */
export function savedFestivals(): FestivalGroup[] {
  try {
    const v = JSON.parse(localStorage.getItem(FKEY) || 'null');
    if (Array.isArray(v)) return v.filter((g) => FESTIVAL_GROUPS.some(([k]) => k === g));
  } catch { /* fall through */ }
  return currentPack().festivals;
}
export function setFestivals(groups: FestivalGroup[]) {
  try { localStorage.setItem(FKEY, JSON.stringify(groups)); } catch { /* storage off */ }
  if (typeof dispatchEvent !== 'undefined') dispatchEvent(new Event(EVT));
}
let lastF = '', lastFv: FestivalGroup[] = [];
const festSnap = () => { const v = savedFestivals(); const k = v.join(','); if (k !== lastF) { lastF = k; lastFv = v; } return lastFv; };
export const useFestivals = () => useSyncExternalStore(subscribe, festSnap, () => PACKS[FAMILY_DEFAULT].festivals);

/** What `ego` calls `other` in this pack's words (null if there's no everyday word). */
export function kinTerm(f: Family, other: string, ego: string, pack: Pack = currentPack()): Term | null {
  const r = roleOf(f, other, ego);
  return r ? pack.term(r) : null;
}
/** "Chacha (चाचा)" */
export const termText = (t: Term | null) => (t ? (t.native ? `${t.word} (${t.native})` : t.word) : '');
