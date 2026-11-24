import { isEngaged } from '../lib/family';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../lib/store';
import { fullName, initials, lifespan } from '../lib/format';
import { revealIn } from '../lib/scroll';

/* ---------- routing (hash based, so any static host works) ---------- */
export type Route = { page: 'home' } | { page: 'person'; id: string } | { page: 'related'; a?: string } | { page: 'privacy' } | { page: 'admin'; tab?: string } | { page: 'photos'; id?: string } | { page: 'tree'; id?: string } | { page: 'talk'; id?: string } | { page: 'chat'; id?: string } | { page: 'calendar'; at?: string } | { page: 'help'; section?: string } | { page: 'devcenter'; id?: string } | { page: 'whatsnew' } | { page: 'child' };
export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  let m = h.match(/^p\/([A-Za-z0-9]+)$/); if (m) return { page: 'person', id: m[1] };
  m = h.match(/^related(?:\/([A-Za-z0-9]+))?$/); if (m) return { page: 'related', a: m[1] };
  m = h.match(/^photos(?:\/([a-f0-9-]{36}))?$/); if (m) return { page: 'photos', id: m[1] };
  m = h.match(/^tree(?:\/([A-Za-z0-9]+))?$/); if (m) return { page: 'tree', id: m[1] };
  m = h.match(/^talk(?:\/([a-f0-9-]{36}))?$/); if (m) return { page: 'talk', id: m[1] };
  m = h.match(/^chat(?:\/([A-Za-z0-9]{1,20}))?$/); if (m) return { page: 'chat', id: m[1] };
  m = h.match(/^calendar(?:\/(\d{4}-\d{2}(?:-\d{2})?))?$/); if (m) return { page: 'calendar', at: m[1] };
  if (h === 'privacy') return { page: 'privacy' };
  m = h.match(/^help(?:\/([a-z]+))?$/); if (m) return { page: 'help', section: m[1] };
  m = h.match(/^devcenter(?:\/([a-z0-9-]{1,40}))?$/); if (m) return { page: 'devcenter', id: m[1] };
  if (h === 'whats-new') return { page: 'whatsnew' };
  if (h === 'child') return { page: 'child' };
  m = h.match(/^admin(?:\/([a-z]+))?$/); if (m) return { page: 'admin', tab: m[1] };
  return { page: 'home' };
}
export const go = (path: string) => { location.hash = '#/' + path.replace(/^\//, ''); };
export function useRoute(): Route {
  const [r, setR] = useState(() => parseRoute(location.hash));
  useEffect(() => { const f = () => setR(parseRoute(location.hash)); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return r;
}

/* ---------- avatar ---------- */
export function Avatar({ id, size }: { id: string; size: 26 | 40 | 56 | 72 | 88 | 168 }) {
  const { family, photoUrl } = useStore();
  const [broken, setBroken] = useState(false);
  const p = family.byId.get(id); if (!p) return null;
  const url = photoUrl(id);
  return (
    <span className={`av s${size}${p.is_living ? '' : ' late'}`} aria-hidden="true">
      {url && !broken ? <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} /> : initials(p)}
    </span>
  );
}

/* ---------- person search ---------- */
export function SearchBox({ placeholder, onPick, initial, autoFocus }: { placeholder: string; onPick: (id: string) => void; initial?: string; autoFocus?: boolean }) {
  const { family, snap, fieldsOf } = useStore();
  const [q, setQ] = useState(initial || '');
  const [open, setOpen] = useState(false);
  const [act, setAct] = useState(0);
  useEffect(() => { setQ(initial || ''); }, [initial]);
  // On phones the keyboard covers the bottom half: move the box to the top of the page so the matches
  // below it stay in view, and keep the list no taller than the space left above the keyboard.
  const box = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<number | null>(null);
  const fit = () => requestAnimationFrame(() => {
    const vv = window.visualViewport; const r = box.current?.getBoundingClientRect();
    if (!vv || !r || !matchMedia('(pointer: coarse)').matches) { setRoom(null); return; }
    setRoom(Math.max(140, Math.round(vv.height + vv.offsetTop - r.bottom - 14)));
  });
  const lift = () => {
    if (!matchMedia('(pointer: coarse)').matches || !box.current?.closest('main')) { fit(); return; }
    document.body.classList.add('kb-room');   // room below, so a box near the end of the page can still move up
    setTimeout(() => { revealIn(box.current, { block: 'start' }); setTimeout(fit, 350); }, 320);
  };
  useEffect(() => { const vv = window.visualViewport; if (!vv) return; vv.addEventListener('resize', fit); return () => vv.removeEventListener('resize', fit); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const items = !words.length ? [] : snap.persons
    .filter((p) => { const hay = `${fullName(p)} ${p.birth_surname} ${fieldsOf(p.id).known_as?.value || ''} ${fieldsOf(p.id).city?.value || ''}`.toLowerCase(); return words.every((w) => hay.includes(w)); })
    .sort((a, b) => fullName(a).localeCompare(fullName(b))).slice(0, 30);
  const pick = (i: number) => { const p = items[i]; if (!p) return; setOpen(false); setQ(''); onPick(p.id); };
  const context = (id: string) => {
    const p = family.byId.get(id)!; const ps = (family.parents.get(id) || []).map((x) => family.byId.get(x)?.given_name).filter(Boolean).join(' & ');
    const sp = (family.spouses.get(id) || [])[0];
    const rel = ps ? `${p.gender === 'f' ? 'Daughter' : 'Son'} of ${ps}` : sp ? `${isEngaged(family, id, sp) ? (p.gender === 'f' ? 'Fiancée' : 'Fiancé') : p.gender === 'f' ? 'Wife' : 'Husband'} of ${fullName(family.byId.get(sp))}` : '';
    return [lifespan(p), rel].filter(Boolean).join(' · ');
  };
  return (
    <div className="search" ref={box}>
      <input type="search" value={q} placeholder={placeholder} aria-label={placeholder} autoComplete="off" autoFocus={autoFocus}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setAct(0); fit(); }}
        onFocus={() => { setOpen(true); lift(); }} onBlur={() => setTimeout(() => { setOpen(false); document.body.classList.remove('kb-room'); }, 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (items.length) setAct((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length); }
          else if (e.key === 'Enter') { e.preventDefault(); pick(act); } else if (e.key === 'Escape') setOpen(false);
        }} />
      {open && words.length > 0 && (
        <div className="results on" role="listbox" style={room ? { maxHeight: room } : undefined}>
          {items.length ? items.map((p, i) => (
            <div key={p.id} className={`ri${i === act ? ' act' : ''}`} role="option" aria-selected={i === act} onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(i)}>
              <Avatar id={p.id} size={26} /><div>{fullName(p)}<small>{context(p.id)}</small></div>
            </div>
          )) : <div className="ri" style={{ cursor: 'default', color: 'var(--text2)' }}>No one by that name</div>}
        </div>
      )}
    </div>
  );
}

/* ---------- modal sheet ---------- */
export function Sheet({ title, sub, onClose, children, footer }: { title: string; sub?: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Escape closes only the top sheet (a photo picker can open over the post you're writing)
    const k = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; const all = document.querySelectorAll('.modal.on'); if (!ref.current || all[all.length - 1]?.contains(ref.current)) onClose(); };
    addEventListener('keydown', k); ref.current?.querySelector<HTMLElement>('input,textarea,select,button')?.focus();
    return () => removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal on" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" ref={ref}>
        <h3>{title}</h3>{sub && <p className="sub">{sub}</p>}
        {children}
        <div className="foot">{footer}</div>
      </div>
    </div>
  );
}

export function Toast({ msg }: { msg: string | null }) {
  return <div className={`toast${msg ? ' on' : ''}`} role="status" aria-live="polite">{msg}</div>;
}

/** The public privacy notice (web/public/privacy.html), linked at the foot of every page and the sign-in screens. */
export const PRIVACY_URL = '/privacy.html';
export function PrivacyLink({ className = 'privacy-link' }: { className?: string }) {
  return <a className={className} href={PRIVACY_URL} target="_blank" rel="noopener">Read our Privacy Policy</a>;
}
