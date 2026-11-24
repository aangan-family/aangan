import { SITE_NAME, SiteAvatar, useIsSiteAdmin } from './SiteAdmin';
import { MotifTile } from './Motifs';
import { Banyan } from './Banyan';
import { FAMILY } from '../lib/site';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Gopuram } from './Gopuram';
import { KolamMark, Lamp, Marigold, Scripts, WovenBorder, useHeritage } from './Heritage';
import { WELCOME } from '../lib/heritage';
import { useStore } from '../lib/store';
import { lineageOf } from '../lib/family';
import { daysUntil, firstName, fullName, ago } from '../lib/format';
import type { Upcoming } from '../lib/traditions';
import { findDay, shownFor, starName } from '../lib/calendar';
import { useFestivals, usePack } from '../lib/community';
import { regionalDate, tithiText } from '../lib/community/dates';
import { todayIST } from '../lib/format';
import { CATEGORY_ICON } from '../lib/types';
import { plain } from '../pages/Talk';
import { Avatar, go } from './common';
import { BannerSheet } from './FamilySections';
import { HeroSlides, heroSlides } from './HeroSlides';
import { revealIn } from '../lib/scroll';

const WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Smoothly scroll to a section of the Family page (hash routing is used for pages). */
export function jump(id: string) {
  revealIn(document.getElementById(id), { behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
}

/** A number that counts up when it first appears. */
function CountUp({ to }: { to: number }) {
  const [n, setN] = useState(reduced() ? to : 0);
  useEffect(() => {
    if (reduced()) { setN(to); return; }
    let raf = 0; const t0 = performance.now(); const dur = 1100;
    const step = (t: number) => { const k = Math.min(1, (t - t0) / dur); setN(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{n}</>;
}

/** A tile on the overview: lifts on hover, with a soft light that follows the pointer. */
function Card({ i, cls, label, onOpen, children }: { i: number; cls: string; label: string; onOpen: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className={`bento ${cls}`} style={{ '--i': i } as CSSProperties}
      onClick={(e) => { if ((e.target as HTMLElement).closest('button, a, input')) return; onOpen(); }}
      onPointerMove={(e) => { const r = ref.current!.getBoundingClientRect(); ref.current!.style.setProperty('--mx', `${e.clientX - r.left}px`); ref.current!.style.setProperty('--my', `${e.clientY - r.top}px`); }}>
      {children}
      <button type="button" className="bento-go" aria-label={label} onClick={onOpen}><span aria-hidden="true">›</span></button>
    </div>
  );
}

export function Overview({ upcoming, q, setQ }: { upcoming: Upcoming[]; q: string; setQ: (s: string) => void }) {
  const { snap, family, myId, isAdmin, fileUrl, activeConsent } = useStore();
  const pack = usePack();
  const groups = useFestivals();
  const [banner, setBanner] = useState(false);
  const root = family.root ? family.byId.get(family.root) : null;
  const rootSp = root ? (family.spouses.get(root.id) || []).map((s) => family.byId.get(s)!)[0] : null;
  const living = snap.persons.filter((p) => p.is_living).length;
  const slides = heroSlides(snap.info);
  const bannerUrl = slides.length ? fileUrl(slides[0].path) : undefined;
  const me = myId ? family.byId.get(myId) : null;
  const siteAdmin = useIsSiteAdmin();
  const host = me ? (family.blood.has(me.id) ? me.id : (family.spouses.get(me.id) || []).find((s) => family.blood.has(s))) : undefined;
  const line = host ? lineageOf(family, host) : [];
  const gens = useMemo(() => Array.from({ length: family.maxGen }, (_, i) => snap.persons.filter((p) => family.gen.get(p.id) === i + 1).length), [family, snap.persons]);
  const { border, south, motif } = useHeritage();
  const myGen = me ? family.gen.get(me.id) : undefined;
  const threads = [...snap.threads].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.last_activity_at.localeCompare(a.last_activity_at)).slice(0, 2);
  const photos = [...snap.photos].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 4);
  const info = snap.info;
  const roots = [info?.gothram, info?.sutram, info?.vedam].filter(Boolean) as string[];
  const story = info?.about ? plain(info.about) : '';
  const next = upcoming.slice(0, 2);
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <div className="ovbox">
    <section className="overview" aria-label="Family at a glance">
      {/* hero */}
      <div className={`bento b-hero${bannerUrl ? ' has-photo' : ''}`} style={{ '--i': 0 } as CSSProperties}>
        <div className="mesh" aria-hidden="true"><i /><i /><i /></div>
        <HeroSlides slides={slides} />
        <div className="b-hero-in">
          <Scripts ml={WELCOME.ml} ta={WELCOME.ta} en={WELCOME.en} className="b-welcome" />
          <h2>{WORDS[family.maxGen] || family.maxGen} generations.<br />One family.</h2>
          {root && <p className="b-sub">From {fullName(root)}{rootSp ? ` & ${fullName(rootSp)}` : ''} to all of us.</p>}
          <div className="b-stats">
            <div><b><CountUp to={snap.persons.length} /></b><span>People</span></div>
            <div><b><CountUp to={family.maxGen} /></b><span>Generations</span></div>
            <div><b><CountUp to={living} /></b><span>Living</span></div>
            <div><b><CountUp to={snap.joined.length} /></b><span>Joined</span></div>
          </div>
          <div className="b-ctas">
            <button className="pill small" onClick={() => go('tree')}>Open the tree</button>
            <button className="pill small glass" onClick={() => go('related')}>How are we related?</button>
            {isAdmin && <button className="tlink small nochev b-photo-edit" onClick={() => setBanner(true)}>{slides.length ? 'Family photos' : 'Add family photos'}</button>}
          </div>
        </div>
        {border && <div className="b-weave"><WovenBorder kind={border} /></div>}
      </div>

      {/* you */}
      {!me && siteAdmin && (
        <Card i={1} cls="b-me b-site" label="Admin" onOpen={() => go('admin')}>
          <small className="b-k">You</small>
          <div className="b-me-row"><SiteAvatar size={56} /><span><b>{SITE_NAME}</b><span>The website admin account</span></span></div>
          <p className="b-line">Not in the tree. Members see you as {SITE_NAME}.</p>
          <div className="b-row">
            <button className="pill small" onClick={() => go('admin')}>Admin</button>
            <button className="pill small ghost" onClick={() => go('chat')}>Messages</button>
          </div>
        </Card>
      )}
      {me && (
        <Card i={1} cls="b-me" label="Your profile" onOpen={() => go('p/' + me.id)}>
          <small className="b-k">You</small>
          <div className="b-me-row"><Avatar id={me.id} size={56} /><span><b>{fullName(me)}</b><span>{family.gen.get(me.id) ? `Generation ${family.gen.get(me.id)}` : ''}</span></span></div>
          {line.length > 1 && <p className="b-line">{line.map((x) => firstName(family.byId.get(x))).join(' › ')}</p>}
          <div className="b-row">
            <button className="pill small" onClick={() => go('p/' + me.id)}>{me.is_living && !activeConsent(me.id) ? 'Set up profile' : 'My profile'}</button>
            <button className="pill small ghost" onClick={() => go('tree')}>Find me in the tree</button>
          </div>
        </Card>
      )}

      {/* coming up */}
      <Card i={2} cls="b-up" label="Coming up" onOpen={() => go('calendar')}>
        <small className="b-k">Coming up</small>
        {(() => { const t = todayIST(); const d = findDay(t.toISOString().slice(0, 10)); if (!d) return null;
          const fest = d.events.find((e) => e.kind === 'festival' && shownFor(e, groups)) || d.events.find((e) => e.title === 'Amavasai' || e.title === 'Pournami' || e.title === 'Ekadasi');
          return <p className="b-today"><Lamp size={12} /> <b>Today</b> {pack.date !== 'none' ? `${regionalDate(d, pack.date)} · ` : ''}{starName(d.star)} · {tithiText(d.tithi)}{fest ? <> · <span>{fest.icon} {fest.title}</span></> : null}</p>; })()}
        {next.length ? <ul className="b-list">{next.map((u) => {
          const n = daysUntil(u.date);
          return (
            <li key={u.id + u.kind}><span className={`b-date${u.kind === 'shraddham' || u.kind === 'remembrance' ? ' rem' : ''}`}>{u.kind === 'shraddham' || u.kind === 'remembrance' ? <Lamp size={9} /> : u.kind === 'birthday' || u.kind === 'tamil-birthday' ? <Marigold /> : null}<b>{u.date.getUTCDate()}</b><small>{MON[u.date.getUTCMonth()]}</small></span>
              <span><b>{firstName(family.byId.get(u.id))}{u.with ? ` & ${firstName(family.byId.get(u.with))}` : ''}</b><small>{u.kind === 'shraddham' || u.kind === 'remembrance' ? 'Remembrance' : u.kind === 'tamil-birthday' ? 'Star birthday' : u.kind === 'milestone' ? u.title : u.kind === 'anniversary' ? `Anniversary · ${u.sub}` : 'Birthday'} · {n === 0 ? 'today' : n === 1 ? 'tomorrow' : `${DOW[u.date.getUTCDay()]}, in ${n} days`}</small></span></li>
          );
        })}</ul> : <p className="b-empty">Nothing in the next two months.</p>}
        <div className="b-row"><button className="pill small ghost" onClick={() => go('calendar')}>Open the calendar</button></div>
      </Card>

      {/* talk */}
      <Card i={3} cls="b-talk" label="Talk" onOpen={() => jump('h-talk')}>
        <small className="b-k">Talk</small>
        {threads.length ? <ul className="b-threads">{threads.map((t) => (
          <li key={t.id}><button onClick={() => go('talk/' + t.id)}><span aria-hidden="true">{CATEGORY_ICON[t.category]}</span><span><b>{t.title}</b>
            <small>{t.reply_count ? `${t.reply_count} ${t.reply_count === 1 ? 'reply' : 'replies'} · ` : ''}{ago(t.last_activity_at)}</small></span></button></li>
        ))}</ul> : <p className="b-empty">Recipes, traditions, festivals. Start the first conversation.</p>}
        <div className="b-row"><button className="pill small ghost" onClick={() => go('talk')}>Start a conversation</button></div>
      </Card>

      {/* photos */}
      <Card i={4} cls="b-photos" label="Photos" onOpen={() => jump('h-photos')}>
        <small className="b-k">Photos</small>
        {photos.length ? <div className={`b-mosaic n${photos.length}`}>{photos.map((ph) => {
          const u = fileUrl(ph.path);
          return <button key={ph.id} onClick={() => go('photos/' + ph.id)} aria-label={ph.caption || 'Photo'}>{u ? <img src={u} alt="" loading="lazy" /> : <span className="pph" />}</button>;
        })}</div> : <div className="b-polaroids" aria-hidden="true"><i /><i /><i /></div>}
        {!photos.length && <p className="b-empty">Share the first family photo.</p>}
      </Card>

      {/* story */}
      <Card i={5} cls="b-story" label="Our story" onOpen={() => jump('h-story')}>
        <small className="b-k">Our story</small>
        <p className="b-quote">{story ? story.slice(0, 170) + (story.length > 170 ? '…' : '') : `How ${FAMILY} began, and who began it.`}</p>
        <span className="b-more">{story ? 'Read the story' : isAdmin ? 'Write it' : 'Coming soon'}</span>
      </Card>

      {/* roots */}
      <Card i={6} cls="b-roots" label="Our traditions" onOpen={() => jump('h-roots')}>
        <small className="b-k">Our roots</small>
        <div className="b-om">{motif && motif !== 'kolam' ? <MotifTile motif={motif} size={84} /> : <KolamMark />}</div>
        {roots.length ? <div className="b-chips">{roots.map((r) => <span key={r}>{r}</span>)}</div> : <p className="b-empty">{south ? 'Gothram, sutram and vedam.' : `${pack.labels.gothram} and ${pack.labels.kuladeivam.toLowerCase()}.`}</p>}
        {info?.kuladeivam && <p className="b-kula">{info.kuladeivam.replace(/\s*\(.*\)/, '')}</p>}
      </Card>

      {/* generations */}
      <Card i={7} cls="b-gens" label="Every generation" onOpen={() => jump('h-generations')}>
        <small className="b-k">{WORDS[family.maxGen] || family.maxGen} generations</small>
        {south ? <Gopuram compact counts={gens} mine={myGen} /> : <Banyan compact counts={gens} mine={myGen} />}
      </Card>

      {/* find anyone */}
      <Card i={8} cls="b-find" label="Find anyone" onOpen={() => jump('everyone')}>
        <small className="b-k">Find anyone</small>
        <form onSubmit={(e) => { e.preventDefault(); jump('everyone'); }}>
          <div className="search"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or city" aria-label="Find anyone by name or city" /></div>
        </form>
        <div className="b-faces">{snap.joined.slice(0, 6).map((id) => family.byId.has(id) && <Avatar key={id} id={id} size={26} />)}</div>
        <p className="b-empty">{snap.joined.length} of {living} have joined. <button className="tlink small nochev" onClick={() => jump('h-help')}>Invite more</button></p>
      </Card>
      {banner && <BannerSheet onClose={() => setBanner(false)} />}
    </section>
    </div>
  );
}

const SECTIONS: [string, string][] = [
  ['h-story', 'Story'], ['h-roots', 'Roots'], ['h-upcoming', 'Coming up'], ['h-talk', 'Talk'], ['h-photos', 'Photos'],
  ['h-generations', 'Generations'], ['everyone', 'Find anyone'], ['h-help', 'Help & privacy'],
];

/** Sticky chips under the overview; the one for the section you're reading lights up. */
export function SectionNav() {
  const [on, setOn] = useState('');
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // reveal sections as they scroll in, and track which one you're reading
    const els = SECTIONS.map(([id]) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const all = [...document.querySelectorAll<HTMLElement>('.hsec')];
    const reveal = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); reveal.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    all.forEach((el) => reveal.observe(el));
    const spy = new IntersectionObserver((es) => {
      const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setOn(vis.target.id);
    }, { rootMargin: '-30% 0px -60% 0px' });
    els.forEach((el) => spy.observe(el));
    return () => { reveal.disconnect(); spy.disconnect(); };
  }, []);
  useEffect(() => { // keep the lit chip in view, scrolling only the chip row (never the page)
    const b = bar.current; const el = b?.querySelector<HTMLElement>('.on'); if (!b || !el) return;
    b.scrollTo({ left: el.offsetLeft - b.clientWidth / 2 + el.clientWidth / 2, behavior: reduced() ? 'auto' : 'smooth' });
  }, [on]);
  return (
    <nav className="secnav" aria-label="On this page" ref={bar}>
      {SECTIONS.map(([id, label]) => <button key={id} className={on === id ? 'on' : ''} aria-current={on === id ? 'true' : undefined} onClick={() => jump(id)}>{label}</button>)}
    </nav>
  );
}
