import { describe, expect, it } from 'vitest';
import { HELP, helpFor, searchHelp } from './help';

// every **bold** phrase in an answer should be something the site actually shows (a button, a tab, a label)
const NOT_LABELS = new Set(['steward', 'admin', 'Family', 'Close family', 'Only me', 'haven’t joined', 'ourfamily.example/#/join', 'Me', 'More', 'Talk', 'Calendar', 'Open in Chrome', 'Open in Safari', 'Add to Home screen']);
// every page and component, as text (Vite loads them raw)
const files = import.meta.glob(['../**/*.tsx', '../**/*.ts', '!../**/*.test.*', '!./help.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const SRC = Object.values(files).join('\n').replace(/&amp;/g, '&');

describe('help', () => {
  it('has unique ids', () => { expect(new Set(HELP.map((h) => h.id)).size).toBe(HELP.length); });
  it('hides steward and admin help from members', () => {
    expect(helpFor('member').some((h) => h.section === 'stewards' || h.section === 'admin')).toBe(false);
    expect(helpFor('steward').some((h) => h.section === 'stewards')).toBe(true);
    expect(helpFor('steward').some((h) => h.section === 'admin')).toBe(false);
    expect(helpFor('admin').some((h) => h.section === 'admin')).toBe(true);
  });
  it('finds answers by words', () => {
    expect(searchHelp(helpFor('member'), 'change my name').map((h) => h.id)).toContain('name');
    expect(searchHelp(helpFor('member'), 'wedding').map((h) => h.id)).toContain('wedding');
  });
  it('only names buttons and labels that exist on the site', () => {
    expect(SRC.length).toBeGreaterThan(50000);
    const missing: string[] = [];
    for (const h of HELP) for (const m of h.a.matchAll(/\*\*([^*]+)\*\*/g)) {
      if (!NOT_LABELS.has(m[1]) && !SRC.includes(m[1])) missing.push(`${h.id}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });
});
