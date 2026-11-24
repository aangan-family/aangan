// The native-speaker review sheets (docs/review/*.csv) are made from the packs.
// `npm run review-kit` rewrites them; this test fails if a pack changed and the sheets weren't rewritten.
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PACK_LIST } from './packs';
import { REVIEW_ROWS, reviewSheet } from './review';

const dir = new URL('../../../../docs/review/', import.meta.url);
const update = !!process.env.UPDATE_REVIEW;

describe('review sheets', () => {
  it('every relationship row has a unique id and an English name', () => {
    expect(new Set(REVIEW_ROWS.map((r) => r.id)).size).toBe(REVIEW_ROWS.length);
    for (const r of REVIEW_ROWS) expect(r.english).toBeTruthy();
  });

  it('merges a man and a woman speaking only for the same relationship with the same word', () => {
    const hindi = PACK_LIST.find((p) => p.id === 'hindi')!;
    const csv = reviewSheet(hindi);
    expect(csv).toMatch(/Husband's father,a woman,Sasur ji/);
    expect(csv).toMatch(/Wife's father,a man,Sasur ji/);
    expect(csv).toMatch(/Elder brother,anyone,Bhaiya,भैया/);
    expect(csv.startsWith('﻿Row,Relationship')).toBe(true);
  });

  for (const p of PACK_LIST.filter((x) => x.id !== 'english')) {
    it(`${p.name} sheet is up to date (npm run review-kit)`, () => {
      const file = new URL(`${p.id}.csv`, dir);
      const csv = reviewSheet(p);
      if (update) { mkdirSync(dir, { recursive: true }); writeFileSync(file, csv); }
      expect(existsSync(file), `docs/review/${p.id}.csv is missing: run npm run review-kit`).toBe(true);
      expect(readFileSync(file, 'utf8'), `docs/review/${p.id}.csv is out of date: run npm run review-kit`).toBe(csv);
    });
  }
});
