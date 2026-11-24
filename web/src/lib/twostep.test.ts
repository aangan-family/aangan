import { describe, expect, it } from 'vitest';
import { daysLeft, daysLeftText } from './twostep';

describe('2-step countdown', () => {
  const now = Date.parse('2026-11-22T10:00:00Z');
  it('counts whole days from becoming admin', () => {
    expect(daysLeft('2026-11-22T09:00:00Z', now)).toBe(7);
    expect(daysLeft('2026-11-19T09:00:00Z', now)).toBe(4);
    expect(daysLeft('2026-11-16T09:00:00Z', now)).toBe(1);
    expect(daysLeft('2026-11-01T09:00:00Z', now)).toBe(0);
  });
  it('says plainly what happens', () => {
    expect(daysLeftText(4)).toMatch(/4 days left/);
    expect(daysLeftText(1)).toMatch(/Last day/);
    expect(daysLeftText(0)).toMatch(/today/);
  });
});
