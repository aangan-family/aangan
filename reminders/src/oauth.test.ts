import { afterEach, describe, expect, it, vi } from 'vitest';
import { oauth, verifiedEmail, type OAuthEnv, probeProvider } from './oauth';

const env: OAuthEnv = { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_KEY: 'service-key-for-tests', MS_CLIENT_ID: 'ms-id', MS_CLIENT_SECRET: 'ms-secret', YAHOO_CLIENT_ID: 'y-id', YAHOO_CLIENT_SECRET: 'y-secret' };
const MSA = '9188040d-6c67-4c5b-b112-36a304b66dad';
const jwt = (c: object) => `h.${btoa(JSON.stringify(c)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.s`;
const now = () => Math.floor(Date.now() / 1000);

describe('ID token checks', () => {
  const ms = { iss: `https://login.microsoftonline.com/${MSA}/v2.0`, aud: 'ms-id', exp: now() + 600, nonce: 'n', tid: MSA, email: 'Asha@Outlook.com' };
  it('accepts a personal Microsoft account', () => expect(verifiedEmail('azure', ms, 'ms-id', 'n')).toEqual({ email: 'asha@outlook.com' }));
  it('refuses work/school accounts, wrong audience, nonce or expiry', () => {
    expect(verifiedEmail('azure', { ...ms, tid: 'other', iss: 'https://login.microsoftonline.com/other/v2.0' }, 'ms-id', 'n')).toEqual({ error: 'work_account' });
    expect(verifiedEmail('azure', ms, 'other-app', 'n')).toEqual({ error: 'bad_audience' });
    expect(verifiedEmail('azure', ms, 'ms-id', 'x')).toEqual({ error: 'bad_nonce' });
    expect(verifiedEmail('azure', { ...ms, exp: now() - 3600 }, 'ms-id', 'n')).toEqual({ error: 'expired' });
  });
  const y = { iss: 'https://api.login.yahoo.com', aud: 'y-id', exp: now() + 600, nonce: 'n', email: 'ravi@yahoo.co.in', email_verified: true };
  it('accepts a verified Yahoo email; refuses an unverified one', () => {
    expect(verifiedEmail('yahoo', y, 'y-id', 'n')).toEqual({ email: 'ravi@yahoo.co.in' });
    expect(verifiedEmail('yahoo', { ...y, email: 'x@gmail.com', email_verified: false }, 'y-id', 'n')).toEqual({ error: 'unverified' });
    expect(verifiedEmail('yahoo', { ...y, email: 'x@gmail.com', email_verified: undefined }, 'y-id', 'n')).toEqual({ error: 'unverified' });
  });
  const g = { iss: 'https://accounts.google.com', aud: 'g-id', exp: now() + 600, nonce: 'n', email: 'Meera@gmail.com', email_verified: true };
  it('accepts a verified Google email; refuses unverified, wrong issuer or wrong app', () => {
    expect(verifiedEmail('google', g, 'g-id', 'n')).toEqual({ email: 'meera@gmail.com' });
    expect(verifiedEmail('google', { ...g, email_verified: false }, 'g-id', 'n')).toEqual({ error: 'unverified' });
    expect(verifiedEmail('google', { ...g, iss: 'https://evil.example' }, 'g-id', 'n')).toEqual({ error: 'bad_issuer' });
    expect(verifiedEmail('google', g, 'other-app', 'n')).toEqual({ error: 'bad_audience' });
  });
});

describe('sign-in broker', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('start sends people to Microsoft with state and nonce, and only back to our own sites', async () => {
    const r = await oauth(new Request('https://api.ourfamily.example/oauth/azure/start?return=https://evil.example/'), env);
    expect(r.status).toBe(302);
    const loc = new URL(r.headers.get('location')!);
    expect(loc.origin + loc.pathname).toBe('https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize');
    expect(loc.searchParams.get('redirect_uri')).toBe('https://api.ourfamily.example/oauth/azure/callback');
    expect(loc.searchParams.get('state')).toBeTruthy();
    expect(r.headers.get('set-cookie')).toMatch(/HttpOnly; Secure; SameSite=Lax/);
  });

  it('callback turns a verified email into a one-time sign-in on our site', async () => {
    const start = await oauth(new Request('https://api.ourfamily.example/oauth/azure/start?return=https://ourfamily.example/'), env);
    const auth = new URL(start.headers.get('location')!);
    const state = auth.searchParams.get('state')!, nonce = auth.searchParams.get('nonce')!;
    const ck = start.headers.get('set-cookie')!.split(';')[0];
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push(url);
      if (url.includes('/token')) return Response.json({ id_token: jwt({ iss: `https://login.microsoftonline.com/${MSA}/v2.0`, aud: 'ms-id', exp: now() + 600, nonce, tid: MSA, email: 'asha@outlook.com' }) });
      if (url.endsWith('/auth/v1/admin/generate_link')) { expect(JSON.parse(String(init.body))).toEqual({ type: 'magiclink', email: 'asha@outlook.com' }); return Response.json({ properties: { hashed_token: 'abc', verification_type: 'magiclink' } }); }
      return new Response('?', { status: 500 });
    });
    const r = await oauth(new Request(`https://api.ourfamily.example/oauth/azure/callback?code=c&state=${state}`, { headers: { cookie: ck } }), env);
    expect(r.headers.get('location')).toBe('https://ourfamily.example/#/auth?token_hash=abc&type=magiclink');
    expect(calls).toHaveLength(2);
  });

  it('refuses a callback without the matching state cookie', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('should not be called'); });
    const r = await oauth(new Request('https://api.ourfamily.example/oauth/yahoo/callback?code=c&state=forged'), env);
    expect(r.headers.get('location')).toBe('https://ourfamily.example/?error=access_denied&error_code=provider_expired');
  });

  it('refuses a work account', async () => {
    const start = await oauth(new Request('https://api.ourfamily.example/oauth/azure/start?return=https://ourfamily.example/'), env);
    const auth = new URL(start.headers.get('location')!);
    const ck = start.headers.get('set-cookie')!.split(';')[0];
    vi.stubGlobal('fetch', async (url: string) => url.includes('/token')
      ? Response.json({ id_token: jwt({ iss: 'https://login.microsoftonline.com/x/v2.0', aud: 'ms-id', exp: now() + 600, nonce: auth.searchParams.get('nonce'), tid: 'x', email: 'a@corp.com' }) })
      : new Response('no', { status: 500 }));
    const r = await oauth(new Request(`https://api.ourfamily.example/oauth/azure/callback?code=c&state=${auth.searchParams.get('state')}`, { headers: { cookie: ck } }), env);
    expect(r.headers.get('location')).toContain('error_code=provider_work_account');
  });
});

describe('app secret check (health)', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('Microsoft gets the secret in the form body, never in a Basic header', async () => {
    let seen: { auth: string | null; body: string } | null = null;
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => { seen = { auth: new Headers(init.headers).get('authorization'), body: String(init.body) }; return Response.json({ error: 'invalid_grant', error_codes: [70000] }, { status: 400 }); });
    expect(await probeProvider('azure', env)).toEqual({ ok: true, detail: 'secret accepted' });
    expect(seen!.auth).toBeNull();
    expect(seen!.body).toContain('client_secret=ms-secret');
  });
  it('Yahoo gets Basic auth', async () => {
    let auth: string | null = null;
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => { auth = new Headers(init.headers).get('authorization'); return Response.json({ error: 'INVALID_AUTHORIZATION_CODE' }, { status: 400 }); });
    expect((await probeProvider('yahoo', env)).ok).toBe(true);
    expect(auth).toBe(`Basic ${btoa('y-id:y-secret')}`);
  });
  it('says plainly when the Microsoft secret has expired or is wrong', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ error: 'invalid_client', error_codes: [7000222] }, { status: 401 }));
    expect(await probeProvider('azure', env)).toEqual({ ok: false, detail: 'secret has expired (AADSTS7000222)' });
    vi.stubGlobal('fetch', async () => Response.json({ error: 'invalid_client', error_description: 'AADSTS7000215: Invalid client secret provided.' }, { status: 401 }));
    expect((await probeProvider('azure', env)).detail).toMatch(/secret is wrong/);
  });
  it('reports a missing secret without calling anyone', async () => {
    expect(await probeProvider('azure', { ...env, MS_CLIENT_SECRET: undefined })).toEqual({ ok: false, detail: 'app id or secret missing' });
  });
});
