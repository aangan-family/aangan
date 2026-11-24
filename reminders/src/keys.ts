/**
 * Headers for calling Supabase with the server key.
 * Supabase's new secret keys (sb_secret_…) go only in the `apikey` header: they aren't JWTs, and Supabase
 * refuses them as `Authorization: Bearer`. The old service_role key (a JWT, eyJ…) is sent in both, as before.
 * So the Worker works with either key while we move over, and keeps working once the old keys are switched off.
 */
export function serverHeaders(key: string, json = false): Record<string, string> {
  const h: Record<string, string> = { apikey: key };
  if (!key.startsWith('sb_')) h.Authorization = `Bearer ${key}`;
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

async function hmacHex(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 0047: the header that proves a request came through our API address. Derived from the server key, so it
 * needs no secret of its own and changes when the key is replaced. The Worker registers only its SHA-256 with
 * the database (proxy_token_set, every 10 minutes); the database refuses member/anon requests without it, so
 * calling supabase.co directly (skipping our limits and path allow-list) gets nothing.
 */
export const PROXY_HEADER = 'x-fam-proxy';
export function proxyToken(serverKey: string): Promise<string> {
  return hmacHex(serverKey, 'fam-proxy-v1');
}
