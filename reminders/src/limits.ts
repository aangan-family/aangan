/**
 * Rate limits on our API address (security review M2, L3).
 *
 *  - Every request passed to Supabase counts against the signed-in person (or the IP address when signed out):
 *    at most 300 a minute per Cloudflare location. The site itself uses a few dozen when a page opens, so only
 *    a script copying data hits it. Photo downloads through already-signed links don't count.
 *  - Asking for a sign-in email (/auth/v1/otp and friends) allows 5 a minute per IP address. Supabase's own
 *    per-IP limits can't tell relatives apart (every request reaches it from this Worker), so this is the one
 *    that stops someone flooding strangers' inboxes with sign-in emails; Supabase's 30 an hour cap stays behind it.
 *  - Pages behind PREVIEW_KEY (status, previews) allow 10 tries a minute per IP, so the key can't be guessed.
 *  - When someone is stopped, the health check emails the admin ("someone read unusually fast").
 */
export interface LimitEnv { API_LIMIT?: RateLimit; KEY_LIMIT?: RateLimit; MAIL_LIMIT?: RateLimit }

/** The signed-in user's id from the token, or null (no token, or the public key). Not verified: Supabase does that. */
export function tokenSub(auth: string | null): string | null {
  const t = (auth || '').replace(/^Bearer\s+/i, '');
  const parts = t.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.sub === 'string' && /^[0-9a-f-]{36}$/i.test(json.sub) ? json.sub : null;
  } catch { return null; }
}

/** Photo files fetched through a signed link: they carry their own short-lived token. */
export const freePath = (method: string, path: string) => method === 'GET' && path.startsWith('/storage/v1/object/sign/');

export function limitKey(req: Request): string {
  const sub = tokenSub(req.headers.get('authorization'));
  return sub ? `u:${sub}` : `ip:${req.headers.get('cf-connecting-ip') || 'unknown'}`;
}

export function tooMany(origin: string | null): Response {
  const h: Record<string, string> = { 'Content-Type': 'application/json', 'Retry-After': '60', 'Cache-Control': 'no-store' };
  if (origin) { h['Access-Control-Allow-Origin'] = origin; h.Vary = 'Origin'; }
  return new Response(JSON.stringify({ message: 'That was a lot of requests in a short time. Please wait a minute and try again.' }), { status: 429, headers: h });
}

/** Returns the key that was stopped, or null if the request may go ahead. Fails open if the binding is missing. */
/** Requests that make Supabase send an email. */
export const mailPath = (method: string, path: string) => method === 'POST' && /^\/auth\/v1\/(otp|signup|recover|magiclink|resend)$/.test(path);

export async function checkApi(req: Request, env: LimitEnv): Promise<string | null> {
  const path = new URL(req.url).pathname;
  if (env.MAIL_LIMIT && mailPath(req.method, path)) {
    const key = `mail:${req.headers.get('cf-connecting-ip') || 'unknown'}`;
    const { success } = await env.MAIL_LIMIT.limit({ key });
    if (!success) return key;
  }
  if (!env.API_LIMIT || req.method === 'OPTIONS' || freePath(req.method, path)) return null;
  const key = limitKey(req);
  const { success } = await env.API_LIMIT.limit({ key });
  return success ? null : key;
}

export async function checkKeyTries(req: Request, env: LimitEnv): Promise<boolean> {
  if (!env.KEY_LIMIT) return true;
  const { success } = await env.KEY_LIMIT.limit({ key: `ip:${req.headers.get('cf-connecting-ip') || 'unknown'}` });
  return success;
}
