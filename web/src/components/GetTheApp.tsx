import { useEffect, useState } from 'react';
import { APP_NAME, DOMAIN, FAMILY, SITE_URL } from '../lib/site';
import { createPortal } from 'react-dom';
import { useStore } from '../lib/store';
import { friendly } from '../lib/api';
import { chromeIntent, inAppBrowser, isAndroid } from '../lib/google';
import { askedForApp, canPrompt, firstLaunchDone, firstLaunchDue, isInstalled, neverAskForApp, onCanPrompt, platform, promptInstall, shouldAskForApp, timesAsked, type Platform } from '../lib/app';
import { pushState, turnOn, type PushState } from '../lib/push';
import { Sheet } from './common';

const ShareIcon = () => <svg className="stepic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" /></svg>;
const PlusIcon = () => <svg className="stepic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M12 8v8M8 12h8" /></svg>;
const DotsIcon = () => <svg className="stepic" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>;
const AppIcon = () => <img className="stepic app" src="/icons/icon-192.png" alt="" />;

function Step({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <li><span className="stepicon">{icon}</span><span>{children}</span></li>;
}

/** The steps for this phone and browser, with pictures of the buttons to look for. */
export function AppSteps({ p }: { p: Platform }) {
  const { toast } = useStore();
  if (p === 'inapp') {
    const app = inAppBrowser() || 'this app';
    return (
      <div className="appsteps">
        <p className="appnote">You’ve opened the site inside <b>{app}</b>. It needs to be in {isAndroid() ? 'Chrome' : 'Safari'} to go on your home screen.</p>
        {isAndroid()
          ? <a className="pill" href={chromeIntent(location.href)}>Open in Chrome</a>
          : <ol><Step icon={<DotsIcon />}>Tap the <b>···</b> or <b>Share</b> button in {app}.</Step><Step icon={<ShareIcon />}>Choose <b>Open in Safari</b>.</Step><Step icon={<PlusIcon />}>Then come back here and follow the steps.</Step></ol>}
        <button type="button" className="tlink small nochev" onClick={() => navigator.clipboard?.writeText(SITE_URL).then(() => toast('Link copied. Paste it into Safari or Chrome.'), () => {})}>Copy the link instead</button>
      </div>
    );
  }
  if (p === 'ios-safari' || p === 'ios-other') return (
    <ol className="appsteps">
      <Step icon={<ShareIcon />}>Tap <b>Share</b>{p === 'ios-safari' ? <> at the bottom of the screen (on iPad, at the top)</> : <> in the address bar at the top</>}.</Step>
      <Step icon={<PlusIcon />}>Scroll down and tap <b>Add to Home Screen</b>.</Step>
      <Step icon={<span className="stepword">Add</span>}>Tap <b>Add</b> in the top corner.</Step>
      <Step icon={<AppIcon />}>Open <b>{APP_NAME}</b> from your Home Screen from now on.</Step>
    </ol>
  );
  if (p === 'android') return (
    <ol className="appsteps">
      <Step icon={<DotsIcon />}>Tap <b>⋮</b> at the top right of Chrome.</Step>
      <Step icon={<PlusIcon />}>Tap <b>Install app</b> (or <b>Add to Home screen</b>).</Step>
      <Step icon={<span className="stepword">Install</span>}>Tap <b>Install</b>.</Step>
      <Step icon={<AppIcon />}>Open <b>{APP_NAME}</b> from your home screen from now on.</Step>
    </ol>
  );
  return (
    <div className="appsteps">
      <p className="appnote">On a computer, Chrome and Edge show an install button (⊕) at the right of the address bar. On your phone, open {DOMAIN} and you’ll see the steps.</p>
    </div>
  );
}

/**
 * Shown on phones that open the site in a browser: "Get the family app", at most once a day (5 times in all).
 * The first time someone opens it from their home screen: a thank-you, and an offer to turn on notifications.
 */
export function GetTheApp() {
  const { api, snap, toast } = useStore();
  const [mode, setMode] = useState<'ask' | 'welcome' | null>(null);
  const [p] = useState<Platform>(() => platform());
  const [prompt, setPrompt] = useState(canPrompt());
  const [push, setPush] = useState<PushState | null>(null);
  useEffect(() => onCanPrompt(() => setPrompt(true)), []);

  useEffect(() => {
    if (isInstalled()) {
      if (!snap.prefs.app_at) api.savePrefs({ app_at: new Date().toISOString() }).catch(() => {});
      if (firstLaunchDue()) { firstLaunchDone(); pushState().then((s) => { setPush(s); if (s === 'off') setTimeout(() => setMode('welcome'), 1500); }); }
      return;
    }
    if (!shouldAskForApp(p)) return;
    const t = setTimeout(() => { if (!document.querySelector('.modal.on')) { askedForApp(); setMode('ask'); } }, 3500);   // a moment after the page loads, never over another sheet
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mode) return null;
  const close = () => setMode(null);

  if (mode === 'welcome') return createPortal(
    <Sheet title="You’re all set." sub="The family app is on your home screen. One more thing: let it tell you when family writes to you, tags you or shares something new." onClose={close}
      footer={<>
        <button className="btn" onClick={close}>Not now</button>
        <button className="btn primary" onClick={async () => { try { const s = await turnOn(api); if (s === 'on') { toast('Notifications are on.'); close(); } else setPush(s); } catch (e) { toast(friendly(e)); } }}>Turn on notifications</button>
      </>}>
      <div className="appwelcome"><img src="/icons/icon-192.png" alt="" /><p>It says who, never what (“Kavya sent you a message”). Choose what you get any time in <b>My privacy</b>.{push === 'blocked' ? ' Notifications are blocked for this app in your phone’s settings.' : ''}</p></div>
    </Sheet>, document.body);

  return createPortal(
    <Sheet title="Get the family app." sub={`Put ${DOMAIN} on your home screen. It opens like an app, full screen with its own icon, and can tell you when family writes. No app store, nothing to download.`} onClose={close}
      footer={<>
        {timesAsked() >= 2 ? <button className="btn" onClick={() => { neverAskForApp(); close(); }}>Don’t ask again</button> : null}
        <button className="btn" onClick={close}>Not now</button>
        {p === 'android' && prompt && <button className="btn primary" onClick={async () => { if (await promptInstall()) { toast(`Installed. Open ${APP_NAME} from your home screen.`); close(); } else setPrompt(canPrompt()); }}>Install the app</button>}
      </>}>
      {p === 'android' && prompt
        ? <div className="appwelcome"><img src="/icons/icon-192.png" alt="" /><p>Tap <b>Install the app</b>, then <b>Install</b>. It takes a second.</p></div>
        : <AppSteps p={p} />}
    </Sheet>, document.body);
}
