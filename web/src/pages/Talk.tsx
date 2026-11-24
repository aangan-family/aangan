import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { friendly } from '../lib/api';
import { RichText, photoPlain } from '../lib/richtext';
import { photoBlock } from '../components/PostPhoto';
import { ShareLink } from '../components/ShareLink';
import { videosIn } from '../lib/video';
import { Videos } from '../components/VideoEmbed';
import { ago, firstName, fullName } from '../lib/format';
import { CATEGORIES, CATEGORY_ICON, CATEGORY_LABEL, EMOJIS, type Category, type Emoji, type Post, type Reaction, type Thread } from '../lib/types';
import { RichEditor } from '../components/RichEditor';
import { Avatar, Sheet, go } from '../components/common';
import { focus } from '../lib/updates';
import { HelpTip } from '../components/Help';
import { revealIn } from '../lib/scroll';

/** Ideas to get people talking: tap one to start a thread with it. */
export const IDEAS: { title: string; category: Category }[] = [
  // the same for every family, whatever its traditions (no one community's words in shared code)
  { title: 'How do we celebrate our festivals at home?', category: 'traditions' },
  { title: 'Grandma’s best recipe', category: 'recipes' },
  { title: 'Our family’s special dish: share your method', category: 'recipes' },
  { title: 'Stories from our native place', category: 'traditions' },
  { title: 'Ceremonies we keep, and how to do them', category: 'traditions' },
  { title: 'Who remembers our grandparents’ wedding?', category: 'traditions' },
  { title: 'This month’s festivals and family days', category: 'calendar' },
  { title: 'Planning the next family get-together', category: 'festivals' },
  { title: 'Old photos: who’s who?', category: 'traditions' },
];

/** Plain text for previews: drops the formatting markers. */
export const plain = (s: string) => photoPlain(s)
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/(\*\*|~~|\*)/g, '')
  .replace(/^(#{2,3}\s+|\s*[-•]\s+|\s*\d+[.)]\s+|>\s?)/gm, '').replace(/\s+/g, ' ').trim();

function useName() {
  const { family, myId } = useStore();
  return (pid: string | null, short = false) => {
    if (pid && pid === myId) return 'You';
    const p = pid ? family.byId.get(pid) : undefined;
    return p ? (short ? firstName(p) : fullName(p)) : 'A family member';
  };
}

export function Talk({ threadId }: { threadId?: string }) {
  return threadId ? <ThreadView key={threadId} id={threadId} /> : <TalkList />;
}

/* ---------------------------------------------------------------- list */
function TalkList() {
  const { snap, amMinor } = useStore();
  const name = useName();
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [q, setQ] = useState('');
  const [start, setStart] = useState<{ title: string; category: Category } | null>(null);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return snap.threads
      .filter((t) => (cat === 'all' || t.category === cat) && (!needle || (t.title + ' ' + t.body).toLowerCase().includes(needle)))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.last_activity_at.localeCompare(a.last_activity_at));
  }, [snap.threads, cat, q]);
  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const t of snap.threads) c[t.category] = (c[t.category] || 0) + 1; return c; }, [snap.threads]);

  return (
    <div className="wrap talk">
      <section className="tree-hero">
        <h2 className="headline">Talk.<HelpTip sections={['talk']} /></h2>
        <p className="subhead">Ask, share and remember together: traditions, recipes, festivals, the family calendar, family news. Only invited family can see this.</p>
        {amMinor && <p className="note kidnote">You’re under 18, so a parent checks what you write before it appears. <a href="#/child">See what’s waiting</a></p>}
        <div className="ctas" style={{ justifyContent: 'flex-start' }}><button className="pill" onClick={() => setStart({ title: '', category: cat === 'all' ? 'general' : cat })}>Start a conversation</button></div>
      </section>

      <div className="catbar" role="tablist" aria-label="Topics">
        <button role="tab" aria-selected={cat === 'all'} className={`chip${cat === 'all' ? ' on' : ''}`} onClick={() => setCat('all')}>All <span>{snap.threads.length || ''}</span></button>
        {CATEGORIES.map((c) => (
          <button key={c} role="tab" aria-selected={cat === c} className={`chip${cat === c ? ' on' : ''}`} onClick={() => setCat(c)}>{CATEGORY_ICON[c]} {CATEGORY_LABEL[c]} <span>{counts[c] || ''}</span></button>
        ))}
      </div>
      {snap.threads.length > 4 && <div className="tsearch" style={{ margin: '4px 0 14px' }}><div className="search"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations…" aria-label="Search conversations" /></div></div>}

      {shown.length ? (
        <div className="threadlist">{shown.map((t) => (
          <button key={t.id} className="tcard" onClick={() => go('talk/' + t.id)}>
            <span className="ticon" aria-hidden="true">{CATEGORY_ICON[t.category]}</span>
            <span className="tmain">
              <b>{t.pinned && <em className="pin">Pinned</em>}{t.title}{t.locked && <em className="lock">Closed</em>}</b>
              <span className="tsnip">{plain(t.body).slice(0, 150)}</span>
              <small>{name(t.author_person, true)} · {CATEGORY_LABEL[t.category]} · {t.reply_count ? `${t.reply_count} ${t.reply_count === 1 ? 'reply' : 'replies'} · last ${ago(t.last_activity_at)}` : `started ${ago(t.created_at)}`}</small>
            </span>
            {t.author_person && <Avatar id={t.author_person} size={40} />}
          </button>
        ))}</div>
      ) : (
        <div className="nudge"><p>{q || cat !== 'all' ? 'No conversations here yet.' : 'No conversations yet. Start the first one!'}</p></div>
      )}

      <section className="section">
        <div className="section-head"><h3 className="sec-title">Ideas to start. <span>Tap one to begin.</span></h3></div>
        <div className="chips">{IDEAS.filter((i) => !snap.threads.some((t) => t.title === i.title)).map((i) => (
          <button key={i.title} className="chip" onClick={() => setStart(i)}>{CATEGORY_ICON[i.category]} {i.title}</button>
        ))}</div>
      </section>

      {start && <ThreadSheet initial={start} onClose={() => setStart(null)} />}
    </div>
  );
}

/* ---------------------------------------------------------------- start / edit */
function ThreadSheet({ initial, edit, onClose, onSaved }: { initial: { title: string; category: Category; body?: string }; edit?: Thread; onClose: () => void; onSaved?: () => void }) {
  const { api, reload, toast, amMinor } = useStore();
  const [title, setTitle] = useState(initial.title);
  const [category, setCategory] = useState<Category>(initial.category);
  const [body, setBody] = useState(initial.body || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function save() {
    if (title.trim().length < 3) { setErr('Give the conversation a title.'); return; }
    if (!body.trim()) { setErr('Write a few words to start it off.'); return; }
    setBusy(true); setErr('');
    try {
      if (edit) { await api.updateThread(edit.id, { title: title.trim(), body: body.trim(), category }); await reload(); toast('Saved.'); onSaved?.(); onClose(); }
      else if (amMinor) { await api.childSubmit('thread', { title: title.trim(), body: body.trim(), category }); await reload(); toast('Sent to your parent to check. It appears in Talk once they say OK.'); onClose(); }
      else { const id = await api.createThread({ title, body, category }); await reload(); toast('Conversation started. Everyone in the family can join in.'); onClose(); go('talk/' + id); }
    } catch (e) { setErr(friendly(e)); setBusy(false); }
  }
  return (
    <Sheet title={edit ? 'Edit conversation' : 'Start a conversation'} sub={edit ? undefined : 'Everyone invited to the family website can read and reply.'} onClose={onClose}
      footer={<>
        <span className={`status${err ? ' err' : ''}`}>{busy ? 'Saving…' : err}</span>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>{edit ? 'Save' : 'Post'}</button>
      </>}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="full"><label htmlFor="th-title">Title</label>
          <input id="th-title" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} placeholder="How do we celebrate our festivals at home?" autoFocus={!initial.title} /></div>
        <div className="full"><label>Topic</label>
          <div className="chips">{CATEGORIES.map((c) => (
            <button type="button" key={c} className={`chip${category === c ? ' on' : ''}`} aria-pressed={category === c} onClick={() => setCategory(c)}>{CATEGORY_ICON[c]} {CATEGORY_LABEL[c]}</button>
          ))}</div></div>
      </form>
      <div style={{ marginTop: 14 }}>
        <RichEditor value={body} onChange={setBody} maxLength={10000} rows={9} label="Message" mentions photos autoFocus={!!initial.title && !edit}
          placeholder={category === 'recipes' ? 'Ingredients, then the steps. Tips from Paati welcome!\n\nRather talk? Use 🎤 below to speak in any language, or ✨ Help me write to polish your words.' : 'Share what you know, or ask the family…\n\nRather talk? Use 🎤 below to speak in any language — Tamil, Malayalam, Hindi or English — and it’s written in English for you. Or write roughly and tap ✨ Help me write to polish it.'} onSubmit={save} />
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------- reactions */
function Reactions({ target, kind, all, onToggle }: { target: string; kind: 'thread' | 'post'; all: Reaction[]; onToggle: (target: string, kind: 'thread' | 'post', e: Emoji, on: boolean) => void }) {
  const { snap } = useStore();
  const name = useName();
  const [pick, setPick] = useState(false);
  const mine = snap.me?.user_id;
  const here = all.filter((r) => r.target_id === target);
  const groups = EMOJIS.map((e) => ({ e, rs: here.filter((r) => r.emoji === e) })).filter((g) => g.rs.length);
  return (
    <div className="reacts">
      {groups.map(({ e, rs }) => {
        const me = rs.some((r) => r.user_id === mine);
        return (
          <button key={e} className={`react${me ? ' mine' : ''}`} aria-pressed={me} title={rs.map((r) => name(r.person_id, true)).join(', ')}
            onClick={() => onToggle(target, kind, e, !me)}>{e} <span>{rs.length}</span></button>
        );
      })}
      <span className="reactadd">
        <button className="react add" aria-label="Add a reaction" aria-expanded={pick} onClick={() => setPick(!pick)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="12" r="8" /><path d="M8 14s1.2 1.6 3 1.6 3-1.6 3-1.6M8.5 9.5h.01M13.5 9.5h.01M19 3v4M17 5h4" /></svg>
        </button>
        {pick && <span className="reactpick" role="menu">{EMOJIS.map((e) => {
          const me = here.some((r) => r.emoji === e && r.user_id === mine);
          return <button key={e} role="menuitem" className={me ? 'mine' : ''} onClick={() => { onToggle(target, kind, e, !me); setPick(false); }}>{e}</button>;
        })}</span>}
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------- one conversation */
function ThreadView({ id }: { id: string }) {
  const { api, snap, isAdmin, myId, reload, toast, amMinor } = useStore();
  const name = useName();
  const [data, setData] = useState<{ thread: Thread | null; posts: Post[]; reactions: Reaction[] } | null>(null);
  const [reply, setReply] = useState('');
  const [replyTo, setReplyTo] = useState<Post | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editThread, setEditThread] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const composer = useRef<HTMLDivElement>(null);
  const me = snap.me?.user_id;

  const load = useCallback(() => api.getThread(id).then(setData).catch((e) => toast(friendly(e))), [api, id, toast]);
  useEffect(() => { load(); }, [load]);
  // keep the conversation fresh while it's open
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15000);
    const vis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [load]);
  // opened from the bell: bring the reply that mentioned you into view and highlight it
  useEffect(() => {
    if (!data || !focus.post) return;
    const el = document.getElementById('post-' + focus.post);
    if (!el) return;
    focus.post = null;
    setTimeout(() => { revealIn(el, { block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 2600); }, 120);
  }, [data]);

  if (!data) return <div className="wrap talk"><p className="emptyhint" style={{ padding: '60px 0' }}>Opening the conversation…</p></div>;
  const t = data.thread;
  if (!t) return (
    <div className="wrap talk"><div className="nudge" style={{ marginTop: 40 }}><p>This conversation isn’t here any more. It may have been removed.</p>
      <button className="pill small" onClick={() => go('talk')}>Back to Talk</button></div></div>
  );
  const canEditThread = t.author === me || isAdmin;
  const byId = new Map(data.posts.map((p) => [p.id, p]));

  async function act(f: () => Promise<void>, msg?: string, refreshList = false) {
    setBusy(true);
    try { await f(); await load(); if (refreshList) reload(); if (msg) toast(msg); } catch (e) { toast(friendly(e)); } finally { setBusy(false); }
  }
  function toggle(target: string, kind: 'thread' | 'post', e: Emoji, on: boolean) {
    // show it straight away, then save
    setData((d) => d && ({ ...d, reactions: on
      ? [...d.reactions, { target_id: target, target_kind: kind, thread_id: id, emoji: e, user_id: me!, person_id: myId }]
      : d.reactions.filter((r) => !(r.target_id === target && r.emoji === e && r.user_id === me)) }));
    api.react(target, kind, e, on).catch((err) => { toast(friendly(err)); load(); });
  }
  async function send() {
    if (!reply.trim()) return;
    if (amMinor) { await act(async () => { await api.childSubmit('reply', { thread_id: id, body: reply, reply_to: replyTo?.id || '' }); setReply(''); setReplyTo(null); }, 'Sent to your parent to check. Your reply appears here once they say OK.', true); return; }
    await act(async () => { await api.addPost(id, reply, replyTo?.id || null); setReply(''); setReplyTo(null); }, undefined, true);
    setTimeout(() => revealIn(document.querySelector('.posts > :last-child'), { block: 'center' }), 100);
  }

  return (
    <div className="wrap talk thread">
      <article className="opener">
        <p className="eyebrow">{CATEGORY_ICON[t.category]} {CATEGORY_LABEL[t.category]}{t.pinned ? ' · Pinned' : ''}{t.locked ? ' · Closed' : ''}</p>
        <h2 className="ttitle">{t.title}</h2>
        <div className="byline">
          {t.author_person && <Avatar id={t.author_person} size={40} />}
          <span><button className="tlink nochev" onClick={() => t.author_person && go('p/' + t.author_person)}>{name(t.author_person)}</button>
            <small>{ago(t.created_at)}{t.edited_at ? ' · edited' : ''}</small></span>
        </div>
        <RichText text={t.body} className="story tbody" photo={photoBlock} />
        <Videos videos={videosIn(t.body)} />
        <Reactions target={t.id} kind="thread" all={data.reactions} onToggle={toggle} />
        {!canEditThread && <div className="tactions"><ShareLink hash={`#/talk/${t.id}`} title={t.title} /></div>}
        {canEditThread && (
          <div className="tactions">
            <ShareLink hash={`#/talk/${t.id}`} title={t.title} />
            {t.author === me && <button className="tlink small nochev" onClick={() => setEditThread(true)}>Edit</button>}
            {isAdmin && <button className="tlink small nochev" disabled={busy} onClick={() => act(() => api.updateThread(id, { pinned: !t.pinned }), t.pinned ? 'Unpinned.' : 'Pinned to the top.', true)}>{t.pinned ? 'Unpin' : 'Pin'}</button>}
            {isAdmin && <button className="tlink small nochev" disabled={busy} onClick={() => act(() => api.updateThread(id, { locked: !t.locked }), t.locked ? 'Open for replies again.' : 'Closed for replies.', true)}>{t.locked ? 'Reopen' : 'Close replies'}</button>}
            {confirm === 'thread'
              ? <><span className="status err">Delete this conversation and all replies?</span>
                  <button className="tlink small nochev danger" disabled={busy} onClick={() => act(async () => { await api.deleteThread(id); go('talk'); }, 'Conversation deleted.', true)}>Delete</button>
                  <button className="tlink small nochev" onClick={() => setConfirm(null)}>Keep</button></>
              : <button className="tlink small nochev danger" onClick={() => setConfirm('thread')}>Delete</button>}
          </div>
        )}
      </article>

      <h3 className="replyhead">{t.reply_count ? `${data.posts.length} ${data.posts.length === 1 ? 'reply' : 'replies'}` : 'No replies yet'}</h3>
      <div className="posts">{data.posts.map((p) => {
        const parent = p.reply_to ? byId.get(p.reply_to) : null;
        const mine = p.author === me;
        return (
          <div key={p.id} className={`post${mine ? ' mine' : ''}`} id={'post-' + p.id}>
            {p.author_person ? <Avatar id={p.author_person} size={40} /> : <span className="av s40" />}
            <div className="pbody">
              <div className="phead"><button className="tlink nochev" onClick={() => p.author_person && go('p/' + p.author_person)}>{name(p.author_person)}</button>
                <small>{ago(p.created_at)}{p.edited_at ? ' · edited' : ''}</small></div>
              {parent && <button className="quoteref" onClick={() => revealIn(document.getElementById('post-' + parent.id), { block: 'center' })}>
                ↩ {name(parent.author_person, true)}: {plain(parent.body).slice(0, 90)}</button>}
              {editing === p.id ? (
                <div className="pedit">
                  <RichEditor value={editText} onChange={setEditText} maxLength={5000} rows={4} compact mentions photos label="Edit reply" autoFocus
                    onSubmit={() => act(async () => { await api.updatePost(p.id, editText); setEditing(null); }, 'Saved.')} />
                  <div className="ctas" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
                    <button className="btn primary" disabled={busy || !editText.trim()} onClick={() => act(async () => { await api.updatePost(p.id, editText); setEditing(null); }, 'Saved.')}>Save</button>
                    <button className="btn" onClick={() => setEditing(null)}>Cancel</button></div>
                </div>
              ) : <><RichText text={p.body} className="ptext" photo={photoBlock} /><Videos videos={videosIn(p.body)} /></>}
              <div className="pfoot">
                <Reactions target={p.id} kind="post" all={data.reactions} onToggle={toggle} />
                {!t.locked && <button className="tlink small nochev" onClick={() => { setReplyTo(p); setTimeout(() => { revealIn(composer.current, { block: 'center' }); composer.current?.querySelector('textarea')?.focus({ preventScroll: true }); }, 50); }}>Reply</button>}
                {mine && editing !== p.id && <button className="tlink small nochev" onClick={() => { setEditing(p.id); setEditText(p.body); }}>Edit</button>}
                {(mine || isAdmin) && (confirm === p.id
                  ? <><button className="tlink small nochev danger" disabled={busy} onClick={() => act(() => api.deletePost(p.id), 'Reply deleted.', true)}>Delete?</button>
                      <button className="tlink small nochev" onClick={() => setConfirm(null)}>Keep</button></>
                  : <button className="tlink small nochev" onClick={() => setConfirm(p.id)}>Delete</button>)}
              </div>
            </div>
          </div>
        );
      })}</div>

      {t.locked ? <p className="emptyhint closednote">This conversation is closed for replies.</p> : (
        <div className="composer" ref={composer}>
          {replyTo && <div className="replyingto">Replying to <b>{name(replyTo.author_person, true)}</b>: {plain(replyTo.body).slice(0, 60)} <button className="x" aria-label="Cancel reply" onClick={() => setReplyTo(null)}>✕</button></div>}
          <RichEditor value={reply} onChange={setReply} maxLength={5000} rows={3} compact mentions photos label="Write a reply" placeholder="Write a reply… Type @ to mention someone." onSubmit={send} />
          <div className="sendrow"><small className="hint">Ctrl/⌘ + Enter to send</small><button className="pill small" disabled={busy || !reply.trim()} onClick={send}>Send</button></div>
        </div>
      )}

      {editThread && <ThreadSheet initial={{ title: t.title, category: t.category, body: t.body }} edit={t} onClose={() => setEditThread(false)} onSaved={load} />}
    </div>
  );
}
