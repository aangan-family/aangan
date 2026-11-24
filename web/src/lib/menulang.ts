import { useSyncExternalStore } from 'react';
import { applyTextSize } from './theme';

/**
 * Menus in Tamil (Theme → Menus in). Only the menu, tab bar and breadcrumbs change; pages stay in English for now.
 * Kept on this device (an elder's phone can be set to Tamil without changing anyone else's).
 */
export type MenuLang = 'en' | 'ta';
const KEY = 'fam-menu-lang';
const EVT = 'fam-menu-lang';

export function savedMenuLang(): MenuLang {
  try { return localStorage.getItem(KEY) === 'ta' ? 'ta' : 'en'; } catch { return 'en'; }
}
export function setMenuLang(l: MenuLang) {
  try { localStorage.setItem(KEY, l); } catch { /* storage off */ }
  if (typeof document !== 'undefined') document.documentElement.dataset.menu = l;
  if (typeof dispatchEvent !== 'undefined') dispatchEvent(new Event(EVT));
}
const subscribe = (f: () => void) => { addEventListener(EVT, f); return () => removeEventListener(EVT, f); };
export const useMenuLang = () => useSyncExternalStore(subscribe, savedMenuLang, () => 'en' as MenuLang);

/** Tamil for every menu word. Anything missing stays in English. */
export const TA: Record<string, string> = {
  'Home': 'முகப்பு',
  'Family': 'குடும்பம்',
  'Family tree': 'குடும்ப மரம்',
  'Tree': 'மரம்',
  'How are we related?': 'நமக்குள் என்ன உறவு?',
  'Calendar': 'நாட்காட்டி',
  'Photos': 'புகைப்படங்கள்',
  'Conversations': 'உரையாடல்கள்',
  'Talk': 'பேச்சு',
  'With the whole family': 'முழு குடும்பத்துடன்',
  'Messages': 'செய்திகள்',
  'Private, one-to-one': 'தனிப்பட்டது, இருவருக்கு மட்டும்',
  'You': 'நீங்கள்',
  'My profile': 'என் விவரம்',
  'My privacy': 'என் தனியுரிமை',
  'Theme': 'தோற்றம்',
  'Help': 'உதவி',
  'Help & FAQ': 'உதவி & கேள்விகள்',
  'What’s New!': 'புதியவை!',
  'Add to home screen': 'முகப்புத் திரையில் சேர்',
  'Admin': 'நிர்வாகம்',
  'Steward': 'பொறுப்பாளர்',
  'Requests to join': 'சேர விண்ணப்பங்கள்',
  'Sign out': 'வெளியேறு',
  'More': 'மேலும்',
  'Back': 'பின்செல்',
  'Waiting for your OK': 'உங்கள் ஒப்புதலுக்காக',
  'Waiting for a parent': 'பெற்றோரின் ஒப்புதலுக்காக',
  'What a parent is checking': 'பெற்றோர் சரிபார்ப்பவை',
  'From your children': 'உங்கள் குழந்தைகளிடமிருந்து',
};
export const menuText = (l: MenuLang, en: string) => (l === 'ta' && TA[en]) || en;
/** t('Family tree') → 'குடும்ப மரம்' when menus are in Tamil. */
export function useT() { const l = useMenuLang(); return (en: string) => menuText(l, en); }

/**
 * An elder's invitation link (?elder=1[&ta=1], made by "Set this up for …"): larger text and, if asked, Tamil menus
 * on that phone, then the link's address is tidied so a reload doesn't do it again.
 */
export function applyElderLink(loc: Location = location, hist: History = history): boolean {
  const q = new URLSearchParams(loc.search);
  if (q.get('elder') !== '1') return false;
  applyTextSize('larger');
  if (q.get('ta') === '1') setMenuLang('ta');
  try { localStorage.setItem('fam.elder', '1'); } catch { /* storage off */ }
  hist.replaceState(hist.state, '', loc.pathname + loc.hash);
  return true;
}
