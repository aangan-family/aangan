import { describe, expect, it } from 'vitest';
import { addressOf, encodeHeader, gmailReady, mime } from './smtp';
import { emailReady } from './mail';

describe('Gmail sending (free setup)', () => {
  it('is used only when both Gmail secrets are set, and Resend wins when it is there', () => {
    expect(gmailReady({})).toBe(false);
    expect(gmailReady({ GMAIL_USER: 'raos.family@gmail.com' })).toBe(false);
    expect(gmailReady({ GMAIL_USER: 'raos.family@gmail.com', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop' })).toBe(true);
    expect(emailReady({ RESEND_API_KEY: 're_x' })).toBe(true);
    expect(emailReady({})).toBe(false);
  });
  it('writes a two-part message with Indian scripts encoded safely', () => {
    const m = mime({ from: 'राव परिवार <raos.family@gmail.com>', to: ['asha@x.in'], subject: 'நாளை பிறந்தநாள் 🎉', html: '<p>Hi</p>', text: 'Hi\n.hidden line', headers: { 'List-Unsubscribe': '<https://raos.pages.dev/#/privacy>' } }, 'BOUND');
    expect(m).toMatch(/^From: =\?UTF-8\?B\?[^?]+\?= <raos\.family@gmail\.com>\r\n/);
    expect(m).toMatch(/\r\nSubject: =\?UTF-8\?B\?/);
    expect(m).toContain('List-Unsubscribe: <https://raos.pages.dev/#/privacy>');
    expect(m).toContain('Content-Type: multipart/alternative; boundary="BOUND"');
    expect(m).toContain('Content-Type: text/plain; charset=UTF-8');
    expect(m).toContain('Content-Type: text/html; charset=UTF-8');
    expect(m.split('\r\n').every((l) => l.length <= 998)).toBe(true);
    expect(m.trimEnd().endsWith('--BOUND--')).toBe(true);
  });
  it('plain headers stay readable; addresses are pulled out of "Name <a@b>"', () => {
    expect(encodeHeader('Birthday tomorrow')).toBe('Birthday tomorrow');
    expect(addressOf('Rao family <raos.family@gmail.com>')).toBe('raos.family@gmail.com');
    expect(addressOf('asha@x.in')).toBe('asha@x.in');
  });
});
