import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { ago } from '../lib/format';
import { focus, orderForBell, unreadCount, updatesFor, type Update } from '../lib/updates';
import { Avatar, go } from './common';
import { usePresence } from '../lib/presence';

export function Bell() {
  const { snap, family, canManage, api, reload } = useStore();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(snap.prefs.updates_seen_at);
  const box = useRef<HTMLDivElement>(null);
  const all = useMemo(() => updatesFor(snap, family, canManage), [snap, family, canManage]);
  const unread = unreadCount(all, seen);
  const items = useMemo(() => orderForBell(all, seen), [all, seen]);
  const personal = all.filter((u) => u.personal && (!seen || u.at > seen)).length;

  // the count also shows in the browser tab and on the app icon (when installed and supported): updates plus unread messages
  const { unread: messages } = usePresence();
  const total = unread + messages;
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\)\s*/, '');
    document.title = total ? `(${total > 9 ? '9+' : total}) ${base}` : base;
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    (total ? nav.setAppBadge?.(total) : nav.clearAppBadge?.())?.catch(() => {});
  }, [total]);
  // look for new things every few minutes while the site is open, and when you come back to it
  useEffect(() => {
    let last = Date.now();
    const tick = () => { if (document.visibilityState === 'visible' && Date.now() - last > 60000) { last = Date.now(); reload().catch(() => {}); } };
    const t = setInterval(tick, 180000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [reload]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('mousedown', close); addEventListener('keydown', key);
    return () => { removeEventListener('mousedown', close); removeEventListener('keydown', key); };
  }, [open]);

  function toggle() {
    const next = !open; setOpen(next);
    if (next && items.some((u) => !u.action && (!seen || u.at > seen))) {
      const now = new Date().toISOString();
      api.savePrefs({ updates_seen_at: now }).catch(() => {});
      setTimeout(() => setSeen(now), 1500); // keep the dots visible while the list opens
    }
  }
  const pick = (u: Update) => { setOpen(false); focus.post = u.postId || null; if (u.url) { go(u.url.replace(/^#\//, '')); return; } go(u.threadId ? 'talk/' + u.threadId : u.photoId ? 'photos/' + u.photoId : 'p/' + u.personId); };

  return (
    <div className="bell" ref={box}>
      <button className="bellbtn" aria-label={unread ? `${unread} new updates` : 'Updates'} aria-expanded={open} onClick={toggle}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {unread > 0 && <span className={`belldot${personal ? ' personal' : ''}`}>{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="bellpanel" role="dialog" aria-label="Updates">
          <div className="bellhead"><b>Updates</b><span>Things you can see, from the last two months</span></div>
          {items.length ? <ul>{items.map((u) => (
            <li key={u.key}><button className={`${u.action ? 'act ' : ''}${!u.action && (!seen || u.at > seen) ? 'new ' : ''}${u.personal ? 'personal' : ''}`} onClick={() => pick(u)}>
              <span className="bav">{u.personId && family.byId.has(u.personId) ? <Avatar id={u.personId} size={40} /> : <span className="av s40 picon">📷</span>}
                {u.kind === 'mention' && <i className="bbadge" aria-hidden="true">@</i>}{u.kind === 'reply-to-you' && <i className="bbadge" aria-hidden="true">↩</i>}{u.kind === 'news' && <i className="bbadge" aria-hidden="true">📣</i>}</span>
              <span><span className="btxt">{u.text}</span><small>{ago(u.at)}</small></span>
            </button></li>
          ))}</ul> : <p className="emptyhint" style={{ padding: '18px 20px' }}>Nothing new yet. When relatives join, mention you in Talk, reply to you, add details you can see, or tag you in a photo, it shows up here.</p>}
        </div>
      )}
    </div>
  );
}
