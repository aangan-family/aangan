/**
 * Family traditions in the interface (Kerala–Tamil Iyer): woven borders chosen by gender,
 * page names in Malayalam and Tamil beside English, kolam background, door welcome.
 * Spec: web/DESIGN.md. Preferences live in member_prefs (0028).
 */
import type { Route } from '../components/common';

export type Border = 'veshti-red' | 'veshti-blue' | 'saree-green' | 'saree-red';
export type Scripts = 'both' | 'ml' | 'ta' | 'en';

export const BORDER_LABEL: Record<Border, string> = {
  'veshti-red': 'Veshti · Red', 'veshti-blue': 'Veshti · Blue', 'saree-green': 'Saree · Green', 'saree-red': 'Saree · Red',
};
export const SCRIPTS: [Scripts, string, string][] = [['both', 'Both', 'en'], ['ml', 'മലയാളം', 'ml'], ['ta', 'தமிழ்', 'ta'], ['en', 'English', 'en']];

/** Men wear the mayil kann veshti border, women the Kanjeevaram saree border. Anyone else sees the green saree. */
export function borderChoices(gender: string): Border[] {
  if (gender === 'm') return ['veshti-red', 'veshti-blue'];
  if (gender === 'f') return ['saree-green', 'saree-red'];
  return [];
}
export function borderFor(gender: string, pref?: string | null): Border {
  const choices = borderChoices(gender);
  if (pref && (choices as string[]).includes(pref)) return pref as Border;
  return choices[0] ?? 'saree-green';
}

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

