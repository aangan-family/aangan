/**
 * Our API address (site.config.json → apiUrl) → our Supabase project.
 *
 * Indian internet providers have blocked *.supabase.co (DNS and SNI) under a government order, so
 * relatives on Jio, Airtel, ACT etc. can't reach the database or sign in. The website talks to
 * the API address instead, and this forwards each request unchanged to Supabase.
 *
 * It is a plain pass-through: it adds nothing (no server key, no secrets), stores nothing and
 * logs nothing. The browser's own publishable key and session token travel as they would directly.
 *
 * Only the parts of Supabase the website uses are passed on (0045 review): data (/rest), photo files
 * (/storage/v1/object) and the sign-in steps we use (email link, Google token, refresh, sign-out, admins' 2-step codes). Password
 * sign-up/sign-in, password recovery, GraphQL, Realtime and the admin API answer 404 here. Responses carry
 * nosniff, and photo files a sandbox policy, so a stored file can never run as a page on this domain.
 */
export const PROXY_HOST = API_HOST;
const DROP = ['host', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'x-forwarded-proto', 'x-real-ip', 'cookie'];

import { PROXY_HEADER } from './keys';
import { API_HOST } from './site';

const AUTH_PATHS: Record<string, string[]> = {
  '/auth/v1/otp': ['POST'],
  '/auth/v1/verify': ['POST'],
  '/auth/v1/user': ['GET'],
  '/auth/v1/logout': ['POST'],
  '/auth/v1/health': ['GET'],
  '/auth/v1/token': ['POST'],
};
const TOKEN_GRANTS = ['refresh_token', 'id_token', 'pkce'];

/** Is this a request the website itself makes? (OPTIONS preflights follow the same paths.) */
export function allowed(method: string, path: string, search: URLSearchParams): boolean {
  const m = method === 'OPTIONS' ? null : method;
  if (path.startsWith('/rest/v1/')) return true;
  if (path.startsWith('/storage/v1/object/')) return true;
  // 2-step sign-in for admins (0046): set up, challenge, verify, remove an unfinished set-up
  if (path === '/auth/v1/factors') return !m || m === 'POST';
  if (/^\/auth\/v1\/factors\/[0-9a-f-]{36}\/(challenge|verify)$/.test(path)) return !m || m === 'POST';
  if (/^\/auth\/v1\/factors\/[0-9a-f-]{36}$/.test(path)) return !m || m === 'DELETE';
  const ok = AUTH_PATHS[path];
  if (!ok || (m && !ok.includes(m))) return false;
  if (path === '/auth/v1/token' && m) return TOKEN_GRANTS.includes(search.get('grant_type') || '');
  return true;
}

export async function proxy(req: Request, supabaseUrl: string, token?: string): Promise<Response> {
  const u = new URL(req.url);
  if (!allowed(req.method, u.pathname, u.searchParams)) {
    const origin = req.headers.get('origin');
    return new Response(JSON.stringify({ message: 'Not found' }), { status: 404, headers: {
      'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    } });
  }
  // asking for a code with create_user:false answers differently for registered and unknown addresses (an
  // enumeration oracle); the website never asks that way, so answer every such request the same, without Supabase
  if (req.method === 'POST' && u.pathname === '/auth/v1/otp') {
    const text = await req.clone().text();
    try {
      if ((JSON.parse(text) as { create_user?: unknown }).create_user === false) {
        const origin = req.headers.get('origin');
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json', ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}) } });
      }
    } catch { /* not JSON: Supabase will refuse it */ }
  }
  const target = new URL(u.pathname + u.search, supabaseUrl);
  const headers = new Headers(req.headers);
  for (const h of DROP) headers.delete(h);
  headers.delete(PROXY_HEADER);
  if (token) headers.set(PROXY_HEADER, token);   // 0047: proves the request came through here
  const res = await fetch(target.toString(), {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
    redirect: 'manual',
  });
  const out = new Headers(res.headers);
  out.delete('set-cookie');
  out.set('X-Content-Type-Options', 'nosniff');
  if (u.pathname.startsWith('/storage/v1/object/')) out.set('Content-Security-Policy', "default-src 'none'; sandbox");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
}
