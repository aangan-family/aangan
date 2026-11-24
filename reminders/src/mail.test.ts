import { describe, expect, it } from 'vitest';
import { DEFAULT_FROM, payload, TEXT_FOOTER } from './mail';
import { emailHtml } from './index';

const m = { to: ['a@example.com'], subject: 'Hi', html: '<p>Hi</p>', text: 'Hello' };

describe('outgoing email', () => {
  it('always sends from family@ourfamily.example with a name', () => {
    expect(payload({}, m, 'welcome').from).toBe(DEFAULT_FROM);
    expect(DEFAULT_FROM).toMatch(/^Our Family <family@ourfamily\.example>$/);
  });
  it('adds the footer to the plain-text part once', () => {
    expect(payload({}, m, 'welcome').text.endsWith(TEXT_FOOTER)).toBe(true);
    const again = payload({}, { ...m, text: `Hello\n\n${TEXT_FOOTER}` }, 'welcome').text;
    expect(again.split('We never ask for passwords').length).toBe(2);
  });
  it('gives each email its own reference, so Gmail does not fold them together', () => {
    expect(payload({}, m, 'join', 'ref-1').headers['X-Entity-Ref-ID']).toBe('ref-1');
    expect(payload({}, m, 'join').headers['X-Entity-Ref-ID']).not.toBe(payload({}, m, 'join').headers['X-Entity-Ref-ID']);
  });
  it('offers unsubscribe only on emails people can turn off', () => {
    expect(payload({}, m, 'mention').headers['List-Unsubscribe']).toContain('https://ourfamily.example/#/privacy');
    expect(payload({}, m, 'welcome').headers['List-Unsubscribe']).toBeUndefined();
  });
  it('tags each kind and leaves bcc out when empty', () => {
    const p = payload({}, { ...m, bcc: [] }, 'digest');
    expect(p.tags).toEqual([{ name: 'category', value: 'digest' }]);
    expect('bcc' in p).toBe(false);
  });
  it('puts the digest in the shared layout (language, preheader, footer)', () => {
    const html = emailHtml([{ text: 'Hello', share: 'Hello' }], '2026-12-03');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('We never ask for passwords');
  });
});

import { setBorders } from './mail';
import { layout, BORDER_TOKEN } from './brand';
describe('heritage borders on every email', () => {
  const html = layout({ preheader: 'x', headline: 'Hi.', body: '<p>x</p>' });
  it('every email has the thoranam and a woven border', () => {
    expect(html).toContain('https://ourfamily.example/email/thoranam.png');
    expect(html).toContain(BORDER_TOKEN);
  });
  it('each recipient gets their own border; unknown addresses get the green saree', () => {
    setBorders([{ email: 'Ravi@x.in', border: 'veshti-blue' }, { email: 'asha@x.in', border: 'saree-red' }, { email: 'bad@x.in', border: 'evil' }]);
    const of = (to: string) => payload({}, { to: [to], subject: 's', html, text: 't' }, 'welcome').html;
    expect(of('ravi@x.in')).toContain('/email/veshti-blue.png');
    expect(of('asha@x.in')).toContain('/email/saree-red.png');
    expect(of('bad@x.in')).toContain('/email/saree-green.png');
    expect(of('nobody@x.in')).toContain('/email/saree-green.png');
    expect(of('ravi@x.in')).not.toContain(BORDER_TOKEN);
    setBorders([]);
  });
});
