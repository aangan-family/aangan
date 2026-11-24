import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { friendly } from '../lib/api';
import { firstName, fullName } from '../lib/format';
import { statusLabel, StatusDot, usePresence } from '../lib/presence';
import type { DmConversation, DmMessage } from '../lib/types';
import { Avatar, go } from '../components/common';
import { HelpTip } from '../components/Help';
import { EmojiPicker, onlyEmoji } from '../components/EmojiPicker';
import { HelpMeWrite, SpeakButton, SparkleIcon, insertSpoken } from '../components/WritingHelp';
import { draft } from '../lib/wishes';
import { revealIn } from '../lib/scroll';
import { SITE, SITE_NAME, SiteAvatar } from '../components/SiteAdmin';

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
function dayLabel(iso: string) {
  const d = new Date(iso), t = new Date();
  const y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === t.getFullYear() ? undefined : 'numeric' });
}
function shortWhen(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso), t = new Date();
  if (d.toDateString() === t.toDateString()) return time(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
/** plain text with line breaks; https links become links */
function Text({ s }: { s: string }) {
  const parts = s.split(/(https:\/\/[^\s<>"]+)/g);
  return <>{parts.map((p, i) => (i % 2 ? <a key={i} href={p} target="_blank" rel="noopener noreferrer">{p}</a> : <Fragment key={i}>{p}</Fragment>))}</>;
}

export function Chat({ personId }: { personId?: string }) {
  const { api, family, snap, myId, toast } = useStore();
  const { statusOf, seen, unread, refresh } = usePresence();
  const [list, setList] = useState<DmConversation[] | null>(null);
  const [q, setQ] = useState('');
  const [picking, setPicking] = useState(false);

  const loadList = useCallback(() => api.dmList().then(setList).catch((e) => toast(friendly(e))), [api, toast]);
  useEffect(() => { loadList(); }, [loadList, unread]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') loadList(); }, 15000);
    return () => clearInterval(t);
  }, [loadList]);

  const people = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return snap.joined.filter((id) => id !== myId && family.byId.has(id))
      .filter((id) => !ql || fullName(family.byId.get(id)).toLowerCase().includes(ql))
      .sort((a, b) => Number(statusOf(b).kind === 'online') - Number(statusOf(a).kind === 'online')
        || (seen.get(b) || '').localeCompare(seen.get(a) || '') || fullName(family.byId.get(a)).localeCompare(fullName(family.byId.get(b))));
  }, [q, snap.joined, myId, family, statusOf, seen]);

  const convo = personId ? <Conversation key={personId} personId={personId} onChanged={() => { loadList(); refresh(); }} /> : null;
  const showList = !personId || !picking;

  return (
    <div className={`chat${personId ? ' has-convo' : ''}`}>
      <aside className="chat-list" aria-label="Conversations">
        <div className="chat-list-head">
          <h2 className="chat-title">Messages.<HelpTip sections={['chat']} /></h2>
          <button className="pill small" onClick={() => setPicking(!picking)}>{picking ? 'Done' : 'New message'}</button>
        </div>
        {picking ? (
          <div className="chat-pick">
            <input className="chat-search" autoFocus placeholder="Search family who have joined…" value={q} onChange={(e) => setQ(e.target.value)} />
            <ul>{people.map((id) => {
              const st = statusOf(id);
              return (
                <li key={id}><button onClick={() => { setPicking(false); setQ(''); go('chat/' + id); }}>
                  <span className="on-av"><Avatar id={id} size={40} /><StatusDot status={st} size={12} /></span>
                  <span className="cl-txt"><b>{fullName(family.byId.get(id))}</b><small className={st.kind}>{statusLabel(st)}</small></span>
                </button></li>
              );
            })}</ul>
            {!people.length && <p className="emptyhint">Only relatives who have joined can get messages. Invite others from their profile.</p>}
          </div>
        ) : showList && (
          list === null ? <p className="emptyhint chat-pad">Loading…</p> :
          list.length === 0 ? (
            <div className="chat-empty-list chat-pad">
              <p>No conversations yet.</p>
              <p className="emptyhint">Tap <b>New message</b>, or the green dot at the top to see who’s online. Messages are private between the two of you.</p>
            </div>
          ) : (
            <ul>{list.map((c) => {
              const id = c.other_person || '';
              const site = id === SITE;
              const st = statusOf(id);
              const p = family.byId.get(id);
              return (
                <li key={c.id}><button className={`${id === personId ? 'on' : ''}${c.unread ? ' unread' : ''}`} disabled={!id} onClick={() => id && go('chat/' + id)}>
                  <span className="on-av">{site ? <SiteAvatar size={40} /> : p ? <Avatar id={id} size={40} /> : <span className="av s40">?</span>}{!site && <StatusDot status={st} size={12} />}
                    {c.unread > 0 && <span className="av-unread" aria-label={`${c.unread} unread`}>{c.unread > 9 ? '9+' : c.unread}</span>}</span>
                  <span className="cl-txt">
                    <span className="cl-top"><b>{site ? SITE_NAME : p ? fullName(p) : 'A former member'}</b><small>{shortWhen(c.last_message_at)}</small></span>
                    <span className="cl-last">{c.last_body ? `${c.last_from_me ? 'You: ' : ''}${c.last_body}` : 'Say hello'}</span>
                  </span>
                </button></li>
              );
            })}</ul>
          )
        )}
      </aside>
      <section className="chat-main">
        {convo || (
          <div className="chat-blank">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" /></svg>
            <h3>Talk one to one.</h3>
            <p>Pick a conversation, or start a new one with anyone in the family who has joined. Only the two of you can read it.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function Conversation({ personId, onChanged }: { personId: string; onChanged: () => void }) {
  const { api, family, snap, toast, amMinor } = useStore();
  const { statusOf } = usePresence();
  const me = snap.me?.user_id;
  const site = personId === SITE;
  const p = family.byId.get(personId);
  const name = site ? SITE_NAME : p ? fullName(p) : 'Someone';
  const first = site ? SITE_NAME : p ? firstName(p) : '';
  const [cid, setCid] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [msgs, setMsgs] = useState<DmMessage[] | null>(null);
  const [otherRead, setOtherRead] = useState<string>('');
  // opened with 'Send a wish': start with the wish typed in, ready to edit or send
  const [text, setText] = useState(() => (draft.person === personId ? draft.text : ''));
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [emoji, setEmoji] = useState(false);
  const [help, setHelp] = useState(false);
  /** the box grows with its text, up to a few lines */
  const grow = () => requestAnimationFrame(() => { const el = box.current; if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px'; } });
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const st = statusOf(personId);

  useEffect(() => { api.dmOpen(personId).then(setCid).catch((e) => setErr(friendly(e))); }, [api, personId]);

  const pull = useCallback(async (full = false) => {
    if (!cid) return;
    const last = !full && msgs?.length ? msgs[msgs.length - 1].created_at : undefined;
    const fresh = await api.dmMessages(cid, last);
    if (full || !msgs) setMsgs(fresh);
    else if (fresh.length) setMsgs((m) => [...(m || []), ...fresh.filter((f) => !(m || []).some((x) => x.id === f.id))]);
    const l = await api.dmList();
    const c = l.find((x) => x.id === cid);
    if (c) setOtherRead(c.other_read_at);
    if (document.visibilityState === 'visible' && (fresh.some((f) => f.sender !== me) || full) && c?.unread) { await api.dmMarkRead(cid); onChanged(); }
  }, [api, cid, msgs, me, onChanged]);

  useEffect(() => { if (cid) pull(true).catch((e) => setErr(friendly(e))); }, [cid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!cid) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') pull().catch(() => {}); }, 4000);
    return () => clearInterval(t);
  }, [cid, pull]);
  useEffect(() => { revealIn(end.current, { block: 'end', behavior: 'auto' }); }, [msgs?.length]);
  useEffect(() => { // a prepared wish: focus the box with the cursor at the end, sized to fit
    if (draft.person === personId) { draft.person = null; draft.text = ''; }
    const el = box.current; if (!el || !text) return;
    el.focus(); el.setSelectionRange(el.value.length, el.value.length); el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [cid]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send() {
    const body = text.trim();
    if (!body || !cid || busy) return;
    setBusy(true);
    try { await api.dmSend(cid, body); setText(''); await pull(); onChanged(); box.current?.focus(); }
    catch (e) { toast(friendly(e)); } finally { setBusy(false); }
  }
  function addEmoji(e: string) {
    const el = box.current;
    // read the box itself (not React state) so quick taps build on each other
    const cur = el ? el.value : text;
    const a = el?.selectionStart ?? cur.length, b = el?.selectionEnd ?? cur.length;
    const v = (cur.slice(0, a) + e + cur.slice(b)).slice(0, 4000);
    if (el) { el.value = v; el.setSelectionRange(a + e.length, a + e.length); el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px'; }
    setText(v);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(a + e.length, a + e.length); });
  }
  async function remove(id: string) {
    setMenu(null);
    try { await api.dmDelete(id); setMsgs((m) => (m || []).filter((x) => x.id !== id)); onChanged(); } catch (e) { toast(friendly(e)); }
  }

  const lastMine = [...(msgs || [])].reverse().find((m) => m.sender === me);
  return (
    <div className="convo">
      <header className="convo-head">
        <button className="convo-back" onClick={() => go('chat')} aria-label="All messages">‹</button>
        {site ? (
          <div className="convo-who">
            <span className="on-av"><SiteAvatar size={40} /></span>
            <span><b>{name}</b><small>Looks after the family site</small></span>
          </div>
        ) : (
          <button className="convo-who" onClick={() => go('p/' + personId)}>
            <span className="on-av">{p ? <Avatar id={personId} size={40} /> : null}<StatusDot status={st} size={11} /></span>
            <span><b>{name}</b><small className={st.kind}>{statusLabel(st)}</small></span>
          </button>
        )}
      </header>
      <div className="convo-body" onClick={() => setMenu(null)}>
        {err && <div className="chat-blank"><p>{err}</p>{!site && !snap.joined.includes(personId) && <button className="pill small" onClick={() => go('p/' + personId)}>Open their profile</button>}</div>}
        {!err && msgs === null && <p className="emptyhint chat-pad">Opening…</p>}
        {msgs && msgs.length === 0 && (
          <div className="chat-blank small"><p>Say hello to {first || 'them'}. Only the two of you can read this conversation.</p></div>
        )}
        {msgs && msgs.map((m, i) => {
          const mine = m.sender === me;
          const newDay = i === 0 || dayLabel(msgs[i - 1].created_at) !== dayLabel(m.created_at);
          const grouped = i > 0 && msgs[i - 1].sender === m.sender && !newDay && Date.parse(m.created_at) - Date.parse(msgs[i - 1].created_at) < 300000;
          return (
            <Fragment key={m.id}>
              {newDay && <div className="convo-day"><span>{dayLabel(m.created_at)}</span></div>}
              <div className={`msg ${mine ? 'mine' : 'theirs'}${grouped ? ' grouped' : ''}`}>
                <div translate="no" className={`bubble${onlyEmoji(m.body) ? ' big' : ''}`} onClick={(e) => { if (mine) { e.stopPropagation(); setMenu(menu === m.id ? null : m.id); } }}>
                  <Text s={m.body} />
                  <span className="msg-time">{time(m.created_at)}</span>
                </div>
                {menu === m.id && <button className="msg-del" onClick={(e) => { e.stopPropagation(); remove(m.id); }}>Delete for both</button>}
                {mine && lastMine?.id === m.id && otherRead >= m.created_at && <span className="msg-seen">Seen</span>}
              </div>
            </Fragment>
          );
        })}
        <div ref={end} />
      </div>
      {!err && (
        <form className="convo-compose" onSubmit={(e) => { e.preventDefault(); send(); }}>
          {emoji && <EmojiPicker onPick={addEmoji} onClose={() => setEmoji(false)} />}
          {help && <div className="convo-help"><HelpMeWrite text={text} onUse={(v) => { setText(v.slice(0, 4000)); grow(); box.current?.focus(); }} onClose={() => setHelp(false)} /></div>}
          <button type="button" className={`convo-emoji${emoji ? ' on' : ''}`} aria-label="Emoji" aria-expanded={emoji} title="Emoji"
            onMouseDown={(e) => e.preventDefault()} onClick={() => { setEmoji(!emoji); setHelp(false); }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" /><path d="M9 9.5h.01M15 9.5h.01" strokeWidth="2.6" /></svg>
          </button>
          {!amMinor && <button type="button" className={`convo-emoji convo-sparkle${help ? ' on' : ''}${text.trim() || help ? '' : ' phone-hide'}`} aria-label="Help me write" aria-expanded={help} title="Help me write"
            onMouseDown={(e) => e.preventDefault()} onClick={() => { setHelp(!help); setEmoji(false); }}><SparkleIcon /></button>}
          <textarea ref={box} rows={1} value={text} maxLength={4000} placeholder={`Message ${first}…`} aria-label="Message"
            onChange={(e) => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'; }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); setEmoji(false); setHelp(false); send(); } }} />
          {!amMinor && <SpeakButton className={`convo-speak${text.trim() ? ' phone-hide' : ''}`} onText={(t) => { const r = insertSpoken(text, t); setText(r.value.slice(0, 4000)); grow(); }} />}
          <button className="convo-send" type="submit" disabled={!text.trim() || busy || !cid} aria-label="Send">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
          </button>
        </form>
      )}
    </div>
  );
}
