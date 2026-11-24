import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ADMIN, DOMAIN } from '../lib/site';
import { createPortal } from 'react-dom';
import { useStore } from '../lib/store';
import { helpFor, SECTION_LABEL, type HelpSection } from '../lib/help';
import { inline } from '../lib/richtext';
import { fullName } from '../lib/format';
import { go } from './common';

/** The admin's WhatsApp (site.config.json, also on the family emails), for corrections. */
const CORRECTIONS_WA = ADMIN.wa;

/**
 * A small "?" next to a page or section title. Opens a short list of how-tos for that part of the
 * site, with a link to the full Help page.
 */
export function HelpTip({ sections, label }: { sections: HelpSection[]; label?: string }) {
  const { snap } = useStore();
  const [open, setOpen] = useState(false);
  const [openQ, setOpenQ] = useState<string | null>(null);
  const box = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  // the popup lives at the end of the page (so nothing on the page can sit on top of it), placed under the "?"
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = box.current?.getBoundingClientRect(); if (!r) return;
      const w = Math.min(360, window.innerWidth * 0.9);
      const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
      setPos({ top: Math.min(r.bottom + 8, window.innerHeight - 120), left });
    };
    place();
    addEventListener('resize', place); addEventListener('scroll', place, true);
    return () => { removeEventListener('resize', place); removeEventListener('scroll', place, true); };
  }, [open]);
  const items = sections.flatMap((s) => helpFor(snap.me?.role, s));
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node) && !pop.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  if (!items.length) return null;
  const title = label || SECTION_LABEL[sections[0]];
  return (
    <span className="helptip" ref={box}>
      <button type="button" className="helpbtn" aria-expanded={open} aria-label={`Help: ${title}`} title="How does this work?" onClick={() => setOpen(!open)}>?</button>
      {open && pos && createPortal(
        <div className="helppop" ref={pop} role="dialog" aria-label={`Help: ${title}`} style={{ top: pos.top, left: pos.left }}>
          <div className="helppop-head"><b>{title}</b><button type="button" className="helpx" aria-label="Close help" onClick={() => setOpen(false)}>×</button></div>
          <ul>{items.map((h) => (
            <li key={h.id}>
              <button type="button" className="helpq" aria-expanded={openQ === h.id} onClick={() => setOpenQ(openQ === h.id ? null : h.id)}>{h.q}</button>
              {openQ === h.id && <p className="helpa">{inline(h.a)}</p>}
            </li>
          ))}</ul>
          <button type="button" className="tlink small" onClick={() => { setOpen(false); go(`help/${sections[0]}`); }}>All help and questions</button>
        </div>, document.body)}
    </span>
  );
}

/** "Something wrong? Suggest a correction": opens WhatsApp to the admin with the person named. */
export function SuggestCorrection({ id }: { id: string }) {
  const { family, snap, isSteward } = useStore();
  if (isSteward) return null; // stewards and admins fix it directly
  const p = family.byId.get(id);
  const me = snap.me?.person_id ? fullName(family.byId.get(snap.me.person_id)) : '';
  const text = `Correction for the family website (${DOMAIN})\nPerson: ${fullName(p)}\nWhat should change: \n\n${me ? `From ${me}` : ''}`.trim();
  return (
    <a className="tlink small nochev suggest" href={`https://wa.me/${CORRECTIONS_WA}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"
      title="Names, birth years and relationships are corrected by stewards and admins">Something wrong? Suggest a correction</a>
  );
}
