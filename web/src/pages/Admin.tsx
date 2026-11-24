import { useEffect, useState } from 'react';
import { daysLeft } from '../lib/twostep';
import { useStore } from '../lib/store';
import { friendly } from '../lib/api';
import { fullName, ago, when } from '../lib/format';
import { InviteShare } from '../components/InviteShare';
import { ROLES, ROLE_HELP, ROLE_LABEL, type AuditEntry, type DeletionRequest, type Invitation, type Member, type Role } from '../lib/types';
import { JoinRequests } from '../components/JoinRequests';
import { SearchBox, Sheet } from '../components/common';
import { NoEmailList, useMissing } from '../components/NoEmailList';
import { ResendButton } from '../components/ResendButton';
import { HelpTip } from '../components/Help';
import { AdminMessages } from '../components/AdminMessages';

type Tab = 'requests' | 'invite' | 'missing' | 'members' | 'messages' | 'deletions' | 'audit';
const ADMIN_TABS: Tab[] = ['requests', 'invite', 'missing', 'members', 'messages', 'deletions', 'audit'];
const STEWARD_TABS: Tab[] = ['requests', 'missing'];

export function Admin({ initialTab }: { initialTab?: string }) {
  const { api, family, isAdmin, isSteward, snap, toast, reload } = useStore();
  const allowed = isAdmin ? ADMIN_TABS : STEWARD_TABS;
  const [tab, setTabState] = useState<Tab>(() => (allowed.includes(initialTab as Tab) ? initialTab as Tab : 'requests'));
  const setTab = (t: Tab) => { setTabState(t); history.replaceState(null, '', `#/admin/${t}`); };
  const missing = useMissing();
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [share, setShare] = useState<{ email: string; person: string | null; code?: string | null } | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [dels, setDels] = useState<DeletionRequest[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [email, setEmail] = useState('');
  const [person, setPerson] = useState<string | null>(null);
  const [role, setRole] = useState<Role>('member');
  const [err, setErr] = useState('');

  const refresh = async () => {
    try {
      const [i, m, d, a] = await Promise.all([api.listInvitations(), api.listMembers(), api.listDeletionRequests(), api.listAudit(150)]);
      setInvites(i); setMembers(m); setDels(d); setAudit(a);
    } catch (e) { toast(friendly(e)); }
  };
  useEffect(() => { if (isAdmin) refresh(); }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!isSteward) return <div className="wrap"><section className="hero-r"><h2 className="headline">Admins and stewards only.</h2></section></div>;

  const name = (id?: string | null) => (id ? fullName(family.byId.get(id)) || id : '—');
  async function invite() {
    setErr('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr('Enter a valid email.'); return; }
    if (!person) { setErr('Choose who this person is in the tree.'); return; }
    try { const inv = await api.invite(email, person, role); setShare({ email: email.trim().toLowerCase(), person, code: inv.code }); setEmail(''); setPerson(null); refresh(); }
    catch (e) { setErr(friendly(e)); }
  }
  const open = dels.filter((d) => d.status === 'open');

  return (
    <div className="wrap">
      <section className="hero-r reveal" style={{ paddingTop: 60 }}>
        <p className="eyebrow">{isAdmin ? 'Admin' : 'Steward'}</p>
        <h2 className="headline" style={{ fontSize: 'clamp(34px,5vw,56px)' }}>Look after the family site.<HelpTip sections={isAdmin ? ['admin', 'stewards'] : ['stewards']} label={isAdmin ? 'For admins and stewards' : 'For stewards'} /></h2>
        <p className="subhead">{snap.joined.length} of {snap.persons.filter((p) => p.is_living).length} living relatives have joined{open.length ? ` · ${open.length} deletion request${open.length > 1 ? 's' : ''} waiting` : ''}.</p>
      </section>
      <div className="seg" role="tablist" style={{ margin: '40px auto 30px', display: 'flex', width: 'fit-content' }}>
        {([['requests', 'Requests to join'], ['invite', 'Invitations'], ['missing', `No email yet${missing.length ? ` (${missing.length})` : ''}`], ['members', 'Members & roles'], ['messages', 'Messages'], ['deletions', `Deletion requests${open.length ? ` (${open.length})` : ''}`], ['audit', 'Recent changes']] as [Tab, string][]).filter(([k]) => allowed.includes(k)).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'invite' && (
        <section>
          <div className="gap-card">
            <h3 className="sec-title" style={{ fontSize: 26 }}>Invite a relative.</h3>
            <p>Pick them in the tree and enter the email they’ll sign in with. Then share their personal link on WhatsApp, or email them a sign-in link from the site. Use <b>Resend email</b> below to send their invitation again, or <b>Share</b> for their WhatsApp link.</p>
            <div className="form" style={{ marginTop: 10 }}>
              <div><label>Who are they?</label><SearchBox placeholder={person ? name(person) : 'Search the tree…'} onPick={setPerson} /></div>
              <div><label htmlFor="ie">Email</label><input id="ie" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div><label htmlFor="ir">Role</label><select id="ir" className="vis" value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></div>
              <div style={{ alignSelf: 'end' }}><button className="pill" onClick={invite}>Save invitation</button></div>
            </div>
            {person && <p className="note">Inviting as <b>{name(person)}</b>.</p>}
            {err && <p className="status err">{err}</p>}
          </div>
          {(() => {
            // Has the person actually signed in? Joined only means the invitation linked an account; the sign-in time says if they use it.
            const byPerson = new Map(members.filter((m) => m.person_id).map((m) => [m.person_id as string, m]));
            const seenKey = new Set<string>();
            const rows = invites.filter((i) => { const k = `${i.person_id}|${i.email.toLowerCase()}`; if (seenKey.has(k)) return false; seenKey.add(k); return true; })
              .map((i) => { const m = i.person_id ? byPerson.get(i.person_id) : undefined; return { i, last: (i.accepted_at && m?.last_sign_in_at) || null }; });
            const STALE = 30 * 86400000;
            const notIn = rows.filter((r) => !r.last).sort((a, b) => Number(!!a.i.accepted_at) - Number(!!b.i.accepted_at) || b.i.created_at.localeCompare(a.i.created_at));
            const signedIn = rows.filter((r) => r.last).sort((a, b) => (a.last as string).localeCompare(b.last as string));
            const WA = <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1c-.2.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>;
            const nudge = (r: { i: typeof invites[number] }) => <>
              <button className="ilbtn wa" onClick={() => setShare({ email: r.i.email, person: r.i.person_id, code: r.i.accepted_at ? null : r.i.code })} title={`Send ${name(r.i.person_id)} their link on WhatsApp`}>{WA}<span>WhatsApp</span></button>
              <ResendButton email={r.i.email} className="ilbtn" label="Email again" />
            </>;
            const row = (r: { i: typeof invites[number]; last: string | null }, status: React.ReactNode, extra?: React.ReactNode) => (
              <li key={r.i.id}>
                <div className="il-who"><b>{r.i.person_id ? name(r.i.person_id) : 'Admin login (no person)'}</b><small><span className="il-mail">{r.i.email}</span> · {status}</small></div>
                <div className="il-acts">{extra}</div>
              </li>
            );
            return <div className="gap-card inv-card">
              <h3 className="inv-head">Not signed in yet <span className="inv-count">{notIn.length}</span></h3>
              <p className="note">Invited, but they haven’t signed in. Send their link on WhatsApp, or email them a fresh sign-in link.</p>
              {notIn.length ? <ul className="invlist">{notIn.map((r) => (
                row(r,
                  r.i.accepted_at ? <>invited {ago(r.i.accepted_at)}, <b>never signed in</b></> : <>invited {ago(r.i.created_at)}{r.i.approved_at === null ? ', needs approval' : ''}</>,
                  <>{nudge(r)}{!r.i.accepted_at && <button className="ilbtn quiet" onClick={async () => { if (!confirm(`Cancel the invitation for ${name(r.i.person_id)}?`)) return; try { await api.cancelInvitation(r.i.id); refresh(); } catch (e) { toast(friendly(e)); } }}>Cancel</button>}</>)
              ))}</ul> : <p className="emptyhint">Everyone you invited has signed in.</p>}
              <details className="inv-joined">
                <summary>Signed in <span className="inv-count">{signedIn.length}</span>{signedIn.some((r) => Date.now() - Date.parse(r.last as string) > STALE) && <small className="muted inv-stale">{signedIn.filter((r) => Date.now() - Date.parse(r.last as string) > STALE).length} not in 30 days</small>}</summary>
                <ul className="invlist">{signedIn.map((r) => { const stale = Date.now() - Date.parse(r.last as string) > STALE; return (
                  row(r, stale ? <b>last signed in {ago(r.last as string)}</b> : <>last signed in {ago(r.last as string)}</>, stale ? nudge(r) : null)); })}</ul>
              </details>
            </div>;
          })()}
        </section>
      )}

      {tab === 'requests' && <JoinRequests />}
      {tab === 'messages' && <AdminMessages members={members} />}
      {tab === 'missing' && <NoEmailList />}

      {tab === 'members' && (
        <section>
          <div className="gap-card">
            <h3 className="sec-title" style={{ fontSize: 26 }}>Members and roles.</h3>
            <ul className="roles-help">{ROLES.map((r) => <li key={r}><b>{ROLE_LABEL[r]}</b>: {ROLE_HELP[r]}.</li>)}</ul>
            <p className="note">Once someone has joined, only they (and admins) edit their own details. There is always at least one admin. A new admin gets a message from Family Admin asking them to turn on 2-step sign-in; if it isn’t on within 7 days, admin access is removed automatically.</p>
          </div>
          <div className="tblwrap"><table className="tbl"><thead><tr><th>Person</th><th>Role</th><th>Status</th><th>Joined</th><th>Last sign-in</th><th>Welcome email</th><th>App</th><th>2-step</th><th /></tr></thead>
            <tbody>{members.map((m) => (
              <tr key={m.user_id}><td>{m.person_id ? name(m.person_id) : <i>Family Website Admin</i>}</td>
                <td><select className="vis" aria-label={`Role for ${name(m.person_id)}`} value={m.role}
                  onChange={async (e) => { try { await api.updateMember(m.user_id, { role: e.target.value as Role }); toast(`${name(m.person_id)} is now ${ROLE_LABEL[e.target.value as Role].toLowerCase()}.`); refresh(); reload(); } catch (x) { toast(friendly(x)); refresh(); } }}>
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></td>
                <td>{m.status}</td><td>{ago(m.created_at)}</td>
                <td title={m.last_sign_in_at ? ago(m.last_sign_in_at) : undefined}>{m.last_sign_in_at ? when(m.last_sign_in_at) : <span className="muted">Never</span>}</td>
                <td>{m.welcome_sent_at ? <>Sent {when(m.welcome_sent_at)}</> : <span className="muted">{!m.person_id ? '—' : m.created_at && Date.now() - Date.parse(m.created_at) > 30 * 86400000 ? 'Over 30 days ago' : 'None on record'}</span>}</td>
                <td>{m.app_at ? <span title={ago(m.app_at)}>📱 {when(m.app_at)}</span> : <span className="muted">{m.person_id ? 'Not yet' : '—'}</span>}</td>
                <td>{m.role !== 'admin' ? <span className="muted">{m.two_step ? 'On' : '—'}</span> : m.two_step ? <span title="Admin tools need the code from their authenticator app">🔐 On</span>
                  : <span className="warn-text" title="Admins must turn on 2-step sign-in within 7 days">Off · {daysLeft(m.admin_since)} {daysLeft(m.admin_since) === 1 ? 'day' : 'days'} left</span>}</td>
                <td className="acts">
                  <button className="btn" onClick={async () => { try { await api.updateMember(m.user_id, { status: m.status === 'active' ? 'suspended' : 'active' }); refresh(); reload(); } catch (e) { toast(friendly(e)); } }}>{m.status === 'active' ? 'Suspend' : 'Restore'}</button>
                </td></tr>
            ))}</tbody></table></div>
        </section>
      )}

      {tab === 'deletions' && (
        <table className="tbl"><thead><tr><th>Person</th><th>Requested</th><th>Reason</th><th>Status</th><th /></tr></thead>
          <tbody>{dels.map((d) => (
            <tr key={d.id}><td>{name(d.person_id)}</td><td>{ago(d.created_at)}</td><td>{d.reason || '—'}</td><td>{d.status}</td>
              <td className="acts">{d.status === 'open' && <>
                <button className="btn" onClick={async () => { try { await api.saveFields(d.person_id, [{ field: 'photo', value: '', visibility: 'family' }]); await api.resolveDeletion(d.id, 'done'); refresh(); reload(); toast('Photo removed and request completed.'); } catch (e) { toast(friendly(e)); } }}>Remove photo & complete</button>
                <button className="btn" onClick={async () => { try { await api.resolveDeletion(d.id, 'declined'); refresh(); } catch (e) { toast(friendly(e)); } }}>Decline</button></>}</td></tr>
          ))}{!dels.length && <tr><td colSpan={5} className="emptyhint">No requests.</td></tr>}</tbody></table>
      )}

      {tab === 'audit' && (
        <table className="tbl"><thead><tr><th>When</th><th>Change</th><th>What</th></tr></thead>
          <tbody>{audit.map((a) => (
            <tr key={a.id}><td>{new Date(a.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</td><td>{a.action} · {a.table_name.replace('_', ' ')}</td>
              <td>{a.record_key ? a.record_key.split(/[/<]/).map((k) => family.byId.get(k) ? fullName(family.byId.get(k)) : k).join(' · ') : ''}</td></tr>
          ))}{!audit.length && <tr><td colSpan={3} className="emptyhint">No changes yet.</td></tr>}</tbody></table>
      )}
      {share && (
        <Sheet title={`Invite ${share.person ? name(share.person) : share.email}`} sub={`Signs in with ${share.email}.`} onClose={() => setShare(null)}
          footer={<button className="btn primary" onClick={() => setShare(null)}>Done</button>}>
          <InviteShare email={share.email} personId={share.person} code={share.code} />
        </Sheet>
      )}
    </div>
  );
}
