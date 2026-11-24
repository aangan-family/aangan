import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyPageLang, usePagesOn } from './lib/i18n/pages';
import { useMenuLang } from './lib/menulang';
import { FAMILY } from './lib/site';
import { TwoStepBanner } from './components/TwoStep';
import { countVisit, listenForOpens, refreshSubscription } from './lib/push';
import type { Api } from './lib/api';
import { friendly } from './lib/api';
import { demoApi } from './lib/api-demo';
import { supabaseApi } from './lib/api-supabase';
import { StoreProvider, useStore } from './lib/store';
import type { Snapshot } from './lib/types';
import { PrivacyLink, SearchBox, Toast, go, useRoute } from './components/common';
import { Sidebar } from './components/Sidebar';
import { ConsentSheet } from './components/Sheets';
import { Home } from './pages/Home';
import { Person } from './pages/Person';
import { Related } from './pages/Related';
import { Privacy } from './pages/Privacy';
import { Admin } from './pages/Admin';
import { Help } from './pages/Help';
import { DevCenter } from './pages/DevCenter';
import { WhatsNew } from './pages/WhatsNew';
import { Photos } from './pages/Photos';
import { Tree } from './pages/Tree';
import { Talk } from './pages/Talk';
import { Calendar } from './pages/Calendar';
import { TabBar } from './components/TabBar';
import { Breadcrumbs } from './components/Breadcrumbs';
import { KolamBackground, PageNames, Thoranam } from './components/Heritage';
import { Bell } from './components/Bell';
import { ChatButton, OnlineButton } from './components/Online';
import { PresenceProvider } from './lib/presence';
import { Chat } from './pages/Chat';
import { applyMode, applyTheme } from './lib/theme';
import { Loading, Login, NotConfigured, NotInvited } from './pages/Gate';
import { pinShell } from './lib/scroll';
import { GetTheApp } from './components/GetTheApp';
import { rememberDeepLink, takeDeepLink } from './lib/returnto';
import { ChildApprovals } from './pages/ChildApprovals';
import { SITE_NAME, SiteAvatar, useIsSiteAdmin } from './components/SiteAdmin';

const isDemo = import.meta.env.VITE_DEMO === '1';

export function App() {
  const api = useMemo<Api>(() => (isDemo ? demoApi() : supabaseApi()), []);
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<number>();
  const toast = useCallback((m: string) => { setToastMsg(m); clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToastMsg(null), 4200); }, []);

  const reload = useCallback(async () => {
    try { setSnap(await api.load()); setError(''); } catch (e) { setError(friendly(e)); }
  }, [api]);

  useEffect(() => {
    if (!api.configured) return;
    api.currentEmail().then(setEmail);
    return api.onAuthChange((e) => { setEmail(e); if (!e) setSnap(null); });
  }, [api]);
  useEffect(() => { if (email) reload(); }, [email, reload]);
  // phone notifications: count visits for the one-time invitation, follow taps, keep this device's address fresh
  useEffect(() => { listenForOpens(); }, []);
  // page text in the member's language, when they asked for it (Theme → Menus in → Pages too)
  const menuLang = useMenuLang(), pagesOn = usePagesOn();
  useEffect(() => { void applyPageLang(menuLang, pagesOn); }, [menuLang, pagesOn]);
  useEffect(() => { if (email && snap?.me) { countVisit(); refreshSubscription(api); } }, [email, !!snap?.me]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!api.configured) return <NotConfigured />;
  if (email === undefined) return <Loading text="" />;
  if (email === null) { rememberDeepLink(); return <Login api={api} />; }
  if (error && !snap) return <div className="gate"><div className="gate-card"><h1 className="headline" style={{ fontSize: 36 }}>Couldn’t load the family.</h1><p className="subhead" style={{ fontSize: 17 }}>{error}</p><div className="ctas"><button className="pill" onClick={reload}>Try again</button></div></div></div>;
  if (!snap) return <Loading />;
  if (!snap.me || snap.me.status !== 'active') return <NotInvited api={api} email={email} />;

  return (
    <StoreProvider api={api} snap={snap} reload={reload} toast={toast}>
      <PresenceProvider>
        <Shell email={email} />
      </PresenceProvider>
      <Toast msg={toastMsg} />
    </StoreProvider>
  );
}

function Shell({ email }: { email: string }) {
  const route = useRoute();
  const siteAdmin = useIsSiteAdmin();
  const { api, snap, myId, activeConsent, family, canManage, toast, isMinor } = useStore();
  const mobile = () => window.matchMedia('(max-width: 760px)').matches;
  const [sideOpen, setSideOpen] = useState(() => !mobile());
  const [askConsent, setAskConsent] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // signed in after following a shared link: open the page they were sent to
  useEffect(() => { const h = takeDeepLink(); if (h && (!location.hash || location.hash === '#/' || location.hash.startsWith('#/auth'))) location.hash = h; }, []);
  const firstRoute = useRef(true);
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 }); if (mobile()) setSideOpen(false);
    // after a page change, start keyboard and screen-reader focus at the new page (not on the first load)
    if (firstRoute.current) firstRoute.current = false; else mainRef.current?.focus({ preventScroll: true });
  }, [route]); // eslint-disable-line react-hooks/exhaustive-deps
  // First visit: ask for consent once per session until it's given
  useEffect(() => {
    if (!myId || activeConsent(myId) || !family.byId.get(myId)?.is_living || isMinor(myId)) return;   // a parent consents for under-18s
    try { if (sessionStorage.getItem('consent-asked')) return; sessionStorage.setItem('consent-asked', '1'); } catch { /* storage off */ }
    setAskConsent(true);
  }, [myId]); // eslint-disable-line react-hooks/exhaustive-deps

  // the colour theme follows the person across devices
  useEffect(() => { if (snap.prefs.theme) applyTheme(snap.prefs.theme); }, [snap.prefs.theme]);
  useEffect(() => { if (snap.prefs.mode) applyMode(snap.prefs.mode); }, [snap.prefs.mode]);
  // on sign-in: let them know about photos waiting for their say
  useEffect(() => {
    const n = snap.tags.filter((t) => t.status === 'pending' && canManage(t.person_id) && (snap.me?.role === 'member' || t.person_id === myId)).length;
    if (!n) return;
    try { if (sessionStorage.getItem('tags-told')) return; sessionStorage.setItem('tags-told', '1'); } catch { /* storage off */ }
    setTimeout(() => toast(n === 1 ? 'You’ve been tagged in a photo. Open the bell to approve or hide it.' : `You’ve been tagged in ${n} photos. Open the bell to review them.`), 900);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The page frame never scrolls (only <main> does). If iOS or anything else nudges it, put it back.
  useEffect(() => {
    let t = 0;
    const later = () => { cancelAnimationFrame(t); t = requestAnimationFrame(() => setTimeout(pinShell, 120)); };
    const onScroll = (e: Event) => { const el = e.target; if (el === document || el === document.body || el === document.documentElement || (el instanceof Element && (el.id === 'root' || el.classList.contains('layout')))) later(); };
    document.addEventListener('scroll', onScroll, true);
    for (const ev of ['pageshow', 'resize', 'orientationchange', 'focus']) addEventListener(ev, later);
    document.addEventListener('visibilitychange', later);
    const timers = [0, 400, 1500, 3000].map((ms) => setTimeout(pinShell, ms));
    return () => { document.removeEventListener('scroll', onScroll, true); for (const ev of ['pageshow', 'resize', 'orientationchange', 'focus']) removeEventListener(ev, later); document.removeEventListener('visibilitychange', later); timers.forEach(clearTimeout); cancelAnimationFrame(t); };
  }, []);

  const closeOnMobile = () => { if (mobile()) setSideOpen(false); };
  const cls = mobile() ? (sideOpen ? 'side-open' : '') : (sideOpen ? '' : 'side-closed');
  useEffect(() => { document.body.className = cls; }, [cls]);

  return (
    <>
      <button type="button" className="skiplink" onClick={() => mainRef.current?.focus()}>Skip to content</button>
      <header>
        <button className="burger" aria-label="Menu" aria-expanded={sideOpen} onClick={() => setSideOpen(!sideOpen)}><span /></button>
        <div className="brand"><h1 onClick={() => go('')}>{FAMILY}</h1><small>{snap.persons.length} people · {family.maxGen} generations{api.demo ? ' · preview' : ''}</small></div>
        <div className="search hsearch-wrap"><SearchBox placeholder="Find a person…" onPick={(id) => go('p/' + id)} /></div>
        <div className="usermenu">
          <OnlineButton />
          <ChatButton />
          <Bell />
          {siteAdmin
            ? <button className="avbtn site" title={`${SITE_NAME} · ${email}`} onClick={() => go('admin')} aria-label={`${SITE_NAME}: open Admin`}><SiteAvatar size={32} /></button>
            : <button className="avbtn" title={email} onClick={() => (myId ? go('p/' + myId) : go('privacy'))} aria-label="My profile">{(email[0] || '?').toUpperCase()}</button>}
          <button className="tlink small nochev" onClick={() => api.signOut()}>Sign out</button>
        </div>
      </header>
      <div className="layout">
        <Sidebar route={route} onNavigate={closeOnMobile} />
        <div className="scrim" onClick={() => setSideOpen(false)} />
        <main ref={mainRef} id="main" tabIndex={-1}>
          <KolamBackground />
          <Breadcrumbs route={route} />
          <TwoStepBanner />
          {route.page !== 'chat' && <Thoranam />}
          {route.page !== 'chat' && <PageNames route={route} />}
          {route.page === 'home' && <Home />}
          {route.page === 'person' && <Person key={route.id} id={route.id} />}
          {route.page === 'related' && <Related initialA={route.a} />}
          {route.page === 'privacy' && <Privacy />}
          {route.page === 'admin' && <Admin initialTab={route.tab} />}
          {route.page === 'help' && <Help section={route.section} />}
          {route.page === 'devcenter' && <DevCenter id={route.id} />}
          {route.page === 'whatsnew' && <WhatsNew />}
          {route.page === 'child' && <ChildApprovals />}
          {route.page === 'photos' && <Photos openId={route.id} />}
          {route.page === 'calendar' && <Calendar key={route.at || 'now'} at={route.at} />}
          {route.page === 'talk' && <Talk threadId={route.id} />}
          {route.page === 'chat' && <Chat personId={route.id} />}
          {route.page === 'tree' && <Tree key={route.id || ''} focusId={route.id} />}
          {route.page !== 'chat' && route.page !== 'tree' && <p className="pagefoot"><PrivacyLink /></p>}
        </main>
      </div>
      <TabBar route={route} onMore={() => setSideOpen(true)} />
      <footer><span className="lockline">🔒 Secure HTTPS connection</span> · Private to invited family · <a href="#/privacy">My privacy</a> · <PrivacyLink /></footer>
      {askConsent && myId && <ConsentSheet id={myId} relation="self" onClose={() => setAskConsent(false)} />}
      {!askConsent && <GetTheApp />}
    </>
  );
}
