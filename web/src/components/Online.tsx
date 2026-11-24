import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { fullName } from '../lib/format';
import { statusLabel, StatusDot, usePresence } from '../lib/presence';
import { Avatar, go } from './common';

/** Top bar: "● 3 online" with faces; opens a list of who's online and who was here recently, each with Message. */
export function OnlineButton() {
  const { family, snap } = useStore();
  const { onlineIds, statusOf, seen } = usePresence();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('mousedown', close); addEventListener('keydown', key);
    return () => { removeEventListener('mousedown', close); removeEventListener('keydown', key); };
  }, [open]);

  const groups = useMemo(() => {
    const ids = [...seen.keys()].filter((id) => family.byId.has(id));
    const by = (a: string, b: string) => (seen.get(b) || '').localeCompare(seen.get(a) || '') || fullName(family.byId.get(a)).localeCompare(fullName(family.byId.get(b)));
    const week = Date.now() - 7 * 864e5;
    const online = ids.filter((id) => statusOf(id).kind === 'online').sort(by);
    const recent = ids.filter((id) => { const s = statusOf(id); return s.kind === 'away' && Date.parse(s.seen) > week; }).sort(by);
    const rest = ids.filter((id) => !online.includes(id) && !recent.includes(id))
      .sort((a, b) => fullName(family.byId.get(a)).localeCompare(fullName(family.byId.get(b))));
    return { online, recent, rest };
  }, [seen, statusOf, family]);
  if (!snap.me) return null;
  const n = onlineIds.length;

  const row = (id: string) => {
    const st = statusOf(id);
    return (
      <li key={id}>
        <button className="on-who" onClick={() => { setOpen(false); go('p/' + id); }}>
          <span className="on-av"><Avatar id={id} size={40} /><StatusDot status={st} size={11} /></span>
          <span><b>{fullName(family.byId.get(id))}</b><small className={st.kind}>{statusLabel(st)}</small></span>
        </button>
        <button className="pill ghost small" onClick={() => { setOpen(false); go('chat/' + id); }}>Message</button>
      </li>
    );
  };
  return (
    <div className="onlinewrap" ref={box}>
      <button className={`onlinebtn${n ? ' some' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}
        aria-label={n ? `${n} ${n === 1 ? 'person' : 'people'} online` : 'Who’s online'} title="Who’s online">
        <span className="on-faces" aria-hidden="true">{onlineIds.slice(0, 3).map((id) => <Avatar key={id} id={id} size={26} />)}</span>
        <i className="sdot online" aria-hidden="true" /><span className="on-n">{n}</span><span className="on-word">online</span>
      </button>
      {open && (
        <div className="bellpanel onpanel" role="dialog" aria-label="Who’s online">
          <div className="bellhead"><b>Who’s online</b><span>Family members with the site open right now</span></div>
          <div className="on-scroll">
            <p className="on-h">Online now · {groups.online.length}</p>
            {groups.online.length ? <ul>{groups.online.map(row)}</ul> : <p className="emptyhint on-empty">Nobody else right now.</p>}
            {groups.recent.length > 0 && <><p className="on-h">Earlier this week</p><ul>{groups.recent.map(row)}</ul></>}
            {groups.rest.length > 0 && <><p className="on-h">Everyone else who has joined · {groups.rest.length}</p><ul>{groups.rest.map(row)}</ul></>}
          </div>
          <p className="on-foot">Prefer not to show when you’re online? Change it in <button className="on-link" onClick={() => { setOpen(false); go('privacy'); }}>My privacy</button>.</p>
        </div>
      )}
    </div>
  );
}

/** Top bar: speech bubble with the number of unread messages. */
export function ChatButton() {
  const { unread } = usePresence();
  const { snap } = useStore();
  if (!snap.me) return null;
  return (
    <button className="bellbtn chatbtn" onClick={() => go('chat')} aria-label={unread ? `Messages, ${unread} unread` : 'Messages'} title="Messages">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" /></svg>
      {unread > 0 && <span className="belldot">{unread > 9 ? '9+' : unread}</span>}
    </button>
  );
}
