import { isEngaged } from '../lib/family';
import { useMemo, useState } from 'react';
import { NotificationsAsk } from '../components/Notifications';
import { useStore } from '../lib/store';
import { fullName, lifespan, ago, firstName } from '../lib/format';
import { upcomingAnniversaries, upcomingFor } from '../lib/traditions';
import { Avatar, go } from '../components/common';
import { BranchProgress, InviteNudge } from '../components/BringFamily';
import { ComingUp, InviteFamily, PrivacyLevels, Roots, Story, WhatYouCanDo } from '../components/FamilySections';
import { Overview, SectionNav } from '../components/Overview';
import { PhotoGrid } from './Photos';
import { CATEGORY_ICON } from '../lib/types';
import { plain } from './Talk';
import { HelpTip } from '../components/Help';
import { revealIn } from '../lib/scroll';


export function Tile({ id, line }: { id: string; line?: string }) {
  const { family, fieldsOf } = useStore();
  const p = family.byId.get(id)!;
  const f = fieldsOf(id);
  const ps = (family.parents.get(id) || []).map((x) => family.byId.get(x)?.given_name).filter(Boolean).join(' & ');
  const sp = (family.spouses.get(id) || [])[0];
  const rel = ps ? `${p.gender === 'f' ? 'Daughter' : 'Son'} of ${ps}` : sp ? `${isEngaged(family, p.id, sp) ? (p.gender === 'f' ? 'Fiancée' : 'Fiancé') : p.gender === 'f' ? 'Wife' : 'Husband'} of ${family.byId.get(sp)?.given_name}` : '';
  const sub = line || [f.work?.value, f.city?.value].filter(Boolean).join(' · ') || rel || lifespan(p);
  return (
    <button className={`tile${p.is_living ? '' : ' late'}`} onClick={() => go('p/' + id)}>
      <Avatar id={id} size={72} />
      <span className="t"><b>{fullName(p)}</b><span>{sub}</span></span>
    </button>
  );
}

export function Home() {
  const { snap, family, fieldsOf, canManage, activeConsent } = useStore();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'living' | 'joined' | 'nodob'>('all');
  const [gen, setGen] = useState(0);
  /** groups opened past their first 12 people */
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const joined = useMemo(() => new Set(snap.joined), [snap.joined]);
  const ids = snap.persons.map((p) => p.id);
  const upcoming = useMemo(() => [...ids.flatMap((id) => upcomingFor(family, id, fieldsOf(id))), ...upcomingAnniversaries(family, snap.partners, (id) => !!activeConsent(id) || canManage(id))].sort((a, b) => a.date.getTime() - b.date.getTime()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [family, snap.fields, snap.partners]);
  const updated = snap.fields.filter((f) => f.updated_at && f.updated_by)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
    .reduce<string[]>((acc, f) => (acc.includes(f.person_id) || acc.length >= 12 ? acc : [...acc, f.person_id]), []);
  const lastUpdate = (id: string) => snap.fields.filter((f) => f.person_id === id && f.updated_at).map((f) => f.updated_at!).sort().pop();

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const ok = (id: string) => {
    const p = family.byId.get(id)!; const f = fieldsOf(id);
    if (words.length && !words.every((w) => `${fullName(p)} ${p.birth_surname} ${f.known_as?.value || ''} ${f.city?.value || ''}`.toLowerCase().includes(w))) return false;
    if (gen && family.gen.get(id) !== gen) return false;
    if (filter === 'living' && !p.is_living) return false;
    if (filter === 'joined' && !joined.has(id)) return false;
    if (filter === 'nodob' && (f.birth_date || !p.is_living)) return false;
    return true;
  };
  const byGenBirth = (a: string, b: string) => (family.gen.get(a)! - family.gen.get(b)!) || (family.byId.get(a)!.sort_key || '9').localeCompare(family.byId.get(b)!.sort_key || '9');
  const groups: { t: string; s: string; ids: string[] }[] = [
    { t: 'Elders', s: 'The founders of the family', ids: ids.filter((id) => family.gen.has(id) && !family.branch.has(id)) },
    ...((family.branchRoot && family.kids.get(family.branchRoot)) || []).map((c) => {
      const p = family.byId.get(c)!; const sp = (family.spouses.get(c) || []).map((s) => family.byId.get(s)!.given_name).join(' & ');
      return { t: `${p.given_name}’s family`, s: `${p.given_name}${sp ? ' & ' + sp : ''}`, ids: ids.filter((id) => family.branch.get(id) === c) };
    }),
    ...family.sides.map((sd) => {
      const t = family.byId.get(sd.through)!;
      const partner = (family.spouses.get(sd.through) || []).find((x) => family.blood.has(x));
      return { t: `${firstName(t)}’s side`, s: `Family of ${fullName(t)}${partner ? `, married to ${firstName(family.byId.get(partner))}` : ''}`, ids: sd.members };
    }),
    { t: 'Other relatives', s: 'Not yet connected to the main tree', ids: family.others },
  ];
  let shown = 0;
  // Home lists people only once someone picks a generation, searches or filters (the full list lives on Family tree),
  // and each group shows its first 12 until "Show all".
  const listing = !!(gen || q.trim() || filter !== 'all');
  const FIRST = 12;
  const groupEls = groups.map((g) => {
    const list = g.ids.filter(ok).sort(byGenBirth); if (!list.length) return null; shown += list.length;
    const all = openGroups[g.t] || list.length <= FIRST + 2;
    return (
      <div key={g.t}>
        <div className="group-h"><h4>{g.t}</h4><span>{g.s} · {list.length}</span></div>
        <div className="grid">{(all ? list : list.slice(0, FIRST)).map((id) => <Tile key={id} id={id} />)}</div>
        {!all && <button className="pill ghost showall" onClick={() => setOpenGroups({ ...openGroups, [g.t]: true })}>Show all {list.length}</button>}
      </div>
    );
  });
  const missing = ids.filter((id) => family.byId.get(id)!.is_living && !fieldsOf(id).birth_date && canManage(id));

  return (
    <div className="wrap home">
      <NotificationsAsk />
      <Overview upcoming={upcoming} q={q} setQ={setQ} />
      <InviteNudge />

      <SectionNav />
      <p className="helpline">New here? <a href="#/help/start">Start with the quick help</a>, or tap any <span className="helpbtn inline" aria-hidden="true">?</span> for tips on that page.<HelpTip sections={['start', 'family']} label="Getting started" /></p>

      <div id="h-story" className="hsec"><Story /></div>
      <div id="h-roots" className="hsec"><Roots /></div>
      <div id="h-upcoming" className="hsec"><ComingUp items={upcoming} /></div>

      <section className="section hsec" id="h-talk">
        <div className="section-head"><h3 className="sec-title">Talk. <span>{snap.threads.length ? 'Latest conversations.' : 'Traditions, recipes, festivals.'}</span></h3>
          <button className="tlink small" onClick={() => go('talk')}>{snap.threads.length ? 'See all' : 'Start one'}</button></div>
        {snap.threads.length ? (
          <div className="threadlist">{[...snap.threads].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.last_activity_at.localeCompare(a.last_activity_at)).slice(0, 4).map((t) => (
            <button key={t.id} className="tcard" onClick={() => go('talk/' + t.id)}>
              <span className="ticon" aria-hidden="true">{CATEGORY_ICON[t.category]}</span>
              <span className="tmain"><b>{t.pinned && <em className="pin">Pinned</em>}{t.title}</b><span className="tsnip">{plain(t.body).slice(0, 110)}</span>
                <small>{t.reply_count ? `${t.reply_count} ${t.reply_count === 1 ? 'reply' : 'replies'} · ` : ''}{ago(t.last_activity_at)}</small></span>
            </button>
          ))}</div>
        ) : (
          <div className="nudge"><p>Ask the family how to do Avani Avittam, share Paati’s sambar recipe, or plan the next Sathabhishekam.</p>
            <button className="pill small" onClick={() => go('talk')}>Start a conversation</button></div>
        )}
      </section>

      <section className="section hsec" id="h-photos">
        <div className="section-head"><h3 className="sec-title">Photos. <span>{snap.photos.length ? 'Latest from the family.' : 'Share the first one.'}</span></h3><button className="tlink small" onClick={() => go('photos')}>{snap.photos.length ? 'See all' : 'Share a photo'}</button></div>
        {snap.photos.length > 0 ? <PhotoGrid photos={[...snap.photos].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6)} />
          : <div className="nudge"><p>Old black-and-white pictures, weddings, festivals: share them and tag who’s in them.</p><button className="pill small" onClick={() => go('photos')}>Share a photo</button></div>}
      </section>

      {updated.length > 0 && (
        <section className="section hsec">
          <div className="section-head"><h3 className="sec-title">Recently updated. <span>Fresh from the family.</span></h3></div>
          <div className="scroller">{updated.map((id) => <Tile key={id} id={id} line={`Updated ${ago(lastUpdate(id))}`} />)}</div>
        </section>
      )}

      <section className="section hsec" id="h-generations">
        <div className="section-head"><h3 className="sec-title">Every generation. <span>At a glance.</span></h3></div>
        <div className="gens">
          {Array.from({ length: family.maxGen }, (_, i) => i + 1).map((g) => {
            const all = ids.filter((id) => family.gen.get(id) === g);
            const faces = all.filter((id) => family.blood.has(id)).slice(0, 4);
            return (
              <button key={g} className={`gen${gen === g ? ' on' : ''}`} aria-pressed={gen === g}
                onClick={() => { setGen(gen === g ? 0 : g); revealIn(document.getElementById('everyone')); }}>
                <small>Generation</small><b>{g}</b>
                <div className="stack">{faces.map((id) => <Avatar key={id} id={id} size={26} />)}</div>
                <small style={{ marginTop: 10 }}>{all.length} {all.length === 1 ? 'person' : 'people'}</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="section hsec" id="everyone">
        <div className="section-head"><h3 className="sec-title">
          {!listing ? <>Find anyone. <span>Pick a generation or search.</span></> : gen ? <>Generation {gen}. <span>{shown} {shown === 1 ? 'person' : 'people'}.</span></> : shown === ids.length ? <>Everyone. <span>All {shown} of them.</span></> : <>Everyone. <span>{shown} {shown === 1 ? 'match' : 'matches'}.</span></>}
        </h3></div>
        <div className="toolbar">
          <div className="search"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or city" aria-label="Search by name or city" /></div>
          <div className="seg" role="group" aria-label="Show">
            {([['all', 'All'], ['living', 'Living'], ['joined', 'Joined'], ['nodob', 'No birth date']] as const).map(([v, l]) => (
              <button key={v} aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>
            ))}
          </div>
        </div>
        {!listing ? (
          <div className="nudge findnudge"><p>Tap a generation above, or type a name or a town, and they’ll appear here. To browse all {ids.length} people branch by branch, open the family tree.</p>
            <button className="pill small" onClick={() => go('tree')}>Open the family tree</button></div>
        ) : shown ? groupEls : <p className="emptyhint" style={{ textAlign: 'center', padding: '40px 0' }}>No one matches.</p>}
      </section>

      {missing.length > 0 && (
        <section className="section">
          <div className="gap-card">
            <h3 className="sec-title" style={{ fontSize: 28 }}>Help fill the gaps.</h3>
            <p>{missing.length} {missing.length === 1 ? 'profile you look after has' : 'profiles you look after have'} no birth date yet.</p>
            <div className="chips">{missing.map((id) => <button key={id} className="chip" onClick={() => go('p/' + id)}>{fullName(family.byId.get(id))}</button>)}</div>
          </div>
        </section>
      )}

      <div id="h-help" className="hsec">
        <BranchProgress />
        <InviteFamily />
        <WhatYouCanDo />
        <PrivacyLevels />
      </div>
    </div>
  );
}
