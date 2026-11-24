import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { friendly } from '../lib/api';
import { firstName, fullName } from '../lib/format';
import type { Member } from '../lib/types';
import { Sheet } from './common';
import { NotifyEveryone } from './NotifyEveryone';

const fill = (body: string, name: string) => body.replace(/\{name\}/g, name);

/** Admin → Messages: message everyone at once, and the automatic welcome message for people who join. */
export function AdminMessages({ members }: { members: Member[] }) {
  const { api, snap, family, myId, reload, toast } = useStore();
  const active = members.filter((m) => m.status === 'active' && m.person_id && m.person_id !== myId);
  const sample = active[0]?.person_id ? firstName(family.byId.get(active[0].person_id)) : 'Lakshmi';
  const senders = members.filter((m) => m.status === 'active' && m.person_id && (m.role === 'admin' || m.role === 'steward'));

  const [body, setBody] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const info = snap.info;
  const [on, setOn] = useState(!!info?.welcome_dm_on);
  const [wText, setWText] = useState(info?.welcome_dm || '');
  const [from, setFrom] = useState(info?.welcome_dm_from || myId || '');
  useEffect(() => { setOn(!!info?.welcome_dm_on); setWText(info?.welcome_dm || ''); setFrom(info?.welcome_dm_from || myId || ''); }, [info?.welcome_dm_on, info?.welcome_dm, info?.welcome_dm_from, myId]);
  const dirty = on !== !!info?.welcome_dm_on || wText !== (info?.welcome_dm || '') || from !== (info?.welcome_dm_from || myId || '');

  async function broadcast() {
    setBusy(true);
    try { const n = await api.dmBroadcast(body); toast(`Sent to ${n} ${n === 1 ? 'person' : 'people'}. Replies come to your Messages.`); setBody(''); setConfirm(false); }
    catch (e) { toast(friendly(e)); } finally { setBusy(false); }
  }
  async function saveWelcome() {
    if (on && !wText.trim()) { toast('Write the welcome message first.'); return; }
    setBusy(true);
    try { await api.saveFamilyInfo({ welcome_dm_on: on, welcome_dm: wText.trim() || null, welcome_dm_from: from || null }); await reload(); toast(on ? 'Welcome message is on.' : 'Welcome message saved (off).'); }
    catch (e) { toast(friendly(e)); } finally { setBusy(false); }
  }

  return (
    <section className="am">
      <NotifyEveryone />
      <div className="gap-card">
        <h3 className="sec-title" style={{ fontSize: 26 }}>Message everyone.</h3>
        <p className="note">A private message from you to each of the {active.length} people who have joined. Write <code>{'{name}'}</code> and it becomes each person’s first name. Replies come back to your Messages.</p>
        <textarea className="am-text" rows={5} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={'Hi {name}! …'} aria-label="Message to everyone" />
        {body.trim() && <div className="am-preview"><small>How {sample} will see it</small><div className="bubble">{fill(body, sample)}</div></div>}
        <div className="am-acts"><button className="btn primary" disabled={!body.trim() || !active.length} onClick={() => setConfirm(true)}>Send to {active.length} people</button></div>
      </div>

      <div className="gap-card">
        <h3 className="sec-title" style={{ fontSize: 26 }}>Welcome message.</h3>
        <p className="note">Sent automatically as a private message when someone new joins the site, from the person you choose. <code>{'{name}'}</code> becomes their first name.</p>
        <label className="toggle" style={{ margin: '10px 0 14px' }}>
          <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
          <span><b>Send a welcome message to everyone who joins</b><small>Each person gets it once, when they first join.</small></span>
        </label>
        <div className="am-row">
          <label htmlFor="am-from">From</label>
          <select id="am-from" className="vis" value={from} onChange={(e) => setFrom(e.target.value)}>
            {senders.map((m) => <option key={m.user_id} value={m.person_id!}>{fullName(family.byId.get(m.person_id!))}{m.person_id === myId ? ' (you)' : ''}</option>)}
          </select>
        </div>
        <textarea className="am-text" rows={6} maxLength={4000} value={wText} onChange={(e) => setWText(e.target.value)} placeholder={'Welcome {name}! …'} aria-label="Welcome message" />
        {wText.trim() && <div className="am-preview"><small>How a new member called {sample} will see it</small><div className="bubble">{fill(wText, sample)}</div></div>}
        <div className="am-acts"><button className="btn primary" disabled={busy || !dirty} onClick={saveWelcome}>Save</button></div>
      </div>

      {confirm && (
        <Sheet title={`Send to ${active.length} people?`} sub="Each person gets it as a private message from you. You can’t unsend it from their phones, but you can delete it in each conversation."
          onClose={() => setConfirm(false)}
          footer={<><span className="status">{busy ? 'Sending…' : ''}</span><button className="btn" onClick={() => setConfirm(false)}>Cancel</button><button className="btn primary" disabled={busy} onClick={broadcast}>Send</button></>}>
          <div className="am-preview"><small>{sample} will see</small><div className="bubble">{fill(body, sample)}</div></div>
        </Sheet>
      )}
    </section>
  );
}
