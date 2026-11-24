import { describe, expect, it } from 'vitest';
import { emailLinkToken } from './api-supabase';

describe('sign-in email links on our own site', () => {
  it('reads the token from #/auth', () => {
    expect(emailLinkToken('#/auth?token_hash=abc123&type=email')).toEqual({ token_hash: 'abc123', type: 'email' });
    expect(emailLinkToken('#/auth?token_hash=abc')).toEqual({ token_hash: 'abc', type: 'email' });
  });
  it('ignores other pages', () => {
    expect(emailLinkToken('#/tree')).toBeNull();
    expect(emailLinkToken('#/auth?type=email')).toBeNull();
    expect(emailLinkToken('')).toBeNull();
  });
});
