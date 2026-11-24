import { describe, expect, it, vi } from 'vitest';
import { checkApi, checkKeyTries, freePath, limitKey, mailPath, tokenSub, tooMany } from './limits';
import { inviteNotice } from './joins';
import { jobChecks } from './health';
import worker from './index';

const jwt = (sub: string) => `x.${btoa(JSON.stringify({ sub })).replace(/=+$/, '')}.y`;
const SUB = '11111111-2222-3333-4444-555555555555';
const limiter = (ok: boolean) => ({ limit: vi.fn(async () => ({ success: ok })) }) as unknown as RateLimit;

describe('who is counted', () => {
  it('a signed-in person by their id, a signed-out visitor by IP', () => {
    expect(tokenSub(`Bearer ${jwt(SUB)}`)).toBe(SUB);
    expect(tokenSub('Bearer sb_publishable_abc')).toBeNull();
    expect(limitKey(new Request('https://api.ourfamily.example/rest/v1/persons', { headers: { authorization: `Bearer ${jwt(SUB)}` } }))).toBe(`u:${SUB}`);
    expect(limitKey(new Request('https://api.ourfamily.example/rest/v1/persons', { headers: { 'cf-connecting-ip': '1.2.3.4' } }))).toBe('ip:1.2.3.4');
  });
  it('photo downloads through signed links are free', () => {
    expect(freePath('GET', '/storage/v1/object/sign/photos/a.jpg')).toBe(true);
    expect(freePath('POST', '/storage/v1/object/sign/photos')).toBe(false);
  });
});

describe('sign-in emails', () => {
  it('counts only the requests that send an email, per IP', async () => {
    expect(mailPath('POST', '/auth/v1/otp')).toBe(true);
    expect(mailPath('POST', '/auth/v1/verify')).toBe(false);
    expect(mailPath('GET', '/auth/v1/otp')).toBe(false);
    const req = new Request('https://api.ourfamily.example/auth/v1/otp', { method: 'POST', headers: { 'cf-connecting-ip': '1.2.3.4' } });
    expect(await checkApi(req, { MAIL_LIMIT: limiter(false), API_LIMIT: limiter(true) })).toBe('mail:1.2.3.4');
    expect(await checkApi(req, { MAIL_LIMIT: limiter(true), API_LIMIT: limiter(true) })).toBeNull();
  });
});

describe('the limits', () => {
  it('stops a script and says what to do', async () => {
    const env = { API_LIMIT: limiter(false) };
    const req = new Request('https://api.ourfamily.example/rest/v1/profile_fields', { headers: { authorization: `Bearer ${jwt(SUB)}` } });
    expect(await checkApi(req, env)).toBe(`u:${SUB}`);
    const r = tooMany('https://ourfamily.example');
    expect(r.status).toBe(429);
    expect((await r.json() as { message: string }).message).toMatch(/wait a minute/);
  });
  it('lets ordinary use through, and fails open without the binding', async () => {
    const req = new Request('https://api.ourfamily.example/rest/v1/persons');
    expect(await checkApi(req, { API_LIMIT: limiter(true) })).toBeNull();
    expect(await checkApi(req, {})).toBeNull();
    expect(await checkKeyTries(req, {})).toBe(true);
  });
  it('the Worker returns 429 instead of passing a flood to Supabase', async () => {
    const fetchSpy = vi.fn(async () => new Response('[]'));
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('caches', { default: { match: async () => undefined, put: async () => {} } });
    const env = { SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_KEY: 'svc', API_LIMIT: limiter(false) } as never;
    const waits: Promise<unknown>[] = [];
    const r = await worker.fetch(new Request('https://api.ourfamily.example/rest/v1/persons', { headers: { authorization: `Bearer ${jwt(SUB)}` } }), env, { waitUntil: (p: Promise<unknown>) => waits.push(p) } as never);
    await Promise.all(waits);
    expect(r.status).toBe(429);
    const calls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes('/rest/v1/persons'))).toBe(false);
    expect(calls.some((u) => u.endsWith('/rpc/ops_record'))).toBe(true);
    vi.unstubAllGlobals();
  });
  it('key pages allow only a few tries', async () => {
    const r = await worker.fetch(new Request('https://api.ourfamily.example/ops/health?key=guess'), { KEY_LIMIT: limiter(false) } as never);
    expect(r.status).toBe(429);
  });
});

describe('alerts and notices', () => {
  it('the health check reports unusual reading for an hour', () => {
    const now = new Date('2026-11-15T10:00:00Z');
    const runs = { reading: { last_run_at: '2026-11-15T09:30:00Z', last_ok_at: null, ok: false, detail: 'login 11111111… made over 300 requests in a minute' } };
    const c = jobChecks({ welcome_stuck: 0, mentions_stuck: 0, joins_stuck: 0, members: 30, runs }, now);
    expect(c.find((x) => x.key === 'reading')?.ok).toBe(false);
    const later = jobChecks({ welcome_stuck: 0, mentions_stuck: 0, joins_stuck: 0, members: 30, runs }, new Date('2026-11-15T11:00:00Z'));
    expect(later.find((x) => x.key === 'reading')).toBeUndefined();
  });
  it('stewards are asked to check an invitation, without the email in it', () => {
    const m = inviteNotice({ person_name: 'Hema K', inviter_name: 'Asha R' });
    expect(m.subject).toBe('Please check: Asha R invited Hema K');
    expect(m.html).not.toMatch(/@/);
  });
});
