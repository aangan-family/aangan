import { useCallback, useEffect, useState } from 'react';
import { FAMILY } from '../lib/site';
import { useStore } from '../lib/store';
import { friendly } from '../lib/api';
import { daysLeft, daysLeftText } from '../lib/twostep';
import { Sheet } from './common';

type Status = { enrolled: boolean; aal: 'aal1' | 'aal2' | null; factorId: string | null };

/** 2-step status for an admin (null for everyone else, or while loading). */
export function useTwoStep() {
  const { api, snap } = useStore();
  const isAdminRole = snap.me?.role === 'admin' && snap.me?.status === 'active';
  const [st, setSt] = useState<Status | null>(null);
  const refresh = useCallback(async () => {
    if (!isAdminRole) { setSt(null); return; }
    try { setSt(await api.twoStep()); } catch { setSt(null); }
  }, [api, isAdminRole]);
  useEffect(() => { refresh(); }, [refresh]);
  return { st, refresh, isAdminRole };
}

/** A 6-digit code box: digits only, fills from the phone's one-time-code suggestion. */
function CodeInput({ value, onChange, onDone }: { value: string; onChange: (v: string) => void; onDone?: () => void }) {
  return (
    <input className="twostep-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6}
      placeholder="123456" aria-label="6-digit code" value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      onKeyDown={(e) => { if (e.key === 'Enter' && value.length === 6) onDone?.(); }} />
  );
}

/** Setting up the authenticator app: install, scan, type the code. */
export function TwoStepSetup({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { api, toast } = useStore();
  const [f, setF] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.twoStepEnroll().then(setF).catch((x) => setErr(friendly(x))); }, [api]);
  async function verify() {
    if (!f || code.length !== 6) return;
    setBusy(true); setErr('');
    try { await api.twoStepVerify(f.factorId, code); toast('2-step sign-in is on. Thank you.'); onDone(); }
    catch (x) { setErr(friendly(x)); setBusy(false); }
  }
  return (
    <Sheet title="Turn on 2-step sign-in." sub="As an admin you can see and change everyone’s details. With 2-step on, signing in also needs a code from your phone, so a broken-into email account isn’t enough."
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Not now</button><button className="btn primary" disabled={busy || !f || code.length !== 6} onClick={verify}>Turn on</button></>}>
      <ol className="twostep-steps">
        <li><b>Install an authenticator app</b> on your phone: Google Authenticator or Microsoft Authenticator (both free).</li>
        <li><b>Scan this picture</b> in the app (tap + or “Add account”, then “Scan a QR code”).
          <div className="twostep-qr">{f ? <img src={f.qr} alt="QR code for your authenticator app" width={180} height={180} /> : <span className="muted">Preparing…</span>}</div>
          {f && <details className="twostep-key"><summary>Can’t scan? Type this key instead</summary><code>{f.secret.replace(/(.{4})/g, '$1 ').trim()}</code></details>}
        </li>
        <li><b>Type the 6-digit code</b> the app shows for “{FAMILY}”.<CodeInput value={code} onChange={setCode} onDone={verify} /></li>
      </ol>
      {err && <p className="status err">{err}</p>}
    </Sheet>
  );
}

/** At the top of every page for admins: set it up (with the countdown), or type today's code. */
export function TwoStepBanner() {
  const { snap, api, toast, reload } = useStore();
  const { st, refresh, isAdminRole } = useTwoStep();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  if (!isAdminRole || !st || (st.enrolled && st.aal === 'aal2')) return null;
  const done = async () => { setOpen(false); await refresh(); await reload(); };
  if (!st.enrolled) {
    const left = daysLeft(snap.me?.admin_since);
    return (
      <div className={`twostep-banner${left <= 2 ? ' urgent' : ''}`} role="status">
        <span><b>Admins need 2-step sign-in.</b> {daysLeftText(left)}</span>
        <button className="pill small" onClick={() => setOpen(true)}>Turn on 2-step sign-in</button>
        {open && <TwoStepSetup onClose={() => setOpen(false)} onDone={done} />}
      </div>
    );
  }
  async function unlock() {
    if (!st?.factorId || code.length !== 6) return;
    setBusy(true);
    try { await api.twoStepVerify(st.factorId, code); setCode(''); toast('Admin tools unlocked.'); await done(); }
    catch (x) { toast(friendly(x)); } finally { setBusy(false); }
  }
  return (
    <div className="twostep-banner" role="status">
      <span><b>Enter your 2-step code</b> from your authenticator app to use admin tools.</span>
      <CodeInput value={code} onChange={setCode} onDone={unlock} />
      <button className="pill small" disabled={busy || code.length !== 6} onClick={unlock}>Unlock admin tools</button>
    </div>
  );
}

/** My privacy → 2-step sign-in (admins only). */
export function TwoStepCard() {
  const { snap, reload } = useStore();
  const { st, refresh, isAdminRole } = useTwoStep();
  const [open, setOpen] = useState(false);
  if (!isAdminRole || !st) return null;
  return (
    <section className="section">
      <div className="section-head"><h3 className="sec-title">2-step sign-in.</h3></div>
      <div className="gap-card">
        {st.enrolled
          ? <p><b>On.</b> When you sign in, admin tools ask for the 6-digit code from your authenticator app. Changing phones? Set the app up on the new phone first, or ask another admin to reset it in Supabase.</p>
          : <>
            <p><b>Off.</b> Admins need it to keep everyone’s details safe: with 2-step on, a broken-into email account isn’t enough to get in. {daysLeftText(daysLeft(snap.me?.admin_since))}</p>
            <button className="btn primary" onClick={() => setOpen(true)}>Turn on 2-step sign-in</button>
          </>}
      </div>
      {open && <TwoStepSetup onClose={() => setOpen(false)} onDone={async () => { setOpen(false); await refresh(); await reload(); }} />}
    </section>
  );
}
