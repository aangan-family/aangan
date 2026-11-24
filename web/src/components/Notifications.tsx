import { useEffect, useState } from 'react';
import { APP_NAME as FAMILY } from '../lib/site';
import { useStore } from '../lib/store';
import { friendly } from '../lib/api';
import { ago } from '../lib/format';
import type { Prefs } from '../lib/types';
import { dismissAsk, isIOS, pushState, shouldAsk, turnOff, turnOn, type PushState } from '../lib/push';

type Key = 'push_messages' | 'push_mentions' | 'push_occasions' | 'push_festivals' | 'push_admin' | 'push_quiet' | 'push_news' | 'push_family' | 'push_talk' | 'push_photos';
const SWITCHES: [Key, string, string, boolean][] = [
  ['push_messages', 'Private messages', 'Who wrote to you. The message itself stays in Messages.', true],
  ['push_mentions', 'Mentions and photo tags', 'When someone @-mentions you, or tags you in a photo.', true],
  ['push_family', 'Close family updates', 'When someone in your close family has new details on their profile.', true],
  ['push_talk', 'Talk', 'New conversations, and replies in conversations you’re in.', true],
  ['push_photos', 'New photos', 'When someone shares new family photos.', true],
  ['push_news', 'Family news', 'Notices from the family admins, like a new conversation to join.', true],
  ['push_occasions', 'Birthdays and remembrance days', 'At 7 am, the family occasions of the day.', true],
  ['push_festivals', 'Festival days', 'At 7 am, on days like Karthigai Deepam and Deepavali.', false],
  ['push_admin', 'Requests to approve', 'New requests to join, and invitations waiting for you.', true],
  ['push_quiet', 'Quiet hours, 10 pm to 7 am', 'Holds everything except private messages until morning.', true],
];

/** Share icon as drawn in Safari, so the steps match what people see. */
const ShareIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4" /><path d="M6 11v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8" /></svg>
);

/** iPhone/iPad: Apple only allows notifications from the Home Screen app. */
export function IOSInstallSteps() {
  return (
    <ol className="iosteps">
      <li><span className="ios-n">1</span><span>In Safari, tap <b className="ios-ico"><ShareIcon /> Share</b> at the bottom of the screen.</span></li>
      <li><span className="ios-n">2</span><span>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</span></li>
      <li><span className="ios-n">3</span><span>Open <b>{FAMILY}</b> from your Home Screen, come back here and tap <b>Turn on notifications</b>.</span></li>
    </ol>
  );
}

/** My privacy → Phone notifications. */
export function NotificationsCard() {
  const { api, snap, reload, toast, isSteward } = useStore();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<{ id: string; device: string; created_at: string; last_ok_at: string | null }[]>([]);
  const refresh = async () => {
    setState(await pushState());
    try { setDevices(await api.pushDevices()); } catch { setDevices([]); }
  };
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const on = async () => {
    setBusy(true);
    try {
      const s = await turnOn(api); setState(s);
      if (s === 'on') { toast('Notifications are on for this device.'); setDevices(await api.pushDevices()); }
      else if (s === 'blocked') toast('Notifications are blocked for this site. See the steps below.');
    } catch (e) { toast(friendly(e)); } finally { setBusy(false); }
  };
  const off = async () => { setBusy(true); try { await turnOff(api); await refresh(); toast('Notifications are off for this device.'); } catch (e) { toast(friendly(e)); } finally { setBusy(false); } };
  const test = async () => { try { await api.pushTest(); toast('Sent. It should arrive in a few seconds.'); } catch (e) { toast(friendly(e)); } };
  const flip = async (k: Key, v: boolean) => { try { await api.savePrefs({ [k]: v } as Partial<Prefs>); await reload(); } catch (e) { toast(friendly(e)); } };
  const val = (k: Key, def: boolean) => (snap.prefs[k] ?? def) !== false;

  if (!state) return null;
  return (
    <section className="section" id="notifications">
      <div className="section-head"><h3 className="sec-title">Phone notifications.</h3></div>
      <div className="gap-card notif">
        {state === 'on' && <p><b>On for this device.</b> You’ll get a notification when family writes to you. It says who, never what: messages stay private until you open the site.</p>}
        {state === 'off' && <p>Get a notification on this phone or computer when someone writes to you, tags you, starts a conversation or shares photos, when your close family update their profiles, and on family birthdays. It says who, never what.</p>}
        {state === 'ios-install' && <><p>On iPhone and iPad, Apple allows notifications only from the Home Screen app. It takes three taps:</p><IOSInstallSteps /></>}
        {state === 'blocked' && <p><b>Notifications are blocked for this site.</b> {isIOS() ? 'Open Settings → Notifications → ' + FAMILY + ' and turn on Allow Notifications.' : 'Tap the lock or settings icon beside the address, choose Notifications → Allow, then come back here.'}</p>}
        {state === 'unsupported' && <p>This browser can’t show notifications. On Android, use Chrome. On iPhone, add the site to your Home Screen with Safari.</p>}
        <div className="notif-acts">
          {state === 'off' && <button className="pill" disabled={busy} onClick={on}>Turn on notifications</button>}
          {state === 'blocked' && <button className="pill ghost" onClick={refresh}>I’ve allowed them</button>}
          {state === 'on' && <><button className="pill" onClick={test}>Send me a test</button><button className="pill ghost" disabled={busy} onClick={off}>Turn off on this device</button></>}
        </div>
        {devices.length > 0 && (
          <p className="note">On for {devices.length === 1 ? 'one device' : `${devices.length} devices`}: {devices.map((d) => `${d.device || 'a device'}${d.last_ok_at ? ` (last ${ago(d.last_ok_at)})` : ''}`).join(', ')}.</p>
        )}
      </div>
      <div className="toggles">
        {SWITCHES.filter(([k]) => k !== 'push_admin' || isSteward).map(([k, label, hint, def]) => (
          <label className="toggle" key={k}>
            <input type="checkbox" checked={val(k, def)} onChange={(e) => flip(k, e.target.checked)} />
            <span><b>{label}</b><small>{hint}</small></span>
          </label>
        ))}
      </div>
    </section>
  );
}

/** Home: a one-time invitation after a few visits. */
export function NotificationsAsk() {
  const { api, toast } = useStore();
  const [state, setState] = useState<PushState | null>(null);
  const [hide, setHide] = useState(!shouldAsk());
  useEffect(() => { if (!hide) pushState().then(setState); }, [hide]);
  if (hide || !state || (state !== 'off' && state !== 'ios-install')) return null;
  const no = () => { dismissAsk(); setHide(true); };
  return (
    <div className="wrap"><div className="notif-ask" role="region" aria-label="Phone notifications">
      <div><b>Get a buzz when family writes to you.</b><br /><span>{state === 'ios-install' ? 'Add the site to your Home Screen first, then turn on notifications in My privacy.' : 'Messages, mentions and birthdays, on this device. It says who, never what.'}</span></div>
      <div className="notif-ask-acts">
        {state === 'off'
          ? <button className="pill small" onClick={async () => { try { const s = await turnOn(api); if (s === 'on') { toast('Notifications are on.'); dismissAsk(); setHide(true); } else setState(s); } catch (e) { toast(friendly(e)); } }}>Turn on</button>
          : <a className="pill small" href="#/privacy">Show me how</a>}
        <button className="pill ghost small" onClick={no}>Not now</button>
      </div>
    </div></div>
  );
}
