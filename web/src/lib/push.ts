/**
 * Phone notifications (0030), the browser side.
 * The service worker (public/sw.js) only shows notifications: it never caches pages or data.
 * iPhone and iPad: Apple allows web notifications only once the site is added to the Home Screen (iOS 16.4+).
 */
import { VAPID_KEY } from './site';
import type { Api } from './api';

/** Public half of the sending key (the private half is a Worker secret). Safe to publish. */
export const VAPID_PUBLIC = VAPID_KEY;

export type PushState = 'unsupported' | 'ios-install' | 'blocked' | 'off' | 'on';

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** A short label for "which device", e.g. "iPhone · Safari" (no identifiers). */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) || (isIOS() && !/iPhone/.test(ua)) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Device';
  const br = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return [os, isStandalone() ? 'app' : br].filter(Boolean).join(' · ');
}

const keyBytes = (s: string) => { const t = s.replace(/-/g, '+').replace(/_/g, '/'); const b = atob(t + '='.repeat((4 - (t.length % 4)) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
const b64u = (buf: ArrayBuffer | null) => { if (!buf) return ''; let s = ''; for (const x of new Uint8Array(buf)) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };

async function registration() {
  return (await navigator.serviceWorker.getRegistration('/')) || navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return isIOS() && !isStandalone() ? 'ios-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Ask permission (must come from a tap), subscribe this device and tell the server. */
export async function turnOn(api: Api): Promise<PushState> {
  if (!supported()) return pushState();
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'blocked' : 'off';
  const reg = await registration();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) });
  await api.pushSubscribe(sub.endpoint, b64u(sub.getKey('p256dh')), b64u(sub.getKey('auth')), deviceLabel());
  return 'on';
}

/** Turn off on this device (also used when signing out here). */
export async function turnOff(api: Pick<Api, 'pushUnsubscribe'> | null): Promise<void> {
  if (!supported()) return;
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return;
  if (api) await api.pushUnsubscribe(sub.endpoint).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/** If notifications are on here, keep the server's copy fresh (browsers sometimes rotate the address). */
export async function refreshSubscription(api: Api) {
  try { if ((await pushState()) === 'on') await turnOn(api); } catch { /* best effort */ }
}

/** Tapping a notification while the site is open: go to that page. */
export function listenForOpens() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (e) => {
    const u = (e.data && e.data.type === 'open' && typeof e.data.url === 'string') ? new URL(e.data.url) : null;
    if (u && u.origin === location.origin) location.hash = u.hash || '#/';
  });
}

/** The one-time invitation on Home: after a few visits, if notifications could be turned on and aren't. */
const ASK = 'fam.push.ask';
export function shouldAsk(): boolean {
  try {
    const v = JSON.parse(localStorage.getItem(ASK) || '{"visits":0}') as { visits: number; dismissed?: boolean };
    return !v.dismissed && v.visits >= 3;
  } catch { return false; }
}
export function countVisit() {
  try { const v = JSON.parse(localStorage.getItem(ASK) || '{"visits":0}'); if (!sessionStorage.getItem(ASK)) { v.visits = (v.visits || 0) + 1; sessionStorage.setItem(ASK, '1'); localStorage.setItem(ASK, JSON.stringify(v)); } } catch { /* storage off */ }
}
export function dismissAsk() { try { localStorage.setItem(ASK, JSON.stringify({ visits: 99, dismissed: true })); } catch { /* storage off */ } }
