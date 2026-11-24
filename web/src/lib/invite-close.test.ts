import { describe, expect, it } from 'vitest';
import { closeRelatives, elderLink, joinRequestMessage } from './invite';

const m = (o: Record<string, string[]>) => new Map(Object.entries(o));
describe('closest relatives to invite', () => {
  const f = {
    parents: m({ me: ['dad', 'mum'], sis: ['dad', 'mum'], kid: ['me', 'wife'], wife: ['fil'], wbro: ['fil'], niece: ['sis'], dad: ['gpa'] }),
    children: m({ dad: ['me', 'sis'], mum: ['me', 'sis'], me: ['kid'], wife: ['kid'], fil: ['wife', 'wbro'], sis: ['niece'], gpa: ['dad'] }),
    spouses: m({ me: ['wife'], wife: ['me'], dad: ['mum'], mum: ['dad'], sis: ['bil'] }),
  };
  it('puts husband or wife, parents, children and siblings first, then in-laws, then the wider family', () => {
    const r = closeRelatives(f, 'me');
    expect(r.slice(0, 5)).toEqual(['wife', 'dad', 'mum', 'kid', 'sis']);
    expect(r.indexOf('fil')).toBeGreaterThan(r.indexOf('sis'));
    expect(r.indexOf('bil')).toBeGreaterThan(r.indexOf('wbro'));
    expect(r.indexOf('niece')).toBeGreaterThan(r.indexOf('bil'));
    expect(r).not.toContain('me');
    expect(new Set(r).size).toBe(r.length);
  });
  it('makes the links and messages', () => {
    expect(elderLink('abcdefghijkl')).toMatch(/\/\?elder=1#\/invite\/abcdefghijkl$/);
    expect(elderLink('abcdefghijkl', true)).toMatch(/\/\?elder=1&ta=1#\/invite\/abcdefghijkl$/);
    expect(joinRequestMessage('Mani')).toMatch(/^Hi Mani 🙏[\s\S]*\/#\/join/);
  });
});
