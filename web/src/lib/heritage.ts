/**
 * Family traditions in the interface (Kerala–Tamil Iyer): woven borders chosen by gender,
 * page names in Malayalam and Tamil beside English, kolam background, door welcome.
 * Spec: web/DESIGN.md. Preferences live in member_prefs (0028).
 */
import type { Route } from '../components/common';

export type Scripts = 'both' | 'ml' | 'ta' | 'en';

export { TEXTILES, TEXTILE, COMMUNITY_TEXTILES, borderChoices, borderFor, borderName, type Textile, type Border } from './textiles';

export const SCRIPTS: [Scripts, string, string][] = [['both', 'Both', 'en'], ['ml', 'മലയാളം', 'ml'], ['ta', 'தமிழ்', 'ta'], ['en', 'English', 'en']];

export const showMl = (s: Scripts) => s === 'both' || s === 'ml';
export const showTa = (s: Scripts) => s === 'both' || s === 'ta';

/** A page's name in Malayalam and Tamil, shown above its English title. Home has its own welcome. */
export interface PageName { ml: string; ta: string }
export const WELCOME: PageName & { en: string } = { ml: 'സ്വാഗതം', ta: 'வாருங்கள்', en: 'Welcome home' };
const NAMES: Partial<Record<Route['page'], PageName>> = {
  tree: { ml: 'കുടുംബവൃക്ഷം', ta: 'குடும்ப மரம்' },
  related: { ml: 'നമ്മുടെ ബന്ധം', ta: 'நம் உறவு' },
  calendar: { ml: 'പഞ്ചാംഗം', ta: 'நாட்காட்டி' },
  talk: { ml: 'സംസാരം', ta: 'பேச்சு' },
  chat: { ml: 'സന്ദേശങ്ങൾ', ta: 'செய்திகள்' },
  photos: { ml: 'ചിത്രങ്ങൾ', ta: 'புகைப்படங்கள்' },
  privacy: { ml: 'എന്റെ സ്വകാര്യത', ta: 'என் தனியுரிமை' },
  help: { ml: 'സഹായം', ta: 'உதவி' },
  whatsnew: { ml: 'പുതിയത്', ta: 'புதியவை' },
};
const MY_PROFILE: PageName = { ml: 'എന്റെ വിവരങ്ങൾ', ta: 'என் சுயவிவரம்' };
export function pageName(route: Route, myId: string | null): PageName | null {
  if (route.page === 'person') return route.id === myId ? MY_PROFILE : null;
  return NAMES[route.page] ?? null;
}

