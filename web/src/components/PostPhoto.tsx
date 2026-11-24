import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../lib/store';
import { firstName, fullName } from '../lib/format';
import { PhotoViewer } from '../pages/Photos';

/**
 * A photo from the Photos section shown inside a Talk post. It only ever shows a photo the
 * viewer can already see in Photos (the database filters by consent and declined tags), so a
 * post never widens who sees a picture. Tapping it opens the photo, where people can tag themselves.
 */
export function PostPhoto({ id, caption }: { id: string; caption: string }) {
  const { snap, family, fileUrl, myId, amMinor } = useStore();
  const [open, setOpen] = useState(false);
  const ph = snap.photos.find((p) => p.id.toLowerCase() === id);
  if (!ph) return <div className="postphoto gone" role="note">📷 Photo not available. It may have been deleted, or someone in it chose to hide it.</div>;
  const url = fileUrl(ph.path);
  const cap = caption || ph.caption || '';
  const tagged = snap.tags.filter((t) => t.photo_id === ph.id && t.status === 'approved');
  const meTagged = amMinor || !!myId && snap.tags.some((t) => t.photo_id === ph.id && t.person_id === myId && t.status !== 'declined');
  const names = tagged.map((t) => (t.person_id === myId ? 'You' : firstName(family.byId.get(t.person_id)) || fullName(family.byId.get(t.person_id))));
  return (
    <figure className="postphoto">
      <button type="button" className="pp-img" onClick={() => setOpen(true)} aria-label={`Open photo${cap ? `: ${cap}` : ''}`}>
        {url ? <img src={url} alt={cap || 'Family photo'} loading="lazy" /> : <span className="pph" />}
      </button>
      {(cap || ph.taken_year || names.length > 0 || !meTagged) && (
        <figcaption>
          {cap && <span className="pp-cap">{cap}{ph.taken_year && !cap.includes(String(ph.taken_year)) ? ` · ${ph.taken_year}` : ''}</span>}
          {names.length > 0 && <span className="pp-who">In this photo: {names.slice(0, 6).join(', ')}{names.length > 6 ? ` and ${names.length - 6} more` : ''}</span>}
          {!meTagged && <button type="button" className="tlink small nochev pp-tag" onClick={() => setOpen(true)}>Are you in it? Tag yourself</button>}
        </figcaption>
      )}
      {open && createPortal(<PhotoViewer photo={ph} onClose={() => setOpen(false)} />, document.body)}
    </figure>
  );
}

export const photoBlock = (id: string, caption: string) => <PostPhoto id={id} caption={caption} />;
