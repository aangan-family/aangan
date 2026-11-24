import { currentPack } from '../lib/community';
import { Fragment, useState } from 'react';
import { useStore } from '../lib/store';
import { friendly } from '../lib/api';
import { preparePhoto } from '../lib/photos';
import { ageFrom, firstName, fromInputDate, fullName, toInputDate } from '../lib/format';
import { NAKSHATRAMS, TAMIL_MONTHS, TITHI_OPTIONS } from '../lib/panchang';
import {
  CONTACT_FIELDS, DEFAULT_VISIBILITY, VISIBILITY_LABEL,
  MARITAL_STATUS, type ConsentChoices, type FieldChange, type FieldName, type Person, type PersonInput, type RelativeKind, type Visibility,
  ROLES, ROLE_HELP, ROLE_LABEL, type Role, type Invitation,
} from '../lib/types';
import { cutOffBy } from '../lib/family';
import { Avatar, Sheet, go } from './common';
import { InviteShare } from './InviteShare';

type Kind = 'text' | 'date' | 'textarea' | 'tel' | 'email' | 'star' | 'tithi' | 'milestone' | 'marital';
/** South Indian traditions record sutram and vedam; every community names gotra and family deity its own way. */
const south = () => currentPack().art === 'south';
const labelOf = (f: { field: string; label: string }) => (f.field === 'gothram' ? currentPack().labels.gothram : f.field === 'kuladeivam' ? currentPack().labels.kuladeivam : f.label);
interface Spec { field: FieldName; label: string; kind?: Kind; note?: string; wide?: boolean; list?: string; show?: (p: Person, age: number | null, c: { married: boolean; has: (f: FieldName) => boolean }) => boolean }

const SECTIONS: { title: string; hint?: string; fields: Spec[] }[] = [
  { title: 'About', fields: [
    { field: 'known_as', label: 'Known as / nickname' },
    { field: 'marital_status', label: 'Relationship status', kind: 'marital', note: 'Optional. A husband, wife or fiancé(e) in the tree shows on its own.', show: (p, age) => p.is_living && (age === null || age >= 18) },
    { field: 'birth_date', label: 'Date of birth', kind: 'date', note: 'Close family see the full date; everyone else sees the year.' },
    { field: 'birth_place', label: 'Born in', note: 'Town or city' },
    { field: 'city', label: 'Lives in', note: 'City and country, not a street address' },
    { field: 'work', label: 'What they do today', note: 'Job, studies, retired…' },
    { field: 'organisation', label: 'Company, school or college' },
    { field: 'interests', label: 'Interests & hobbies', wide: true },
  ] },
  { title: 'Contact', fields: [
    { field: 'phone', label: 'Phone', kind: 'tel' },
    { field: 'email', label: 'Email', kind: 'email' },
    { field: 'address', label: 'Home address', wide: true },
  ] },
  { title: 'Family traditions', hint: 'Fill in what you know. Many families now record a daughter’s gothram of birth as well as her married one: your choice.', fields: [
    { field: 'gothram', label: 'Gothram', list: 'dl-gothram' },
    { field: 'sutram', label: 'Sutram', list: 'dl-sutram', show: (_p, _a, c) => south() || c.has('sutram') },
    { field: 'vedam', label: 'Vedam', list: 'dl-vedam', show: (_p, _a, c) => south() || c.has('vedam') },
    { field: 'kuladeivam', label: 'Kuladeivam' },
    { field: 'native_place', label: 'Native place', note: 'Village or agraharam the family comes from', wide: true },
    { field: 'janma_nakshatram', label: 'Janma nakshatram', kind: 'star', note: 'Month and star (nakshatra) of birth. Used for the star birthday reminder.', wide: true, show: (_p, _a, c) => currentPack().starBirthday || c.has('janma_nakshatram') },
    { field: 'horoscope', label: 'Horoscope notes', kind: 'textarea', note: 'Rasi, lagnam, jathagam details. Kept to themselves unless they choose otherwise.', wide: true },
    { field: 'shraddha_tithi', label: 'Shraddham tithi', kind: 'tithi', note: 'Month and tithi of passing, for the yearly shraddh reminder.', wide: true, show: (p) => !p.is_living },
  ] },
  { title: 'Milestones', hint: 'Dates of ceremonies already held.', fields: [
    { field: 'upanayanam', label: 'Upanayanam / Janeu', kind: 'milestone', show: (p, _a, c) => (p.gender !== 'f' && currentPack().festivals.includes('hindu')) || c.has('upanayanam') },   // a ceremony for boys
    // engagement: for living people who aren't married yet (kept visible if already filled in)
    { field: 'engagement', label: 'Engagement', kind: 'milestone', show: (p, _a, c) => (p.is_living && !c.married) || c.has('engagement') },
    { field: 'engaged_to', label: 'Engaged to', note: 'Their name, if they aren’t in the family tree yet.', show: (p, _a, c) => (p.is_living && !c.married) || c.has('engaged_to') },
    { field: 'sashtiabdapoorthi', label: 'Shashtiabdapoorthi (60)', kind: 'milestone', show: (p, age) => !p.is_living || (age ?? 0) >= 55 },
    { field: 'bhimaratha_shanti', label: 'Bhimaratha Shanti (70)', kind: 'milestone', show: (p, age) => !p.is_living || (age ?? 0) >= 65 },
    { field: 'sathabhishekam', label: 'Sathabhishekam (80)', kind: 'milestone', show: (p, age) => !p.is_living || (age ?? 0) >= 75 },
  ] },
  { title: 'Story', fields: [{ field: 'about', label: 'Their story & memories', kind: 'textarea', wide: true }] },
];

const GOTHRAMS = ['Atreya', 'Bharadwaja', 'Gautama', 'Haritha', 'Kashyapa', 'Kaundinya', 'Kaushika', 'Moudgalya', 'Naidhruva Kashyapa', 'Parasara', 'Sankrithi', 'Shandilya', 'Srivatsa', 'Vadhula', 'Vasishta', 'Viswamitra'];
const SUTRAMS = ['Apastamba', 'Bodhayana', 'Drahyayana', 'Aswalayana', 'Katyayana', 'Jaimini'];
const VEDAMS = ['Rig', 'Krishna Yajur', 'Shukla Yajur', 'Sama', 'Atharva'];

function VisSelect({ value, onChange, label }: { value: Visibility; onChange: (v: Visibility) => void; label: string }) {
  return (
    <select className="vis" value={value} onChange={(e) => onChange(e.target.value as Visibility)} aria-label={`Who can see ${label}`}>
      {(['family', 'close', 'private'] as Visibility[]).map((v) => <option key={v} value={v}>{VISIBILITY_LABEL[v]}</option>)}
    </select>
  );
}

/** Two selects stored as "Month|Value". */
function PairSelect({ id, value, onChange, options, label }: { id: string; value: string; onChange: (v: string) => void; options: readonly string[]; label: string }) {
  const [m, v] = value.split('|');
  const set = (a: string, b: string) => onChange(a || b ? `${a}|${b}` : '');
  return (
    <div className="pair">
      <select id={id} className="vis" value={m || ''} onChange={(e) => set(e.target.value, v || '')} aria-label={`${label}: Tamil month`}>
        <option value="">Tamil month…</option>{TAMIL_MONTHS.map((x) => <option key={x}>{x}</option>)}
      </select>
      <select className="vis" value={v || ''} onChange={(e) => set(m || '', e.target.value)} aria-label={label}>
        <option value="">{label.includes('tithi') ? 'Tithi…' : 'Nakshatram…'}</option>{options.map((x) => <option key={x}>{x}</option>)}
      </select>
    </div>
  );
}

/** draft: an under-18 suggesting changes to their own page; each change waits for a parent (0034). */
export function EditSheet({ id, onClose, draft }: { id: string; onClose: () => void; draft?: boolean }) {
  const { api, family, fieldsOf, isMinor, reload, toast, snap } = useStore();
  const p = family.byId.get(id)!;
  const current = fieldsOf(id);
  const minor = isMinor(id);
  const age = ageFrom(current.birth_date?.value, p.birth_year, p.is_living) ?? (p.is_living && p.birth_year ? new Date().getFullYear() - p.birth_year : null);
  const married = (family.spouses.get(id) || []).some((sp) => snap.partners.some((x) => x.kind === 'married' && ((x.person_a === id && x.person_b === sp) || (x.person_b === id && x.person_a === sp))));
  const ctx = { married, has: (f: FieldName) => !!current[f]?.value };
  const sections = SECTIONS.map((sec) => ({ ...sec, fields: sec.fields.filter((f) => !(minor && CONTACT_FIELDS.includes(f.field)) && (!f.show || f.show(p, age, ctx))) }))
    .filter((sec) => sec.fields.length);
  const fields = sections.flatMap((s) => s.fields);
  const toInput = (f: Spec, v: string) => (f.kind === 'date' || f.kind === 'milestone' ? toInputDate(v) : v);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.field, toInput(f, current[f.field]?.value || '')])));
  const [vis, setVis] = useState<Record<string, Visibility>>(() => Object.fromEntries([...fields.map((f) => f.field), 'photo' as FieldName].map((k) => [k, current[k]?.visibility || DEFAULT_VISIBILITY[k]])));
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    setBusy(true); setErr('');
    try {
      const changes: FieldChange[] = [];
      for (const f of fields) {
        const raw = (vals[f.field] || '').trim();
        let value = raw;
        if (f.kind === 'date' || f.kind === 'milestone') {
          value = fromInputDate(raw);
          if (raw && !value) throw new Error(`Please pick a full date for ${f.label.toLowerCase()}.`);
        }
        if (f.kind === 'star' || f.kind === 'tithi') {
          const [a, b] = raw.split('|');
          if (raw && (!a || !b)) throw new Error(`Please choose both the Tamil month and the ${f.kind === 'star' ? 'nakshatram' : 'tithi'}.`);
        }
        const before = current[f.field];
        if ((before?.value || '') !== value || (value && before?.visibility !== vis[f.field])) changes.push({ field: f.field, value, visibility: vis[f.field] });
      }
      if (draft) {
        if (!changes.length) { onClose(); return; }
        for (const c of changes) await api.childSubmit('detail', { field: c.field, value: c.value, visibility: c.visibility, remove: !c.value });
        await reload(); toast(changes.length === 1 ? 'Sent to your parent to check.' : `${changes.length} changes sent to your parent to check.`);
        onClose(); return;
      }
      if (photo) {
        const blob = await preparePhoto(photo.file);
        const path = await api.uploadPhoto(id, blob);
        changes.push({ field: 'photo', value: path, visibility: vis.photo });
      } else if (removePhoto && current.photo) changes.push({ field: 'photo', value: '', visibility: vis.photo });
      else if (current.photo && current.photo.visibility !== vis.photo) changes.push({ field: 'photo', value: current.photo.value, visibility: vis.photo });
      if (changes.length) { await api.saveFields(id, changes); await reload(); toast('Saved.'); }
      onClose();
    } catch (e) { setErr(friendly(e)); } finally { setBusy(false); }
  }

  const input = (f: Spec) => {
    const v = vals[f.field] || '';
    const set = (x: string) => setVals({ ...vals, [f.field]: x });
    const fid = `f-${f.field}`;
    if (f.kind === 'textarea') return <textarea id={fid} value={v} maxLength={4000} onChange={(e) => set(e.target.value)}
      placeholder={f.field === 'about' ? 'Where they grew up, what they love, a favourite memory…' : ''} />;
    if (f.kind === 'marital') return <select id={fid} className="vis" value={v} onChange={(e) => set(e.target.value)}><option value="">Not set</option>{Object.entries(MARITAL_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>;
    if (f.kind === 'star') return <PairSelect id={fid} value={v} onChange={set} options={NAKSHATRAMS} label="Nakshatram" />;
    if (f.kind === 'tithi') return <PairSelect id={fid} value={v} onChange={set} options={TITHI_OPTIONS} label="Shraddham tithi" />;
    const type = f.kind === 'milestone' ? 'date' : f.kind || 'text';
    return <input id={fid} type={type} value={v} maxLength={300} list={f.list}
      max={type === 'date' ? new Date().toISOString().slice(0, 10) : undefined} onChange={(e) => set(e.target.value)} />;
  };

  return (
    <Sheet title={fullName(p)} sub={draft ? 'Suggest changes to your page. A parent checks them first, then they appear.' : 'Choose who can see each detail. You can change these at any time.'} onClose={onClose}
      footer={<>
        <span className={`status${err ? ' err' : ''}`} role="status">{busy ? 'Saving…' : err}</span>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>{draft ? 'Send to my parent' : 'Save'}</button>
      </>}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {draft ? <div className="full note">To change your photo, ask a parent.</div> : <div className="full">
          <label>Photo</label>
          <div className="photo-edit">
            {photo ? <span className="av s56"><img src={photo.url} alt="" /></span> : removePhoto ? <span className="av s56">{firstName(p)[0]}</span> : <Avatar id={id} size={56} />}
            <label className="btn">Choose photo<input type="file" accept="image/*" hidden onChange={(e) => {
              const f = e.target.files?.[0]; if (!f) return; setPhoto({ file: f, url: URL.createObjectURL(f) }); setRemovePhoto(false);
            }} /></label>
            {(current.photo || photo) && <button type="button" className="btn" onClick={() => { setPhoto(null); setRemovePhoto(true); }}>Remove</button>}
            <VisSelect value={vis.photo} onChange={(v) => setVis({ ...vis, photo: v })} label="the photo" />
          </div>
          <div className="note">Location data is removed from photos automatically.</div>
        </div>}
        {sections.map((sec) => (
          <Fragment key={sec.title}>
            <div className="full formsec"><h4>{sec.title}</h4>{sec.hint && <p className="note">{sec.hint}</p>}</div>
            {sec.fields.map((f) => (
              <div key={f.field} className={f.wide ? 'full' : ''}>
                <div className="lblrow"><label htmlFor={`f-${f.field}`}>{labelOf(f)}</label>
                  <VisSelect value={vis[f.field]} onChange={(v) => setVis({ ...vis, [f.field]: v })} label={f.label} /></div>
                {input(f)}
                {f.note && <div className="note">{f.note}</div>}
              </div>
            ))}
            {sec.title === 'Contact' && minor && <p className="note full">Phone, email and address aren’t stored for anyone under 18.</p>}
          </Fragment>
        ))}
        {minor && !sections.some((s) => s.title === 'Contact') && <p className="note full">Phone, email and address aren’t stored for anyone under 18.</p>}
        <datalist id="dl-gothram">{GOTHRAMS.map((g) => <option key={g} value={g} />)}</datalist>
        <datalist id="dl-sutram">{SUTRAMS.map((g) => <option key={g} value={g} />)}</datalist>
        <datalist id="dl-vedam">{VEDAMS.map((g) => <option key={g} value={g} />)}</datalist>
      </form>
    </Sheet>
  );
}

/* ---------- admin: add a relative, edit tree facts ---------- */
const REL_LABEL: Record<RelativeKind, string> = { parent: 'Parent', spouse: 'Husband or wife', child: 'Son or daughter', sibling: 'Brother or sister' };

function PersonFields({ v, set, showMaiden = true }: { v: PersonInput; set: (p: PersonInput) => void; showMaiden?: boolean }) {
  return (
    <>
      <div><label htmlFor="pf-given">Given name</label><input id="pf-given" value={v.given_name} maxLength={120} onChange={(e) => set({ ...v, given_name: e.target.value })} autoFocus /></div>
      <div><label htmlFor="pf-sur">Surname or initial</label><input id="pf-sur" value={v.surname} maxLength={120} onChange={(e) => set({ ...v, surname: e.target.value })} /></div>
      <div><label htmlFor="pf-gender">Gender</label>
        <select id="pf-gender" className="vis wide" value={v.gender} onChange={(e) => set({ ...v, gender: e.target.value })}>
          <option value="">Not recorded</option><option value="m">Male</option><option value="f">Female</option><option value="o">Other</option>
        </select></div>
      <div><label htmlFor="pf-year">Year of birth</label><input id="pf-year" inputMode="numeric" value={v.birth_year ?? ''} maxLength={4}
        onChange={(e) => { const n = e.target.value.replace(/\D/g, ''); set({ ...v, birth_year: n ? +n : null }); }} /></div>
      {showMaiden && <div className="full"><label htmlFor="pf-maiden">Surname at birth (if different)</label><input id="pf-maiden" value={v.birth_surname} maxLength={120} onChange={(e) => set({ ...v, birth_surname: e.target.value })} />
        <div className="note">A woman can keep her own name; record both if the family uses both.</div></div>}
      <div className="full"><label className="toggle-inline"><input type="checkbox" checked={!v.is_living} onChange={(e) => set({ ...v, is_living: !e.target.checked })} /> Has passed away</label></div>
      {!v.is_living && <>
        <div><label htmlFor="pf-dd">Date of passing</label><input id="pf-dd" type="date" value={toInputDate(v.death_date || '')} onChange={(e) => set({ ...v, death_date: fromInputDate(e.target.value) || null })} /></div>
        <div><label htmlFor="pf-dp">Place</label><input id="pf-dp" value={v.death_place || ''} maxLength={200} onChange={(e) => set({ ...v, death_place: e.target.value || null })} /></div>
      </>}
    </>
  );
}

const blank: PersonInput = { given_name: '', surname: '', birth_surname: '', gender: '', birth_year: null, is_living: true, death_date: null, death_place: null };
const checkPerson = (v: PersonInput) => {
  if (!v.given_name.trim()) return 'Please enter a name.';
  const y = new Date().getFullYear();
  if (v.birth_year !== null && (v.birth_year < 1700 || v.birth_year > y)) return `Year of birth should be between 1700 and ${y}.`;
  return '';
};

export function AddRelativeSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { api, family, reload, toast } = useStore();
  const p = family.byId.get(id)!;
  const hasParents = (family.parents.get(id) || []).length > 0;
  const fullParents = (family.parents.get(id) || []).length >= 2;
  const spouses = family.spouses.get(id) || [];
  const [kind, setKind] = useState<RelativeKind>(fullParents ? 'child' : 'parent');
  const [other, setOther] = useState<string>(spouses[0] || '');
  const [v, setV] = useState<PersonInput>({ ...blank, surname: p.surname });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function save() {
    const bad = checkPerson(v); if (bad) { setErr(bad); return; }
    setBusy(true); setErr('');
    try {
      const nid = await api.addRelative(id, kind, { ...v, given_name: v.given_name.trim(), surname: v.surname.trim(), birth_surname: v.birth_surname.trim() }, kind === 'child' ? other || null : null);
      await reload(); toast(`${v.given_name.trim()} added.`); onClose(); go('p/' + nid);
    } catch (e) { setErr(friendly(e)); } finally { setBusy(false); }
  }
  return (
    <Sheet title={`Add a relative of ${firstName(p)}`} sub="For anyone, including the families of those who married in. Only admins can change the tree." onClose={onClose}
      footer={<>
        <span className={`status${err ? ' err' : ''}`} role="status">{busy ? 'Saving…' : err}</span>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>Add</button>
      </>}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="full"><label>Relationship to {firstName(p)}</label>
          <div className="seg" role="group">
            {(['parent', 'spouse', 'child', 'sibling'] as RelativeKind[]).map((k) => (
              <button type="button" key={k} aria-pressed={kind === k} disabled={(k === 'parent' && fullParents) || (k === 'sibling' && !hasParents)} onClick={() => setKind(k)}>{REL_LABEL[k]}</button>
            ))}
          </div>
          {!hasParents && <div className="note">To add a brother or sister, add the parents first.</div>}
        </div>
        {kind === 'child' && spouses.length > 0 && (
          <div className="full"><label htmlFor="ar-other">Other parent</label>
            <select id="ar-other" className="vis wide" value={other} onChange={(e) => setOther(e.target.value)}>
              {spouses.map((s) => <option key={s} value={s}>{fullName(family.byId.get(s))}</option>)}<option value="">Not recorded</option>
            </select></div>
        )}
        <PersonFields v={v} set={setV} />
      </form>
    </Sheet>
  );
}

export function EditPersonSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { api, family, reload, toast } = useStore();
  const p = family.byId.get(id)!;
  const [v, setV] = useState<PersonInput>({ given_name: p.given_name, surname: p.surname, birth_surname: p.birth_surname, gender: p.gender, birth_year: p.birth_year, is_living: p.is_living, death_date: p.death_date, death_place: p.death_place });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function save() {
    const bad = checkPerson(v); if (bad) { setErr(bad); return; }
    setBusy(true); setErr('');
    try { await api.updatePerson(id, { ...v, given_name: v.given_name.trim() }); await reload(); toast('Saved.'); onClose(); }
    catch (e) { setErr(friendly(e)); } finally { setBusy(false); }
  }
  return (
    <Sheet title="Tree details" sub="Name, birth year and passing. These are visible to every family member." onClose={onClose}
      footer={<>
        <span className={`status${err ? ' err' : ''}`} role="status">{busy ? 'Saving…' : err}</span>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>Save</button>
      </>}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}><PersonFields v={v} set={setV} /></form>
    </Sheet>
  );
}

export function ConsentSheet({ id, relation, onClose }: { id: string; relation: 'self' | 'guardian'; onClose: () => void }) {
  const { api, snap, family, activeConsent, reload, toast } = useStore();
  const p = family.byId.get(id)!;
  const prev = activeConsent(id);
  const [choices, setChoices] = useState<ConsentChoices>({
    show_photo: prev ? prev.show_photo : relation === 'self',
    allow_tags: prev ? prev.allow_tags : relation === 'self',
    include_in_exports: prev ? prev.include_in_exports : true,
  });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const policy = snap.policy;
  const who = relation === 'self' ? 'me' : firstName(p);

  async function submit() {
    if (!policy) return;
    setBusy(true); setErr('');
    try { await api.giveConsent(id, relation, policy.version, choices); await reload(); toast('Thank you. Your choices are saved.'); onClose(); }
    catch (e) { setErr(friendly(e)); } finally { setBusy(false); }
  }
  const Toggle = ({ k, label, hint }: { k: keyof ConsentChoices; label: string; hint: string }) => (
    <label className="toggle"><input type="checkbox" checked={choices[k]} onChange={(e) => setChoices({ ...choices, [k]: e.target.checked })} />
      <span><b>{label}</b><small>{hint}</small></span></label>
  );
  return (
    <Sheet title={relation === 'self' ? 'Before you join in' : `Consent for ${firstName(p)}`}
      sub={relation === 'self' ? 'Please read this once. Your details stay hidden from the family until you agree.' : `As ${firstName(p)}’s parent, you decide what the family can see until ${p.gender === 'f' ? 'she turns' : p.gender === 'm' ? 'he turns' : 'they turn'} 18.`}
      onClose={onClose}
      footer={<>
        <span className={`status${err ? ' err' : ''}`}>{busy ? 'Saving…' : err}</span>
        <button className="btn" onClick={onClose}>Not now</button>
        <button className="btn primary" disabled={!agree || busy || !policy} onClick={submit}>I agree</button>
      </>}>
      <div className="policy">{policy ? policy.body.trim() : 'The consent wording could not be loaded.'}</div>
      <div className="toggles">
        <Toggle k="show_photo" label={`Show ${relation === 'self' ? 'my' : 'their'} photo to the family`} hint="You can still upload one and keep it to yourself." />
        <Toggle k="allow_tags" label={`Let family members tag ${who} in photos`} hint="Each tag waits for approval." />
        <Toggle k="include_in_exports" label={`Include ${who} in family books and backups`} hint="Printed books and the family’s own backups." />
      </div>
      <label className="agree"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>{relation === 'self' ? 'I have read this and I agree.' : `I am ${firstName(p)}’s parent or guardian, and I agree on ${p.gender === 'f' ? 'her' : p.gender === 'm' ? 'his' : 'their'} behalf.`}</span></label>
      <p className="note">Version {policy?.version ?? '–'} · Saved with today’s date. You can withdraw at any time from My privacy.</p>
    </Sheet>
  );
}

export function InviteSheet({ id, onClose, initialEmail = '' }: { id: string | null; onClose: () => void; initialEmail?: string }) {
  const { api, family, toast, isAdmin, reload } = useStore();
  const [email, setEmail] = useState(initialEmail);
  const [role, setRole] = useState<Role>('member');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<Invitation | null>(null);
  const p = id ? family.byId.get(id) : null;
  const first = p ? firstName(p) : 'them';
  const addr = email.trim().toLowerCase();
  async function send() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) { setErr('Please enter a valid email address.'); return; }
    setBusy(true); setErr('');
    try { const inv = await api.invite(addr, id, isAdmin ? role : 'member'); await reload(); setDone(inv); }
    catch (e) { setErr(friendly(e)); } finally { setBusy(false); }
  }
  if (done) return (
    <Sheet title={done.approved_at ? 'Invitation saved.' : 'Invitation sent for checking.'}
      sub={done.approved_at ? `${first} can now sign in with ${addr}. Let them know:` : `A steward or admin will check it first, so nobody can sign in as ${first} with the wrong email.`} onClose={onClose}
      footer={<button className="btn primary" onClick={onClose}>Done</button>}>
      <InviteShare email={addr} personId={id} code={done.code} pending={!done.approved_at} />
    </Sheet>
  );
  return (
    <Sheet title={p ? `Invite ${first}` : 'Invite someone'} sub={`${p ? first : 'They'} sign${p ? 's' : ''} in with this email (or its Google account) and ${p ? 'is' : 'are'} linked to this profile automatically. Next you can share a personal link on WhatsApp or email them a sign-in link.`} onClose={onClose}
      footer={<>
        <span className={`status${err ? ' err' : ''}`}>{busy ? 'Saving…' : err}</span>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={send} disabled={busy}>Save invitation</button>
      </>}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <div className="full"><label htmlFor="inv-email">{p ? `${first}’s email` : 'Email'}</label><input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          <div className="note">Please use an address that really is {first}’s: whoever signs in with it gets {p ? 'their' : 'this'} profile.</div></div>
        {isAdmin && <div className="full"><label htmlFor="inv-role">Role</label>
          <select id="inv-role" className="vis" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}: {ROLE_HELP[r]}</option>)}
          </select></div>}
      </form>
    </Sheet>
  );
}

export const TrashIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12a2 2 0 0 0 2 1.8h7a2 2 0 0 0 2-1.8l1-12M9 7V4.8A.8.8 0 0 1 9.8 4h4.4a.8.8 0 0 1 .8.8V7" />
  </svg>
);

/** Admins only: remove someone from the tree, after showing what goes with them. */
export function DeletePersonSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { api, family, snap, myId, reload, toast } = useStore();
  const p = family.byId.get(id)!;
  const first = firstName(p);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const joined = snap.joined.includes(id);
  const self = id === myId;
  const nParents = (family.parents.get(id) || []).length;
  const nSpouses = (family.spouses.get(id) || []).length;
  const nKids = (family.children.get(id) || []).length;
  const cut = cutOffBy(family, id);
  const isRoot = family.root === id;
  const strong = cut.length > 0 || isRoot;
  const ok = !strong || typed.trim().toLowerCase() === first.toLowerCase();
  const links = [nParents && `${nParents === 1 ? 'a parent' : `${nParents} parents`}`, nSpouses && `${nSpouses === 1 ? 'a spouse' : `${nSpouses} spouses`}`,
    nKids && `${nKids === 1 ? 'a child' : `${nKids} children`}`].filter(Boolean) as string[];
  const back = (family.parents.get(id) || [])[0] || (family.spouses.get(id) || [])[0] || (family.children.get(id) || [])[0];

  async function remove() {
    setBusy(true); setErr('');
    try {
      await api.deletePerson(id);
      go(back ? 'p/' + back : '');
      await reload();
      toast(`${fullName(p)} was removed from the tree.`);
      onClose();
    } catch (e) { setErr(friendly(e)); setBusy(false); }
  }

  if (self || joined) {
    return (
      <Sheet title={`Remove ${first}?`} onClose={onClose} footer={<button className="btn primary" onClick={onClose}>OK</button>}>
        <p className="emptyhint">{self ? 'You can’t remove your own profile.'
          : `${first} has joined the site, so they can’t be removed from the tree. To stop their access, suspend their account in Admin → Members & roles.`}</p>
      </Sheet>
    );
  }
  return (
    <Sheet title={`Remove ${fullName(p)} from the tree?`} sub="This can’t be undone. The removal is recorded in Recent changes." onClose={onClose}
      footer={<>
        <span className={`status${err ? ' err' : ''}`} role="status">{busy ? 'Removing…' : err}</span>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary danger-bg" onClick={remove} disabled={busy || !ok}><TrashIcon /> Remove {first}</button>
      </>}>
      <ul className="delete-list">
        <li>{first}’s place in the tree{links.length ? `, and their links to ${links.join(', ').replace(/, ([^,]*)$/, ' and $1')}` : ''}.</li>
        <li>Everything on {first}’s page, including any photo{snap.invited.includes(id) ? ', and their open invitation' : ''}. Their tags in shared photos go too.</li>
      </ul>
      {isRoot && <p className="delete-warn"><b>{first} is the founder at the top of the tree.</b> The tree will start from {back ? firstName(family.byId.get(back)!) : 'someone else'} instead.</p>}
      {cut.length > 0 && (
        <p className="delete-warn"><b>{cut.length === 1 ? '1 person' : `${cut.length} people`} would no longer be connected to the family</b>, because they’re linked only through {first}: {cut.slice(0, 8).map((x) => fullName(family.byId.get(x)!)).join(', ')}{cut.length > 8 ? ` and ${cut.length - 8} more` : ''}.
          They stay on the site, under “Other relatives” in the tree.</p>
      )}
      {strong && (
        <form className="form" onSubmit={(e) => { e.preventDefault(); if (ok) remove(); }}>
          <label>Type <b>{first}</b> to confirm<input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></label>
        </form>
      )}
      {!strong && <p className="emptyhint">Nobody else loses their connection to the family.</p>}
    </Sheet>
  );
}
