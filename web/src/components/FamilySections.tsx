import { useEffect, useMemo, useState } from 'react';
import { FAMILY, STORY_HINT } from '../lib/site';
import { RichText } from '../lib/richtext';
import { RichEditor } from './RichEditor';
import { useStore } from '../lib/store';
import { friendly } from '../lib/api';
import { preparePhoto } from '../lib/photos';
import { daysUntil, firstName, fullName } from '../lib/format';
import { byMonth, type Upcoming } from '../lib/traditions';
import type { FamilyInfo, HeroPhoto, Invitation } from '../lib/types';
import { heroSlides } from './HeroSlides';
import { InviteSheet } from './Sheets';
import { InviteShare } from './InviteShare';
import { ResendButton } from './ResendButton';
import { ago } from '../lib/format';
import { draft, relationToMe, wishRecipient, wishText } from '../lib/wishes';
import { tamilTerm } from '../lib/tamil';
import { SearchBox, Sheet, go } from './common';

/* ---------- banner ---------- */
export function Banner() {
  const { snap, fileUrl, isAdmin } = useStore();
  const [edit, setEdit] = useState(false);
  const url = fileUrl(snap.info?.banner_path);
  if (!snap.info?.banner_path && !isAdmin) return null;
  return (
    <>
      {snap.info?.banner_path ? (
        <div className="banner reveal">
          {url ? <img src={url} alt="The family together" /> : <div className="banner-ph" />}
          {isAdmin && <button className="banner-edit" onClick={() => setEdit(true)}>Change photo</button>}
        </div>
      ) : (
        <button className="banner banner-empty" onClick={() => setEdit(true)}>
          <b>Add a family photo.</b><span>A picture of everyone together, shown at the top of this page.</span>
        </button>
      )}
      {edit && <BannerSheet onClose={() => setEdit(false)} />}
    </>
  );
}

export function BannerSheet({ onClose }: { onClose: () => void }) {
  const { api, snap, reload, toast, fileUrl } = useStore();
  type Item = { path?: string; file?: File; url?: string; caption: string };
  const [items, setItems] = useState<Item[]>(() => heroSlides(snap.info).map((h) => ({ path: h.path, caption: h.caption || '' })));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (i: number, patch: Partial<Item>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) => setItems((xs) => { const ys = [...xs]; const [x] = ys.splice(i, 1); ys.splice(Math.max(0, Math.min(ys.length, i + d)), 0, x); return ys; });
  function add(files: FileList | null) {
    const fs = [...(files || [])].filter((f) => /^image\//.test(f.type));
    setItems((xs) => [...xs, ...fs.map((f) => ({ file: f, url: URL.createObjectURL(f), caption: '' }))].slice(0, 12));
  }
  async function save() {
    setBusy(true); setErr('');
    try {
      const before = heroSlides(snap.info).map((h) => h.path);
      const out: HeroPhoto[] = [];
      for (const it of items) {
        const path = it.path || await api.uploadBanner(await preparePhoto(it.file!, 2600));
        out.push(it.caption.trim() ? { path, caption: it.caption.trim().slice(0, 120) } : { path });
      }
      await api.saveFamilyInfo({ hero_photos: out, banner_path: out[0]?.path ?? null });
      const keep = new Set(out.map((o) => o.path));
      for (const old of before) if (!keep.has(old)) await api.removeFile(old).catch(() => {}); // best effort
      await reload(); toast(out.length ? 'Family photos updated.' : 'Family photos removed.'); onClose();
    } catch (e) { setErr(friendly(e)); setBusy(false); }
  }
  return (
    <Sheet title="Family photos" sub="They move gently across the top of the Home page, one after another. Only invited family can see them. Location data is removed automatically." onClose={onClose}
      footer={<>
        <span className={`status${err ? ' err' : ''}`}>{busy ? 'Saving…' : err}</span>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>Save</button>
      </>}>
      {items.length > 0 && (
        <ol className="hp-list">
          {items.map((it, i) => (
            <li key={it.path || it.url}>
              {it.url || fileUrl(it.path) ? <img src={it.url || fileUrl(it.path)} alt="" /> : <span className="hp-ph" />}
              <input value={it.caption} maxLength={120} placeholder="Caption, e.g. The family, 1975" aria-label={`Caption for photo ${i + 1}`}
                onChange={(e) => set(i, { caption: e.target.value })} />
              <div className="hp-acts">
                <button className="btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move earlier">↑</button>
                <button className="btn" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move later">↓</button>
                <button className="btn danger" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>Remove</button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {items.length < 12 && (
        <label className="dropzone">
          <span>{items.length ? 'Add more photos' : 'Choose photos. Wide group photos work beautifully.'}</span>
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
        </label>
      )}
    </Sheet>
  );
}

/* ---------- our story ---------- */
export function Story() {
  const { snap, isAdmin } = useStore();
  const [edit, setEdit] = useState(false);
  const about = snap.info?.about?.trim();
  if (!about && !isAdmin) return null;
  return (
    <section className="section">
      <div className="section-head"><h3 className="sec-title">Our story. <span>What is {FAMILY}?</span></h3>
        {isAdmin && about && <button className="tlink small" onClick={() => setEdit(true)}>Edit</button>}</div>
      {about ? <RichText text={about} className="story famstory" /> : (
        <div className="nudge"><p>Tell the family how {FAMILY} began, who started it, and what the name means.</p>
          <button className="pill small" onClick={() => setEdit(true)}>Write the family story</button></div>
      )}
      {edit && <StorySheet onClose={() => setEdit(false)} />}
    </section>
  );
}

function StorySheet({ onClose }: { onClose: () => void }) {
  const { api, snap, reload, toast } = useStore();
  const [text, setText] = useState(snap.info?.about || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function save() {
    setBusy(true); setErr('');
    try { await api.saveFamilyInfo({ about: text.trim() || null }); await reload(); toast('Family story saved.'); onClose(); }
    catch (e) { setErr(friendly(e)); setBusy(false); }
  }
  return (
    <Sheet title="Our story" sub={`What ${FAMILY} is, how it started and who started it. Everyone invited can read this.`} onClose={onClose}
      footer={<>
        <span className={`status${err ? ' err' : ''}`}>{busy ? 'Saving…' : err}</span>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>Save</button>
      </>}>
      <RichEditor value={text} onChange={setText} maxLength={8000} rows={14} label="Family story" placeholder={STORY_HINT} onSubmit={save} />
      <div className="note">Select text and press a button, or type <b>**bold**</b>, <i>*italic*</i>, “## ” for a heading, “- ” for a list. Leave a blank line between paragraphs.</div>
    </Sheet>
  );
}

/* ---------- traditions' roots ---------- */
export function Roots() {
  const { snap, family, isAdmin } = useStore();
  const [edit, setEdit] = useState(false);
  const info = snap.info;
  const root = info?.roots_person_id ? family.byId.get(info.roots_person_id) : null;
  const partner = root ? (family.spouses.get(root.id) || []).map((s) => family.byId.get(s)!)[0] : null;
  const rows: [string, string | null | undefined][] = [
    ['Gothram', info?.gothram], ['Sutram', info?.sutram], ['Vedam', info?.vedam], ['Kuladeivam', info?.kuladeivam],
  ];
  const filled = rows.filter(([, v]) => v);
  if (!filled.length && !isAdmin) return null;
  return (
    <section className="section">
      <div className="section-head"><h3 className="sec-title">Our traditions’ roots.{root && <span> From {fullName(root)}{partner ? ` & ${fullName(partner)}` : ''}.</span>}</h3>
        {isAdmin && <button className="tlink small" onClick={() => setEdit(true)}>Edit</button>}</div>
      {filled.length ? (
        <>
          <div className="facts roots">{filled.map(([k, v]) => <div className="fact" key={k}><small>{k}</small><b>{v}</b></div>)}</div>
          <p className="uphint">In our Iyer tradition the gothram, sutram, vedam and kuladeivam pass unchanged from father to son. A daughter carries her father’s
            until she marries; then she takes her husband’s family’s, and wives who marry into the family take ours. Each profile shows what it carries{root ? <> from <button className="tlink small nochev inline" onClick={() => go('p/' + root.id)}>{firstName(root)}</button></> : ''}.</p>
        </>
      ) : <div className="nudge"><p>Record the family gothram, sutram, vedam and kuladeivam once. Every son of the line inherits them.</p>
        <button className="pill small" onClick={() => setEdit(true)}>Add the family traditions</button></div>}
      {edit && <RootsSheet onClose={() => setEdit(false)} />}
    </section>
  );
}

function RootsSheet({ onClose }: { onClose: () => void }) {
  const { api, snap, family, reload, toast } = useStore();
  const i = snap.info;
  const [v, setV] = useState<Partial<FamilyInfo>>({
    roots_person_id: i?.roots_person_id || family.root, gothram: i?.gothram || '', sutram: i?.sutram || '', vedam: i?.vedam || '', kuladeivam: i?.kuladeivam || '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const root = v.roots_person_id ? family.byId.get(v.roots_person_id) : null;
  async function save() {
    setBusy(true); setErr('');
    const clean = (x?: string | null) => (x || '').trim() || null;
    try {
      await api.saveFamilyInfo({ roots_person_id: v.roots_person_id || null, gothram: clean(v.gothram), sutram: clean(v.sutram), vedam: clean(v.vedam), kuladeivam: clean(v.kuladeivam) });
      await reload(); toast('Family traditions saved.'); onClose();
    } catch (e) { setErr(friendly(e)); setBusy(false); }
  }
  const field = (k: 'gothram' | 'sutram' | 'vedam' | 'kuladeivam', label: string, list?: string) => (
    <div className={k === 'kuladeivam' ? 'full' : ''}><label htmlFor={`r-${k}`}>{label}</label>
      <input id={`r-${k}`} value={v[k] || ''} maxLength={k === 'kuladeivam' ? 200 : 80} list={list} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>
  );
  return (
    <Sheet title="Our traditions’ roots" sub="Every son of the line inherits these. Anyone can still record their own on their profile." onClose={onClose}
      footer={<>
        <span className={`status${err ? ' err' : ''}`}>{busy ? 'Saving…' : err}</span>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>Save</button>
      </>}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="full"><label>Where the line begins</label>
          <div className="pickrow"><b>{root ? fullName(root) : 'Not chosen'}</b></div>
          <SearchBox placeholder="Change: find the founder…" onPick={(id) => setV({ ...v, roots_person_id: id })} />
          <div className="note">Usually the earliest father in the tree. His sons, grandsons and so on carry the gothram.</div></div>
        {field('gothram', 'Gothram', 'dl-gothram')}
        {field('sutram', 'Sutram', 'dl-sutram')}
        {field('vedam', 'Vedam', 'dl-vedam')}
        {field('kuladeivam', 'Kuladeivam (family deity and temple)')}
        <datalist id="dl-gothram">{['Atreya', 'Bharadwaja', 'Gautama', 'Haritha', 'Kashyapa', 'Kaundinya', 'Kaushika', 'Shandilya', 'Srivatsa', 'Vadhula', 'Vasishta', 'Viswamitra'].map((g) => <option key={g} value={g} />)}</datalist>
        <datalist id="dl-sutram">{['Apastamba', 'Bodhayana', 'Drahyayana', 'Aswalayana', 'Katyayana', 'Jaimini'].map((g) => <option key={g} value={g} />)}</datalist>
        <datalist id="dl-vedam">{['Rig', 'Krishna Yajur', 'Shukla Yajur', 'Sama', 'Atharva'].map((g) => <option key={g} value={g} />)}</datalist>
      </form>
    </Sheet>
  );
}

/* ---------- coming up ---------- */
export function ComingUp({ items }: { items: Upcoming[] }) {
  const { family, myId, snap } = useStore();
  const joined = useMemo(() => new Set(snap.joined), [snap.joined]);
  const [all, setAll] = useState<Set<string>>(new Set());
  const LIMIT = 6;
  const List = ({ k, list }: { k: string; list: Upcoming[] }) => {
    if (!list.length) return <p className="emptyhint">None this month.</p>;
    const open = all.has(k) || list.length <= LIMIT + 1;
    return (
      <>
        <div className="uplist">{(open ? list : list.slice(0, LIMIT)).map((u) => <Item key={u.id + u.kind} u={u} />)}</div>
        {!open && <button className="tlink small morebtn" onClick={() => setAll(new Set([...all, k]))}>Show {list.length - LIMIT} more</button>}
      </>
    );
  };
  if (!items.length) return null;
  const months = byMonth(items);
  const Item = ({ u }: { u: Upcoming }) => {
    const p = family.byId.get(u.id)!; const n = daysUntil(u.date);
    // who they are to me: for a couple, the partner I'm related to
    const relOf = (id?: string) => (id ? relationToMe(family, id, myId) : null);
    const who = relOf(u.id) ? u.id : u.with && relOf(u.with) ? u.with : u.id;
    const rel = relOf(who);
    const ta = myId && who !== myId ? tamilTerm(family, who, myId) : null;
    const to = wishRecipient(family, u, myId, joined);
    return (
      <div className="up">
        <button className="up-main" onClick={() => go('p/' + u.id)}>
          <span className="when"><b>{u.date.getUTCDate()}</b><small>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][u.date.getUTCDay()]}</small></span>
          <span className="what"><b>{firstName(p)}{u.with ? ` & ${firstName(family.byId.get(u.with))}` : ''}{u.kind !== 'birthday' && u.kind !== 'remembrance' ? ` · ${u.title}` : ''}</b>
            {(rel || ta) && <span className="up-rel">{rel ? (u.with && who === u.with ? `${firstName(family.byId.get(who))} is ${rel}` : rel.replace(/^your/, 'Your')) : ''}{rel && ta ? ' · ' : ''}{ta && <i>{ta}</i>}</span>}
            <span>{u.sub} · {n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`}</span></span>
        </button>
        {to && (
          <button className={`up-wish${n === 0 ? ' today' : ''}`} title={`Send ${firstName(family.byId.get(to))} a wish`}
            onClick={() => { draft.person = to; draft.text = wishText(family, u, to, myId); go('chat/' + to); }}>
            <span aria-hidden="true">{u.kind === 'anniversary' ? '💐' : u.kind === 'tamil-birthday' ? '🪔' : '🎂'}</span> Send a wish
          </button>
        )}
      </div>
    );
  };
  return (
    <section className="section">
      <div className="section-head"><h3 className="sec-title">Coming up. <span>The next two months.</span></h3><button className="tlink small" onClick={() => go('calendar')}>Open the calendar</button></div>
      {months.map((m) => (
        <div className="month" key={m.key}>
          <h4 className="month-h">{m.label}</h4>
          <div className="month-cols">
            <div><h5 className="kind-h bday">Birthdays &amp; anniversaries <span>{m.birthdays.length || ''}</span></h5>
              <List k={m.key + 'b'} list={m.birthdays} /></div>
            <div><h5 className="kind-h remem">Remembrance <span>{m.remembrance.length || ''}</span></h5>
              <List k={m.key + 'r'} list={m.remembrance} /></div>
          </div>
        </div>
      ))}
      {items.some((u) => u.kind === 'tamil-birthday' || u.kind === 'shraddham') && <p className="uphint">Tamil birthdays and shraddhams are worked out from the Tamil calendar. Please confirm with your panchangam.</p>}
    </section>
  );
}

/* ---------- what you can do ---------- */
export function WhatYouCanDo() {
  const { isAdmin, isSteward } = useStore();
  const member = [
    ['Find anyone', 'Search by name or city, browse every generation, or open the tree on the left.'],
    ['See how you’re related', 'Pick two people for the relationship in English and the Tamil word you’d use.'],
    ['Fill in your profile', 'Photo, city, work, story, contact details, gothram, star and milestones.'],
    ['Choose who sees each detail', 'Everyone in the family, close family only, or only you. Change it any time.'],
    ['Look after others', 'Fill in details for close family who haven’t joined yet. Parents look after children until 18; children keep a late parent’s memory. Once someone joins, their profile is theirs.'],
    ['Invite relatives', 'Open a relative’s profile and choose Invite. They join as a member, linked to their place in the tree.'],
    ['Share photos', 'Add family pictures and tag people. Anyone tagged can approve or hide the photo.'],
    ['Talk together', 'Start a conversation about a tradition, a recipe or a festival, reply, and react with 🙏 ❤️ 👍.'],
    ['Never miss a day', 'The calendar shows birthdays, Tamil birthdays, anniversaries, remembrance days, festivals and the Tamil date.'],
    ['Stay in the loop', 'The bell shows who joined, new details you can see, and photos you’re tagged in.'],
    ['Your data, your call', 'Download everything about you, withdraw consent, or ask for it all to be deleted.'],
  ];
  const steward = [
    ['Let people in', 'Check requests to join, find the person in the tree, and approve or decline.'],
    ['Grow the tree', 'Add parents, children, spouses and siblings, including in-law families.'],
    ['Correct tree details', 'Names, birth years, and dates of passing.'],
    ['Fill in the gaps', 'Add details for anyone who hasn’t joined yet, or has passed away.'],
  ];
  const admin = [
    ['Choose roles', 'Make someone a member, steward or admin when you invite them, or later from the Admin page.'],
    ['Tell the family’s story', 'Edit the story, the family photo and the traditions’ roots on this page.'],
    ['Look after Talk', 'Pin important conversations, close them for replies, or remove posts that don’t belong.'],
    ['Manage accounts', 'Pause an account, see who has joined, and remove people from the tree.'],
    ['Handle requests', 'Complete deletion requests and review the change history.'],
  ];
  return (
    <section className="section">
      <div className="section-head"><h3 className="sec-title">What you can do. <span>{isAdmin ? 'As a member, a steward and an admin.' : isSteward ? 'As a member and as a steward.' : 'Here’s the short version.'}</span></h3></div>
      <div className="cando">
        <div className="cando-card"><h4>Every family member</h4><ul>{member.map(([t, d]) => <li key={t}><b>{t}</b><span>{d}</span></li>)}</ul></div>
        <div className="cando-card admin"><h4>Family stewards <small>also</small></h4><ul>{steward.map(([t, d]) => <li key={t}><b>{t}</b><span>{d}</span></li>)}</ul></div>
        <div className="cando-card admin"><h4>Family admins <small>also</small></h4><ul>{admin.map(([t, d]) => <li key={t}><b>{t}</b><span>{d}</span></li>)}</ul>
          {!isAdmin && <p className="note">Stewards don’t see details you’ve kept to close family or to yourself once you’ve joined. Admins can see everything, to look after the site.</p>}</div>
      </div>
    </section>
  );
}

/* ---------- privacy levels ---------- */
export function PrivacyLevels({ compact, canEdit, onEdit, name, self }: { compact?: boolean; canEdit?: boolean; onEdit?: () => void; name?: string; self?: boolean }) {
  const levels = [
    { k: 'family', t: 'Family', who: 'Everyone invited to this website.', eg: 'City, work, story, gothram, milestones' },
    { k: 'close', t: 'Close family', who: 'Your parents, children, brothers and sisters, your husband or wife, and their husbands and wives (your in-laws too).', eg: 'Phone, email, full date of birth, nakshatram' },
    { k: 'private', t: 'Only me', who: 'Just you, and anyone who looks after your profile (a parent while you’re under 18).', eg: 'Home address, horoscope' },
  ];
  return (
    <section className="section">
      <div className="section-head"><h3 className="sec-title">{compact ? 'Who can see what.' : 'Your privacy.'} <span>{compact ? (self ? 'Each of your details has its own setting.' : `Each of ${name}’s details has its own setting.`) : 'Three levels, set detail by detail.'}</span></h3></div>
      <div className="levels">{levels.map((l) => (
        <div key={l.k} className={`level lv-${l.k}`}><b>{l.t}</b><p>{l.who}</p>{!compact && <span>Usually: {l.eg}</span>}</div>
      ))}</div>
      <div className="howto">
        {!compact && <p><b>How to set it up.</b> Open your profile, choose <i>Edit profile</i>, and use the menu beside each detail. Nothing is shown to anyone until you agree to the family privacy declaration, and you can withdraw that at any time on <a href="#/privacy">My privacy</a>. Your name and place in the tree are always visible to the family; phone, email and address are never stored for anyone under 18.</p>}
        {compact && <p>Names, relationships and birth years are visible to all family members. Everything else is shown only at the level chosen for it{canEdit || self ? '.' : `, and only after ${name || 'they'} agree to share.`}</p>}
        {compact && canEdit && onEdit && <button className="pill small ghost" onClick={onEdit}>Change who sees what</button>}
      </div>
    </section>
  );
}

/* ---------- bring the family in ---------- */
export function InviteFamily() {
  const { api, snap, family, myId, isMinor, reload, toast } = useStore();
  const [who, setWho] = useState<string | null | undefined>(undefined);
  const [sent, setSent] = useState<Invitation[]>([]);
  const [shareInv, setShareInv] = useState<Invitation | null>(null);
  const load = () => api.listInvitations().then((l) => setSent(l.filter((i) => !i.accepted_at && (snap.me?.role !== 'admin' || i.invited_by === snap.me?.user_id)))).catch(() => {});
  useEffect(() => { load(); }, [snap.invited.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!myId) return null;
  const joined = new Set(snap.joined), invited = new Set(snap.invited);
  const near = new Set<string>();
  const add = (ids?: string[]) => (ids || []).forEach((x) => near.add(x));
  const sps = family.spouses.get(myId) || [];
  add(family.parents.get(myId)); add(family.children.get(myId)); add(sps);
  for (const par of family.parents.get(myId) || []) add(family.children.get(par));
  for (const sp of sps) { add(family.parents.get(sp)); for (const par of family.parents.get(sp) || []) add(family.children.get(par)); }
  for (const x of [...near]) add(family.spouses.get(x));
  near.delete(myId);
  const ideas = [...near].filter((id) => { const p = family.byId.get(id); return p?.is_living && !isMinor(id) && !joined.has(id) && !invited.has(id); }).slice(0, 12);
  if (!ideas.length && !sent.length) return null;
  return (
    <section className="section">
      <div className="gap-card">
        <h3 className="sec-title" style={{ fontSize: 28 }}>Bring the family in.</h3>
        <p>Anyone in the family can invite a relative who is in the tree. Open their profile and choose <b>Invite</b>, or start with someone close:</p>
        {ideas.length > 0 && <div className="chips">{ideas.map((id) => <button key={id} className="chip" onClick={() => setWho(id)}>Invite {fullName(family.byId.get(id))}</button>)}</div>}
        {sent.length > 0 && (
          <>
            <h5 className="vh" style={{ marginTop: 22 }}>Invitations you’ve sent</h5>
            <ul className="sentlist">{sent.map((i) => (
              <li key={i.id}><span><b>{i.person_id ? fullName(family.byId.get(i.person_id)) : i.email}</b> · {i.email} · {ago(i.created_at)}{i.approved_at === null && <span className="inv-tag">Waiting for approval</span>}</span>
                <span className="sentacts">{i.approved_at !== null && <><ResendButton email={i.email} className="tlink small nochev" /><button className="tlink small nochev" onClick={() => setShareInv(i)}>Share again</button></>}
                <button className="tlink small nochev" onClick={async () => { try { await api.cancelInvitation(i.id); await reload(); load(); toast('Invitation cancelled.'); } catch (e) { toast(friendly(e)); } }}>Cancel</button></span></li>
            ))}</ul>
          </>
        )}
      </div>
      {who !== undefined && <InviteSheet id={who} onClose={() => { setWho(undefined); load(); }} />}
      {shareInv && <Sheet title="Share the invitation" sub={`Signs in with ${shareInv.email}.`} onClose={() => setShareInv(null)} footer={<button className="btn primary" onClick={() => setShareInv(null)}>Done</button>}>
        <InviteShare email={shareInv.email} personId={shareInv.person_id} code={shareInv.code} /></Sheet>}
    </section>
  );
}
