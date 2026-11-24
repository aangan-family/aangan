import { useEffect, useMemo, useState } from 'react';
import { ADMIN } from '../lib/site';
import { useStore } from '../lib/store';
import { helpFor, searchHelp, SECTION_LABEL, type HelpSection } from '../lib/help';
import { inline } from '../lib/richtext';
import { revealIn } from '../lib/scroll';

const ORDER: HelpSection[] = ['start', 'profile', 'corrections', 'privacy', 'family', 'tree', 'related', 'calendar', 'talk', 'photos', 'invite', 'signin', 'phone', 'stewards', 'admin'];

export function Help({ section }: { section?: string }) {
  const { snap } = useStore();
  const [q, setQ] = useState('');
  const all = useMemo(() => helpFor(snap.me?.role), [snap.me?.role]);
  const found = searchHelp(all, q);
  const groups = ORDER.map((s) => [s, found.filter((h) => h.section === s)] as const).filter(([, l]) => l.length);
  // the app scrolls every new page to the top right after this runs, so reveal the section a moment later
  const show = (s?: string) => { if (s) window.setTimeout(() => revealIn(document.getElementById(`help-${s}`)), 80); };
  useEffect(() => { show(section); }, [section]);
  return (
    <div className="wrap">
      <section className="hero-r reveal" style={{ paddingTop: 60 }}>
        <p className="eyebrow">Help</p>
        <h2 className="headline">How can we help?</h2>
        <p className="subhead">Short answers to the questions the family asks most. Look for the <span className="helpbtn inline" aria-hidden="true">?</span> next to each page’s title for help right where you are.</p>
        <input className="helpsearch" type="search" placeholder="Search, e.g. “change my name”, “photo”, “wedding”" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search help" />
      </section>
      {!q && <nav className="chips helpnav" aria-label="Help topics">{groups.map(([s]) => <a key={s} className="chip" href={`#/help/${s}`} onClick={() => { if (section === s) show(s); }}>{SECTION_LABEL[s]}</a>)}</nav>}
      {groups.map(([s, items]) => (
        <section className="section helpgroup" id={`help-${s}`} key={s}>
          <div className="section-head"><h3 className="sec-title">{SECTION_LABEL[s]}.</h3></div>
          <div className="faq">{items.map((h) => (
            <details key={h.id} open={!!q || items.length === 1}>
              <summary>{h.q}</summary>
              <p>{inline(h.a)}</p>
            </details>
          ))}</div>
        </section>
      ))}
      {!groups.length && <p className="emptyhint" style={{ textAlign: 'center' }}>No answers for “{q}”. Try other words, or ask in Talk.</p>}
      <p className="emptyhint" style={{ textAlign: 'center', margin: '40px 0' }}>Still stuck? Ask in <a href="#/talk">Talk</a>, {ADMIN.phone ? <>, or call or WhatsApp {ADMIN.short} on <a href={`tel:${ADMIN.tel}`}>{ADMIN.phone}</a></> : null}.</p>
    </div>
  );
}
