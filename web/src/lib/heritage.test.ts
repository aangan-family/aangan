import { describe, expect, it } from 'vitest';
import { borderChoices, borderFor, pageName, showMl, showTa } from './heritage';
import { parseRoute } from '../components/common';

describe('borders by traditions', () => {
  it('each tradition has its own textiles; English has none', () => {
    expect(borderChoices('f', 'punjabi')).toEqual(['khes', 'phulkari']);
    expect(borderFor('f', null, 'punjabi')).toBe('phulkari');
    expect(borderFor('m', null, 'punjabi')).toBe('khes');
    expect(borderFor('m', null, 'bengali')).toBe('dhuti');
    expect(borderFor('f', null, 'odia')).toBe('sambalpuri');
    expect(borderFor('', null, 'hindi')).toBe('leheriya');
    expect(borderFor('f', null, 'english')).toBe(null);
  });
  it('a chosen textile follows the member, whatever their traditions', () => {
    expect(borderFor('m', 'phulkari', 'tamil')).toBe('phulkari');
    expect(borderFor('f', 'kasavu', 'english')).toBe('kasavu');
    expect(borderFor('f', 'not-a-border', 'hindi')).toBe('banarasi');
  });
  it('every tradition lists only textiles we draw', async () => {
    const { COMMUNITY_TEXTILES, TEXTILE } = await import('./heritage');
    const { PACK_LIST } = await import('./community/packs');
    for (const p of PACK_LIST) {
      expect(COMMUNITY_TEXTILES[p.id], p.id).toBeDefined();
      for (const id of COMMUNITY_TEXTILES[p.id]) expect(TEXTILE.has(id), id).toBe(true);
    }
  });
});

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
