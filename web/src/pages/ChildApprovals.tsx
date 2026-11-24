import { useState } from 'react';
import { useStore } from '../lib/store';
import { friendly } from '../lib/api';
import { firstName, fullName } from '../lib/format';
import { RichText } from '../lib/richtext';
import { FIELD_LABEL, VISIBILITY_LABEL, type ChildDraft, type FieldName, type Visibility } from '../lib/types';
import { Avatar, go } from '../components/common';

/**
 * #/child: what under-18s have added, waiting for a parent (0034).
 * A child sees their own waiting items (and can withdraw them); a parent sees their children's, and approves
 * (it's published under the child's name) or declines (it's gone, with no copy kept).
 */
export function ChildApprovals() {
  const { api, snap, family, myId, amMinor, activeConsent, reload, toast } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const drafts = snap.childDrafts || [];
  const mine = drafts.filter((d) => d.child_person === myId);
  const theirs = drafts.filter((d) => d.child_person !== myId);
  const kids = [...new Set(theirs.map((d) => d.child_person))];
  // my children under 18 who have joined but have no consent yet
  const needConsent = (family.children.get(myId || '') || []).filter((k) => snap.joined.includes(k) && !activeConsent(k) && family.byId.get(k)?.is_living
    && (family.byId.get(k)?.birth_year ?? 0) > new Date().getFullYear() - 18);

  async function act(d: ChildDraft, f: () => Promise<void>, done: string) {
    setBusy(d.id);
    try { await f(); await reload(); toast(done); } catch (e) { toast(friendly(e)); } finally { setBusy(null); }
  }

  return (
    <div className="wrap child-approvals">
      <section className="hero-p" style={{ paddingBottom: 8 }}>
        <p className="eyebrow">Under 18</p>
        <h2 className="headline">{amMinor ? 'Waiting for your parent.' : 'Waiting for your OK.'}</h2>
        <p className="subhead">{amMinor
          ? 'You’re under 18, so a parent checks what you add before the family sees it. Once they say OK it appears with your name.'
          : 'Your children under 18 can use the site. What they add waits here until you say OK. If you decline, it’s deleted and nobody else ever sees it.'}</p>
      </section>

      {needConsent.map((k) => (
        <div key={k} className="gap-card cd-consent">
          <Avatar id={k} size={40} />
          <p><b>{firstName(family.byId.get(k))}</b> has joined. As their parent, please give consent so the family can see their page.</p>
          <button className="pill small" onClick={() => go('p/' + k)}>Give consent</button>
        </div>
      ))}

      {amMinor && (mine.length ? mine.map((d) => (
        <Draft key={d.id} d={d}>
          <button className="btn" disabled={busy === d.id} onClick={() => act(d, () => api.childWithdraw(d.id), 'Taken back.')}>Take back</button>
        </Draft>
      )) : <p className="emptyhint">Nothing waiting. When you add something, it shows here until a parent says OK.</p>)}

      {!amMinor && kids.map((k) => (
        <section key={k} className="section">
          <div className="section-head"><h3 className="sec-title"><Avatar id={k} size={40} /> {fullName(family.byId.get(k))}</h3></div>
          {theirs.filter((d) => d.child_person === k).map((d) => (
            <Draft key={d.id} d={d}>
              <button className="btn" disabled={busy === d.id} onClick={() => act(d, () => api.childDecide(d.id, false), 'Declined and deleted.')}>Decline</button>
              <button className="btn primary" disabled={busy === d.id} onClick={() => act(d, () => api.childDecide(d.id, true), 'Approved. It’s now on the site.')}>Approve</button>
            </Draft>
          ))}
        </section>
      ))}
      {!amMinor && !kids.length && !needConsent.length && <p className="emptyhint">Nothing waiting for you.</p>}
    </div>
  );
}

function Draft({ d, children }: { d: ChildDraft; children: React.ReactNode }) {
  const { snap, fileUrl } = useStore();
  const p = d.payload;
  const when = new Date(d.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  let what: React.ReactNode;
  if (d.kind === 'detail') {
    const label = FIELD_LABEL[p.field as FieldName] || p.field;
    what = p.remove === 'true' || !p.value
      ? <p>Remove <b>{label}</b> from their page.</p>
      : <p><b>{label}</b>: {p.value} <em className="vischip">{VISIBILITY_LABEL[(p.visibility || 'family') as Visibility]}</em></p>;
  } else if (d.kind === 'thread') {
    what = <><p className="cd-kind">A new conversation</p><h4>{p.title}</h4><RichText text={p.body || ''} className="story" /></>;
  } else if (d.kind === 'reply') {
    const t = snap.threads.find((x) => x.id === p.thread_id);
    what = <><p className="cd-kind">A reply in “{t?.title || 'a conversation'}”</p><RichText text={p.body || ''} className="story" /></>;
  } else {
    const url = fileUrl(p.path);
    what = <><p className="cd-kind">A photo{p.caption ? `: ${p.caption}` : ''}{p.taken_year ? ` (${p.taken_year})` : ''}</p>{url ? <img className="cd-photo" src={url} alt={p.caption || 'Photo'} /> : <span className="pph cd-photo" />}</>;
  }
  return (
    <div className="gap-card cd-item">
      <div className="cd-body">{what}<small>{when}</small></div>
      <div className="cd-acts">{children}</div>
    </div>
  );
}
