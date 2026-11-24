/**
 * Google's own "Sign in with Google" button (Google Identity Services). It runs on our
 * domain, so Google's popup names our own domain instead of the Supabase project address.
 * The ID token it returns is exchanged for a Supabase session (signInWithIdToken).
 */
import { DOMAIN, GOOGLE_ID, SITE_URLS } from './site';
export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)
  || GOOGLE_ID; // public identifier, not a secret (site.config.json → googleClientId)

/** Sites registered as JavaScript origins for this client in Google Cloud. Anywhere else (preview
 *  deployments, a new domain), Google refuses the button with origin_mismatch, so we use the redirect flow. */
export const GSI_ORIGINS = SITE_URLS;
export const gsiAllowed = (origin = typeof location !== 'undefined' ? location.origin : '') => GSI_ORIGINS.includes(origin);

/** The canonical address: www.<domain> → <domain>, keeping the path, query and #. */
export function canonicalUrl(href: string): string | null {
  const u = new URL(href);
  if (u.hostname !== `www.${DOMAIN}`) return null;
  u.hostname = DOMAIN;
  return u.toString();
}

type Gsi = {
  accounts: { id: {
    initialize: (o: Record<string, unknown>) => void;
    renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
  } };
};
declare global { interface Window { google?: Gsi } }

let loading: Promise<Gsi> | null = null;
export function loadGsi(timeoutMs = 6000): Promise<Gsi> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (loading) return loading;
  loading = new Promise<Gsi>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    const t = setTimeout(() => reject(new Error('Google sign-in didn’t load')), timeoutMs);
    s.onload = () => { clearTimeout(t); window.google?.accounts?.id ? resolve(window.google) : reject(new Error('Google sign-in didn’t load')); };
    s.onerror = () => { clearTimeout(t); reject(new Error('Google sign-in didn’t load')); };
    document.head.appendChild(s);
  });
  loading.catch(() => { loading = null; });
  return loading;
}

/** A random nonce and its SHA-256 hex digest (Google gets the hash, Supabase the original). */
export async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const raw = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return { raw, hashed: Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('') };
}

/** Inside WhatsApp, Instagram, Facebook and similar apps Google refuses to sign people in. */
export function inAppBrowser(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): string | null {
  if (/WhatsApp/i.test(ua)) return 'WhatsApp';
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'Facebook';
  if (/Line\//i.test(ua)) return 'LINE';
  if (/Telegram/i.test(ua)) return 'Telegram';
  if (/Snapchat/i.test(ua)) return 'Snapchat';
  if (/Android/i.test(ua) && /; wv\)/.test(ua)) return 'this app';
  return null;
}
export const isAndroid = (ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') => /Android/i.test(ua);
/** Opens the current page in Chrome on Android. */
export const chromeIntent = (href: string) => {
  const u = new URL(href);
  return `intent://${u.host}${u.pathname}${u.search}${u.hash}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
};
