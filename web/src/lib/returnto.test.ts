import { describe, expect, it, beforeEach } from 'vitest';

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(), key: () => null, length: 0,
} as Storage;
const { rememberDeepLink, takeDeepLink, sentToConversation } = await import('./returnto');

describe('opening a shared link after signing in', () => {
  beforeEach(() => store.clear());
  it('remembers a conversation and gives it back once', () => {
    rememberDeepLink('#/talk/0f8fad5b-d9cb-469f-a165-70867728950e');
    expect(takeDeepLink()).toBe('#/talk/0f8fad5b-d9cb-469f-a165-70867728950e');
    expect(takeDeepLink()).toBeNull();
  });
  it('ignores sign-in and join pages and anything odd', () => {
    for (const h of ['#/auth?token_hash=x', '#/join/abc', '#/invite/ABC', '', '#/talk/<script>', 'https://evil.example']) { rememberDeepLink(h); expect(takeDeepLink()).toBeNull(); }
  });
  it('forgets after an hour', () => {
    store.set('fam.next', JSON.stringify({ h: '#/talk/abc', t: Date.now() - 2 * 3600_000 }));
    expect(takeDeepLink()).toBeNull();
  });
  it('knows when someone was sent a conversation', () => {
    expect(sentToConversation('#/talk/abc-123')).toBe(true);
    expect(sentToConversation('#/talk')).toBe(false);
  });
});
