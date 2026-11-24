import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { welcomeEmail } from './welcome';
import { DAILY } from './index';
import { ADMIN } from './site';

describe('welcome email', () => {
  const m = welcomeEmail({ given_name: 'Ananya', invited_by_name: 'Meera Iyer', admins: 'Arjun Sharma, Lakshmi Menon', people: 141 });

  it('greets them by name and says who invited them', () => {
    expect(m.subject).toBe('Welcome to the family website, Ananya.');
    expect(m.html).toContain('Welcome home, Ananya.');
    expect(m.html).toContain('Meera Iyer invited you');
    expect(m.text).toContain('Meera Iyer invited you');
  });

  it('covers the tree, relationships, calendar, talk, photos, privacy and the admins', () => {
    for (const s of ['family tree', 'How are we related?', 'Family calendar', 'Talk', 'Photos', 'Only me', 'withdraw your consent', 'Add to Home screen'])
      expect(m.html).toContain(s);
    expect(m.html).toContain('<b>Arjun Sharma</b>, <b>Lakshmi Menon</b>');
  });

  it('is signed by the admin with their phone and WhatsApp (site.config.json)', () => {
    expect(m.html).toContain(`tel:${ADMIN.tel}`);
    expect(m.html).toContain(`https://wa.me/${ADMIN.wa}`);
    expect(m.text).toContain(ADMIN.phone);
  });

  it('links only to the family website and contact links', () => {
    const links = [...m.html.matchAll(/href="([^"]+)"/g)].map((x) => x[1]);
    expect(links.every((l) => /^(https:\/\/ourfamily\.example|tel:|https:\/\/wa\.me\/)/.test(l))).toBe(true);
  });

  it('escapes names', () => {
    const x = welcomeEmail({ given_name: '<b>Eve</b>', invited_by_name: 'A & B', admins: null, people: 0 });
    expect(x.html).not.toContain('<b>Eve</b>');
    expect(x.html).toContain('&lt;b&gt;Eve&lt;/b&gt;');
    expect(x.html).toContain('A &amp; B invited you');
  });

  it('still reads well without a name, inviter or admins', () => {
    const x = welcomeEmail({ given_name: '', invited_by_name: null, admins: null, people: 0 });
    expect(x.subject).toBe('Welcome to the family website.');
    expect(x.html).toContain('Welcome home.');
    expect(x.html).not.toContain('invited you');
  });

  it('the daily cron in wrangler.toml matches the one the Worker checks', () => {
    const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
    expect(toml).toContain(`"${DAILY}"`);
    expect(toml).toMatch(/"\*\/10 \* \* \* \*"/);
  });
});

describe('sign-in email templates', () => {
  for (const f of ['confirm-signup.html', 'magic-link.html']) {
    const html = readFileSync(new URL(`../../supabase/templates/${f}`, import.meta.url), 'utf8');
    it(`${f} has the sign-in link, Arjun's contact, and no other links`, () => {
      expect(html).toContain('{{ .SiteURL }}/#/auth?token_hash={{ .TokenHash }}&type=email');
      expect(html).not.toContain('ConfirmationURL');
      expect(html).toContain(`tel:${ADMIN.tel}`);
      const links = [...html.matchAll(/href="([^"]+)"/g)].map((x) => x[1]);
      expect(links.every((l) => /^(\{\{ \.SiteURL \}\}\/#\/auth\?token_hash=|https:\/\/ourfamily\.example|tel:|https:\/\/wa\.me\/)/.test(l))).toBe(true);
    });
  }
});

import { proxy } from './proxy';
describe('api.ourfamily.example pass-through', () => {
  it('forwards path, query, method, body and auth headers to Supabase, without cookies', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const orig = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response('ok', { status: 201, headers: { 'set-cookie': 'x=1', 'access-control-allow-origin': '*' } }); }) as typeof fetch;
    try {
      const r = await proxy(new Request('https://api.ourfamily.example/rest/v1/persons?select=*', { method: 'POST', body: '{"a":1}', headers: { apikey: 'anon', authorization: 'Bearer t', cookie: 'c=1' } }), 'https://example-project.supabase.co');
      expect(seen!.url).toBe('https://example-project.supabase.co/rest/v1/persons?select=*');
      expect(seen!.init.method).toBe('POST');
      const h = seen!.init.headers as Headers;
      expect(h.get('apikey')).toBe('anon');
      expect(h.get('authorization')).toBe('Bearer t');
      expect(h.get('cookie')).toBeNull();
      expect(r.status).toBe(201);
      expect(r.headers.get('set-cookie')).toBeNull();
      expect(r.headers.get('access-control-allow-origin')).toBe('*');
    } finally { globalThis.fetch = orig; }
  });
});

import { joinNotice } from './joins';
describe('join request notice', () => {
  it('names the person and their family, links to the review page, and never includes a phone number', () => {
    const m = joinNotice({ full_name: 'Janaki <R>', father_name: 'Ravi', mother_name: 'Uma', spouse_name: '', city: 'Chennai', note: 'Ravi’s daughter' });
    expect(m.subject).toBe('Janaki <R> asked to join the family website');
    expect(m.html).toContain('Janaki &lt;R&gt;');
    expect(m.html).toContain('https://ourfamily.example/#/admin/requests');
    expect(m.html).not.toContain('Husband or wife');
    expect(m.text).toContain('Father: Ravi');
  });
});
