import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { useStore } from '../lib/store';
import { friendly } from '../lib/api';
import { firstName, fullName } from '../lib/format';
import { relationToMe } from '../lib/wishes';
import { closeRelatives, elderLink, isGmail, joinRequestMessage, maskEmail } from '../lib/invite';
import { usePack } from '../lib/community';
import type { Invitation } from '../lib/types';
import { Sheet } from './common';
import { InviteSheet } from './Sheets';

const NUDGE_KEY = 'fam.invite-nudge-hidden';
const hiddenUntil = () => { try { return +(localStorage.getItem(NUDGE_KEY) || 0); } catch { return 0; } };
const thisYear = new Date().getFullYear();
/** 60 and over: "Set this up for …" is offered. */
export const isElder = (birthYear?: number | null) => !!birthYear && thisYear - birthYear >= 60;

/** Living, not joined, not invited, not a child: who could be brought in. */
function useCanBring() {
  const { snap, family, isMinor } = useStore();
  const joined = useMemo(() => new Set(snap.joined), [snap.joined]);
  const invited = useMemo(() => new Set(snap.invited), [snap.invited]);
  return (id: string) => { const p = family.byId.get(id); return !!p?.is_living && !joined.has(id) && !invited.has(id) && !isMinor(id); };
}

/**
 * Home: "Bring in your family." The two or three closest relatives who aren't on the website yet, each with a
 * ready-made WhatsApp message (join by request, for when you don't know their email) or a personal invitation.
 * "Not now" hides it on this device for two weeks.
 */
export function InviteNudge() {
  const { family, myId, amMinor } = useStore();
  const can = useCanBring();
  const [hidden, setHidden] = useState(() => hiddenUntil() > Date.now());
  const [invite, setInvite] = useState<string | null>(null);
  const [elder, setElder] = useState<string | null>(null);
  if (!myId || amMinor || hidden || !family.byId.has(myId)) return null;
  const all = closeRelatives(family, myId).filter(can);
  const top = all.slice(0, 3);
  if (!top.length) return null;
  const hide = () => { try { localStorage.setItem(NUDGE_KEY, String(Date.now() + 14 * 86400000)); } catch { /* storage off */ } setHidden(true); };
  return (
    <section className="section bring">
      <div className="gap-card">
        <h3 className="sec-title" style={{ fontSize: 28 }}>Bring in your family.</h3>
        <p>{all.length === 1 ? 'One of your closest relatives isn’t' : `${all.length} of your close relatives aren’t`} on the website yet. A message from you is what brings people in.</p>
        <ul className="bring-list">
          {top.map((id) => {
            const p = family.byId.get(id)!;
            const first = firstName(p);
            const rel = relationToMe(family, id, myId);
            return (
              <li key={id}>
                <a className="bring-who" href={`#/p/${id}`}><b>{fullName(p)}</b>{rel && <small>{rel}</small>}</a>
                <span className="bring-acts">
                  <a className="pill small" href={`https://wa.me/?text=${encodeURIComponent(joinRequestMessage(first))}`} target="_blank" rel="noopener noreferrer">Ask on WhatsApp</a>
                  <button className="pill small ghost" onClick={() => setInvite(id)}>Invite by email</button>
                  {isElder(p.birth_year) && <button className="tlink small nochev" onClick={() => setElder(id)}>Set this up for {first}</button>}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="note small"><b>Ask on WhatsApp</b> sends them the join link: they sign in and ask, and a steward lets them in. <b>Invite by email</b> lets them straight in if you know their email. <button className="tlink small nochev" onClick={hide}>Not now</button></p>
      </div>
      {invite && <InviteSheet id={invite} onClose={() => setInvite(null)} />}
      {elder && <ElderSheet id={elder} onClose={() => setElder(null)} />}
    </section>
  );
}

/**
 * Home: "Who's here, by branch." Each branch of the family (a child of the couple where the tree first branches out)
 * with how many of its living people have joined. Names and counts only, from the tree everyone can already see.
 * Tap a branch to see who isn't on yet, with Invite beside each.
 */
export function BranchProgress() {
  const { snap, family, myId, isMinor } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const can = useCanBring();
  const rows = useMemo(() => {
    const joined = new Set(snap.joined);
    const heads = (family.branchRoot && family.kids.get(family.branchRoot)) || [];
    const out = heads.map((h) => ({ key: h, label: `${firstName(family.byId.get(h))}’s family`, living: [] as string[], joined: 0 }));
    const other = { key: '', label: 'Families who married in', living: [] as string[], joined: 0 };
    for (const p of family.byId.values()) {
      if (!p.is_living) continue;
      const b = family.branch.get(p.id);
      const r = out.find((x) => x.key === b) || other;
      r.living.push(p.id);
      if (joined.has(p.id)) r.joined++;
    }
    const mine = myId ? family.branch.get(myId) : undefined;
    return [...out.filter((r) => r.living.length).sort((a, b) => (a.key === mine ? -1 : b.key === mine ? 1 : 0)), ...(other.living.length ? [other] : [])].map((r) => ({ ...r, mine: !!mine && r.key === mine }));
  }, [snap.joined, family, myId]);
  if (!rows.length) return null;
  const total = rows.reduce((a, r) => a + r.living.length, 0), on = rows.reduce((a, r) => a + r.joined, 0);
  return (
    <section className="section">
      <div className="gap-card">
        <h3 className="sec-title" style={{ fontSize: 28 }}>Who’s here, by branch.</h3>
        <p>{on} of {total} living relatives are on the website. Tap a branch to see who isn’t yet.</p>
        <ul className="branches">
          {rows.map((r) => {
            const pct = Math.round((100 * r.joined) / r.living.length);
            const missing = r.living.filter((id) => !snap.joined.includes(id)).sort((a, b) => fullName(family.byId.get(a)).localeCompare(fullName(family.byId.get(b))));
            return (
              <li key={r.key || 'other'} className={r.mine ? 'mine' : ''}>
                <button type="button" className="branch-row" aria-expanded={open === r.key} onClick={() => setOpen(open === r.key ? null : r.key)}>
                  <span className="branch-name">{r.label}{r.mine && <small>Your branch</small>}</span>
                  <span className="branch-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
                  <span className="branch-n">{r.joined} of {r.living.length}</span>
                </button>
                {open === r.key && (missing.length ? (
                  <div className="chips branch-missing">{missing.slice(0, 20).map((id) => can(id)
                    ? <button key={id} className="chip" onClick={() => setInvite(id)}>Invite {fullName(family.byId.get(id))}</button>
                    : <a key={id} className="chip quiet" href={`#/p/${id}`}>{fullName(family.byId.get(id))}{isMinor(id) ? ' (child)' : snap.invited.includes(id) ? ' (invited)' : ''}</a>)}
                    {missing.length > 20 && <a className="chip quiet" href="#/tree">and {missing.length - 20} more in the Family tree</a>}</div>
                ) : <p className="note small">Everyone in this branch is here. 🎉</p>)}
              </li>
            );
          })}
        </ul>
      </div>
      {invite && <InviteSheet id={invite} onClose={() => setInvite(null)} />}
    </section>
  );
}

/**
 * "Set this up for …": a younger relative gets an elder onto the website on the elder's own phone.
 * 1. Invite them (their email). 2. Open the link on their phone (QR code or WhatsApp): it opens with larger text,
 * and Tamil menus if ticked. 3. Sign in together. 4. Add it to the home screen (the site shows the steps).
 */
export function ElderSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { api, family, snap, reload, isAdmin, isSteward } = useStore();
  const p = family.byId.get(id);
  const first = firstName(p);
  const [inv, setInv] = useState<Invitation | null | undefined>(undefined);
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const pack = usePack();
  const [native, setNative] = useState(false);
  const [qr, setQr] = useState('');
  useEffect(() => { api.listInvitations().then((l) => setInv(l.find((i) => i.person_id === id && !i.accepted_at) || null), () => setInv(null)); }, [api, id]);
  const link = inv?.code && inv.approved_at !== null ? elderLink(inv.code, native ? pack.lang : '') : '';
  useEffect(() => { if (link) QRCode.toDataURL(link, { margin: 1, width: 240, errorCorrectionLevel: 'M' }).then(setQr, () => setQr('')); else setQr(''); }, [link]);
  const invitedByOther = inv === null && snap.invited.includes(id);
  async function save() {
    const addr = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) { setErr('Please enter a valid email address.'); return; }
    setBusy(true); setErr('');
    try { const i = await api.invite(addr, id, 'member'); await reload(); setInv(i); } catch (e) { setErr(friendly(e)); } finally { setBusy(false); }
  }
  const waMsg = link ? `Hi ${first} 🙏 This opens our family website on your phone, with big letters: ${link}` : '';
  return (
    <Sheet title={`Set this up for ${first}.`} sub={`Sit with ${first} and do it on ${first}’s own phone. It takes about five minutes.`} onClose={onClose}
      footer={<button className="btn primary" onClick={onClose}>Done</button>}>
      <ol className="elder-steps">
        <li>
          <b>Invite {first} with their email.</b>
          {inv === undefined ? <p className="note">Checking…</p>
            : invitedByOther ? <p className="note">{first} already has an invitation from someone else. Ask them for the link, or {isSteward ? 'open Admin to see it' : 'ask a steward'}.</p>
            : inv ? <p className="note">Invited with {maskEmail(inv.email)}.{inv.approved_at === null ? ' A steward or admin checks the email first; come back here once it’s approved (it usually takes less than a day).' : ''}</p>
            : (<>
              <p className="note">A Gmail address is easiest: then {first} just taps <b>Continue with Google</b>. No email yet? Make a Gmail account together on {first}’s phone first.</p>
              <div className="elder-form"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={`${first}’s email`} aria-label={`${first}’s email`} />
                <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save invitation'}</button></div>
              {err && <p className="status err">{err}</p>}
              {!isAdmin && !isSteward && <p className="note small">A steward or admin checks the email before it works.</p>}
            </>)}
        </li>
        <li>
          <b>Open the link on {first}’s phone.</b>
          {link ? (<>
            {pack.lang !== 'en' && <label className="themetoggle"><input type="checkbox" checked={native} onChange={(e) => setNative(e.target.checked)} /> Menus in {pack.name} ({pack.native})</label>}
            <div className="elder-qr">{qr && <img src={qr} width={200} height={200} alt={`QR code for ${first}’s link`} />}
              <p className="note">Point {first}’s phone camera at this code and tap the link that appears. Or send it to {first} on WhatsApp:</p>
              <a className="pill small" href={`https://wa.me/?text=${encodeURIComponent(waMsg)}`} target="_blank" rel="noopener noreferrer">Send on WhatsApp</a></div>
            <p className="note small">The website opens on {first}’s phone with the largest text{native ? ` and the menus in ${pack.name}` : ''}. {first} can change it later in Theme.</p>
          </>) : <p className="note">The link appears here once the invitation is ready.</p>}
        </li>
        <li><b>Sign in together.</b><p className="note">{inv && isGmail(inv.email) ? <>Tap <b>Continue with Google</b> and pick {first}’s account.</> : <>Tap <b>Email me a sign-in link</b>, then open the email on {first}’s phone and tap the button.</>}</p></li>
        <li><b>Put it on the home screen.</b><p className="note">After signing in, the website shows how to add it to the home screen and turn on notifications, so {first} gets birthdays and messages like any app.</p></li>
      </ol>
    </Sheet>
  );
}
