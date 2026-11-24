import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { friendly } from '../lib/api';
import { preparePhoto } from '../lib/photos';
import { Sheet } from './common';
import { TagPicker } from '../pages/Photos';

/**
 * Add a photo to a Talk post: pick one already in Photos, or share a new one (it goes into
 * Photos too, with the same tags, consent and private storage), then it's placed in the post.
 */
export function PhotoPicker({ onPick, onClose }: { onPick: (id: string, caption: string) => void; onClose: () => void }) {
  const { snap, api, reload, fileUrl } = useStore();
  const [tab, setTab] = useState<'album' | 'new'>(snap.photos.length ? 'album' : 'new');
  const [q, setQ] = useState('');
  const [file, setFile] = useState<{ f: File; url: string } | null>(null);
  const [caption, setCaption] = useState('');
  const [year, setYear] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return [...snap.photos].sort((a, b) => b.created_at.localeCompare(a.created_at))
      .filter((p) => !n || `${p.caption || ''} ${p.taken_year || ''}`.toLowerCase().includes(n)).slice(0, 60);
  }, [snap.photos, q]);

  async function upload() {
    if (!file) { setErr('Choose a photo first.'); return; }
    const y = year.trim() ? +year : null;
    if (y !== null && (!Number.isInteger(y) || y < 1850 || y > new Date().getFullYear())) { setErr('Enter the year as four digits, like 1985.'); return; }
    setBusy(true); setErr('');
    try {
      const id = await api.sharePhoto(await preparePhoto(file.f, 2000), caption, y, tags);
      await reload(); onPick(id, caption.trim()); onClose();
    } catch (e) { setErr(friendly(e)); setBusy(false); }
  }

  return (
    <Sheet title="Add a photo" sub="Photos you add here are also saved in Photos, where people can tag themselves." onClose={onClose}
      footer={<>
        <span className={`status${err ? ' err' : ''}`}>{busy ? 'Uploading…' : err}</span>
        <button className="btn" onClick={onClose}>Cancel</button>
        {tab === 'new' && <button className="btn primary" onClick={upload} disabled={busy}>Add to post</button>}
      </>}>
      <div className="seg" role="group" aria-label="Where from" style={{ marginBottom: 14 }}>
        <button type="button" aria-pressed={tab === 'album'} onClick={() => setTab('album')}>From Photos</button>
        <button type="button" aria-pressed={tab === 'new'} onClick={() => setTab('new')}>Upload new</button>
      </div>
      {tab === 'album' ? (
        <>
          <input className="pickq" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search captions, like wedding" aria-label="Search photos" />
          {list.length ? <div className="pgrid pickgrid">{list.map((p) => {
            const url = fileUrl(p.path);
            return (
              <button key={p.id} type="button" className="pcell" onClick={() => { onPick(p.id, p.caption || ''); onClose(); }} aria-label={`Add ${p.caption || 'this photo'}`}>
                {url ? <img src={url} alt="" loading="lazy" /> : <span className="pph" />}
                {(p.caption || p.taken_year) && <span className="pcap">{p.caption}{p.caption && p.taken_year ? ' · ' : ''}{p.taken_year || ''}</span>}
              </button>
            );
          })}</div> : <p className="emptyhint">{q ? 'No photos match.' : 'No photos yet.'} <button type="button" className="tlink small" onClick={() => setTab('new')}>Upload one</button></p>}
        </>
      ) : (
        <form className="form" onSubmit={(e) => { e.preventDefault(); upload(); }}>
          <label className="dropzone full">
            {file ? <img src={file.url} alt="" /> : <span className="dz-in">Tap to choose a photo<small>From your phone’s photos or files. Location data is removed.</small></span>}
            <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile({ f, url: URL.createObjectURL(f) }); }} />
          </label>
          <div><label htmlFor="pp-cap">Caption</label><input id="pp-cap" value={caption} maxLength={200} onChange={(e) => setCaption(e.target.value)} placeholder="Grandparents at the wedding, 1985" /></div>
          <div><label htmlFor="pp-year">Year taken</label><input id="pp-year" inputMode="numeric" value={year} maxLength={4} onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} placeholder="1985" /></div>
          <div className="full"><label>Who’s in it</label><TagPicker ids={tags} onChange={setTags} /></div>
        </form>
      )}
    </Sheet>
  );
}
