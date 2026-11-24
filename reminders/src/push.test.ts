import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { createECDH, createPublicKey, verify, randomBytes } from 'node:crypto';
import { b64u, encrypt, vapidHeader } from './push';

// http_ece is the reference implementation used by the web-push library; we only use it here, to decrypt.
const require = createRequire(import.meta.url);
let ece: { decrypt: (b: Buffer, o: object) => Buffer } | null = null;
try { ece = require('http_ece'); } catch { /* not installed: the round-trip test is skipped */ }

describe('Web Push encryption (RFC 8291)', () => {
  it('a device can decrypt what we send', async () => {
    if (!ece) return;
    const ua = createECDH('prime256v1'); ua.generateKeys();
    const authSecret = randomBytes(16);
    const sub = { endpoint: 'https://push.example.com/x', p256dh: b64u.encode(ua.getPublicKey()), auth: b64u.encode(authSecret) };
    const body = await encrypt(sub, new TextEncoder().encode('{"title":"New message","body":"Kavya sent you a message"}'));
    const plain = ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: ua, authSecret });
    expect(plain.toString()).toBe('{"title":"New message","body":"Kavya sent you a message"}');
  });
  it('the body starts with salt, a 4096 record size and our 65-byte public key', async () => {
    const ua = createECDH('prime256v1'); ua.generateKeys();
    const body = await encrypt({ endpoint: 'https://x', p256dh: b64u.encode(ua.getPublicKey()), auth: b64u.encode(randomBytes(16)) }, new Uint8Array([1, 2, 3]));
    expect([...body.slice(16, 20)]).toEqual([0, 0, 16, 0]);
    expect(body[20]).toBe(65);
    expect(body[21]).toBe(4); // uncompressed point
  });
});

describe('VAPID (RFC 8292)', () => {
  it('signs a token the push service can verify', async () => {
    const k = createECDH('prime256v1'); k.generateKeys();
    const env = { VAPID_PUBLIC: b64u.encode(k.getPublicKey()), VAPID_PRIVATE: b64u.encode(k.getPrivateKey()) };
    const h = await vapidHeader(env, 'https://fcm.googleapis.com/fcm/send/abc', Date.UTC(2026, 10, 16));
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h)!;
    expect(m[4]).toBe(env.VAPID_PUBLIC);
    const claims = JSON.parse(Buffer.from(b64u.decode(m[2])).toString());
    expect(claims.aud).toBe('https://fcm.googleapis.com');
    expect(claims.sub).toBe('mailto:family@ourfamily.example');
    const pub = k.getPublicKey();
    const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u.encode(pub.subarray(1, 33)), y: b64u.encode(pub.subarray(33)) }, format: 'jwk' });
    expect(verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(b64u.decode(m[3])))).toBe(true);
  });
});
