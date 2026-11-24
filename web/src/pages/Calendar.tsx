import type { CoupleStatus } from '../lib/api';
import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { friendly } from '../lib/api';
import { LUNAR, dayKey, monthDays, shownFor, starName, type CalDay, type CalEvent } from '../lib/calendar';
import { useFestivals, usePack } from '../lib/community';
import { REGIONAL_NAME, regionalCell, regionalDate, regionalSpan, tithiText } from '../lib/community/dates';
import { familyDays } from '../lib/familyDays';
import { firstName, fullName, todayIST, toInputDate, fromInputDate } from '../lib/format';
import { Avatar, Sheet, go } from '../components/common';
import { HelpTip } from '../components/Help';
import { revealIn } from '../lib/scroll';

const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
type Layer = 'family' | 'festival' | 'monthly' | 'tamil';
const LAYERS: [Layer, string][] = [['family', '👨‍👩‍👧 Family'], ['festival', '🎉 Festivals'], ['monthly', '🌙 Monthly days'], ['tamil', '☀️ Months']];
const layerOf = (e: CalEvent): Layer => (e.kind === 'festival' ? 'festival' : e.kind === 'observance' ? 'monthly' : e.kind === 'month' ? 'tamil' : 'family');
const FAMILY_ORDER = ['birthday', 'tamil-birthday', 'anniversary', 'remembrance', 'shraddham'];

/** Parses #/calendar/2026-11 or #/calendar/2026-11-17. */
export function Calendar({ at }: { at?: string }) {
  const { snap, family, fieldsOf, activeConsent, canManage, myId } = useStore();
  const pack = usePack();
  const groups = useFestivals();
  const style = pack.date;
  // Tamil month starts are shown only with the Tamil calendar; festivals only for the groups this person keeps
  const visible = (e: CalEvent) => (e.kind === 'month' ? style === 'tamil' : shownFor(e, groups));
  const today = todayIST();
  const todayKey = dayKey(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const [y, m] = at && /^\d{4}-\d{2}/.test(at) ? [+at.slice(0, 4), +at.slice(5, 7) - 1] : [today.getUTCFullYear(), today.getUTCMonth()];
  const [sel, setSel] = useState<string>(at && at.length === 10 ? at : (y === today.getUTCFullYear() && m === today.getUTCMonth() ? todayKey : dayKey(y, m, 1)));
  const [layers, setLayers] = useState<Set<Layer>>(new Set(['family', 'festival', 'monthly']));
  const [dir, setDir] = useState<'l' | 'r' | ''>('');
  const [wedding, setWedding] = useState<{ a: string; b: string } | null>(null);

  const days = useMemo(() => monthDays(y, m), [y, m]);
  const fam = useMemo(() => familyDays(y, family, fieldsOf, snap.partners, (id) => !!activeConsent(id) || canManage(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [y, family, snap.fields, snap.partners]);
  const eventsOf = (d: CalDay) => [...(fam.get(d.key) || []).sort((a, b) => FAMILY_ORDER.indexOf(a.kind) - FAMILY_ORDER.indexOf(b.kind)), ...d.events.filter(visible)]
    .filter((e) => layers.has(layerOf(e)));
  const selDay = days.find((d) => d.key === sel) || days[0];

  const nav = (delta: number) => {
    const t = new Date(Date.UTC(y, m + delta, 1));
    setDir(delta > 0 ? 'r' : 'l');
    go(`calendar/${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`);
  };
  const lead = days[0].date.getUTCDay();
  const tamilSpan = regionalSpan(days, style);
  const agenda = days.map((d) => ({ d, es: eventsOf(d).filter((e) => e.kind !== 'observance' || e.title === 'Amavasai' || e.title === 'Pournami') })).filter((x) => x.es.length);

  // a nudge for my own wedding date, if missing
  const myMarriage = myId ? snap.partners.find((p) => p.kind === 'married' && (p.person_a === myId || p.person_b === myId) && !p.start_date) : undefined;

  return (
    <div className="wrap calpage">
      <section className="tree-hero">
        <h2 className="headline">Calendar.<HelpTip sections={['calendar']} /></h2>
        <p className="subhead">Family birthdays, remembrance and anniversaries, with {REGIONAL_NAME[style] ? REGIONAL_NAME[style].toLowerCase() + ', ' : ''}the festivals you keep, and monthly days. Choose your traditions in Theme.</p>
      </section>

      <div className="calbar">
        <div className="calnav">
          <button className="calarrow" aria-label="Previous month" onClick={() => nav(-1)}>‹</button>
          <div className="caltitle"><b>{LONG[m]} {y}</b><span>{tamilSpan}</span></div>
          <button className="calarrow" aria-label="Next month" onClick={() => nav(1)}>›</button>
          {(y !== today.getUTCFullYear() || m !== today.getUTCMonth() || sel !== todayKey) &&
            <button className="pill small ghost" onClick={() => { setSel(todayKey); go('calendar'); }}>Today</button>}
        </div>
        <div className="chips callayers" role="group" aria-label="Show">
          {LAYERS.map(([k, label]) => (
            <button key={k} className={`chip${layers.has(k) ? ' on' : ''}`} aria-pressed={layers.has(k)}
              onClick={() => setLayers((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; })}>{label}</button>
          ))}
        </div>
      </div>

      <div className="callayout">
        <div className={`calgrid-wrap slide-${dir}`} key={`${y}-${m}`}>
          <div className="calgrid" role="group" aria-label={`${LONG[m]} ${y}`} onKeyDown={(e) => {
            const step = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[e.key];
            const idx = days.findIndex((d) => d.key === sel);
            if (!step || idx < 0) return;
            const next = days[Math.min(days.length - 1, Math.max(0, idx + step))];
            const grid = e.currentTarget; e.preventDefault(); setSel(next.key);
            requestAnimationFrame(() => grid.querySelector<HTMLElement>(`[data-day="${next.key}"]`)?.focus());
          }}>
            {DOW.map((d) => <div key={d} className="caldow" aria-hidden="true">{d}</div>)}
            {Array.from({ length: lead }, (_, i) => <div key={'x' + i} className="calcell empty" />)}
            {days.map((d) => {
              const es = eventsOf(d);
              const famEs = es.filter((e) => layerOf(e) === 'family');
              const moon = style === 'amanta' || style === 'purnimanta' ? undefined : d.events.find((e) => e.title === 'Amavasai' || e.title === 'Pournami');
              const major = es.find((e) => e.major && e.kind === 'festival');
              return (
                <button key={d.key} data-day={d.key} aria-pressed={sel === d.key} tabIndex={sel === d.key ? 0 : -1}
                  className={`calcell${d.key === todayKey ? ' today' : ''}${sel === d.key ? ' sel' : ''}${major ? ' fest' : ''}${d.date.getUTCDay() === 0 ? ' sun' : ''}`}
                  onClick={() => setSel(d.key)} aria-label={`${d.d} ${LONG[m]}${style !== 'none' ? ', ' + regionalDate(d, style) : ''}${es.length ? `, ${es.map((e) => e.title).join(', ')}` : ''}`}>
                  <span className="cnum">{d.d}</span>
                  <span className="ctamil">{regionalCell(d, style)}</span>
                  {moon && layers.has('monthly') && <span className="cmoon" title={moon.title}>{moon.icon}</span>}
                  <span className="cevents">
                    {es.filter((e) => e.kind !== 'observance' && e.kind !== 'month').slice(0, 3).map((e, i) => (
                      <span key={i} className={`cev k-${e.kind}`}>{e.icon} <span>{e.kind === 'festival' ? e.title : e.ids ? e.ids.map((x) => firstName(family.byId.get(x))).join(' & ') : e.title}</span></span>
                    ))}
                  </span>
                  <span className="cdots" aria-hidden="true">{famEs.slice(0, 4).map((e, i) => <i key={i} className={`k-${e.kind}`} />)}{major && <i className="k-festival" />}</span>
                </button>
              );
            })}
          </div>
          <p className="uphint">Dates, stars, tithis and festivals are calculated for India (Lahiri; Islamic days from the Umm al-Qura calendar). They may differ by a day from your local panchang or moon sighting; please check before an important ceremony.</p>
        </div>

        {selDay && (
          <aside className="calday" aria-live="polite">
            <p className="b-k">{DOW_LONG[selDay.date.getUTCDay()]}</p>
            <h3>{selDay.d} {LONG[selDay.m]} {selDay.y}</h3>
            <p className="caltam">{style !== 'none' ? regionalDate(selDay, style) : ''}{style === 'tamil' && selDay.lunar >= 0 ? ` · ${LUNAR[selDay.lunar]}${selDay.adhika ? ' (adhika)' : ''} masam` : ''}</p>
            <div className="calpanch">
              <div><small>Nakshatram</small><b>{starName(selDay.star)}</b>{selDay.stars.length > 1 && <span>then {selDay.stars.slice(1).map(starName).join(', ')}</span>}</div>
              <div><small>Tithi</small><b>{tithiText(selDay.tithi)}</b>{selDay.tithis.length > 1 && <span>then {selDay.tithis.slice(1).map(tithiText).join(', ')}</span>}</div>
            </div>
            {(() => {
              const es = [...(fam.get(selDay.key) || []), ...selDay.events.filter(visible)];
              if (!es.length) return <p className="emptyhint">Nothing special on this day.</p>;
              return (
                <ul className="caldaylist">{es.map((e, i) => (
                  <li key={i} className={`k-${e.kind}`}>
                    <span className="cdi" aria-hidden="true">{e.icon}</span>
                    <span className="cdt"><b>{e.title}</b>{e.sub && <small>{e.sub}</small>}</span>
                    {e.ids && <span className="cdp">{e.ids.map((id) => <button key={id} onClick={() => go('p/' + id)} aria-label={fullName(family.byId.get(id))}><Avatar id={id} size={26} /></button>)}</span>}
                  </li>
                ))}</ul>
              );
            })()}
            {myMarriage && (
              <div className="nudge small"><p>Add your wedding date and your anniversary will show here for the family.</p>
                <button className="pill small" onClick={() => setWedding({ a: myMarriage.person_a, b: myMarriage.person_b })}>Add wedding date</button></div>
            )}
          </aside>
        )}
      </div>

      <section className="section">
        <div className="section-head"><h3 className="sec-title">This month. <span>{agenda.length ? `${agenda.length} days to remember.` : 'A quiet month.'}</span></h3></div>
        <div className="agenda">{agenda.map(({ d, es }) => (
          <button key={d.key} className={`agday${d.key === todayKey ? ' today' : ''}`} onClick={() => { setSel(d.key); revealIn(document.querySelector('.calday'), { block: 'nearest' }); }}>
            <span className="agdate"><b>{d.d}</b><small>{DOW[d.date.getUTCDay()]}</small></span>
            <span className="agitems">{es.map((e, i) => <span key={i} className={`agi k-${e.kind}`}>{e.icon} <b>{e.title}</b>{e.sub ? <small> · {e.sub}</small> : null}</span>)}
              {style !== 'none' && <small className="agtam">{regionalDate(d, style)}</small>}</span>
          </button>
        ))}</div>
      </section>

      {wedding && <WeddingSheet a={wedding.a} b={wedding.b} onClose={() => setWedding(null)} />}
    </div>
  );
}

/** Record when and where a couple married (either partner, or whoever looks after them). */
export function WeddingSheet({ a, b, onClose }: { a: string; b: string; onClose: () => void }) {
  const { api, snap, family, reload, toast } = useStore();
  const pt = snap.partners.find((p) => (p.person_a === a && p.person_b === b) || (p.person_a === b && p.person_b === a));
  const was: CoupleStatus = pt?.kind === 'engaged' ? 'engaged' : 'married';
  const [status, setStatus] = useState<CoupleStatus>(was);
  const ended = false;
  const [date, setDate] = useState(toInputDate(pt?.start_date || undefined));
  const [place, setPlace] = useState(pt?.place || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function save(clear = false) {
    const d = clear ? null : fromInputDate(date) || null;
    const statusChanged = status !== was;
    if (!clear && !d && !statusChanged && !ended) { setErr('Please choose the date.'); return; }
    setBusy(true); setErr('');
    try {
      await api.setCouple(a, b, status, d, clear ? null : place.trim() || null); await reload();
      toast(clear ? 'Date removed.' : ended ? `Saved: ${status}.` : status === 'engaged' ? 'Saved: they’re engaged.' : d ? 'Wedding date saved. It’s on the family calendar.' : 'Saved: they’re married. Add the wedding date when you have it.');
      onClose();
    }
    catch (e) { setErr(friendly(e)); setBusy(false); }
  }
  return (
    <Sheet title={ended ? 'Couple' : status === 'engaged' ? 'Engagement' : 'Wedding date'} sub={`${fullName(family.byId.get(a))} & ${fullName(family.byId.get(b))}. ${ended ? 'Their wedding date stays on record; the anniversary no longer appears on the calendar.' : status === 'engaged' ? 'When they marry, switch this to Married and add the wedding date.' : 'Your anniversary appears on the family calendar.'}`} onClose={onClose}
      footer={<>
        <span className={`status${err ? ' err' : ''}`}>{busy ? 'Saving…' : err}</span>
        {pt?.start_date && !ended && <button className="btn danger" disabled={busy} onClick={() => save(true)}>Remove</button>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={() => save()}>Save</button>
      </>}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="full"><label>Status</label><div className="seg" role="group" aria-label="Status">
          {(['married', 'engaged'] as const).map((k) => <button type="button" key={k} aria-pressed={status === k} onClick={() => { if (k !== status) { setStatus(k); if (k === was) { setDate(toInputDate(pt?.start_date || undefined)); setPlace(pt?.place || ''); } else if (k === 'married' || k === 'engaged') { setDate(''); setPlace(''); } } }}>{k[0].toUpperCase() + k.slice(1)}</button>)}
        </div></div>
        {!ended && <><div><label htmlFor="wd-date">{status === 'engaged' ? 'Engagement date' : 'Wedding date'}</label><input id="wd-date" type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} /></div>
        <div><label htmlFor="wd-place">Place</label><input id="wd-place" value={place} maxLength={120} onChange={(e) => setPlace(e.target.value)} placeholder="Guruvayur" /></div></>}
      </form>
    </Sheet>
  );
}
