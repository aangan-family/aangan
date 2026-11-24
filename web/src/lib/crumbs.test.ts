import { describe, expect, it } from 'vitest';
import { crumbsFor, parentHref } from './crumbs';
import { parseRoute } from '../components/common';

const ctx = { personName: (id: string) => (id === 'P1' ? 'Lakshmi Chidambaram' : ''), threadTitle: (id: string) => (id.startsWith('a') ? 'Pongal plans' : ''), photoCaption: () => '', isAdmin: true };
const at = (hash: string, c = ctx) => crumbsFor(parseRoute(hash), c);
const labels = (hash: string, c = ctx) => at(hash, c).map((x) => x.label);

describe('breadcrumbs', () => {
  it('Home has no trail', () => { expect(at('#/')).toEqual([]); });
  it('every other page starts at Home and ends on the page, unlinked', () => {
    for (const h of ['#/tree', '#/p/P1', '#/related', '#/privacy', '#/photos', '#/talk', '#/chat', '#/calendar', '#/help', '#/admin', '#/devcenter', '#/whats-new']) {
      const c = at(h);
      expect(c[0]).toEqual({ label: 'Home', href: '#/' });
      expect(c[c.length - 1].href).toBeUndefined();
    }
  });
  it('names people, conversations, months and sections', () => {
    expect(labels('#/p/P1')).toEqual(['Home', 'Family tree', 'Lakshmi Chidambaram']);
    expect(labels('#/talk/' + 'a'.repeat(8) + '-0000-0000-0000-000000000000')).toEqual(['Home', 'Talk', 'Pongal plans']);
    expect(labels('#/calendar/2026-11-15')).toEqual(['Home', 'Calendar', 'November 2026', '15 Nov']);
    expect(at('#/calendar/2026-11-15')[2].href).toBe('#/calendar/2026-11');
    expect(labels('#/help/invite')).toEqual(['Home', 'Help & FAQ', 'Inviting relatives']);
    expect(labels('#/admin/members')).toEqual(['Home', 'Admin', 'Members & roles']);
    expect(labels('#/devcenter/vapt')).toEqual(['Home', 'DevCenter', 'Security review (VAPT)']);
  });
  it('stewards see their own page name, and unknown ids get a plain fallback', () => {
    expect(labels('#/admin/requests', { ...ctx, isAdmin: false })).toEqual(['Home', 'Requests to join']);
    expect(labels('#/p/NOPE')).toEqual(['Home', 'Family tree', 'Person']);
    expect(labels('#/chat/NOPE')).toEqual(['Home', 'Messages', 'Conversation']);
  });
  it('Back without history goes one step up', () => {
    expect(parentHref(at('#/p/P1'))).toBe('#/tree');
    expect(parentHref(at('#/privacy'))).toBe('#/');
    expect(parentHref(at('#/calendar/2026-11-15'))).toBe('#/calendar/2026-11');
  });
});
