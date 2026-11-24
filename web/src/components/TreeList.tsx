import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { countDescendants, kindOf, rowOf, type Family } from '../lib/family';
import { firstName, fullName, lifespan } from '../lib/format';
import { Avatar, go } from './common';
import { revealIn } from '../lib/scroll';

const Chev = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/** The rows above a person's row in the tree list, nearest first (their "line"). */
export function rowPath(f: Family, id: string | null | undefined): string[] {
  if (!id) return [];
  const host = rowOf(f, id); if (!host) return [];
  const out: string[] = []; const seen = new Set<string>();
  for (let cur: string | undefined = host; cur && !seen.has(cur); cur = f.hangs.get(cur)) { seen.add(cur); out.push(cur); }
  return out;
}

/**
 * The family tree as an indented list. The signed-in person's row is highlighted
 * ("You"), and the rows leading to it are marked as their line and opened at start.
 * `roomy` is the full-screen, touch-friendly version (names wrap, larger rows).
 */
export function useTreeList({ current, onPick, roomy }: { current: string | null; onPick: (id: string) => void; roomy?: boolean }) {
  const { family, myId, snap } = useStore();
  const signedIn = useMemo(() => (snap.signedIn ? new Set(snap.signedIn) : null), [snap.signedIn]);
  /** green dot: on the site (has signed in); red: not yet. Only on the full tree, only for living people. */
  const dot = (x: string) => {
    if (!roomy || !signedIn) return null;
    const q = family.byId.get(x); if (!q || !q.is_living) return null;
    const on = signedIn.has(x);
    return <span className={`sdot ${on ? 'on' : 'off'}`} role="img" aria-label={on ? 'On the site' : 'Not on the site yet'} title={on ? 'On the site' : 'Not on the site yet'} />;
  };
  const myLine = useMemo(() => new Set(rowPath(family, myId)), [family, myId]);
  const myRow = myId ? rowOf(family, myId) : null;
  const startOpen = () => {
    const s = new Set<string>();
    if (family.root) s.add(family.root);
    for (const x of myLine) if (x !== myRow) s.add(x); // open the way down to me
    if (!myLine.size) { let cur = family.root; while (cur) { s.add(cur); if (cur === family.branchRoot) break; cur = (family.kids.get(cur) || [])[0] || null; } }
    return s;
  };
  const [open, setOpen] = useState<Set<string>>(startOpen);

  // reveal the selected person (or me, when asked) and scroll to them
  const reveal = (id: string | null, behavior: ScrollBehavior = 'smooth') => {
    if (!id) return;
    const path = rowPath(family, id); if (!path.length) return;
    setOpen((o) => { const n = new Set(o); path.slice(1).forEach((x) => n.add(x)); return n; });
    setTimeout(() => revealIn(document.querySelector(`${roomy ? '.treepage' : '.side'} [data-row="${path[0]}"]`), { block: 'center', behavior }), 60);
  };
  useEffect(() => { reveal(current, 'auto'); }, [current, family]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (roomy && !current) reveal(myId, 'auto'); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const step = roomy ? 16 : 14;

  const Row = ({ id, depth }: { id: string; depth: number }) => {
    const p = family.byId.get(id)!;
    const kids = family.kids.get(id) || [];
    const isOpen = open.has(id);
    const sps = family.spouses.get(id) || [];
    const mine = id === myRow;
    const on = current === id || (current !== null && sps.includes(current) && rowOf(family, current) === id);
    const line = myLine.has(id) && !mine;
    const youTag = (x: string) => (x === myId ? <em className="youtag">You</em> : null);
    return (
      <>
        <div className={`trow${on ? ' on' : ''}${mine ? ' mine' : ''}${line ? ' line' : ''}`} data-row={id}
          style={{ paddingLeft: depth * step + 2 }} role="treeitem" aria-expanded={kids.length ? isOpen : undefined} aria-current={mine ? 'true' : undefined}>
          {depth > 0 && roomy && <span className="tguide" style={{ left: depth * step - 6 }} aria-hidden="true" />}
          <button className={`chev${kids.length ? '' : ' none'}`} aria-expanded={isOpen} tabIndex={kids.length ? 0 : -1}
            aria-label={`${isOpen ? 'Hide' : 'Show'} ${firstName(p)}’s children`} onClick={() => toggle(id)}><Chev /></button>
          <span className="tav"><Avatar id={id} size={roomy ? 40 : 26} />{dot(id)}</span>
          <div className="tnames">
            <button className={p.is_living ? '' : 'late'} onClick={() => onPick(id)}>{fullName(p)}{youTag(id)}</button>
            {sps.map((s) => { const q = family.byId.get(s)!; return <button key={s} className={`spn${q.is_living ? '' : ' late'}`} onClick={() => onPick(s)}>&amp; {fullName(q)}{kindOf(family, id, s) === 'engaged' && <small className="engaged"> · engaged</small>}{youTag(s)}{dot(s)}</button>; })}
            {roomy && <small className="tmeta">{[family.gen.get(id) ? `Gen ${family.gen.get(id)}` : '', lifespan(p)].filter((x) => x && !/^\?\s*–\s*\?$/.test(x)).join(' · ')}</small>}
          </div>
          {kids.length > 0 && !isOpen && <span className="tcount" title="Descendants">{countDescendants(family, id)}</span>}
        </div>
        {kids.length > 0 && isOpen && <div className="tkids">{kids.map((k) => <Row key={k} id={k} depth={depth + 1} />)}</div>}
      </>
    );
  };

  /** Keyboard: Up/Down move between people, Right opens a branch, Left folds it, Home/End jump to the ends. */
  const treeKeys = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const row = (e.target as HTMLElement).closest('.trow');
    if (!row || !['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const rows = [...e.currentTarget.querySelectorAll<HTMLElement>('.trow')];
    const i = rows.indexOf(row as HTMLElement);
    const focusRow = (r?: HTMLElement) => r?.querySelector<HTMLElement>('.tnames button')?.focus();
    const chev = row.querySelector<HTMLButtonElement>('.chev:not(.none)');
    const open = chev?.getAttribute('aria-expanded') === 'true';
    e.preventDefault();
    if (e.key === 'ArrowDown') focusRow(rows[i + 1]);
    else if (e.key === 'ArrowUp') focusRow(rows[i - 1]);
    else if (e.key === 'Home') focusRow(rows[0]);
    else if (e.key === 'End') focusRow(rows[rows.length - 1]);
    else if (chev && (e.key === 'ArrowRight' ? !open : open)) {
      // the list redraws after opening/folding, so put focus back on the same person
      const id = row.getAttribute('data-row'); const list = e.currentTarget;
      chev.click();
      requestAnimationFrame(() => focusRow(list.querySelector<HTMLElement>(`.trow[data-row="${id}"]`) || undefined));
    } else if (e.key === 'ArrowRight') focusRow(rows[i + 1]);
  };

  return {
    showMe: () => reveal(myId),
    hasMe: !!myRow,
    expandAll: () => setOpen(new Set([...family.kids.keys()])),
    collapse: () => setOpen(startOpen()),
    el: (
      <div className={`treelist${roomy ? ' roomy' : ''}`} role="tree" onKeyDown={treeKeys}>
        {family.root && <Row id={family.root} depth={0} />}
        {family.sides.length > 0 && (
          <>
            <div className="sidehead side-h"><b>Connected families</b></div>
            {family.sides.map((sd) => (
              <div key={sd.through}>
                <div className="sidehead side-h"><span>{firstName(family.byId.get(sd.through))}’s side</span></div>
                {sd.tops.map((t) => <Row key={t} id={t} depth={0} />)}
              </div>
            ))}
          </>
        )}
        {family.others.length > 0 && (
          <>
            <div className="sidehead" style={{ marginTop: 10 }}><b>Other relatives</b></div>
            {family.others.map((id) => <Row key={id} id={id} depth={0} />)}
          </>
        )}
      </div>
    ),
  };
}
