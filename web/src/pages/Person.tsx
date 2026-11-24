import { useState } from 'react';
import { useStore } from '../lib/store';
import { hostOf, isEngaged, kindOf, lineageOf, siblingsOf } from '../lib/family';
import { ageFrom, ago, firstName, fmtDate, fmtDay, fullName, yearOf } from '../lib/format';
import { nextShraddham, nextTamilBirthday, unpackStar, unpackTithi } from '../lib/panchang';
import { kinTerm, usePack } from '../lib/community';
import { TRADITION_NOTE, starLabel, tithiLabel, tradition } from '../lib/traditions';
import { MARITAL_STATUS, MILESTONES, VISIBILITY_LABEL, type FieldName } from '../lib/types';
import { Avatar, go } from '../components/common';
import { ElderSheet, isElder } from '../components/BringFamily';
import { AddRelativeSheet, ConsentSheet, DeletePersonSheet, EditPersonSheet, EditSheet, InviteSheet, TrashIcon } from '../components/Sheets';
import { Tile } from './Home';
import { PhotoGrid } from './Photos';
import { WeddingSheet } from './Calendar';
import { PrivacyLevels } from '../components/FamilySections';
import { SignOutIcon, signOut } from '../components/Sidebar';
import { HelpTip, SuggestCorrection } from '../components/Help';
import { ProfileLog } from '../components/ProfileLog';

export function Person({ id }: { id: string }) {
  const s = useStore();
  const { amMinor, family, fieldsOf, canManage, canEditTree, isAdmin, isSteward, myId, isMinor, activeConsent, snap } = s;
  const [sheet, setSheet] = useState<'edit' | 'suggest' | 'consent' | 'invite' | 'elder' | 'add' | 'tree' | 'delete' | null>(null);
  const [wed, setWed] = useState<string | null>(null);
  const p = family.byId.get(id);
  if (!p) return <div className="wrap"><section className="hero-p"><h2 className="headline">Not found.</h2><p className="subhead">This person isn’t in the tree.</p></section></div>;

  const f = fieldsOf(id);
  const first = firstName(p);
  const manage = canManage(id);
  const consent = activeConsent(id);
  const joined = snap.joined.includes(id);
  const relation: 'self' | 'guardian' | null = id === myId ? 'self' : isMinor(id) && (family.parents.get(id) || []).includes(myId || '') ? 'guardian' : null;
  const kidSelf = id === myId && amMinor;   // under 18, on their own page: suggest changes, a parent consents (0034)
  const needsConsent = p.is_living && relation !== null && !consent && !kidSelf;
  const branch = family.branch.get(id);
  const through = family.via.get(id);
  const throughP = through ? family.byId.get(through)! : null;
  const throughPartner = through ? (family.spouses.get(through) || []).find((x) => family.blood.has(x)) : undefined;
  const genNo = family.gen.get(id);
  const eyebrow = [genNo !== undefined && genNo >= 1 ? `Generation ${genNo}` : '',
    branch && branch !== id ? `${family.byId.get(branch)!.given_name}’s family` : '',
    throughP ? `${firstName(throughP)}’s side` : ''].filter(Boolean).join(' · ');
  const pack = usePack();
  const term = myId && myId !== id ? kinTerm(family, id, myId, pack) : null;
  const aka = [f.known_as ? `Known as ${f.known_as.value}` : '', p.birth_surname && p.birth_surname !== p.surname ? `Born ${first} ${p.birth_surname}` : ''].filter(Boolean).join(' · ');
  const age = ageFrom(f.birth_date?.value, p.birth_year, p.is_living);
  // joined the tree through a fiancé(e) in the family, not (yet) by marriage
  const engagedTo = !family.blood.has(id) ? (() => { const h = hostOf(family, id); return h && isEngaged(family, id, h) ? h : null; })() : null;
  const chip = (k: FieldName) => (manage && f[k] ? <em className="vischip">{VISIBILITY_LABEL[f[k]!.visibility]}</em> : null);

  const facts: { k: string; v: React.ReactNode; sub?: string; field?: FieldName }[] = [];
  const born = f.birth_date ? fmtDate(f.birth_date.value) : p.birth_year ? String(p.birth_year) : '';
  if (born || f.birth_place) facts.push({ k: 'Born', v: born || f.birth_place!.value, sub: [born ? f.birth_place?.value : '', age !== null ? `Age ${age}` : ''].filter(Boolean).join(' · '), field: f.birth_date ? 'birth_date' : undefined });
  if (!p.is_living) facts.push({ k: 'Passed away', v: fmtDate(p.death_date) || 'Date not recorded', sub: p.death_place || '' });
  {
    // relationship status: their own choice wins; otherwise a partner recorded in the tree
    const sp = (family.spouses.get(id) || []).find((s) => ['married', 'engaged'].includes(kindOf(family, id, s)) && family.byId.get(s)?.is_living !== false);
    if (f.marital_status) facts.push({ k: 'Status', v: MARITAL_STATUS[f.marital_status.value] || f.marital_status.value, field: 'marital_status',
      sub: sp && ['married', 'engaged'].includes(f.marital_status.value) ? `${f.marital_status.value === 'engaged' ? 'to' : 'with'} ${firstName(family.byId.get(sp))}` : f.marital_status.value === 'engaged' && f.engaged_to?.value ? `to ${f.engaged_to.value}` : '' });
    else if (sp && p.is_living) facts.push({ k: 'Status', v: kindOf(family, id, sp) === 'engaged' ? 'Engaged' : 'Married', sub: `${kindOf(family, id, sp) === 'engaged' ? 'to' : 'with'} ${firstName(family.byId.get(sp))}` });
  }
  if (f.city) facts.push({ k: 'Lives in', v: f.city.value, field: 'city' });
  if (f.work || f.organisation) facts.push({ k: f.work ? 'Today' : 'Organisation', v: (f.work || f.organisation)!.value, sub: f.work ? f.organisation?.value : '', field: f.work ? 'work' : 'organisation' });
  if (f.interests) facts.push({ k: 'Interests', v: f.interests.value, field: 'interests' });
  if (f.phone) { const tel = f.phone.value.replace(/[^+\d]/g, ''); facts.push({ k: 'Phone', v: tel ? <a href={`tel:${tel}`}>{f.phone.value}</a> : f.phone.value, field: 'phone' }); }
  if (f.email) facts.push({ k: 'Email', v: /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(f.email.value) ? <a href={`mailto:${f.email.value}`}>{f.email.value}</a> : f.email.value, field: 'email' });
  if (f.address) facts.push({ k: 'Address', v: f.address.value, field: 'address' });

  const groups: [string, string[]][] = [];
  const ps = family.parents.get(id) || []; if (ps.length) groups.push(['Parents', ps]);
  const sps = family.spouses.get(id) || []; if (sps.length) groups.push([sps.length > 1 ? 'Spouses' : isEngaged(family, id, sps[0]) ? (p.gender === 'f' ? 'Fiancé' : p.gender === 'm' ? 'Fiancée' : 'Fiancé(e)') : p.gender === 'f' ? 'Husband' : p.gender === 'm' ? 'Wife' : 'Spouse', sps]);
  const ch = family.children.get(id) || []; if (ch.length) groups.push(['Children', ch]);
  const sb = siblingsOf(family, id); if (sb.length) groups.push(['Brothers & sisters', sb]);

  const lastEdit = Object.values(f).map((x) => x!.updated_at || '').sort().pop();
  const hiddenNote = p.is_living && !consent && !manage
    ? joined ? `${first} hasn’t shared any details yet.` : `${first} hasn’t joined the site yet, so only their name and relationships are shown.`
    : '';

  return (
    <div className="wrap">
      <section className="hero-p reveal">
        <Avatar id={id} size={168} />
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className="headline">{fullName(p)}<HelpTip sections={id === myId ? ['profile', 'corrections'] : ['corrections', 'profile']} label={id === myId ? 'Your profile' : 'Profiles and corrections'} /></h2>
        {aka && <div className="aka">{aka}</div>}
        <div className="badges">
          {!p.is_living && <span className="badge late">In loving memory</span>}
          <span className="badge">{family.blood.has(id) ? 'Born into the family' : engagedTo ? `Engaged to ${firstName(family.byId.get(engagedTo))}` : through ? 'Related by marriage' : 'Married into the family'}</span>
          {p.is_living && <span className="badge">{joined ? 'On the site' : snap.invited.includes(id) ? 'Invitation sent' : 'Not joined yet'}</span>}
          {f.photo && manage && <span className="badge">Photo: {VISIBILITY_LABEL[f.photo.visibility]}{consent && !consent.show_photo ? ' (hidden by consent)' : ''}</span>}
        </div>
        <div className="ctas">
          {needsConsent && <button className="pill" onClick={() => setSheet('consent')}>{relation === 'self' ? 'Set up your profile' : `Give consent for ${first}`}</button>}
          {manage && !needsConsent && <button className="pill" onClick={() => setSheet('edit')}>{Object.keys(f).length ? 'Edit profile' : 'Add photo & details'}</button>}
          {kidSelf && <button className="pill" onClick={() => setSheet('suggest')}>Suggest a change</button>}
          {joined && id !== myId && <button className="pill" onClick={() => go('chat/' + id)}>Message {first}</button>}
          {p.is_living && !joined && !snap.invited.includes(id) && <button className="pill ghost" onClick={() => setSheet('invite')}>Invite {first}</button>}
          {p.is_living && !joined && !amMinor && isElder(p.birth_year) && !isMinor(id) && myId !== id && <button className="pill ghost" onClick={() => setSheet('elder')}>Set this up for {first}</button>}
          {isSteward && <button className="pill ghost" onClick={() => setSheet('add')}>Add a relative</button>}
          {canEditTree(id) && <button className="pill ghost" onClick={() => setSheet('tree')}>Edit tree details</button>}
          {isAdmin && id !== myId && <button className="pill ghost danger-pill" onClick={() => setSheet('delete')} title={`Remove ${first} from the tree (admins only)`}><TrashIcon />Delete</button>}
          <button className="tlink" onClick={() => go('tree/' + id)}>Show in the tree</button>
          <button className="tlink" onClick={() => go('related/' + id)}>How are {id === myId ? 'you' : 'they'} related to…</button>
        </div>
        <SuggestCorrection id={id} />
        {term && <div className="tamil">You call {first} <b>{term.word}</b>{term.native && <span className="native" lang={pack.lang} dir={pack.rtl ? 'rtl' : undefined}> {term.native}</span>}</div>}
        {kidSelf && <p className="emptyhint" style={{ marginTop: 14 }}>{consent ? 'You’re under 18, so a parent checks any change before the family sees it.' : 'You’re under 18, so a parent gives consent for you. Until they do, only you and your parents can see your details.'} <a href="#/child">See what’s waiting</a></p>}
        {needsConsent && <p className="emptyhint" style={{ marginTop: 14 }}>{relation === 'self' ? 'Your details are hidden from the family until you agree to the family privacy declaration.' : `${first}’s details stay hidden until you give consent as their parent.`}</p>}
        {manage && !needsConsent && p.is_living && relation === null && !isAdmin && <p className="emptyhint" style={{ marginTop: 14 }}>{snap.joined.includes(id) ? 'You look after this profile.' : `You can add details for ${first} until they join. Others in the family see them only once ${first} joins and agrees.`}</p>}
        {family.blood.has(id) ? (
          <nav className="lineage" aria-label="Lineage">
            {lineageOf(family, id).map((x, i, a) => (
              <span key={x}>{x === id ? <span className="me">{family.byId.get(x)!.given_name}</span> : <button onClick={() => go('p/' + x)}>{family.byId.get(x)!.given_name}</button>}{i < a.length - 1 && <span className="sep">›</span>}</span>
            ))}
          </nav>
        ) : throughP ? (
          <nav className="lineage">Family of&nbsp;<button onClick={() => go('p/' + through)}>{fullName(throughP)}</button>
            {throughPartner && <>, who married&nbsp;<button onClick={() => go('p/' + throughPartner)}>{fullName(family.byId.get(throughPartner))}</button></>}</nav>
        ) : hostOf(family, id) ? (
          <nav className="lineage">{engagedTo ? 'Engaged to' : 'Married into the family through'}&nbsp;<button onClick={() => go('p/' + hostOf(family, id))}>{fullName(family.byId.get(hostOf(family, id)!))}</button></nav>
        ) : null}
      </section>

      {hiddenNote && <section className="section"><div className="nudge"><p style={{ margin: 0 }}>{hiddenNote}</p></div></section>}

      {facts.length > 0 && (
        <section className="section">
          <div className="section-head"><h3 className="sec-title">At a glance.</h3></div>
          <div className="facts">{facts.map((x) => (
            <div className="fact" key={x.k}><small>{x.k}{x.field && chip(x.field)}</small><b>{x.v}</b>{x.sub && <span>{x.sub}</span>}</div>
          ))}</div>
        </section>
      )}

      {(() => {
        const items: { k: string; v: string; sub?: string; field: FieldName }[] = [];
        const add = (field: FieldName, k: string, v?: string, sub?: string) => { if (v) items.push({ k, v, sub, field }); };
        // gothram & co.: sons and unmarried daughters carry their father's; a married woman her husband's
        const ownOf = (k: FieldName) => (x: string) => fieldsOf(x)[k]?.value || undefined;
        for (const [k, label] of [['gothram', pack.labels.gothram], ['sutram', 'Sutram'], ['vedam', 'Vedam'], ['kuladeivam', pack.labels.kuladeivam]] as const) {
          const t = tradition(family, id, k, ownOf(k), snap.info?.roots_person_id, snap.info?.[k]);
          if (!t) continue;
          if (t.source === 'own') { add(k, label, t.value!); continue; }
          const who = t.via ? firstName(family.byId.get(t.via)) : '';
          if (t.value) add(k, label, t.value, t.source === 'husband' ? `From her husband${who ? ` ${who}` : ''}’s family` : t.source === 'father' ? `${TRADITION_NOTE.father}${who ? ` (${who})` : ''}` : TRADITION_NOTE.family);
          else if (k === 'gothram' && t.source === 'husband') add(k, label, 'Not recorded yet', `Follows her husband${who ? ` ${who}` : ''}’s family. ${who ? `Add it on ${who}’s profile.` : ''}`.trim());
        }
        add('native_place', 'Native place', f.native_place?.value);
        const star = unpackStar(f.janma_nakshatram?.value);
        const nb = star && p.is_living ? nextTamilBirthday(star.month, star.star) : null;
        add('janma_nakshatram', 'Janma nakshatram', f.janma_nakshatram && starLabel(f.janma_nakshatram.value), nb ? `Next Tamil birthday around ${fmtDay(nb)}` : undefined);
        const tt = unpackTithi(f.shraddha_tithi?.value);
        const ns = tt ? nextShraddham(tt.month, tt.tithi) : null;
        add('shraddha_tithi', 'Shraddham', f.shraddha_tithi && tithiLabel(f.shraddha_tithi.value), ns ? `Next around ${fmtDay(ns)}` : undefined);
        add('horoscope', 'Horoscope', f.horoscope?.value);
        if (!items.length) return null;
        return (
          <section className="section">
            <div className="section-head"><h3 className="sec-title">Traditions.<HelpTip sections={['profile']} label="Gothram and traditions" /></h3></div>
            <div className="facts">{items.map((x) => (
              <div className="fact" key={x.k}><small>{x.k}{chip(x.field)}</small><b>{x.v}</b>{x.sub && <span>{x.sub}</span>}</div>
            ))}</div>
            {(nb || ns) && <p className="uphint">Dates are worked out from the Tamil calendar. Please confirm with your panchangam.</p>}
          </section>
        );
      })()}

      {(() => {
        const ms: { k: string; v: string; sub?: string; done: boolean; act?: () => void; actLabel?: string }[] = [];
        if (f.upanayanam) ms.push({ k: 'Upanayanam', v: fmtDate(f.upanayanam.value) || 'Held', done: true });
        if ((f.engagement || f.engaged_to) && !(family.spouses.get(id) || []).some((sp) => isEngaged(family, id, sp))) ms.push({ k: 'Engagement', v: (f.engagement && fmtDate(f.engagement.value)) || 'Engaged', sub: f.engaged_to?.value ? `to ${f.engaged_to.value}` : undefined, done: true });
        for (const sp of family.spouses.get(id) || []) {
          const pt = snap.partners.find((x) => (x.person_a === id && x.person_b === sp) || (x.person_b === id && x.person_a === sp));
          const canWed = (pt?.kind === 'married' || pt?.kind === 'engaged') && (manage || canManage(sp) || isSteward);
          if (pt?.kind === 'engaged') {
            ms.push({ k: 'Engagement', v: pt.start_date ? fmtDate(pt.start_date) : 'Engaged', sub: `to ${firstName(family.byId.get(sp))}${pt.place ? ` · ${pt.place}` : ''}`, done: true,
              act: canWed ? () => setWed(sp) : undefined, actLabel: 'Edit' });
            continue;
          }
          if (pt?.start_date) ms.push({ k: 'Wedding', v: fmtDate(pt.start_date), sub: `with ${firstName(family.byId.get(sp))}${pt.place ? ` · ${pt.place}` : ''}`, done: true,
            act: canWed ? () => setWed(sp) : undefined, actLabel: 'Edit' });
          else if (canWed && (p.is_living || family.byId.get(sp)?.is_living)) ms.push({ k: 'Wedding', v: 'Date not added', sub: `with ${firstName(family.byId.get(sp))}`, done: false,
            act: () => setWed(sp), actLabel: 'Add the date' });
        }
        const thisYear = new Date().getFullYear();
        for (const m of MILESTONES) {
          const held = f[m.field];
          if (held) { ms.push({ k: m.name, v: fmtDate(held.value) || 'Held', sub: m.about, done: true }); continue; }
          if (!p.is_living || !p.birth_year) continue;
          const year = p.birth_year + m.age;
          if (year >= thisYear && year <= thisYear + 15) ms.push({ k: m.name, v: year === thisYear ? 'This year' : `In ${year}`, sub: m.about, done: false });
        }
        if (!ms.length) return null;
        return (
          <section className="section">
            <div className="section-head"><h3 className="sec-title">Milestones.</h3></div>
            <div className="milestones">{ms.map((x) => (
              <div className={`ms${x.done ? ' done' : ''}`} key={x.k + x.v + (x.sub || '')}><small>{x.k}</small><b>{x.v}</b>{x.sub && <span>{x.sub}</span>}
                {x.act && <button className="tlink small nochev msact" onClick={x.act}>{x.actLabel}</button>}</div>
            ))}</div>
          </section>
        );
      })()}

      {f.about ? (
        <section className="section">
          <div className="section-head"><h3 className="sec-title">{p.is_living ? 'About' : 'Remembering'} {first}.{chip('about')}</h3></div>
          <div className="story">{f.about.value}</div>
        </section>
      ) : manage && !needsConsent ? (
        <section className="section"><div className="nudge">
          <h3 className="sec-title" style={{ fontSize: 28 }}>{relation === 'self' ? 'Tell your story.' : `Know ${first}’s story?`}</h3>
          <p>Add where {relation === 'self' ? 'you grew up, what you do' : p.is_living ? 'they live, what they do' : 'they lived, what they did'}, a photo, or a favourite memory.</p>
          <button className="pill small" onClick={() => setSheet('edit')}>Add to {relation === 'self' ? 'your' : `${first}’s`} page</button>
        </div></section>
      ) : null}

      {(() => {
        const mine = snap.photos.filter((ph) => snap.tags.some((t) => t.photo_id === ph.id && t.person_id === id && t.status === 'approved'));
        if (!mine.length) return null;
        return (
          <section className="section">
            <div className="section-head"><h3 className="sec-title">Photos.</h3><button className="tlink small" onClick={() => go('photos')}>All photos</button></div>
            <PhotoGrid photos={mine} />
          </section>
        );
      })()}

      {groups.length > 0 && (
        <section className="section">
          <div className="section-head"><h3 className="sec-title">Family.</h3></div>
          {groups.map(([t, ids]) => (
            <div className="famgroup" key={t}><h3>{t}</h3><div className="famgrid">{ids.map((x) => <Tile key={x} id={x} />)}</div></div>
          ))}
        </section>
      )}
      {(p.is_living || manage) && <PrivacyLevels compact self={id === myId} name={first} canEdit={manage && !needsConsent} onEdit={() => setSheet('edit')} />}
      {lastEdit && <div className="updated">Last updated {ago(lastEdit)}.</div>}
      {id === myId && (
        <section className="section signout-sec">
          <p>Using a shared phone or computer? Sign out when you’re done. You can sign back in any time with your email, Google, Microsoft or Yahoo.</p>
          <button className="pill signout-pill" onClick={() => signOut(s.api)}><SignOutIcon />Sign out</button>
        </section>
      )}
      {!p.is_living && yearOf(p.death_date) === '' && null}
      <ProfileLog id={id} />

      {sheet === 'edit' && <EditSheet id={id} onClose={() => setSheet(null)} />}
      {sheet === 'suggest' && <EditSheet id={id} draft onClose={() => setSheet(null)} />}
      {wed && <WeddingSheet a={id} b={wed} onClose={() => setWed(null)} />}
      {sheet === 'consent' && relation && <ConsentSheet id={id} relation={relation} onClose={() => setSheet(null)} />}
      {sheet === 'invite' && <InviteSheet id={id} onClose={() => setSheet(null)} />}
      {sheet === 'elder' && <ElderSheet id={id} onClose={() => setSheet(null)} />}
      {sheet === 'add' && <AddRelativeSheet id={id} onClose={() => setSheet(null)} />}
      {sheet === 'tree' && <EditPersonSheet id={id} onClose={() => setSheet(null)} />}
      {sheet === 'delete' && <DeletePersonSheet id={id} onClose={() => setSheet(null)} />}
    </div>
  );
}
