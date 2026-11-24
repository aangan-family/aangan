/**
 * "Get the app": helping everyone put the site on their home screen. It then opens full screen with
 * its own icon, and (on iPhone) phone notifications become possible at all.
 */
import { inAppBrowser } from './google';

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: PromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as PromptEvent; listeners.forEach((f) => f()); });
}
/** Chrome on Android (and desktop) offers a real Install button once it decides the site qualifies. */
export const canPrompt = () => !!deferred;
export const onCanPrompt = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const r = await deferred.userChoice; deferred = null;
  return r.outcome === 'accepted';
}

export const isInstalled = () => typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

export type Platform = 'installed' | 'inapp' | 'ios-safari' | 'ios-other' | 'android' | 'desktop';
export function platform(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '', touch = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0): Platform {
  if (typeof window !== 'undefined' && isInstalled()) return 'installed';
  if (inAppBrowser(ua)) return 'inapp';
  const ios = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && touch > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua) ? 'ios-other' : 'ios-safari';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

// How often to ask: once a day at most, five times in all, never after "Don't ask again".
const KEY = 'fam.app.ask';
interface Ask { last: number; count: number; never?: boolean }
const read = (): Ask => { try { return { last: 0, count: 0, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { last: 0, count: 0, never: true }; } };
const write = (a: Ask) => { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* storage off */ } };
export function shouldAskForApp(p: Platform = platform(), now = Date.now()): boolean {
  if (p === 'installed' || p === 'desktop') return false;
  const a = read();
  return !a.never && a.count < 5 && now - a.last > 20 * 3600_000;
}
export const askedForApp = (now = Date.now()) => { const a = read(); write({ ...a, last: now, count: a.count + 1 }); };
export const neverAskForApp = () => write({ ...read(), never: true });
export const timesAsked = () => read().count;

// First time the app is opened from the home screen: say thanks, offer notifications. Once per device.
const FIRST = 'fam.app.first';
export const firstLaunchDue = () => { try { return isInstalled() && !localStorage.getItem(FIRST); } catch { return false; } };
export const firstLaunchDone = () => { try { localStorage.setItem(FIRST, String(Date.now())); } catch { /* storage off */ } };
