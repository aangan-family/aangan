import { useEffect, useRef, useState } from 'react';
import { EMAIL_FROM, FAMILY } from '../lib/site';
import type { Api } from '../lib/api';
import type { JoinRequest, JoinRequestInput } from '../lib/types';
import { helpFor } from '../lib/help';
import { inline } from '../lib/richtext';
import { friendly, PROVIDER_LABEL, SIGNIN_PROVIDERS } from '../lib/api';
import { authLinkError, inviteCode, isGmail, joinEmail } from '../lib/invite';
import { GateBackdrop } from '../components/GateBackdrop';
import { PrivacyLink } from '../components/common';
import { GOOGLE_CLIENT_ID, chromeIntent, gsiAllowed, inAppBrowser, isAndroid, loadGsi, makeNonce } from '../lib/google';
import { isDark } from '../lib/theme';
import { sentToConversation } from '../lib/returnto';

const ADMIN_CONTACT = (import.meta.env.VITE_ADMIN_CONTACT as string | undefined) || '';

export function Login({ api }: { api: Api }) {
  // opened from a personal invitation link: #/join/<email>
  const [invited] = useState(() => joinEmail(location.hash));
  // the family-wide link shared in WhatsApp groups: #/join
  const [asking] = useState(() => /^#\/join\/?$/.test(location.hash));
  // newer links carry a random code (#/invite/<code>); the page shows only a masked email ("ra•••@gmail.com")
  const [code] = useState(() => inviteCode(location.hash));
  const [hint, setHint] = useState<string | null>(null);
  useEffect(() => { if (code) api.inviteHint(code).then(setHint).catch(() => {}); }, [api, code]);
  const [email, setEmail] = useState(invited || '');
  const [inApp] = useState(() => inAppBrowser());
  const googleFirst = !inApp && ((!!invited && isGmail(invited)) || (!!hint && /@(gmail|googlemail)\.com$/.test(hint))) && SIGNIN_PROVIDERS.includes('google');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(() => authLinkError(location.search, location.hash) || '');
  const providers = SIGNIN_PROVIDERS;
  // tidy the address bar after a failed link, so a reload doesn't show the error again
  useEffect(() => { if (authLinkError(location.search, location.hash)) history.replaceState(null, '', location.pathname); }, []);
  async function send(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr('Please enter your email address.'); return; }
    setBusy(true);
    try { await api.signInWithEmail(email.trim()); setSent(true); } catch (x) { setErr(friendly(x)); } finally { setBusy(false); }
  }
  return (
    <div className="gate gate-photo">
      <GateBackdrop />
      <div className="gate-card reveal">
        <p className="eyebrow">{FAMILY}</p>
        <h1 className="headline" style={{ fontSize: 'clamp(36px,6vw,56px)' }}>{invited || code ? 'You’re invited.' : asking ? 'Join the family website.' : 'Welcome home.'}</h1>
        <p className="subhead" style={{ fontSize: 19 }}>{code && !invited
          ? <>Welcome to the family website. Sign in with the email you were invited with{hint ? <> (<b>{hint}</b>)</> : ''}. {hint && /@(gmail|googlemail)\.com$/.test(hint) ? 'Continue with Google, or we’ll email you a sign-in link.' : 'Enter it below and we’ll email you a sign-in link.'}</>
          : invited
          ? <>Welcome to the family website. You’re invited as <b>{invited}</b>. {isGmail(invited) ? 'Continue with Google, or we’ll email you a sign-in link.' : 'Tap below and we’ll email you a sign-in link.'}</>
          : asking ? `A private website for the ${FAMILY} family. Sign in with any option below, then tell us who you are. A family steward checks and lets you in.`
          : 'This is a private family website. Sign in with the email address you were invited with, or sign in and ask to join.'}</p>
        {sentToConversation() && !invited && !code && <p className="gate-sent">💬 Someone shared a family conversation with you. Sign in and it opens straight away.</p>}
        {sent ? (
          <div className="sentbox"><b>Check your email.</b><span>We sent a sign-in link to {email.trim()} from {EMAIL_FROM}. Open it on this device. It can take a minute; if it isn’t in your inbox, look in Spam or Promotions.</span>
            <button className="tlink" onClick={() => setSent(false)}>Use a different email</button></div>
        ) : (
          <form onSubmit={send} className="gate-form">
            <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email address" autoComplete="email" />
            {inApp && <InAppNotice app={inApp} />}
            {googleFirst && <GoogleButton api={api} hint={invited || undefined} onError={setErr} />}
            <button className={`pill${googleFirst ? ' ghost' : ''}`} disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in link'}</button>
            {providers.some((pv) => !(googleFirst && pv === 'google') && !(inApp && pv === 'google')) && <div className="or"><span>or</span></div>}
            {providers.filter((pv) => !(googleFirst && pv === 'google')).map((pv) => (
              pv === 'google' ? (inApp ? null : <GoogleButton key={pv} api={api} hint={invited || undefined} onError={setErr} />) :
              <button key={pv} type="button" className={`pill ghost prov prov-${pv.replace(':', '-')}`} onClick={() => api.signInWith(pv).catch((x) => setErr(friendly(x)))}>
                <ProviderIcon p={pv} />Continue with {PROVIDER_LABEL[pv]}</button>
            ))}
            {err && <p className="status err">{err}</p>}
          </form>
        )}
        <p className="secure"><Lock /> Secure connection. Everything you send is encrypted (HTTPS).</p>
        <details className="gate-help">
          <summary>Trouble signing in?</summary>
          {helpFor(null, 'signin').map((h) => <div key={h.id}><b>{h.q}</b><p>{inline(h.a)}</p></div>)}
        </details>
        <p className="fine">No passwords. Nothing here is public or searchable. New here? Sign in and you can ask to join.</p>
        <p className="gate-foot"><PrivacyLink /></p>
      </div>
    </div>
  );
}

const Lock = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg>
);

/** Simple, recognisable marks for each sign-in service. */
function ProviderIcon({ p }: { p: string }) {
  if (p === 'google') return <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.8 6.1C12.3 13.6 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z"/><path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.4 0-11.7-4.1-13.6-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48z"/></svg>;
  if (p === 'azure') return <svg width="16" height="16" viewBox="0 0 22 22" aria-hidden="true"><path fill="#F25022" d="M0 0h10.5v10.5H0z"/><path fill="#7FBA00" d="M11.5 0H22v10.5H11.5z"/><path fill="#00A4EF" d="M0 11.5h10.5V22H0z"/><path fill="#FFB900" d="M11.5 11.5H22V22H11.5z"/></svg>;
  if (p === 'apple') return <svg width="16" height="18" viewBox="0 0 17 20" aria-hidden="true"><path fill="currentColor" d="M14.1 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.7-1-2.7-4.1zM11.6 3c.7-.9 1.2-2 1-3.2-1 .1-2.2.7-3 1.5-.6.7-1.2 1.9-1 3.1 1.1.1 2.3-.6 3-1.4z"/></svg>;
  if (p === 'custom:yahoo') return <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="5" fill="#6001D2"/><path fill="#fff" d="M5 7.5h2.9l1.7 4.4 1.7-4.4h2.8l-4.2 9.8H7.1l1.1-2.6L5 7.5zm10.3 5.3h2.6l-.6 4.5h-2.6l.6-4.5zm.8-5.3H19l-1.6 4.4h-2.8l1.5-4.4z"/></svg>;
  return null;
}

/**
 * Google's official button (Google Identity Services): the popup names our own domain.
 * Falls back to the redirect flow if Google's script can't load.
 */
function GoogleButton({ api, hint, onError, redirectOk = true }: { api: Api; hint?: string; onError: (s: string) => void; redirectOk?: boolean }) {
  const redirect = useRef(redirectOk);
  redirect.current = redirectOk;
  const box = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'loading' | 'gsi' | 'fallback'>(() => (gsiAllowed() ? 'loading' : 'fallback'));
  useEffect(() => {
    if (!gsiAllowed()) return;
    let alive = true;
    (async () => {
      try {
        const [g, nonce] = await Promise.all([loadGsi(), makeNonce()]);
        if (!alive || !box.current) return;
        g.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID, nonce: nonce.hashed, ux_mode: 'popup', auto_select: false, itp_support: true,
          use_fedcm_for_button: true, login_hint: hint, context: 'signin',
          callback: (r: { credential?: string }) => {
            if (!r.credential) { onError('Google didn’t finish signing you in. Please try again.'); return; }
            const cred = r.credential;
            // Some phone browsers (data savers, tracker blockers, flaky mobile data) drop the background
            // request to our sign-in server. Try once more, then fall back to the full-page Google sign-in.
            const offline = (x: unknown) => /Failed to fetch|NetworkError|Load failed|network/i.test(String((x as { message?: string })?.message || x));
            api.signInWithGoogleToken(cred, nonce.raw)
              .catch((x) => offline(x)
                ? new Promise((ok) => setTimeout(ok, 1500)).then(() => api.signInWithGoogleToken(cred, nonce.raw))
                : Promise.reject(x))
              .catch((x) => offline(x) && redirect.current ? api.signInWith('google') : Promise.reject(x))
              .catch((x) => onError(friendly(x)));
          },
        });
        const dark = isDark();
        g.accounts.id.renderButton(box.current, {
          type: 'standard', theme: dark ? 'filled_black' : 'outline', size: 'large', text: 'continue_with', shape: 'pill',
          logo_alignment: 'center', width: Math.min(400, Math.max(240, box.current.clientWidth || 320)),
        });
        setMode('gsi');
      } catch { if (alive) setMode('fallback'); }
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div ref={box} className={`gsi-box${mode === 'gsi' ? ' on' : ''}`} aria-label="Continue with Google" />
      {mode !== 'gsi' && (
        <button type="button" className="pill ghost prov prov-google" disabled={mode === 'loading'} onClick={() => api.signInWith('google').catch((x) => onError(friendly(x)))}>
          <ProviderIcon p="google" />Continue with Google</button>
      )}
    </>
  );
}

/** Opened inside WhatsApp (or another app's browser): Google won't sign anyone in there. */
function InAppNotice({ app }: { app: string }) {
  const android = isAndroid();
  return (
    <div className="inapp">
      <b>You’ve opened this inside {app}.</b>
      <span>Google sign-in doesn’t work in {app === 'this app' ? 'an app’s' : `${app}’s`} built-in browser. {android
        ? 'Open it in Chrome to use Google, or sign in with an email link below.'
        : 'Tap the ··· or Share button and choose “Open in Safari” (or your browser), or sign in with an email link below.'}</span>
      {android && <a className="pill small" href={chromeIntent(location.href)}>Open in Chrome</a>}
    </div>
  );
}

export function NotInvited({ api, email }: { api: Api; email: string }) {
  const [reqs, setReqs] = useState<JoinRequest[] | null>(null);
  const [again, setAgain] = useState(false);
  const load = () => api.myJoinRequests().then(setReqs).catch(() => setReqs([]));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const last = reqs?.[0];
  const signOut = <button className="tlink" onClick={() => api.signOut()}>Sign out</button>;
  if (!reqs) return <Loading />;
  if (last?.status === 'pending') return (
    <div className="gate"><div className="gate-card reveal">
      <p className="eyebrow">Request sent</p>
      <h1 className="headline" style={{ fontSize: 'clamp(32px,5vw,48px)' }}>Thank you, {last.full_name.split(' ')[0]}.</h1>
      <p className="subhead" style={{ fontSize: 19 }}>Your request is with the family stewards. Once someone confirms who you are, you’ll get an email and can sign in with {email}. This usually takes a day or two.</p>
      <div className="ctas"><button className="pill" onClick={() => location.reload()}>Check again</button>{signOut}</div>
      <p className="gate-foot"><PrivacyLink /></p>
    </div></div>
  );
  if (last?.status === 'approved') return (
    <div className="gate"><div className="gate-card reveal">
      <p className="eyebrow">Welcome</p>
      <h1 className="headline" style={{ fontSize: 'clamp(32px,5vw,48px)' }}>You’re in.</h1>
      <p className="subhead" style={{ fontSize: 19 }}>Your request was approved. Reload to open the family website.</p>
      <div className="ctas"><button className="pill" onClick={() => location.reload()}>Open the website</button>{signOut}</div>
      <p className="gate-foot"><PrivacyLink /></p>
    </div></div>
  );
  if (last?.status === 'declined' && !again) return (
    <div className="gate"><div className="gate-card reveal">
      <p className="eyebrow">About your request</p>
      <h1 className="headline" style={{ fontSize: 'clamp(32px,5vw,48px)' }}>We couldn’t confirm it.</h1>
      <p className="subhead" style={{ fontSize: 19 }}>{last.decline_note || 'The family stewards couldn’t place you in the family tree from your request.'} If you think this is a mistake, please contact the family admin, or send a new request with more detail.</p>
      <div className="ctas"><button className="pill" onClick={() => setAgain(true)}>Send a new request</button>{signOut}</div>
      <p className="gate-foot"><PrivacyLink /></p>
    </div></div>
  );
  return <JoinForm api={api} email={email} onSent={load} signOut={signOut} />;
}

function JoinForm({ api, email, onSent, signOut }: { api: Api; email: string; onSent: () => void; signOut: React.ReactNode }) {
  const [v, setV] = useState<JoinRequestInput>({ full_name: '', father_name: '', mother_name: '', spouse_name: '', city: '', phone: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof JoinRequestInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  async function send(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    if (v.full_name.trim().length < 2) { setErr('Please enter your full name.'); return; }
    if (!v.father_name.trim() && !v.mother_name.trim() && !v.spouse_name.trim()) { setErr('Please tell us at least one parent (or your husband or wife), so we can find you in the tree.'); return; }
    setBusy(true);
    try { await api.requestToJoin(v); onSent(); } catch (x) { setErr(friendly(x)); } finally { setBusy(false); }
  }
  return (
    <div className="gate"><div className="gate-card reveal" style={{ maxWidth: 560 }}>
      <p className="eyebrow">Ask to join</p>
      <h1 className="headline" style={{ fontSize: 'clamp(32px,5vw,48px)' }}>Tell us who you are.</h1>
      <p className="subhead" style={{ fontSize: 17 }}>You’re signed in as <b>{email}</b>, which isn’t on the invitation list yet. A family steward will find you in the tree and let you in. Nobody outside the stewards sees this.</p>
      <form className="form join-form" onSubmit={send}>
        <div className="full"><label htmlFor="jf-name">Your full name</label><input id="jf-name" value={v.full_name} onChange={set('full_name')} autoComplete="name" maxLength={120} required /></div>
        <div><label htmlFor="jf-father">Father’s name</label><input id="jf-father" value={v.father_name} onChange={set('father_name')} maxLength={120} /></div>
        <div><label htmlFor="jf-mother">Mother’s name</label><input id="jf-mother" value={v.mother_name} onChange={set('mother_name')} maxLength={120} /></div>
        <div><label htmlFor="jf-spouse">Husband or wife (if married)</label><input id="jf-spouse" value={v.spouse_name} onChange={set('spouse_name')} maxLength={120} /></div>
        <div><label htmlFor="jf-city">City</label><input id="jf-city" value={v.city} onChange={set('city')} maxLength={80} autoComplete="address-level2" /></div>
        <div className="full"><label htmlFor="jf-phone">Phone (optional)</label><input id="jf-phone" type="tel" value={v.phone} onChange={set('phone')} maxLength={30} autoComplete="tel" placeholder="+91 …" />
          <div className="note">Only so a steward can call or WhatsApp you if they need to check. It’s deleted once your request is decided.</div></div>
        <div className="full"><label htmlFor="jf-note">Anything that helps us place you (optional)</label><textarea id="jf-note" rows={3} value={v.note} onChange={set('note')} maxLength={500} placeholder="e.g. Ramesh Mama’s daughter, Sarala Periyamma’s granddaughter" /></div>
        <div className="full ctas" style={{ justifyContent: 'flex-start' }}><button className="pill" disabled={busy}>{busy ? 'Sending…' : 'Send my request'}</button>{signOut}</div>
        {err && <p className="status err full">{err}</p>}
      </form>
      <p className="gate-foot"><PrivacyLink /></p>
    </div></div>
  );
}

export function NotConfigured() {
  return (
    <div className="gate"><div className="gate-card">
      <p className="eyebrow">Setup needed</p>
      <h1 className="headline" style={{ fontSize: 40 }}>Connect the database.</h1>
      <p className="subhead" style={{ fontSize: 17 }}>Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see README.md), then rebuild. To preview without a database, run <code>npm run demo</code>.</p>
      <p className="gate-foot"><PrivacyLink /></p>
    </div></div>
  );
}

export function Loading({ text = 'Loading the family…' }: { text?: string }) {
  return <div className="gate"><div className="loading" role="status"><span className="spinner" />{text}</div></div>;
}
