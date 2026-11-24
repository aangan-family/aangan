import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { friendly } from '../lib/api';
import { firstName, fullName } from '../lib/format';
import { Sheet } from './common';

const PAGES: [string, string][] = [['#/', 'Home'], ['#/talk', 'Talk'], ['#/photos', 'Photos'], ['#/calendar', 'Calendar'], ['#/whats-new', 'What’s New']];

/**
 * Admin → Messages → Notify everyone: a short notice that pops up on phones (for everyone with notifications
 * on) and sits at the top of everyone's bell, opening the page you pick.
 */
export function NotifyEveryone() {
  const { api, snap, family, myId, reload, toast } = useStore();
  const threads = useMemo(() => [...snap.threads].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 30), [snap.threads]);
  const [url, setUrl] = useState(threads[0] ? '#/talk/' + threads[0].id : '#/');
  const [title, setTitle] = useState(threads[0] ? 'New conversation in Talk' : '');
  const [body, setBody] = useState(threads[0]?.title || '');
  const [reach, setReach] = useState<{ members: number; phones: number } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [who, setWho] = useState<'all' | 'some'>('all');
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [email, setEmail] = useState(false);
  const me = firstName(family.byId.get(myId || '')) || 'You';
  const to = who === 'some' ? picked : [];
  const key = to.join(',');
  useEffect(() => { api.announceReach(to).then(setReach, () => setReach(null)); }, [api, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const joined = useMemo(() => snap.joined.map((id) => family.byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p)
    .sort((a, b) => fullName(a).localeCompare(fullName(b))), [snap.joined, family]);
  const shown = useMemo(() => { const n = q.trim().toLowerCase(); return joined.filter((p) => !n || fullName(p).toLowerCase().includes(n)); }, [joined, q]);
  const toggle = (id: string) => setPicked((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const audience = who === 'all' ? 'everyone' : `${picked.length} ${picked.length === 1 ? 'person' : 'people'}`;

  const pickLink = (u: string) => {
    setUrl(u);
    const t = threads.find((x) => '#/talk/' + x.id === u);
    if (t) { if (!title.trim() || title === 'New conversation in Talk') setTitle('New conversation in Talk'); setBody(t.title); }
  };

  async function send() {
    setBusy(true);
    try {
      const r = await api.announce(title.trim(), body.trim(), url, to, email);
      await reload();
      toast(`Sent to ${who === 'all' ? 'everyone' : `${r.members} ${r.members === 1 ? 'person' : 'people'}`}. It’s in their bell, and ${r.phones} ${r.phones === 1 ? 'phone gets' : 'phones get'} a notification now.${email ? ` ${r.emails ?? 0} ${r.emails === 1 ? 'email goes' : 'emails go'} out within 10 minutes.` : ''}`);
      setConfirm(false); setPicked([]); setWho('all'); setEmail(false);
    } catch (e) { toast(friendly(e)); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    try { await api.deleteAnnouncement(id); await reload(); toast('Removed from the bell.'); } catch (e) { toast(friendly(e)); }
  }

  const past = (snap.announcements || []).slice(0, 5);
  const ok = title.trim().length > 0 && (who === 'all' || picked.length > 0);
  return (
    <div className="gap-card">
      <h3 className="sec-title" style={{ fontSize: 26 }}>Send a notification.</h3>
      <p className="note">A short notice at the top of their bell 🔔. Anyone who has turned on phone notifications also gets it on their phone{reach ? <> (<b>{reach.phones}</b> of {reach.members} right now)</> : ''}. Tapping it opens the page you pick.</p>
      <div className="am-row"><label>To</label>
        <div className="seg" role="group" aria-label="Who gets it">
          <button type="button" aria-pressed={who === 'all'} onClick={() => setWho('all')}>Everyone</button>
          <button type="button" aria-pressed={who === 'some'} onClick={() => setWho('some')}>Choose people</button>
        </div>
      </div>
      {who === 'some' && (
        <div className="ne-pick">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find someone who has joined" aria-label="Find someone" />
          <div className="ne-list" role="group" aria-label="People">
            {shown.map((p) => (
              <label key={p.id} className={picked.includes(p.id) ? 'on' : ''}>
                <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} />{fullName(p)}{p.id === myId ? ' (you)' : ''}
              </label>
            ))}
            {!shown.length && <p className="note small">No one by that name has joined yet.</p>}
          </div>
          <p className="note small">{picked.length ? `${picked.length} chosen. ` : ''}Only people who have joined can get notifications.{picked.length > 0 && <> <button type="button" className="tlink small nochev" onClick={() => setPicked([])}>Clear</button></>}</p>
        </div>
      )}
      <div className="am-row"><label htmlFor="ne-link">Opens</label>
        <select id="ne-link" className="vis" value={url} onChange={(e) => pickLink(e.target.value)}>
          {threads.length > 0 && <optgroup label="A conversation">{threads.map((t) => <option key={t.id} value={'#/talk/' + t.id}>{t.title}</option>)}</optgroup>}
          <optgroup label="A page">{PAGES.map(([u, l]) => <option key={u} value={u}>{l}</option>)}</optgroup>
        </select>
      </div>
      <div className="am-row"><label htmlFor="ne-title">Title</label><input id="ne-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="New conversation in Talk" /></div>
      <div className="am-row"><label htmlFor="ne-body">Text</label><input id="ne-body" value={body} maxLength={160} onChange={(e) => setBody(e.target.value)} placeholder="One short line, like: Can you spot yourself in the photo?" /></div>
      <label className="toggle">
        <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} />
        <span><b>Also email them</b><small>One email each, with the title, the text and a button to the page. Members can turn these off in My privacy. At most two emailed notices a day.</small></span>
      </label>
      {ok && <Preview title={title} body={body} who={me} />}
      <div className="am-acts"><button className="btn primary" disabled={!ok} onClick={() => setConfirm(true)}>{who === 'all' ? 'Notify everyone' : `Notify ${audience}`}</button></div>
      {past.length > 0 && (
        <div className="ne-past"><small>Recent notices</small>
          <ul>{past.map((a) => <li key={a.id}><span><b>{a.title}</b>{a.body ? ` · ${a.body}` : ''}<small>{a.to_persons?.length ? `To ${a.to_persons.length === 1 ? fullName(family.byId.get(a.to_persons[0])) : `${a.to_persons.length} people`} · ` : 'To everyone · '}{new Date(a.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small></span>
            <button className="tlink small nochev" onClick={() => remove(a.id)}>Remove</button></li>)}</ul>
          <p className="note small">Removing takes it out of the bell. Phone notifications already shown stay on those phones.</p>
        </div>
      )}
      {confirm && (
        <Sheet title={`Notify ${audience}?`} sub={`It goes into ${who === 'all' ? `all ${reach?.members ?? ''} members’` : `${reach?.members ?? picked.length} people’s`} bells${reach ? `, and to ${reach.phones} ${reach.phones === 1 ? 'phone' : 'phones'} as a notification` : ''}${email ? ', and by email' : ''}. Phones in quiet hours (10 pm–7 am) get it in the morning.`}
          onClose={() => setConfirm(false)}
          footer={<><span className="status">{busy ? 'Sending…' : ''}</span><button className="btn" onClick={() => setConfirm(false)}>Cancel</button><button className="btn primary" disabled={busy} onClick={send}>Send</button></>}>
          <Preview title={title} body={body} who={me} />
        </Sheet>
      )}
    </div>
  );
}

function Preview({ title, body, who }: { title: string; body: string; who: string }) {
  return (
    <div className="ne-preview" aria-label="How the notification looks">
      <small>On phones</small>
      <div className="ne-note"><img src="/icons/icon-192.png" alt="" /><span><b>{title.trim()}</b><span>{who}: {body.trim() || 'Tap to have a look.'}</span></span><em>now</em></div>
      <small>In the bell</small>
      <div className="ne-bell"><span className="ne-ic">📣</span><span><b>{title.trim()}</b>{body.trim() ? ` · ${body.trim()}` : ''}</span></div>
    </div>
  );
}
