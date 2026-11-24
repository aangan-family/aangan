import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { friendly } from '../lib/api';
import { preparePhoto } from '../lib/photos';
import { ago, firstName, fullName } from '../lib/format';
import type { Photo, PhotoTag } from '../lib/types';
import { SearchBox, Sheet, go } from '../components/common';
import { HelpTip } from '../components/Help';

const order = (a: Photo, b: Photo) => (b.taken_year || 0) - (a.taken_year || 0) || b.created_at.localeCompare(a.created_at);

/** Photos the viewer may see (the database already filtered), newest first. */
export function PhotoGrid({ photos }: { photos: Photo[] }) {
  const { fileUrl } = useStore();
  return (
    <div className="pgrid">{[...photos].sort(order).map((ph) => {
      const url = fileUrl(ph.path);
      return (
        <button key={ph.id} className="pcell" onClick={() => go('photos/' + ph.id)} aria-label={ph.caption || 'Family photo'}>
          {url ? <img src={url} alt="" loading="lazy" /> : <span className="pph" />}
          {(ph.caption || ph.taken_year) && <span className="pcap">{ph.caption}{ph.caption && ph.taken_year ? ' · ' : ''}{ph.taken_year || ''}</span>}
        </button>
      );
    })}</div>
  );
}

export function Photos({ openId }: { openId?: string }) {
  const { snap, family, canManage, myId } = useStore();
  const [share, setShare] = useState(false);
  const [who, setWho] = useState<string | null>(null);
  const waiting = snap.tags.filter((t) => t.status === 'pending' && canManage(t.person_id) && (snap.me?.role === 'member' || t.person_id === myId));
  const shown = useMemo(() => (who ? snap.photos.filter((ph) => snap.tags.some((t) => t.photo_id === ph.id && t.person_id === who && t.status === 'approved')) : snap.photos),
    [who, snap.photos, snap.tags]);
  const open = openId ? snap.photos.find((p) => p.id === openId) : undefined;

  return (
    <div className="wrap">
      <section className="hero-home reveal" style={{ paddingBottom: 20 }}>
        <p className="eyebrow">Photos</p>
        <h2 className="headline">Family moments.<HelpTip sections={['photos']} /></h2>
        <p className="subhead">Share pictures with everyone invited and tag who’s in them. Anyone tagged can approve the tag or hide the photo.</p>
        <div className="ctas"><button className="pill" onClick={() => setShare(true)}>Share a photo</button></div>
      </section>

      {waiting.length > 0 && (
        <section className="section"><div className="gap-card attention">
          <h3 className="sec-title" style={{ fontSize: 26 }}>{waiting.length === 1 ? 'A photo needs your say.' : `${waiting.length} photos need your say.`}</h3>
          <p>Approve to show your name on the photo, or hide the photo from the family.</p>
          <div className="chips">{waiting.map((t) => (
            <button key={t.photo_id + t.person_id} className="chip" onClick={() => go('photos/' + t.photo_id)}>
              {t.person_id === myId ? 'You' : firstName(family.byId.get(t.person_id))} · {ago(t.created_at)}</button>
          ))}</div>
        </div></section>
      )}

      <section className="section">
        <div className="section-head">
          <h3 className="sec-title">{who ? <>{firstName(family.byId.get(who))}. <span>{shown.length} {shown.length === 1 ? 'photo' : 'photos'}.</span></> : <>All photos. <span>{shown.length}.</span></>}</h3>
          {who && <button className="tlink small" onClick={() => setWho(null)}>Show everyone</button>}
        </div>
        <div className="toolbar"><SearchBox placeholder="Photos of…" onPick={setWho} /></div>
        {shown.length ? <PhotoGrid photos={shown} /> : (
          <div className="nudge"><p>{who ? 'No photos with this person tagged yet.' : 'No photos yet. Be the first to share one.'}</p>
            {!who && <button className="pill small" onClick={() => setShare(true)}>Share a photo</button>}</div>
        )}
      </section>

      {share && <ShareSheet onClose={() => setShare(false)} />}
      {openId && (open ? <PhotoViewer photo={open} onClose={() => go('photos')} />
        : <Sheet title="Photo not available." sub="It may have been deleted, or someone in it chose to hide it." onClose={() => go('photos')} footer={<button className="btn primary" onClick={() => go('photos')}>OK</button>}><span /></Sheet>)}
    </div>
  );
}

export function TagPicker({ ids, onChange }: { ids: string[]; onChange: (ids: string[]) => void }) {
  const { family } = useStore();
  return (
    <>
      {ids.length > 0 && <div className="chips" style={{ marginBottom: 10 }}>{ids.map((id) => (
        <button type="button" key={id} className="chip on" onClick={() => onChange(ids.filter((x) => x !== id))} aria-label={`Remove ${fullName(family.byId.get(id))}`}>
          {fullName(family.byId.get(id))} ✕</button>
      ))}</div>}
      <SearchBox placeholder="Tag someone…" onPick={(id) => !ids.includes(id) && onChange([...ids, id])} />
    </>
  );
}

function ShareSheet({ onClose }: { onClose: () => void }) {
  const { api, reload, toast, amMinor } = useStore();
  const [file, setFile] = useState<{ f: File; url: string } | null>(null);
  const [caption, setCaption] = useState('');
  const [year, setYear] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function save() {
    if (!file) { setErr('Choose a photo first.'); return; }
    const y = year.trim() ? +year : null;
    if (y !== null && (!Number.isInteger(y) || y < 1850 || y > new Date().getFullYear())) { setErr('Enter the year as four digits, like 1985.'); return; }
    setBusy(true); setErr('');
    try {
      if (amMinor) {   // under 18: the photo waits for a parent (0034)
        const path = await api.uploadAlbumFile(await preparePhoto(file.f, 2000));
        await api.childSubmit('photo', { path, caption, taken_year: y });
        await reload(); toast('Sent to your parent to check. It appears in Photos once they say OK.'); onClose(); return;
      }
      await api.sharePhoto(await preparePhoto(file.f, 2000), caption, y, tags);
      await reload(); toast(tags.length ? 'Photo shared. People you tagged will be asked to approve.' : 'Photo shared.'); onClose();
    } catch (e) { setErr(friendly(e)); setBusy(false); }
  }
  return (
    <Sheet title="Share a photo" sub="Everyone invited to the website can see it. Location data is removed automatically." onClose={onClose}
      footer={<>
        <span className={`status${err ? ' err' : ''}`}>{busy ? 'Uploading…' : err}</span>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>Share</button>
      </>}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label className="dropzone full">
          {file ? <img src={file.url} alt="" /> : <span className="dz-in"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-8 8" /></svg>Tap to choose a photo<small>From your phone’s photos or files</small></span>}
          <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile({ f, url: URL.createObjectURL(f) }); }} />
        </label>
        <div><label htmlFor="ph-cap">Caption</label><input id="ph-cap" value={caption} maxLength={500} onChange={(e) => setCaption(e.target.value)} placeholder="Wedding in our native place" aria-describedby="ph-cap-note" /><div className="note" id="ph-cap-note">Say what’s happening and where. It helps relatives who use a screen reader, and everyone searching later.</div></div>
        <div><label htmlFor="ph-year">Year taken</label><input id="ph-year" inputMode="numeric" value={year} maxLength={4} onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} placeholder="1985" /></div>
        {!amMinor && <div className="full"><label>Who’s in it</label><TagPicker ids={tags} onChange={setTags} />
          <div className="note">People who have joined are asked to approve before their name shows. Tags of children and late relatives are added straight away by their family.</div></div>}
        {amMinor && <div className="full note">You’re under 18, so a parent checks the photo before the family sees it.</div>}
      </form>
    </Sheet>
  );
}

export function PhotoViewer({ photo, onClose }: { photo: Photo; onClose: () => void }) {
  const { api, snap, family, fileUrl, canManage, isAdmin, myId, reload, toast, amMinor } = useStore();
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(photo.caption || '');
  const [year, setYear] = useState(photo.taken_year ? String(photo.taken_year) : '');
  const [adding, setAdding] = useState<string[]>([]);
  const mine = photo.uploaded_by === snap.me?.user_id;
  const canEdit = mine || isAdmin;
  const tags = snap.tags.filter((t) => t.photo_id === photo.id);
  const url = fileUrl(photo.path);
  const run = async (f: () => Promise<void>, msg: string) => {
    setBusy(true);
    try { await f(); await reload(); toast(msg); } catch (e) { toast(friendly(e)); } finally { setBusy(false); }
  };
  const label = (t: PhotoTag) => (t.person_id === myId ? 'You' : fullName(family.byId.get(t.person_id)));
  const mineToDecide = tags.filter((t) => canManage(t.person_id) && (!isAdmin || t.person_id === myId || t.status !== 'approved'));

  return (
    <div className="modal on viewer" role="dialog" aria-modal="true" aria-label={photo.caption || 'Photo'} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet viewer-sheet">
        <div className="viewer-img">{url ? <img src={url} alt={photo.caption || 'Family photo'} /> : <span className="pph" />}</div>
        <div className="viewer-body">
          {editing ? (
            <form className="form" onSubmit={(e) => { e.preventDefault(); const y = year ? +year : null;
              run(() => api.updatePhoto(photo.id, { caption: caption.trim() || null, taken_year: y }), 'Photo updated.').then(() => setEditing(false)); }}>
              <div><label htmlFor="v-cap">Caption</label><input id="v-cap" value={caption} maxLength={500} onChange={(e) => setCaption(e.target.value)} /></div>
              <div><label htmlFor="v-year">Year taken</label><input id="v-year" inputMode="numeric" maxLength={4} value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} /></div>
              <div className="full"><button className="btn primary" disabled={busy}>Save</button> <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button></div>
            </form>
          ) : (
            <>
              <h3>{photo.caption || 'Family photo'}</h3>
              <p className="sub">{[photo.taken_year ? `Taken ${photo.taken_year}` : '', `Shared ${ago(photo.created_at)}${mine ? ' by you' : ''}`].filter(Boolean).join(' · ')}</p>
            </>
          )}

          <h5 className="vh">In this photo</h5>
          {tags.length ? <div className="chips">{tags.map((t) => (
            <span key={t.person_id} className={`chip tagchip ${t.status}`}>
              <button className="tlink nochev" onClick={() => go('p/' + t.person_id)}>{label(t)}</button>
              {t.status === 'pending' && <em>waiting</em>}{t.status === 'declined' && <em>hidden</em>}
              {(canEdit || canManage(t.person_id) || t.tagged_by === snap.me?.user_id) && <button className="x" aria-label={`Remove tag ${label(t)}`} disabled={busy}
                onClick={() => run(() => api.removeTag(photo.id, t.person_id), 'Tag removed.')}>✕</button>}
            </span>
          ))}</div> : <p className="emptyhint">No one tagged yet.</p>}

          {mineToDecide.map((t) => (
            <div key={t.person_id} className="decide">
              <p>{t.person_id === myId ? 'You’re' : `${firstName(family.byId.get(t.person_id))} is`} tagged in this photo.
                {t.status === 'pending' ? ' Show the name, or hide the photo from the family?' : t.status === 'declined' ? ' The photo is hidden from the family.' : ''}</p>
              <div className="ctas" style={{ marginTop: 0 }}>
                {t.status !== 'approved' && <button className="btn primary" disabled={busy} onClick={() => run(() => api.decideTag(photo.id, t.person_id, 'approved'), 'Approved. The tag now shows.')}>{t.status === 'declined' ? 'Show the photo again' : 'Approve'}</button>}
                {t.status !== 'declined' && <button className="btn" disabled={busy} onClick={() => run(() => api.decideTag(photo.id, t.person_id, 'declined'), 'Photo hidden from the family.')}>Hide this photo</button>}
              </div>
            </div>
          ))}

          {!amMinor && <div className="vadd"><TagPicker ids={adding} onChange={setAdding} />
            {adding.length > 0 && <button className="btn primary" disabled={busy} onClick={() => run(async () => { for (const id of adding) if (!tags.some((t) => t.person_id === id)) await api.addTag(photo.id, id); setAdding([]); }, 'Tagged. They’ll be asked to approve.')}>Add {adding.length === 1 ? 'tag' : 'tags'}</button>}</div>}

          <div className="foot">
            {canEdit && !editing && <button className="btn" onClick={() => setEditing(true)}>Edit caption</button>}
            {canEdit && (confirmDel
              ? <><span className="status err">Delete for everyone? This can’t be undone.</span><button className="btn danger-bg" disabled={busy}
                  onClick={() => run(() => api.deletePhoto(photo.id, photo.path), 'Photo deleted.').then(onClose)}>Delete</button><button className="btn" onClick={() => setConfirmDel(false)}>Keep</button></>
              : <button className="btn danger" onClick={() => setConfirmDel(true)}>Delete</button>)}
            <button className="btn primary" onClick={onClose} style={{ marginLeft: confirmDel ? 0 : 'auto' }}>Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}
