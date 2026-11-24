import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { translateText, PAGE_LANGS } from './pages';
import phrases from './phrases.json';

const dict = (l: string) => { const d = JSON.parse(readFileSync(new URL(`./${l}.json`, import.meta.url), 'utf8')); delete d._note; return d as Record<string, string>; };

describe('page translation', () => {
  const d = { 'Cancel': 'रद्द करें', 'How are we related?': 'हमारा क्या रिश्ता है?' };
  it('swaps a whole known phrase and keeps the spaces around it', () => {
    expect(translateText('Cancel', d)).toBe('रद्द करें');
    expect(translateText('  Cancel ', d)).toBe('  रद्द करें ');
    expect(translateText('How  are we\nrelated?', d)).toBe('हमारा क्या रिश्ता है?');
  });
  it('never touches text that is only partly a phrase (people\'s own words)', () => {
    expect(translateText('Cancel the trip to Madurai', d)).toBeNull();
    expect(translateText('Ravi', d)).toBeNull();
    expect(translateText('', d)).toBeNull();
  });
  for (const l of PAGE_LANGS) {
    it(`${l}: every translation is filled in and most keys are still phrases the site shows`, () => {
      const t = dict(l), keys = Object.keys(t), known = new Set(phrases as string[]);
      for (const k of keys) expect(t[k].trim(), k).not.toBe('');
      const still = keys.filter((k) => known.has(k)).length;
      // when interface wording changes, run `npm run phrases` and move the translations to the new wording
      expect(still / keys.length).toBeGreaterThan(0.9);
    });
  }
  it('no single-word month or day names that are also people\'s names', () => {
    for (const l of PAGE_LANGS) expect(dict(l).May).toBeUndefined();
  });
});
