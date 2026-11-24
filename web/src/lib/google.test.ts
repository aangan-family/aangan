import { describe, expect, it } from 'vitest';
import { chromeIntent, inAppBrowser, makeNonce } from './google';
import { canonicalUrl, gsiAllowed } from './google';

describe('Google sign-in helpers', () => {
  it('spots in-app browsers where Google blocks sign-in', () => {
    expect(inAppBrowser('Mozilla/5.0 (Linux; Android 14; SM-S918B; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 WhatsApp/2.24')).toBe('WhatsApp');
    expect(inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0')).toBe('Instagram');
    expect(inAppBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36')).toBe('this app');
    expect(inAppBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36')).toBeNull();
    expect(inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBeNull();
  });
  it('builds an Open-in-Chrome link that keeps the page and invitation', () => {
    expect(chromeIntent('https://ourfamily.example/#/join/abc')).toBe('intent://ourfamily.example/#/join/abc#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fourfamily.example%2F%23%2Fjoin%2Fabc;end');
  });
  it('nonce: Google gets the SHA-256 of what Supabase gets', async () => {
    const n = await makeNonce();
    expect(n.raw).toMatch(/^[0-9a-f]{48}$/);
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(n.raw));
    expect(n.hashed).toBe(Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join(''));
  });
});

describe('addresses', () => {
  it('sends www to the main address, keeping the rest', () => {
    expect(canonicalUrl('https://www.ourfamily.example/?x=1#/join/abc')).toBe('https://ourfamily.example/?x=1#/join/abc');
    expect(canonicalUrl('https://ourfamily.example/#/tree')).toBeNull();
  });
  it('uses Google\'s button only where it is registered', () => {
    expect(gsiAllowed('https://ourfamily.example')).toBe(true);
    expect(gsiAllowed('https://someone-else.pages.dev')).toBe(false);
    expect(gsiAllowed('https://abc123.ourfamily.pages.dev')).toBe(false);
  });
});
