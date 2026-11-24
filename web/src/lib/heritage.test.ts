import { describe, expect, it } from 'vitest';
import { borderChoices, borderFor, pageName, showMl, showTa } from './heritage';
import { parseRoute } from '../components/common';

describe('borders by gender', () => {
  it('men get the veshti, women the saree, others the green saree', () => {
    expect(borderChoices('m')).toEqual(['veshti-red', 'veshti-blue']);
    expect(borderChoices('f')).toEqual(['saree-green', 'saree-red']);
    expect(borderFor('m')).toBe('veshti-red');
    expect(borderFor('f')).toBe('saree-green');
    expect(borderFor('')).toBe('saree-green');
    expect(borderFor('o')).toBe('saree-green');
  });
  it('a saved colour is used only if it belongs to that gender', () => {
    expect(borderFor('m', 'veshti-blue')).toBe('veshti-blue');
    expect(borderFor('m', 'saree-red')).toBe('veshti-red');
    expect(borderFor('f', 'saree-red')).toBe('saree-red');
    expect(borderFor('', 'veshti-blue')).toBe('saree-green');
  });
});

describe('page names in Malayalam and Tamil', () => {
  it('main pages have both, home and admin pages have none', () => {
    expect(pageName(parseRoute('#/tree'), null)).toEqual({ ml: 'കുടുംബവൃക്ഷം', ta: 'குடும்ப மரம்' });
    expect(pageName(parseRoute('#/calendar/2026-11'), null)?.ta).toBe('நாட்காட்டி');
    expect(pageName(parseRoute('#/'), null)).toBeNull();
    expect(pageName(parseRoute('#/admin'), null)).toBeNull();
  });
  it('a profile is named only when it is your own', () => {
    expect(pageName(parseRoute('#/p/P1'), 'P1')?.ml).toBe('എന്റെ വിവരങ്ങൾ');
    expect(pageName(parseRoute('#/p/P2'), 'P1')).toBeNull();
  });
  it('the words switch picks the scripts', () => {
    expect([showMl('both'), showTa('both')]).toEqual([true, true]);
    expect([showMl('ml'), showTa('ml')]).toEqual([true, false]);
    expect([showMl('en'), showTa('en')]).toEqual([false, false]);
  });
});
