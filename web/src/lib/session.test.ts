import { describe, expect, it } from 'vitest';
import { moveOldSession } from './api-supabase';

function store(init: Record<string, string>) {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    all: () => Object.fromEntries(m),
  };
}

describe('moveOldSession', () => {
  it('moves a sign-in saved under the project name to the new name, so nobody is signed out', () => {
    const s = store({ 'sb-abcdefghijklmnopqrst-auth-token': '{"t":1}', 'sb-abcdefghijklmnopqrst-auth-token-flow-1a2b-code-verifier': 'x', 'fam.theme': 'blue' });
    moveOldSession(s);
    expect(s.all()).toEqual({ 'fam-auth': '{"t":1}', 'fam.theme': 'blue' });
  });
  it('keeps a newer sign-in and still removes the old one', () => {
    const s = store({ 'sb-abcdefghijklmnopqrst-auth-token': 'old', 'fam-auth': 'new' });
    moveOldSession(s);
    expect(s.all()).toEqual({ 'fam-auth': 'new' });
  });
});
