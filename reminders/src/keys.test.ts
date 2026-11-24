import { describe, expect, it } from 'vitest';
import { serverHeaders } from './keys';

describe('serverHeaders', () => {
  it('sends a new secret key only as apikey', () => {
    expect(serverHeaders('sb_secret_abc', true)).toEqual({ apikey: 'sb_secret_abc', 'Content-Type': 'application/json' });
  });
  it('still sends an old service_role key in both headers', () => {
    expect(serverHeaders('eyJhbGciOi.x.y')).toEqual({ apikey: 'eyJhbGciOi.x.y', Authorization: 'Bearer eyJhbGciOi.x.y' });
  });
});

describe('pass-through proof header (0047)', () => {
  it('is a stable HMAC of the server key, different for another key', async () => {
    const { proxyToken, sha256Hex } = await import('./keys');
    const a = await proxyToken('sb_secret_one');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await proxyToken('sb_secret_one')).toBe(a);
    expect(await proxyToken('sb_secret_two')).not.toBe(a);
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
