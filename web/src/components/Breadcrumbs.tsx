import { useEffect, useState } from 'react';
import { FAMILY } from '../lib/site';
import { useStore } from '../lib/store';
import { fullName } from '../lib/format';
import { crumbsFor, parentHref } from '../lib/crumbs';
import { WovenBorder, useHeritage } from './Heritage';
import { useT } from '../lib/menulang';
import type { Route } from './common';

/*
 * How many pages deep into this visit we are. Each new page gets a number in its history entry,
 * so Back can tell "there's an earlier page of ours to go back to" from "they arrived here from a link".
 */
const depth = () => (typeof history.state?.famDepth === 'number' ? history.state.famDepth as number : 0);
let last = 0;
function stamp() {
  if (typeof history.state?.famDepth !== 'number') {
    try { history.replaceState({ ...(history.state || {}), famDepth: last + 1 }, ''); } catch { /* some webviews refuse */ }
  }
  last = depth();
}
if (typeof window !== 'undefined') {
  try { if (typeof history.state?.famDepth !== 'number') history.replaceState({ ...(history.state || {}), famDepth: 0 }, ''); } catch { /* ignore */ }
  last = depth();
  addEventListener('hashchange', stamp);
}

/** "You are here" trail plus a Back button, at the top of every page except Home. */
export function Breadcrumbs({ route }: { route: Route }) {
  const t = useT();
  const { family, snap, isAdmin } = useStore();
  const { border } = useHeritage();
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  const crumbs = crumbsFor(route, {
    personName: (id) => fullName(family.byId.get(id)),
    threadTitle: (id) => snap.threads.find((t) => t.id === id)?.title ?? '',
    photoCaption: (id) => snap.photos.find((p) => p.id === id)?.caption ?? '',
    isAdmin,
  });
  const here = crumbs.length ? crumbs[crumbs.length - 1].label : '';
  useEffect(() => {
    const prefix = document.title.match(/^\(\d+\+?\)\s*/)?.[0] || '';
    document.title = `${prefix}${here ? here + ' · ' : ''}${FAMILY}`;
  }, [here]);
  if (!crumbs.length) return null;
  const back = () => { if (depth() > 0) history.back(); else location.hash = parentHref(crumbs); };
  return (
    <nav className="crumbbar" aria-label="You are here">
      <button type="button" className="crumbback" onClick={back} aria-label="Back">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        <span>{t('Back')}</span>
      </button>
      <ol className="crumbs">
        {crumbs.map((c, i) => (
          <li key={i}>
            {c.href ? <a href={c.href}>{t(c.label)}</a> : <span aria-current="page">{t(c.label)}</span>}
          </li>
        ))}
      </ol>
      <div className="crumbweave"><WovenBorder kind={border} slim /></div>
    </nav>
  );
}
