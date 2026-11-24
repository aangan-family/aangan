import { useEffect, useMemo, useState } from 'react';
import { DOMAIN } from '../lib/site';
import { useStore } from '../lib/store';
import { friendly } from '../lib/api';
import { ago, firstName, fullName } from '../lib/format';
import type { JoinRequest, Person, InviteToApprove } from '../lib/types';
import { SearchBox } from './common';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1);

/** People in the tree who might be the person asking: living relatives who haven't joined, best matches first. */
export function suggestMatches(r: Pick<JoinRequest, 'full_name' | 'father_name' | 'mother_name' | 'spouse_name'>, persons: Person[],
  parentsOf: (id: string) => string[], spousesOf: (id: string) => string[], byId: (id: string) => Person | undefined, eligible: (id: string) => boolean): Person[] {
  const name = norm(r.full_name), dad = norm(r.father_name), mum = norm(r.mother_name), sp = norm(r.spouse_name);
  const hit = (ws: string[], p?: Person) => !!p && ws.some((w) => norm(`${p.given_name} ${p.surname} ${p.birth_surname}`).includes(w));
  const scored = persons.filter((p) => eligible(p.id)).map((p) => {
    let s = 0;
    const own = norm(`${p.given_name} ${p.surname} ${p.birth_surname}`);
    if (name[0] && own.includes(name[0])) s += 3;
    s += name.slice(1).filter((w) => own.includes(w)).length;
    const parents = parentsOf(p.id).map(byId);
    if (dad.length && parents.some((q) => q?.gender === 'm' && hit(dad, q))) s += 2;
    if (mum.length && parents.some((q) => q?.gender === 'f' && hit(mum, q))) s += 2;
    if (sp.length && spousesOf(p.id).map(byId).some((q) => hit(sp, q))) s += 2;
    return { p, s };
  }).filter((x) => x.s >= 3).sort((a, b) => b.s - a.s);
  return scored.slice(0, 5).map((x) => x.p);
}

export function JoinRequests() {
  const { api, toast, reload } = useStore();
  const [list, setList] = useState<JoinRequest[] | null>(null);
  const [show, setShow] = useState<'pending' | 'done'>('pending');
  const load = () => api.listJoinRequests().then(setList).catch((e) => toast(friendly(e)));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!list) return <p className="emptyhint" style={{ textAlign: 'center', marginTop: 30 }}>Loading requests…</p>;
  const month = Date.now() - 30 * 86400_000;
  const pending = list.filter((r) => r.status === 'pending' && new Date(r.created_at).getTime() > month);
  const done = list.filter((r) => r.status !== 'pending' || new Date(r.created_at).getTime() <= month);
  const shown = show === 'pending' ? pending : done;
  return (
    <section>
      <div className="gap-card">
        <h3 className="sec-title" style={{ fontSize: 26 }}>Requests to join.</h3>
        <p>People who signed in without an invitation and asked to join. They see nothing of the family until you approve them. Find them in the tree, then approve: their account is linked to that person and they get the welcome email. Not sure who they are? Call or WhatsApp them first.</p>
        <p className="note">Share this link in the family WhatsApp groups so people can ask to join: <b>{DOMAIN}/#/join</b></p>
        <div className="seg" role="tablist" style={{ marginTop: 12 }}>
          <button role="tab" aria-selected={show === 'pending'} onClick={() => setShow('pending')}>Waiting{pending.length ? ` (${pending.length})` : ''}</button>
          <button role="tab" aria-selected={show === 'done'} onClick={() => setShow('done')}>Decided</button>
        </div>
      </div>
      <InvitesToApprove />
      {shown.map((r) => <RequestCard key={r.id} r={r} onDone={async () => { await load(); await reload(); }} />)}
      {!shown.length && <p className="emptyhint" style={{ textAlign: 'center', marginTop: 30 }}>{show === 'pending' ? 'No requests waiting.' : 'Nothing decided yet.'}</p>}
    </section>
  );

}

function RequestCard({ r, onDone }: { r: JoinRequest; onDone: () => Promise<void> }) {
  const [checked, setChecked] = useState(false);
  const { api, snap, family, isAdmin, toast } = useStore();
  const joined = new Set(snap.joined);
  // the chosen person already has a login (e.g. an old email): admins can move them to this new login
  const [conflict, setConflict] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const eligible = (id: string) => { const p = family.byId.get(id); return !!p?.is_living && !joined.has(id); };
  const suggestions = useMemo(() => suggestMatches(r, snap.persons, (id) => family.parents.get(id) || [], (id) => family.spouses.get(id) || [], (id) => family.byId.get(id), eligible),
    [r.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [pick, setPick] = useState<string | null>(suggestions[0]?.id || null);
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState('');
  const desc = (id: string) => {
    const ps = (family.parents.get(id) || []).map((x) => firstName(family.byId.get(x))).filter(Boolean).join(' & ');
    const sp = (family.spouses.get(id) || []).map((x) => firstName(family.byId.get(x))).filter(Boolean).join(', ');
    return [ps && `child of ${ps}`, sp && `married to ${sp}`].filter(Boolean).join(' · ');
  };
  const pending = r.status === 'pending';
  async function approve() {
    if (!pick) return;
    setBusy(true);
    try { await api.approveJoin(r.id, pick); toast(`${r.full_name} can now sign in as ${fullName(family.byId.get(pick))}.`); await onDone(); }
    catch (e) {
      const msg = friendly(e);
      if (/already joined as this person/i.test(msg)) setConflict(pick); else toast(msg);
    } finally { setBusy(false); }
  }
  async function approveReplacing() {
    if (!pick) return;
    setBusy(true);
    try { await api.approveJoinReplacing(r.id, pick); toast(`${fullName(family.byId.get(pick))} now signs in with ${r.email}. The old login was removed.`); setReplacing(false); setConflict(null); await onDone(); }
    catch (e) { toast(friendly(e)); } finally { setBusy(false); }
  }
  async function decline() {
    setBusy(true);
    try { await api.declineJoin(r.id, note); toast('Request declined.'); await onDone(); }
    catch (e) { toast(friendly(e)); } finally { setBusy(false); }
  }
  const tel = r.phone ? r.phone.replace(/[^\d+]/g, '') : '';
  return (
    <div className="jr">
      <div className="jr-head">
        <div><b>{r.full_name}</b> <span className="jr-meta">· {r.email} · {ago(r.created_at)}</span></div>
        {!pending && <span className={`badge${r.status === 'approved' ? ' ok' : ''}`}>{r.status === 'approved' ? `Approved as ${fullName(family.byId.get(r.person_id || '')) || 'a relative'}` : 'Declined'}</span>}
      </div>
      {!pending && (
        <p className="jr-decided">
          {r.status === 'approved' ? 'Approved' : 'Declined'} by <b>{r.decided_by_person && family.byId.has(r.decided_by_person) ? fullName(family.byId.get(r.decided_by_person)) : 'a steward or admin'}</b>
          {r.decided_at ? ` · ${new Date(r.decided_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}
        </p>
      )}
      <dl className="jr-facts">
        {r.father_name && <><dt>Father</dt><dd>{r.father_name}</dd></>}
        {r.mother_name && <><dt>Mother</dt><dd>{r.mother_name}</dd></>}
        {r.spouse_name && <><dt>Husband or wife</dt><dd>{r.spouse_name}</dd></>}
        {r.city && <><dt>City</dt><dd>{r.city}</dd></>}
        {r.phone && <><dt>Phone</dt><dd><a href={`tel:${tel}`}>{r.phone}</a> · <a href={`https://wa.me/${tel.replace(/^\+/, '')}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></dd></>}
        {r.note && <><dt>Their note</dt><dd>{r.note}</dd></>}
        {r.decline_note && <><dt>Your note</dt><dd>{r.decline_note}</dd></>}
      </dl>
      {pending && !declining && (
        <div className="jr-match">
          <label>Who are they in the tree?</label>
          {suggestions.length > 0 && <div className="chips">{suggestions.map((p) => (
            <button key={p.id} type="button" className={`chip${pick === p.id ? ' on' : ''}`} onClick={() => { setPick(p.id); setReplacing(false); }}>{fullName(p)}</button>
          ))}</div>}
          <SearchBox placeholder={pick ? `Or search: ${fullName(family.byId.get(pick))} chosen` : 'Search the tree…'} onPick={(id) => { if (eligible(id) || (isAdmin && joined.has(id) && family.byId.get(id)?.is_living)) { setPick(id); setConflict(null); setReplacing(false); } else toast('Choose a living relative who hasn’t joined yet. If they’re missing, add them to the tree first.'); }} />
          {pick && <p className="note">Approving as <b>{fullName(family.byId.get(pick))}</b>{desc(pick) ? ` (${desc(pick)})` : ''}.</p>}
          {pick && (conflict === pick || joined.has(pick)) && (
            <div className="jr-conflict">
              <b>{firstName(family.byId.get(pick))} already has a login with another email.</b>
              {isAdmin
                ? <span>If this is the same person signing in with a new email ({r.email}), approve and replace: their place in the tree moves to this login and the old login is deleted. Their details, consent and role stay.</span>
                : <span>Only an admin can move them to this new login.</span>}
              {isAdmin && !replacing && <button className="btn danger" disabled={busy || !checked} onClick={() => setReplacing(true)}>Approve and replace old login</button>}
              {isAdmin && replacing && (
                <div className="jr-acts">
                  <button className="btn danger-bg primary" disabled={busy} onClick={approveReplacing}>{busy ? 'Moving…' : `Yes, move ${firstName(family.byId.get(pick))} to ${r.email}`}</button>
                  <button className="btn" disabled={busy} onClick={() => setReplacing(false)}>Cancel</button>
                </div>
              )}
            </div>
          )}
          <label className="jr-check"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            I’ve checked this is really {r.full_name.split(' ')[0] || 'them'}: I called or messaged them{r.phone ? ' on the number above' : ''}, or I know them and this email is theirs.</label>
          <div className="jr-acts">
            <button className="btn primary" disabled={!pick || busy || !checked} onClick={approve}>{busy ? 'Approving…' : 'Approve'}</button>
            <button className="btn" disabled={busy} onClick={() => setDeclining(true)}>Decline</button>
          </div>
        </div>
      )}
      {pending && declining && (
        <div className="jr-match">
          <label htmlFor={`dn-${r.id}`}>A short note for them (optional)</label>
          <input id={`dn-${r.id}`} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e.g. We couldn’t find you in the tree. Please call the family admin." />
          <div className="jr-acts">
            <button className="btn" disabled={busy} onClick={decline}>{busy ? 'Declining…' : 'Decline request'}</button>
            <button className="tlink" onClick={() => setDeclining(false)}>Back</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 0024: invitations sent by members wait here until a steward or admin checks the email really is that relative's. */
function InvitesToApprove() {
  const { api, family, toast, reload } = useStore();
  const [list, setList] = useState<InviteToApprove[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => api.invitationsToApprove().then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!list || !list.length) return null;
  async function act(i: InviteToApprove, ok: boolean) {
    setBusy(i.id);
    try {
      if (ok) await api.approveInvitation(i.id); else await api.declineInvitation(i.id);
      toast(ok ? `Approved. ${fullName(family.byId.get(i.person_id || '')) || 'They'} can now sign in with ${i.email}.` : 'Invitation declined.');
      await load(); await reload();
    } catch (e) { toast(friendly(e)); } finally { setBusy(null); }
  }
  return (
    <div className="gap-card inv-approve">
      <h3 className="sec-title" style={{ fontSize: 22 }}>Invitations to approve.</h3>
      <p>Family members invited these relatives. Check each email really belongs to that person (call or message them if you’re not sure), so nobody can sign in as someone else.</p>
      {list.map((i) => {
        const p = family.byId.get(i.person_id || '');
        const by = family.byId.get(i.invited_by_person || '');
        return (
          <div key={i.id} className="inv-row">
            <div><b>{p ? fullName(p) : 'A relative'}</b> <span className="jr-meta">· {i.email} · invited by {by ? fullName(by) : 'a member'} · {ago(i.created_at)}</span></div>
            <div className="jr-acts">
              <button className="btn primary" disabled={busy === i.id} onClick={() => act(i, true)}>{busy === i.id ? 'Saving…' : 'Approve invitation'}</button>
              <button className="btn" disabled={busy === i.id} onClick={() => act(i, false)}>Decline</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
