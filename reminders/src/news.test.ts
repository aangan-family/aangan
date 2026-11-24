import { describe, expect, it } from 'vitest';
import { newsEmail, newsLink } from './news';
import { payload } from './mail';

const row = { id: 1, email: 'a@x.in', given_name: 'Asha', by_name: 'Arjun Sharma', title: '🪔 Karthigai Deepam: light a lamp', body: '## What it is\n**Agal vilakku** at the door. @[Bala](person:B1)', url: '#/talk/0b6f0a1e-1111-2222-3333-444455556666' };

describe('news emails', () => {
  it('links only inside the site', () => {
    expect(newsLink('#/talk/abc-1')).toBe('https://ourfamily.example/#/talk/abc-1');
    expect(newsLink('https://evil.example')).toBe('https://ourfamily.example/#/');
    expect(newsLink('#/"><script>')).toBe('https://ourfamily.example/#/');
  });
  it('greets by first name, shows the notice as plain text and opens the conversation', () => {
    const m = newsEmail(row);
    expect(m.subject).toBe(row.title);
    expect(m.html).toContain('Hi Asha');
    expect(m.html).toContain('Open the conversation');
    expect(m.html).not.toContain('**');
    expect(m.text).toContain('@Bala');
    expect(m.text).toContain('https://ourfamily.example/#/talk/0b6f0a1e');
  });
  it('escapes the notice', () => {
    expect(newsEmail({ ...row, title: '<b>x</b>', body: '<img src=x>' }).html).not.toContain('<img src=x>');
  });
  it('can be turned off: List-Unsubscribe header', () => {
    expect(payload({}, { to: ['a@x.in'], ...newsEmail(row) }, 'news').headers['List-Unsubscribe']).toContain('/#/privacy');
  });
});
