import { describe, expect, it } from 'vitest';
import { inviteCode, inviteLink, inviteMessage, isGmail, joinEmail, legacyInviteLink, maskEmail } from './invite';
import { authLinkError } from './invite';

describe('personal invitation links', () => {
  it('new links carry only a random code, never the email (security review L2)', () => {
    const link = inviteLink('k7qp2xzr9m0a');
    expect(link).toMatch(/\/#\/invite\/k7qp2xzr9m0a$/);
    expect(inviteCode('#/invite/k7qp2xzr9m0a')).toBe('k7qp2xzr9m0a');
    expect(inviteCode('#/invite/short')).toBeNull();
    const msg = inviteMessage('Lakshmi', 'lakshmi.r@yahoo.co.in', 'k7qp2xzr9m0a');
    expect(msg).toContain('/#/invite/k7qp2xzr9m0a');
    expect(msg).not.toContain('lakshmi.r@');
    expect(msg).toContain('la•••@yahoo.co.in');
    expect(maskEmail('Ab@x.in')).toBe('ab•••@x.in');
  });
  it('old links still round-trip the email through the link fragment', () => {
    const link = legacyInviteLink(' Lakshmi.R+family@Yahoo.co.in ');
    expect(link).toMatch(/\/#\/join\/[A-Za-z0-9_-]+$/);
    expect(joinEmail(link.slice(link.indexOf('#')))).toBe('lakshmi.r+family@yahoo.co.in');
  });
  it('ignores anything that isn’t an invitation link', () => {
    expect(joinEmail('#/p/START')).toBeNull();
    expect(joinEmail('#/join/!!!')).toBeNull();
    expect(joinEmail('#/join/' + btoa('not an email'))).toBeNull();
  });
  it('message carries the link and the right sign-in hint', () => {
    expect(inviteMessage('Lakshmi', 'lakshmi@gmail.com')).toContain('Continue with Google');
    expect(inviteMessage('Ravi', 'ravi@outlook.com')).not.toContain('Continue with Google');
    expect(inviteMessage('Ravi', 'ravi@outlook.com')).toContain('/#/join/');
    expect(isGmail('a@googlemail.com')).toBe(true);
  });
});

describe('failed sign-in links', () => {
  it('explains an expired or used link', () => {
    expect(authLinkError('?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', '#error=access_denied')).toMatch(/expired or was already used/);
    expect(authLinkError('', '#error=access_denied&error_code=otp_expired')).toMatch(/expired/);
  });
  it('is quiet when there is no error', () => {
    expect(authLinkError('', '#/join/abc')).toBeNull();
    expect(authLinkError('', '')).toBeNull();
  });
});

describe('Microsoft / Yahoo sign-in messages', () => {
  it('explains a work account and a not-ready provider', () => {
    expect(authLinkError('?error=access_denied&error_code=provider_work_account', '')).toMatch(/personal Outlook, Hotmail or Live/);
    expect(authLinkError('?error=access_denied&error_code=provider_not_ready', '')).toMatch(/isn’t ready yet/);
    expect(authLinkError('?error=access_denied&error_code=provider_failed', '')).toMatch(/didn’t finish/);
  });
});
