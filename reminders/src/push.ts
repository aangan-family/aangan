/**
 * Phone notifications (Web Push), with nothing but WebCrypto.
 *
 *  - VAPID (RFC 8292): a short ES256 token proves the notification comes from us.
 *    VAPID_PUBLIC (base64url, 65 bytes) is in wrangler.toml and in the site; VAPID_PRIVATE (base64url, 32 bytes)
 *    is a Worker secret that only the admin pastes in Cloudflare.
 *  - Payload encryption (RFC 8291, aes128gcm): only the person's own device can read the notification.
 *    Apple's and Google's push services pass along an encrypted blob.
 *
 * What we send is small and says who, never what: {title, body, url, tag}.
 */

import { EMAIL_FROM } from './site';

export interface PushEnv { VAPID_PUBLIC?: string; VAPID_PRIVATE?: string }
export interface PushSub { endpoint: string; p256dh: string; auth: string }
export interface PushMsg { title: string; body: string; url: string; tag?: string }

const enc = new TextEncoder();
export const b64u = {
  encode(b: ArrayBuffer | Uint8Array): string {
    const u = b instanceof Uint8Array ? b : new Uint8Array(b);
    let s = ''; for (const x of u) s += String.fromCharCode(x);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(s: string): Uint8Array {
    const t = s.replace(/-/g, '+').replace(/_/g, '/'); const p = t + '='.repeat((4 - (t.length % 4)) % 4);
    return Uint8Array.from(atob(p), (c) => c.charCodeAt(0));
  },
};
const cat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}
/** HKDF with SHA-256: extract with `salt`, expand with `info`, first `len` bytes (len ≤ 32). */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const prk = await hmac(salt, ikm);
  return (await hmac(prk, cat(info, new Uint8Array([1])))).slice(0, len);
}

/** RFC 8291 aes128gcm body for one device. `salt` and `local` are only passed in tests. */
export async function encrypt(sub: PushSub, plaintext: Uint8Array, opts: { salt?: Uint8Array; local?: CryptoKeyPair } = {}): Promise<Uint8Array> {
  const uaPublic = b64u.decode(sub.p256dh), authSecret = b64u.decode(sub.auth);
  const local = opts.local || (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey } as never, local.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, cat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = opts.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(plaintext, new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return cat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}

/** The VAPID Authorization header for one push service (cached per origin by the caller). */
export async function vapidHeader(env: Required<PushEnv>, endpoint: string, now = Date.now()): Promise<string> {
  const pub = b64u.decode(env.VAPID_PUBLIC);
  const jwk = { kty: 'EC', crv: 'P-256', d: env.VAPID_PRIVATE, x: b64u.encode(pub.slice(1, 33)), y: b64u.encode(pub.slice(33, 65)), ext: true };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u.encode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u.encode(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: `mailto:${EMAIL_FROM}` })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${claims}`)));
  return `vapid t=${head}.${claims}.${b64u.encode(sig)}, k=${env.VAPID_PUBLIC}`;
}

export type PushOutcome = 'ok' | 'gone' | 'failed';

/** Send one notification to one device. */
export async function sendPush(env: Required<PushEnv>, sub: PushSub, msg: PushMsg, auth?: string, urgent = false): Promise<{ outcome: PushOutcome; status: number }> {
  const body = await encrypt(sub, enc.encode(JSON.stringify({ title: msg.title, body: msg.body, url: msg.url, tag: msg.tag || '' })));
  const headers: Record<string, string> = {
    Authorization: auth || (await vapidHeader(env, sub.endpoint)),
    'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
    TTL: '43200', Urgency: urgent ? 'high' : 'normal',
  };
  const topic = (msg.tag || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
  if (topic) headers.Topic = topic;
  const r = await fetch(sub.endpoint, { method: 'POST', headers, body });
  return { outcome: r.status === 404 || r.status === 410 ? 'gone' : r.ok ? 'ok' : 'failed', status: r.status };
}
