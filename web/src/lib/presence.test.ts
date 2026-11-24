import { describe, expect, it } from 'vitest';
import { statusFor, statusLabel } from './presence';

describe('online status', () => {
  const now = Date.parse('2026-11-14T12:00:00Z');
  it('online within two minutes of a heartbeat', () => {
    expect(statusFor('2026-11-14T11:59:10Z', now, true).kind).toBe('online');
    expect(statusFor('2026-11-14T11:57:30Z', now, true).kind).toBe('away');
  });
  it('hidden and never-active people show no dot', () => {
    expect(statusFor(null, now, true).kind).toBe('hidden');
    expect(statusFor(undefined, now, false).kind).toBe('never');
  });
  it('reads naturally', () => {
    expect(statusLabel({ kind: 'online' })).toBe('Online');
    expect(statusLabel({ kind: 'away', seen: new Date(Date.now() - 30 * 60000).toISOString() })).toBe('Active 30 min ago');
    expect(statusLabel({ kind: 'away', seen: new Date(Date.now() - 3 * 3600000).toISOString() })).toBe('Active 3 hrs ago');
    expect(statusLabel({ kind: 'away', seen: new Date(Date.now() - 26 * 3600000).toISOString() })).toBe('Active yesterday');
  });
});
describe('never active vs hidden', () => {
  it('tells them apart', () => {
    expect(statusFor('', Date.now(), true).kind).toBe('never');
    expect(statusFor(null, Date.now(), true).kind).toBe('hidden');
  });
});
