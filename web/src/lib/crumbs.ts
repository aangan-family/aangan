import type { Route } from '../components/common';
import { SECTION_LABEL, type HelpSection } from './help';

/** One step in the "you are here" trail. The last step has no link (it's the page you're on). */
export interface Crumb { label: string; href?: string }

export interface CrumbContext {
  /** a person's display name, or '' if not in the tree */
  personName: (id: string) => string;
  /** a Talk conversation's title, or '' if unknown */
  threadTitle: (id: string) => string;
  /** a shared photo's caption, or '' */
  photoCaption: (id: string) => string;
  isAdmin: boolean;
}

export const ADMIN_TAB_LABEL: Record<string, string> = {
  requests: 'Requests to join', invite: 'Invitations', missing: 'No email yet', members: 'Members & roles',
  messages: 'Messages', deletions: 'Deletion requests', audit: 'Recent changes',
};
export const DEV_SECTION_LABEL: Record<string, string> = {
  operations: 'Operations', build: 'How each feature is built', security: 'Security, privacy and law', vapt: 'Security review (VAPT)',
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const short = (s: string, n = 40) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const humanize = (id: string) => id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** The trail for a page, starting at Home. Home itself has no trail. */
export function crumbsFor(route: Route, ctx: CrumbContext): Crumb[] {
  const home: Crumb = { label: 'Home', href: '#/' };
  const trail = (...rest: Crumb[]): Crumb[] => {
    const all = [home, ...rest];
    const last = all[all.length - 1];
    all[all.length - 1] = { label: last.label }; // you are here: no link
    return all;
  };
  switch (route.page) {
    case 'home': return [];
    case 'person': return trail({ label: 'Family tree', href: '#/tree' }, { label: short(ctx.personName(route.id) || 'Person') });
    case 'tree': return route.id
      ? trail({ label: 'Family tree', href: '#/tree' }, { label: short(ctx.personName(route.id) || 'Person') })
      : trail({ label: 'Family tree' });
    case 'related': return trail({ label: 'How are we related?' });
    case 'privacy': return trail({ label: 'My privacy' });
    case 'photos': return route.id
      ? trail({ label: 'Photos', href: '#/photos' }, { label: short(ctx.photoCaption(route.id) || 'Photo') })
      : trail({ label: 'Photos' });
    case 'talk': return route.id
      ? trail({ label: 'Talk', href: '#/talk' }, { label: short(ctx.threadTitle(route.id) || 'Conversation') })
      : trail({ label: 'Talk' });
    case 'chat': return route.id
      ? trail({ label: 'Messages', href: '#/chat' }, { label: route.id === 'site' ? 'Family Admin' : short(ctx.personName(route.id) || 'Conversation') })
      : trail({ label: 'Messages' });
    case 'calendar': {
      const m = route.at?.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
      if (!m) return trail({ label: 'Calendar' });
      const month = `${MONTHS[Number(m[2]) - 1] ?? ''} ${m[1]}`;
      return m[3]
        ? trail({ label: 'Calendar', href: '#/calendar' }, { label: month, href: `#/calendar/${m[1]}-${m[2]}` }, { label: `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]?.slice(0, 3)}` })
        : trail({ label: 'Calendar', href: '#/calendar' }, { label: month });
    }
    case 'help': return route.section && route.section in SECTION_LABEL
      ? trail({ label: 'Help & FAQ', href: '#/help' }, { label: SECTION_LABEL[route.section as HelpSection] })
      : trail({ label: 'Help & FAQ' });
    case 'admin': {
      const root = ctx.isAdmin ? 'Admin' : 'Requests to join';
      const tab = route.tab && ADMIN_TAB_LABEL[route.tab];
      return tab && tab !== root ? trail({ label: root, href: '#/admin' }, { label: tab }) : trail({ label: root });
    }
    case 'devcenter': return route.id
      ? trail({ label: 'DevCenter', href: '#/devcenter' }, { label: DEV_SECTION_LABEL[route.id] ?? humanize(route.id) })
      : trail({ label: 'DevCenter' });
    case 'whatsnew': return trail({ label: 'What’s New!' });
    case 'child': return trail({ label: 'Waiting for a parent' });
  }
}

/** Where Back goes when there is no earlier page in this visit: one step up the trail. */
export function parentHref(crumbs: Crumb[]): string {
  for (let i = crumbs.length - 2; i >= 0; i--) if (crumbs[i].href) return crumbs[i].href!;
  return '#/';
}
