import { useEffect, useState, type ReactNode } from 'react';
import { useStore } from '../lib/store';
import { usePresence } from '../lib/presence';
import { go, type Route } from './common';
import { InstallApp } from './InstallApp';
import { applyMode, applyTextSize, applyTheme, savedTextSize, TEXT_SIZES, type TextSize } from '../lib/theme';
import { COLOURS, MODES, MODE_LABEL, STYLES, STYLE_HINT, THEME_LABEL, type Mode, type Prefs, type Theme } from '../lib/types';
import { hasUnseen } from '../lib/whatsnew';
import { setHeritagePrefs, useHeritage } from './Heritage';
import { BORDER_LABEL, SCRIPTS, borderChoices, type Border, type Scripts } from '../lib/heritage';
import { setMenuLang, useMenuLang, useT } from '../lib/menulang';
import { FAMILY_DEFAULT, FESTIVAL_GROUPS, PACK_LIST, PACKS, setCommunity, setFestivals, useCommunityId, useFestivals, usePack, type CommunityId, type FestivalGroup } from '../lib/community';

/** Sign out and go back to the start, so the next person on a shared phone sees the sign-in page. */
export function signOut(api: { signOut: () => Promise<void> }) {
  api.signOut().catch(() => {}).finally(() => { location.hash = ''; });
}
export const SignOutIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14" /><path d="M10 8l-4 4 4 4M6 12h9" /></svg>
);

function WhatsNewLink({ on, onNavigate }: { on: boolean; onNavigate: () => void }) {
  const t = useT();
  const [unseen, setUnseen] = useState(hasUnseen);
  useEffect(() => { const f = () => setUnseen(hasUnseen()); addEventListener('fam-whatsnew-seen', f); return () => removeEventListener('fam-whatsnew-seen', f); }, []);
  return (
    <a href="#/whats-new" className={on ? 'on' : ''} onClick={onNavigate}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></svg>
      <span className="navtext">{t('What’s New!')}</span>{unseen && !on ? <span className="navnew" aria-label="new" /> : null}</a>
  );
}

const I = {
  home: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 10.5 12 3.5l8.5 7" /><path d="M5.5 9v10.5a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9" /></svg>,
  tree: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2.5" width="6" height="5" rx="1.5" /><rect x="2.5" y="16.5" width="6" height="5" rx="1.5" /><rect x="15.5" y="16.5" width="6" height="5" rx="1.5" /><path d="M12 7.5v4.5M5.5 16.5V12h13v4.5" /></svg>,
  related: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="6.5" cy="6.5" r="3" /><circle cx="17.5" cy="17.5" r="3" /><path d="M6.5 9.5v2.5a3 3 0 0 0 3 3h5" /></svg>,
  calendar: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /><circle cx="12" cy="15" r="1.3" fill="currentColor" stroke="none" /></svg>,
  photos: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="M21 16l-5-5-8 8.5" /></svg>,
  browse: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M8 12h12M12 18h8" /><circle cx="4.5" cy="12" r=".6" fill="currentColor" /><circle cx="8.5" cy="18" r=".6" fill="currentColor" /></svg>,
  talk: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12a7.5 7.5 0 0 1-11 6.6L4 20l1.4-4.3A7.5 7.5 0 1 1 20 12z" /><path d="M8.5 11h.01M12 11h.01M15.5 11h.01" /></svg>,
  me: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>,
  privacy: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg>,
  theme: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.5-.2-.9-.5-1.2-.3-.4-.5-.8-.5-1.2 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4.1-4-7.4-9-7.4z" /><circle cx="7.5" cy="11" r="1" fill="currentColor" /><circle cx="10.5" cy="7.5" r="1" fill="currentColor" /><circle cx="15" cy="7.5" r="1" fill="currentColor" /></svg>,
  help: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.2a2.6 2.6 0 0 1 5 .8c0 1.7-2.5 2.3-2.5 3.8" /><circle cx="12" cy="17" r=".6" fill="currentColor" /></svg>,
  admin: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7.5 3v5.5c0 4.4-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5.1-7.5-9.5V6z" /><path d="M9 12l2 2 4-4" /></svg>,
  dev: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 8 4.5 12l4 4M15.5 8l4 4-4 4M13.5 5.5l-3 13" /></svg>,
  chev: <svg className="navchev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>,
};

const remember = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* storage off */ } };
const recall = (k: string) => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };

export function Sidebar({ route, onNavigate }: { route: Route; onNavigate: () => void }) {
  const { isAdmin, isSteward, api, myId, amMinor, snap, family } = useStore();
  const waitingForMe = (snap.childDrafts || []).filter((d) => d.child_person !== myId).length;
  const [themeOpen, setThemeOpen] = useState(false);
  const t = useT();
  const link = (href: string, on: boolean, icon: ReactNode, label: string, sub?: string) => (
    <a href={href} className={on ? 'on' : ''} onClick={onNavigate} aria-current={on ? 'page' : undefined}>
      {icon}<span className="navtext">{t(label)}{sub && <small>{t(sub)}</small>}</span></a>
  );
  return (
    <aside className="side" aria-label="Menu">
      <nav className="navlinks">
        {link('#/', route.page === 'home', I.home, 'Home')}

        <p className="navgroup">{t('Family')}</p>
        {link('#/tree', route.page === 'tree', I.tree, 'Family tree')}
        {link('#/related', route.page === 'related', I.related, 'How are we related?')}
        {link('#/calendar', route.page === 'calendar', I.calendar, 'Calendar')}
        {link('#/photos', route.page === 'photos', I.photos, 'Photos')}

        <p className="navgroup">{t('Conversations')}</p>
        {link('#/talk', route.page === 'talk', I.talk, 'Talk', 'With the whole family')}
        <MessagesLink on={route.page === 'chat'} onNavigate={onNavigate} />

        <p className="navgroup">{t('You')}</p>
        {myId && family.byId.has(myId) && link(`#/p/${myId}`, route.page === 'person' && route.id === myId, I.me, 'My profile')}
        {link('#/privacy', route.page === 'privacy', I.privacy, 'My privacy')}
        {(amMinor || waitingForMe > 0) && link('#/child', route.page === 'child', I.privacy, amMinor ? 'Waiting for a parent' : `${t('Waiting for your OK')} (${waitingForMe})`, amMinor ? 'What a parent is checking' : 'From your children')}
        <button type="button" className="navrow" aria-expanded={themeOpen} onClick={() => setThemeOpen(!themeOpen)}>
          {I.theme}<span className="navtext">{t('Theme')}</span>{I.chev}</button>
        {themeOpen && <ThemePicker api={api} />}

        <p className="navgroup">{t('Help')}</p>
        {link('#/help', route.page === 'help', I.help, 'Help & FAQ')}
        <WhatsNewLink on={route.page === 'whatsnew'} onNavigate={onNavigate} />
        <InstallApp onDone={onNavigate} />

        {isSteward && <>
          <p className="navgroup">{t(isAdmin ? 'Admin' : 'Steward')}</p>
          {link('#/admin', route.page === 'admin', I.admin, isAdmin ? 'Admin' : 'Requests to join')}
          {isAdmin && link('#/devcenter', route.page === 'devcenter', I.dev, 'DevCenter')}
        </>}

        <button type="button" className="nav-signout" onClick={() => { onNavigate(); signOut(api); }}>
          <SignOutIcon />{t('Sign out')}</button>
      </nav>
    </aside>
  );
}

/** Theme: Light / Dark / Automatic, one of six colours, or a style. Saved on this device at once and on the account. */
export function ThemePicker({ api }: { api: { savePrefs: (p: Partial<Prefs>) => Promise<void> } }) {
  const { snap } = useStore();
  const h = useHeritage();
  const choices = borderChoices(h.gender);
  const save = (patch: Partial<Prefs>) => { setHeritagePrefs(patch); api.savePrefs(patch).catch(() => {}); };
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) || snap.prefs.theme || 'blue');
  const [mode, setMode] = useState<Mode>(() => (document.documentElement.dataset.mode as Mode) || snap.prefs.mode || 'auto');
  const pickTheme = (t: Theme) => { setTheme(t); applyTheme(t); api.savePrefs({ theme: t }).catch(() => {}); };
  const pickMode = (m: Mode) => { setMode(m); applyMode(m); api.savePrefs({ mode: m }).catch(() => {}); };
  return (
    <div className="themepick">
      <div className="seg" role="radiogroup" aria-label="Light or dark">
        {MODES.map((m) => <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => pickMode(m)}>{MODE_LABEL[m]}</button>)}
      </div>
      <p className="themelabel">Colour</p>
      <div className="swatches" role="radiogroup" aria-label="Colour">
        {COLOURS.map((t) => (
          <button key={t} role="radio" aria-checked={theme === t} title={THEME_LABEL[t]} aria-label={THEME_LABEL[t]}
            className={`swatch sw-${t}${theme === t ? ' on' : ''}`} onClick={() => pickTheme(t)} />
        ))}
      </div>
      <p className="themelabel">Style</p>
      <div className="styles" role="radiogroup" aria-label="Style">
        {STYLES.map((t) => (
          <button key={t} role="radio" aria-checked={theme === t} className={`stylecard st-${t}${theme === t ? ' on' : ''}`} onClick={() => pickTheme(t)} title={STYLE_HINT[t]}>
            <i aria-hidden="true" /><span>{THEME_LABEL[t]}</span>
          </button>
        ))}
      </div>
      {choices.length > 0 && <>
        <p className="themelabel">Border</p>
        <div className="seg" role="radiogroup" aria-label="Border">
          {choices.map((b: Border) => <button key={b} role="radio" aria-checked={h.border === b} className={h.border === b ? 'on' : ''} onClick={() => save({ border: b })}>{BORDER_LABEL[b].split(' · ')[1]}</button>)}
        </div>
      </>}
      <p className="themelabel">Names in</p>
      <div className="seg four" role="radiogroup" aria-label="Names in">
        {SCRIPTS.map(([k, t, lang]) => <button key={k} role="radio" lang={lang} aria-checked={h.scripts === k} className={h.scripts === k ? 'on' : ''} onClick={() => save({ scripts: k as Scripts })}>{t}</button>)}
      </div>
      <TraditionsRow />
      <MenuLangRow />
      <TextSizeRow />
      <label className="themetoggle"><input type="checkbox" checked={h.kolam} onChange={(e) => save({ kolam: e.target.checked })} /> Kolam background</label>
    </div>
  );
}

function MessagesLink({ on, onNavigate }: { on: boolean; onNavigate: () => void }) {
  const { unread, onlineIds } = usePresence();
  const t = useT();
  return (
    <a href="#/chat" className={on ? 'on' : ''} onClick={onNavigate}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" /></svg>
      <span className="navtext">{t('Messages')}<small>{t('Private, one-to-one')}</small></span>{unread > 0 ? <span className="navbadge">{unread > 9 ? '9+' : unread}</span> : onlineIds.length > 0 ? <span className="navonline"><i className="sdot online" />{onlineIds.length}</span> : null}
    </a>
  );
}

/** Text size: Normal / Large / Larger, on this device. */
function TextSizeRow() {
  const [t, setT] = useState<TextSize>(savedTextSize);
  return (<>
    <p className="themelabel">Text size</p>
    <div className="seg" role="radiogroup" aria-label="Text size">
      {TEXT_SIZES.map(([k, label]) => <button key={k} role="radio" aria-checked={t === k} className={`${t === k ? 'on' : ''} ts-${k}`} onClick={() => { applyTextSize(k); setT(k); }}>{label}</button>)}
    </div>
  </>);
}

/** Menus in English or the member's language, on this device. */
function MenuLangRow() {
  const l = useMenuLang();
  const pack = usePack();
  const opts: [string, string, string][] = [['en', 'English', 'en']];
  if (pack.lang !== 'en') opts.push([pack.lang, pack.native, pack.lang]);
  return (<>
    <p className="themelabel">Menus in</p>
    <div className="seg" role="radiogroup" aria-label="Menus in">
      {opts.map(([k, label, lang]) =>
        <button key={k} role="radio" lang={lang} aria-checked={l === k} className={l === k ? 'on' : ''} onClick={() => setMenuLang(k)}>{label}</button>)}
    </div>
  </>);
}

/** Whose traditions: family words, menus, calendar and festivals. Per device; the family's default comes from site.config.json. */
function TraditionsRow() {
  const id = useCommunityId();
  const fest = useFestivals();
  const [open, setOpen] = useState(false);
  const pick = (k: CommunityId) => { setCommunity(k); setMenuLang(PACKS[k].lang); };
  const toggle = (g: FestivalGroup) => setFestivals(fest.includes(g) ? fest.filter((x) => x !== g) : [...fest, g]);
  return (<>
    <p className="themelabel">Traditions</p>
    <select className="themeselect" aria-label="Traditions" value={id} onChange={(e) => pick(e.target.value as CommunityId)}>
      {PACK_LIST.map((p) => <option key={p.id} value={p.id}>{p.id === 'english' || p.native === p.name ? p.name : `${p.name} · ${p.native}`}{p.draft ? ' (first draft)' : ''}{p.id === FAMILY_DEFAULT ? ' (family default)' : ''}</option>)}
    </select>
    <p className="note small">Family words (Chacha, Mausi, Athai…), menus and the calendar follow this. Only on this device.</p>
    <button className="tlink" onClick={() => setOpen(!open)}>{open ? 'Hide festival list' : 'Festivals in the calendar'}</button>
    {open && <div className="festgroups">
      {FESTIVAL_GROUPS.map(([g, label]) => (
        <label key={g} className="themetoggle"><input type="checkbox" checked={fest.includes(g)} onChange={() => toggle(g)} /> {label}</label>
      ))}
    </div>}
  </>);
}
