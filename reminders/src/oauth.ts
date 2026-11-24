/**
 * Microsoft, Yahoo and Google (full-page) sign-in, finished on our own API address (site.config.json → apiUrl) instead of supabase.co.
 *
 * Indian providers block supabase.co, where Supabase's own OAuth callback lives. So we do the
 * OAuth code flow here:
 *   /oauth/<p>/start     → Microsoft/Yahoo sign-in page (state + nonce kept in a signed cookie)
 *   /oauth/<p>/callback  → exchange the code (with our client secret) for an ID token, check it,
 *                          then ask Supabase (server key) for a one-time sign-in token for that
 *                          verified email, and send the browser to <site>/#/auth?token_hash=…
 * The site then signs in with verifyOtp, exactly like an email link. Who may see anything is
 * still decided by invitations: an email without one gets the "no invitation" page.
 *
 * Microsoft: personal accounts only (Outlook, Hotmail, Live), whose email Microsoft has verified.
 * Work/school accounts can carry an unverified email claim, so they're refused here.
 */
import { serverHeaders } from './keys';
import { API_URL, SITE_URLS } from './site';

export interface OAuthEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  MS_CLIENT_ID?: string;
  MS_CLIENT_SECRET?: string;
  YAHOO_CLIENT_ID?: string;
  YAHOO_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

const API = API_URL;
export const SITES = SITE_URLS;
const MSA_TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad'; // Microsoft's tenant for personal accounts
const YAHOO_DOMAINS = /@(yahoo\.[a-z.]+|ymail\.com|rocketmail\.com|myyahoo\.com)$/i;

type P = 'azure' | 'yahoo' | 'google';
const PROVIDERS: Record<P, {
  authorize: string; token: string; issuer: (iss: string) => boolean;
  id: (e: OAuthEnv) => string | undefined; secret: (e: OAuthEnv) => string | undefined; extra?: Record<string, string>;
  /** how the app secret is sent to the token endpoint: Microsoft documents the form body; Yahoo asks for Basic auth */
  auth: 'body' | 'basic';
}> = {
  azure: {
    authorize: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
    token: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
    issuer: (iss) => iss === `https://login.microsoftonline.com/${MSA_TENANT}/v2.0`,
    id: (e) => e.MS_CLIENT_ID, secret: (e) => e.MS_CLIENT_SECRET,
    extra: { prompt: 'select_account', response_mode: 'query' },
    auth: 'body',
  },
  yahoo: {
    authorize: 'https://api.login.yahoo.com/oauth2/request_auth',
    token: 'https://api.login.yahoo.com/oauth2/get_token',
    issuer: (iss) => iss === 'https://api.login.yahoo.com',
    id: (e) => e.YAHOO_CLIENT_ID, secret: (e) => e.YAHOO_CLIENT_SECRET,
    auth: 'basic',
  },
  // Google's full-page sign-in, used only when Google's own button can't load. Supabase's built-in Google
  // redirect would finish on supabase.co (blocked in India, and it shows our project's address), so it finishes here.
  google: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    issuer: (iss) => iss === 'https://accounts.google.com' || iss === 'accounts.google.com',
    id: (e) => e.GOOGLE_CLIENT_ID, secret: (e) => e.GOOGLE_CLIENT_SECRET,
    extra: { prompt: 'select_account' },
    auth: 'body',
  },
};

const enc = new TextEncoder();
const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const rand = () => b64u(crypto.getRandomValues(new Uint8Array(24)));

/** HMAC key for the state cookie, derived from the server key (no extra secret to manage). */
async function hmacKey(env: OAuthEnv) {
  const base = await crypto.subtle.importKey('raw', enc.encode(env.SUPABASE_SERVICE_KEY), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('family-oauth-state'), info: enc.encode('v1') },
    base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign', 'verify']);
}
async function seal(env: OAuthEnv, data: object) {
  const body = b64u(enc.encode(JSON.stringify(data)));
  const sig = b64u(await crypto.subtle.sign('HMAC', await hmacKey(env), enc.encode(body)));
  return `${body}.${sig}`;
}
async function unseal<T>(env: OAuthEnv, v: string | undefined): Promise<T | null> {
  if (!v) return null;
  const [body, sig] = v.split('.');
  if (!body || !sig) return null;
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(env), unb64u(sig), enc.encode(body));
  return ok ? JSON.parse(new TextDecoder().decode(unb64u(body))) as T : null;
}
const cookie = (req: Request, name: string) =>
  (req.headers.get('cookie') || '').split(/;\s*/).find((c) => c.startsWith(name + '='))?.slice(name.length + 1);

export function claims(idToken: string): Record<string, unknown> {
  const part = idToken.split('.')[1];
  if (!part) throw new Error('no id_token payload');
  return JSON.parse(new TextDecoder().decode(unb64u(part)));
}

/** The verified email in an ID token from the token endpoint, or a reason it isn't acceptable. */
export function verifiedEmail(p: P, c: Record<string, unknown>, clientId: string, nonce: string, now = Date.now() / 1000): { email: string } | { error: string } {
  if (!PROVIDERS[p].issuer(String(c.iss))) return { error: p === 'azure' ? 'work_account' : 'bad_issuer' };
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(clientId)) return { error: 'bad_audience' };
  if (typeof c.exp !== 'number' || c.exp < now - 60) return { error: 'expired' };
  if (c.nonce !== nonce) return { error: 'bad_nonce' };
  const email = String(c.email || (p === 'azure' ? c.preferred_username || '' : '')).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'no_email' };
  if (p === 'azure' && c.tid !== MSA_TENANT) return { error: 'work_account' };
  if (p === 'google' && c.email_verified !== true) return { error: 'unverified' };
  if (p === 'yahoo' && c.email_verified !== true && !(c.email_verified === undefined && YAHOO_DOMAINS.test(email))) return { error: 'unverified' };
  return { email };
}

/** Code → tokens at the provider's token endpoint, authenticated with our app secret. */
function redeem(p: P, clientId: string, secret: string, code: string) {
  const cfg = PROVIDERS[p];
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: `${API}/oauth/${p}/callback`, client_id: clientId });
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (cfg.auth === 'basic') headers.Authorization = `Basic ${btoa(`${clientId}:${secret}`)}`;
  else body.set('client_secret', secret);
  return fetch(cfg.token, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) });
}

/**
 * Is the app secret still accepted? Redeems a made-up code: a good secret gets "invalid_grant" (the code is wrong),
 * a wrong or expired secret gets "invalid_client". No one is signed in and nothing is created.
 */
export async function probeProvider(p: P, env: OAuthEnv): Promise<{ ok: boolean; detail: string }> {
  const clientId = PROVIDERS[p].id(env), secret = PROVIDERS[p].secret(env);
  if (!clientId || !secret) return { ok: false, detail: 'app id or secret missing' };
  try {
    const r = await redeem(p, clientId, secret, 'health-check-not-a-real-code');
    const j = await r.json().catch(() => ({})) as { error?: string; error_description?: string; error_codes?: number[] };
    const code = (j.error_codes || [])[0] ?? (/AADSTS(\d+)/.exec(j.error_description || '')?.[1] || '');
    // Microsoft says invalid_grant, Yahoo says INVALID_AUTHORIZATION_CODE: our secret passed, only the made-up code failed
    if (/^(invalid_grant|invalid_authorization_code)$/i.test(j.error || '')) return { ok: true, detail: 'secret accepted' };
    if (j.error === 'invalid_client' || r.status === 401) {
      const why = String(code) === '7000222' ? 'secret has expired' : String(code) === '7000215' ? 'secret is wrong (use the secret Value, not its ID)' : 'secret refused';
      return { ok: false, detail: `${why}${code ? ` (AADSTS${code})` : ''}` };
    }
    return { ok: false, detail: `unexpected answer ${r.status}${j.error ? ` ${j.error}` : ''}${code ? ` (AADSTS${code})` : ''}` };
  } catch (e) {
    return { ok: false, detail: `couldn't reach the provider: ${String((e as Error)?.message || e).slice(0, 120)}` };
  }
}

const back = (site: string, code: string) => Response.redirect(`${site}/?error=access_denied&error_code=${encodeURIComponent(code)}`, 302);

export async function oauth(req: Request, env: OAuthEnv): Promise<Response> {
  const u = new URL(req.url);
  const [, , prov, step] = u.pathname.split('/'); // /oauth/<p>/<step>
  if (prov !== 'azure' && prov !== 'yahoo' && prov !== 'google') return new Response('Not found', { status: 404 });
  const p = prov as P, cfg = PROVIDERS[p];
  const clientId = cfg.id(env), secret = cfg.secret(env);
  const redirectUri = `${API}/oauth/${p}/callback`;
  const cname = `fam_oauth_${p}`;

  if (step === 'start') {
    const ret = u.searchParams.get('return') || '';
    const site = SITES.find((s) => ret === s || ret.startsWith(s + '/')) || SITES[0];
    if (!clientId || !secret) return back(site, 'provider_not_ready');
    const state = rand(), nonce = rand();
    const auth = new URL(cfg.authorize);
    for (const [k, v] of Object.entries({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri, scope: 'openid email profile', state, nonce, ...cfg.extra })) auth.searchParams.set(k, v);
    const sealed = await seal(env, { state, nonce, site, exp: Date.now() + 10 * 60_000 });
    return new Response(null, { status: 302, headers: {
      Location: auth.toString(),
      'Set-Cookie': `${cname}=${sealed}; Path=/oauth/${p}; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
      'Cache-Control': 'no-store',
    } });
  }

  if (step === 'callback') {
    const st = await unseal<{ state: string; nonce: string; site: string; exp: number }>(env, cookie(req, cname));
    const site = st && SITES.includes(st.site) ? st.site : SITES[0];
    const clear = `${cname}=; Path=/oauth/${p}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
    const fail = (code: string) => { const r = back(site, code); const h = new Headers(r.headers); h.append('Set-Cookie', clear); return new Response(null, { status: 302, headers: h }); };
    if (!st || st.exp < Date.now()) return fail('provider_expired');
    if (u.searchParams.get('error')) return fail('provider_cancelled');
    if (u.searchParams.get('state') !== st.state) return fail('provider_state');
    const code = u.searchParams.get('code');
    if (!code || !clientId || !secret) return fail('provider_failed');

    // 1. code → ID token (straight from the provider over TLS, authenticated with our secret)
    const tr = await redeem(p, clientId, secret, code);
    if (!tr.ok) { console.error('token exchange failed', p, tr.status, (await tr.text()).slice(0, 300)); return fail('provider_failed'); }
    const tok = await tr.json() as { id_token?: string };
    if (!tok.id_token) return fail('provider_failed');
    const v = verifiedEmail(p, claims(tok.id_token), clientId, st.nonce);
    if ('error' in v) { console.error('id token refused', p, v.error); return fail(v.error === 'work_account' ? 'provider_work_account' : 'provider_failed'); }

    // 2. verified email → one-time Supabase sign-in token (creates the login if it's new; sends no email)
    const gl = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: serverHeaders(env.SUPABASE_SERVICE_KEY, true),
      body: JSON.stringify({ type: 'magiclink', email: v.email }),
    });
    if (!gl.ok) { console.error('generate_link failed', gl.status); return fail('provider_failed'); }
    const link = await gl.json() as { hashed_token?: string; verification_type?: string; properties?: { hashed_token?: string; verification_type?: string } };
    const hashed = link.properties?.hashed_token || link.hashed_token;
    const type = link.properties?.verification_type || link.verification_type || 'magiclink';
    if (!hashed) return fail('provider_failed');

    return new Response(null, { status: 302, headers: {
      Location: `${site}/#/auth?token_hash=${encodeURIComponent(hashed)}&type=${encodeURIComponent(type)}`,
      'Set-Cookie': clear, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
    } });
  }
  return new Response('Not found', { status: 404 });
}
