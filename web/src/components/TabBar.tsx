import { useStore } from '../lib/store';
import { usePresence } from '../lib/presence';
import type { Route } from './common';
import { useT } from '../lib/menulang';

/** Phones: the main places one thumb away. Hidden on larger screens (the sidebar does this there). */
export function TabBar({ route, onMore }: { route: Route; onMore: () => void }) {
  const { snap } = useStore();
  const { unread } = usePresence();
  const t = useT();
  const tab = (href: string, on: boolean, label: string, icon: React.ReactNode) => (
    <a href={href} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}>{icon}<span>{t(label)}</span></a>
  );
  return (
    <nav className="tabbar" aria-label="Main">
      {tab('#/', route.page === 'home', 'Home',
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 10.5 12 3.5l8.5 7" /><path d="M5.5 9v10.5a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9" /></svg>)}
      {tab('#/tree', route.page === 'tree', 'Tree',
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2.5" width="6" height="5" rx="1.5" /><rect x="2.5" y="16.5" width="6" height="5" rx="1.5" /><rect x="15.5" y="16.5" width="6" height="5" rx="1.5" /><path d="M12 7.5v4.5M5.5 16.5V12h13v4.5" /></svg>)}
      {tab('#/talk', route.page === 'talk', 'Talk',
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12a7.5 7.5 0 0 1-11 6.6L4 20l1.4-4.3A7.5 7.5 0 1 1 20 12z" /><path d="M8.5 11h.01M12 11h.01M15.5 11h.01" /></svg>)}
      {snap.me ? tab('#/chat', route.page === 'chat', 'Messages',
        <span className="tabicon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" /></svg>
          {unread > 0 && <b className="tabbadge" aria-label={`${unread} unread`}>{unread > 9 ? '9+' : unread}</b>}
        </span>) : null}
      <button type="button" onClick={onMore} className={['related', 'privacy', 'admin', 'photos', 'calendar', 'help', 'devcenter', 'whatsnew'].includes(route.page) ? 'on' : ''}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="5.5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="18.5" cy="12" r="1.4" /></svg>
        <span>{t('More')}</span></button>
    </nav>
  );
}
