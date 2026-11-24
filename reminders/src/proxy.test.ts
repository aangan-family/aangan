import { afterEach, describe, expect, it, vi } from 'vitest';
import { allowed, proxy } from './proxy';

const q = (s = '') => new URLSearchParams(s);

describe('what the pass-through lets through', () => {
  it('passes the website’s own requests', () => {
    expect(allowed('GET', '/rest/v1/persons', q())).toBe(true);
    expect(allowed('POST', '/rest/v1/rpc/invite_hint', q())).toBe(true);
    expect(allowed('POST', '/storage/v1/object/sign/photos', q())).toBe(true);
    expect(allowed('POST', '/auth/v1/otp', q())).toBe(true);
    expect(allowed('POST', '/auth/v1/verify', q())).toBe(true);
    expect(allowed('POST', '/auth/v1/token', q('grant_type=refresh_token'))).toBe(true);
    expect(allowed('POST', '/auth/v1/token', q('grant_type=id_token'))).toBe(true);
    expect(allowed('GET', '/auth/v1/user', q())).toBe(true);
    expect(allowed('POST', '/auth/v1/logout', q('scope=global'))).toBe(true);
    expect(allowed('OPTIONS', '/auth/v1/token', q())).toBe(true);
    const f = '11111111-2222-3333-4444-555555555555';
    expect(allowed('POST', '/auth/v1/factors', q())).toBe(true);
    expect(allowed('POST', `/auth/v1/factors/${f}/challenge`, q())).toBe(true);
    expect(allowed('POST', `/auth/v1/factors/${f}/verify`, q())).toBe(true);
    expect(allowed('DELETE', `/auth/v1/factors/${f}`, q())).toBe(true);
    expect(allowed('GET', `/auth/v1/factors/${f}`, q())).toBe(false);
  });
  it('refuses passwords, recovery, email changes, GraphQL, Realtime and the admin API', () => {
    expect(allowed('POST', '/auth/v1/token', q('grant_type=password'))).toBe(false);
    expect(allowed('POST', '/auth/v1/signup', q())).toBe(false);
    expect(allowed('POST', '/auth/v1/recover', q())).toBe(false);
    expect(allowed('PUT', '/auth/v1/user', q())).toBe(false);
    expect(allowed('GET', '/auth/v1/admin/users', q())).toBe(false);
    expect(allowed('GET', '/auth/v1/authorize', q('provider=google'))).toBe(false);
    expect(allowed('POST', '/graphql/v1', q())).toBe(false);
    expect(allowed('GET', '/realtime/v1/websocket', q())).toBe(false);
    expect(allowed('GET', '/storage/v1/bucket', q())).toBe(false);
  });
});

describe('the pass-through', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('answers 404 itself for a refused request, without calling Supabase', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const r = await proxy(new Request('https://api.ourfamily.example/auth/v1/token?grant_type=password', { method: 'POST', headers: { origin: 'https://ourfamily.example' } }), 'https://example-project.supabase.co');
    expect(r.status).toBe(404);
    expect(r.headers.get('access-control-allow-origin')).toBe('https://ourfamily.example');
    expect(f).not.toHaveBeenCalled();
  });
  it('answers create_user:false code requests itself, the same for every address', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const r = await proxy(new Request('https://api.ourfamily.example/auth/v1/otp', { method: 'POST', body: JSON.stringify({ email: 'x@gmail.com', create_user: false }) }), 'https://example-project.supabase.co', 't');
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('{}');
    expect(f).not.toHaveBeenCalled();
  });
  it('adds the proof header and drops any the caller sent', async () => {
    const f = vi.fn(async (_u: string, init: RequestInit) => new Response(String(new Headers(init.headers).get('x-fam-proxy'))));
    vi.stubGlobal('fetch', f);
    const r = await proxy(new Request('https://api.ourfamily.example/rest/v1/persons', { headers: { 'x-fam-proxy': 'forged' } }), 'https://example-project.supabase.co', 'tok');
    expect(await r.text()).toBe('tok');
  });
  it('marks photo files so they can never run as a page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { headers: { 'content-type': 'image/jpeg', 'set-cookie': 'a=b' } })));
    const r = await proxy(new Request('https://api.ourfamily.example/storage/v1/object/sign/photos/a.jpg?token=t'), 'https://example-project.supabase.co');
    expect(r.headers.get('content-security-policy')).toContain('sandbox');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('set-cookie')).toBeNull();
  });
});
