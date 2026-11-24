import { describe, expect, it, beforeEach } from 'vitest';
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: () => null, length: 0 } as Storage;
const { platform, shouldAskForApp, askedForApp, neverAskForApp } = await import('./app');

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';
const WHATSAPP = IPHONE + ' WhatsApp/2.24';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';

describe('getting the app', () => {
  beforeEach(() => store.clear());
  it('knows the phone and browser', () => {
    expect(platform(IPHONE, 5)).toBe('ios-safari');
    expect(platform(IPHONE_CHROME, 5)).toBe('ios-other');
    expect(platform(ANDROID, 5)).toBe('android');
    expect(platform(WHATSAPP, 5)).toBe('inapp');
    expect(platform(MAC, 0)).toBe('desktop');
    expect(platform(MAC, 5)).toBe('ios-safari');   // iPad says it's a Mac
  });
  it('asks at most once a day, five times, and never after "Don’t ask again"', () => {
    const t = Date.now();
    expect(shouldAskForApp('ios-safari', t)).toBe(true);
    askedForApp(t);
    expect(shouldAskForApp('ios-safari', t + 3600_000)).toBe(false);
    expect(shouldAskForApp('ios-safari', t + 21 * 3600_000)).toBe(true);
    for (let i = 0; i < 4; i++) askedForApp(t);
    expect(shouldAskForApp('ios-safari', t + 99 * 3600_000)).toBe(false);
    store.clear(); neverAskForApp();
    expect(shouldAskForApp('android', t)).toBe(false);
  });
  it('never asks on a computer or once installed', () => {
    expect(shouldAskForApp('desktop')).toBe(false);
    expect(shouldAskForApp('installed')).toBe(false);
  });
});
