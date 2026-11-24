import { useState } from 'react';
import { useStore } from '../lib/store';
import { friendly } from '../lib/api';
import { firstName, fullName } from '../lib/format';
import { FIELD_LABEL, VISIBILITY_LABEL } from '../lib/types';
import { ConsentSheet, EditSheet } from '../components/Sheets';
import { Sheet, go } from '../components/common';
import { HelpTip } from '../components/Help';
import { NotificationsCard } from '../components/Notifications';
import { TwoStepCard } from '../components/TwoStep';

const ADMIN_CONTACT = (import.meta.env.VITE_ADMIN_CONTACT as string | undefined) || '';

export function Privacy() {
  const { api, family, snap, myId, isMinor, activeConsent, fieldsOf, reload, toast } = useStore();
  const [sheet, setSheet] = useState<{ kind: 'consent' | 'edit' | 'delete'; id: string; relation?: 'self' | 'guardian' } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const me = myId ? family.byId.get(myId) : null;
  const children = myId ? (family.children.get(myId) || []).filter((c) => isMinor(c)) : [];

  async function download(id: string) {
    try {
      const data = await api.exportMyData(id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${fullName(family.byId.get(id)).replace(/\W+/g, '-').toLowerCase()}-family-data.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { toast(friendly(e)); }
  }
  async function withdraw(consentId: string) {
    try { await api.withdrawConsent(consentId); await reload(); toast('Consent withdrawn. Your details are now hidden from the family.'); } catch (e) { toast(friendly(e)); }
  }
  async function del(id: string) {
    setBusy(true); setErr('');
    try { await api.requestDeletion(id, reason); await reload(); toast('Done. Your details are hidden and an admin will finish removing them.'); setSheet(null); }
    catch (e) { setErr(friendly(e)); } finally { setBusy(false); }
  }

  const Card = ({ id, relation }: { id: string; relation: 'self' | 'guardian' }) => {
    const p = family.byId.get(id)!; const c = activeConsent(id); const f = fieldsOf(id);
    const shared = Object.values(f).filter(Boolean);
    return (
      <div className="pcard-privacy">
        <div className="pc-head">
          <div><h3 className="pc-name">{relation === 'self' ? 'You' : firstName(p)}</h3><p>{fullName(p)}</p></div>
          <span className={`state ${c ? 'ok' : 'off'}`}>{c ? 'Sharing with the family' : 'Hidden from the family'}</span>
        </div>
        {c ? (
          <ul className="plist">
            <li>Agreed on {new Date(c.granted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} (version {c.policy_version}){c.relation === 'guardian' ? ' by a parent' : ''}</li>
            <li>Photo {c.show_photo ? 'shown' : 'hidden'} · Photo tags {c.allow_tags ? 'allowed' : 'off'} · Family books {c.include_in_exports ? 'included' : 'left out'}</li>
          </ul>
        ) : <p className="emptyhint">Nothing about {relation === 'self' ? 'you' : firstName(p)} is shown beyond name, relationships and birth year.</p>}
        {shared.length > 0 && (
          <div className="sharelist">{shared.map((x) => <span key={x!.field}>{FIELD_LABEL[x!.field]}: <b>{VISIBILITY_LABEL[x!.visibility]}</b></span>)}</div>
        )}
        <div className="pc-actions">
          <button className="pill small" onClick={() => setSheet({ kind: 'consent', id, relation })}>{c ? 'Change my choices' : 'Give consent'}</button>
          <button className="btn" onClick={() => setSheet({ kind: 'edit', id })}>Edit details & visibility</button>
          <button className="btn" onClick={() => download(id)}>Download data</button>
          {c && <button className="btn" onClick={() => withdraw(c.id)}>Withdraw consent</button>}
          <button className="btn danger" onClick={() => { setReason(''); setErr(''); setSheet({ kind: 'delete', id }); }}>Delete {relation === 'self' ? 'my' : 'their'} information</button>
        </div>
      </div>
    );
  };

  return (
    <div className="wrap narrow">
      <section className="hero-r reveal">
        <p className="eyebrow">My privacy</p>
        <h2 className="headline">Your details.<br />Your choice.<HelpTip sections={['privacy']} /></h2>
        <p className="subhead">This site is private to invited family. You decide what each person can see, and you can change your mind at any time.</p>
      </section>
      <section className="section">
        {me ? <Card id={me.id} relation="self" /> : <p className="emptyhint">Your account isn’t linked to a profile yet. Ask a family admin to link it.</p>}
        {children.map((c) => <Card key={c} id={c} relation="guardian" />)}
      </section>
      {snap.me && (
        <section className="section">
          <div className="section-head"><h3 className="sec-title">Online status and emails.</h3></div>
          <div className="toggles">
            <label className="toggle">
              <input type="checkbox" checked={snap.prefs.show_online !== false}
                onChange={async (e) => { const on = e.target.checked; try { await api.savePrefs({ show_online: on }); await reload(); toast(on ? 'Family can see when you’re online.' : 'Your online status is hidden.'); } catch (x) { toast(friendly(x)); } }} />
              <span><b>Show when I’m online</b><small>A green dot shows family when you have the site open, and when you were last here. If you turn this off, you won’t see it for others either.</small></span>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={snap.prefs.email_mentions !== false}
                onChange={async (e) => { const on = e.target.checked; try { await api.savePrefs({ email_mentions: on }); await reload(); toast(on ? 'We’ll email you when someone mentions you.' : 'No more mention emails.'); } catch (x) { toast(friendly(x)); } }} />
              <span><b>Email me when someone mentions me in Talk</b><small>One short email with a link to the conversation. You’ll still see mentions in the bell either way.</small></span>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={snap.prefs.email_weekly !== false}
                onChange={async (e) => { const on = e.target.checked; try { await api.savePrefs({ email_weekly: on }); await reload(); toast(on ? 'We’ll send This week in the family on Sundays.' : 'No more weekly emails.'); } catch (x) { toast(friendly(x)); } }} />
              <span><b>This week in the family</b><small>A short email on Sunday mornings: birthdays and festivals coming up, who joined, and what’s new in Talk and Photos.</small></span>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={snap.prefs.email_news !== false}
                onChange={async (e) => { const on = e.target.checked; try { await api.savePrefs({ email_news: on }); await reload(); toast(on ? 'We’ll email you family news.' : 'No more family news emails.'); } catch (x) { toast(friendly(x)); } }} />
              <span><b>Family news by email</b><small>Now and then the admins email everyone about something new, like a festival conversation. At most two a day. It’s in your bell either way.</small></span>
            </label>
          </div>
        </section>
      )}
      {snap.me && <NotificationsCard />}
      <TwoStepCard />
      <section className="section">
        <div className="section-head"><h3 className="sec-title">Your sign-ins.</h3></div>
        <div className="gap-card signout-all">
          <p>Lost a phone, or signed in on someone else’s computer? Sign out everywhere ends every session on every device, including this one. You can sign straight back in.</p>
          <button className="btn danger" disabled={busy} onClick={async () => {
            if (!window.confirm('Sign out on every phone and computer, including this one?')) return;
            setBusy(true);
            try { await api.signOutEverywhere(); location.reload(); } catch (x) { setBusy(false); toast(friendly(x)); }
          }}>Sign out everywhere</button>
        </div>
      </section>
      <section className="section">
        <div className="section-head"><h3 className="sec-title">Who sees what.</h3></div>
        <div className="facts">
          <div className="fact"><small>Family</small><b>Every signed-in member</b><span>Names, relationships and photos (if you allow them) are always at this level.</span></div>
          <div className="fact"><small>Close family</small><b>Parents, children, siblings, spouse</b><span>And their households. Phone, email and full birth date start here.</span></div>
          <div className="fact"><small>Only me</small><b>You and the admins</b><span>Home address starts here.</span></div>
        </div>
        <p className="emptyhint" style={{ marginTop: 20 }}>We never collect ID numbers, bank details or health information. Location data is stripped from photos. Nothing on this site is public or searchable.{ADMIN_CONTACT && <> Questions or concerns: <a href={`mailto:${ADMIN_CONTACT}`}>{ADMIN_CONTACT}</a>.</>}</p>
      </section>

      {sheet?.kind === 'consent' && sheet.relation && <ConsentSheet id={sheet.id} relation={sheet.relation} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'edit' && <EditSheet id={sheet.id} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'delete' && (
        <Sheet title="Delete information?" sub="Consent is withdrawn and personal details are removed straight away. An admin then removes photos. Name and place in the tree stay, so the family tree isn’t broken."
          onClose={() => setSheet(null)}
          footer={<><span className={`status${err ? ' err' : ''}`}>{busy ? 'Working…' : err}</span><button className="btn" onClick={() => setSheet(null)}>Cancel</button><button className="btn primary danger-bg" onClick={() => del(sheet.id)} disabled={busy}>Delete</button></>}>
          <form className="form" onSubmit={(e) => e.preventDefault()}>
            <div className="full"><label htmlFor="why">Anything the admins should know? (optional)</label><textarea id="why" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} /></div>
          </form>
        </Sheet>
      )}
      {snap.me && !me && <button className="tlink" onClick={() => go('')}>Back to the family</button>}
    </div>
  );
}
