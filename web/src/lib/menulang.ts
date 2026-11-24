import { useSyncExternalStore } from 'react';
import { applyTextSize } from './theme';
import { MENUS } from './community/menus';

/**
 * Menus in the member's own language (Theme → Menus in): Hindi, Tamil, Bengali, Urdu and the rest (lib/community/menus.ts).
 * Only the menu, tab bar and breadcrumbs change; pages stay in English for now.
 * Kept on this device (an elder's phone can be set to their language without changing anyone else's).
 */
export type MenuLang = string; // 'en' or a key of MENUS
const KEY = 'fam-menu-lang';
const EVT = 'fam-menu-lang';
const known = (l: string | null): l is string => !!l && (l === 'en' || l in MENUS);

export function savedMenuLang(): MenuLang {
  try { const v = localStorage.getItem(KEY); return known(v) ? v : 'en'; } catch { return 'en'; }
}
export function setMenuLang(l: MenuLang) {
  if (!known(l)) l = 'en';
  try { localStorage.setItem(KEY, l); } catch { /* storage off */ }
  if (typeof document !== 'undefined') document.documentElement.dataset.menu = l;
  if (typeof dispatchEvent !== 'undefined') dispatchEvent(new Event(EVT));
}
const subscribe = (f: () => void) => { addEventListener(EVT, f); return () => removeEventListener(EVT, f); };
export const useMenuLang = () => useSyncExternalStore(subscribe, savedMenuLang, () => 'en' as MenuLang);

/** Tamil for every menu word (kept for the menu test; every language is in MENUS). */
export const TA: Record<string, string> = MENUS.ta;
export const menuText = (l: MenuLang, en: string) => (l !== 'en' && MENUS[l]?.[en]) || en;
/** t('Family tree') → 'वंश वृक्ष' when menus are in Hindi. */
export function useT() { const l = useMenuLang(); return (en: string) => menuText(l, en); }

/**
 * An elder's invitation link (?elder=1[&lang=hi], made by "Set this up for …"): larger text and, if asked, menus in their language
 * on that phone, then the link's address is tidied so a reload doesn't do it again.
 */
export function applyElderLink(loc: Location = location, hist: History = history): boolean {
  const q = new URLSearchParams(loc.search);
  if (q.get('elder') !== '1') return false;
  applyTextSize('larger');
  if (q.get('ta') === '1') setMenuLang('ta'); // older links
  const lang = q.get('lang');
  if (lang) setMenuLang(lang);
  try { localStorage.setItem('fam.elder', '1'); } catch { /* storage off */ }
  hist.replaceState(hist.state, '', loc.pathname + loc.hash);
  return true;
}
