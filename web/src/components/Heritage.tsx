import { usePack } from '../lib/community';
import { motifFor } from '../lib/motif';
import { MotifBackground } from './Motifs';
import { useEffect, useId, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Prefs } from '../lib/types';
import { useStore } from '../lib/store';
import { borderFor, pageName, showMl, showTa, type Border, type Scripts as ScriptsPref } from '../lib/heritage';
import type { Route } from './common';
import { TextileBorder } from './Textiles';

/* Choices made in the Theme picker apply at once (and are saved in the background); they sit over the loaded prefs. */
let local: Partial<Prefs> = {};
const subs = new Set<() => void>();
export function setHeritagePrefs(patch: Partial<Prefs>) { local = { ...local, ...patch }; subs.forEach((f) => f()); }
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

/** The signed-in person's heritage settings: border (by gender), which scripts to show, kolam and door on/off. */
export function useHeritage() {
  const { snap, family, myId } = useStore();
  const over = useSyncExternalStore(subscribe, () => local);
  const gender = (myId && family.byId.get(myId)?.gender) || '';
  const p = { ...snap.prefs, ...over };
  // South Indian art (veshti/saree borders, kolam, gopuram, Malayalam/Tamil page names) follows the member's traditions
  const pack = usePack();
  const south = pack.art === 'south';
  return {
    gender, south, community: pack.id,
    /** null when the member's traditions have no border (English) */
    border: borderFor(gender, p.border, pack.id),
    scripts: (south ? ((p.scripts as ScriptsPref) || 'both') : 'en') as ScriptsPref,
    /** the background floor art is on (the member's Theme switch) */
    kolam: p.kolam !== false && !!motifFor(pack.id),
    motif: motifFor(pack.id),
    doors: p.doors !== false,
  };
}

const sid = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '');

/** Malayalam · Tamil · English on one line; each script shown according to the member's "Names in" choice. */
export function Scripts({ ml, ta, en, className }: { ml: string; ta: string; en?: ReactNode; className?: string }) {
  const { scripts } = useHeritage();
  const m = showMl(scripts), t = showTa(scripts);
  if (!m && !t && !en) return null;
  return (
    <p className={`scripts ${className || ''}`}>
      {m && <span lang="ml" className="ml">{ml}</span>}
      {m && t && <span aria-hidden="true"> · </span>}
      {t && <span lang="ta" className="ta">{ta}</span>}
      {en && (m || t) && <span aria-hidden="true"> · </span>}
      {en && <span>{en}</span>}
    </p>
  );
}

/** The page's Malayalam and Tamil names, above its own English headline. */
export function PageNames({ route }: { route: Route }) {
  const { myId } = useStore();
  const n = pageName(route, myId);
  if (!n) return null;
  return <Scripts ml={n.ml} ta={n.ta} className="pagenames" />;
}

/* ---------- woven borders (drawn, so they stay sharp at any size) ---------- */
const GOLD = ['#F7E58C', '#E2BE4E', '#B08A24'];

function Zari({ id }: { id: string }) {
  return <linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={GOLD[0]} /><stop offset=".45" stopColor={GOLD[1]} /><stop offset="1" stopColor={GOLD[2]} /></linearGradient>;
}

function Creeper({ id, g, ground }: { id: string; g: string; ground: string }) {
  return (
    <pattern id={id} width="14" height="12" patternUnits="userSpaceOnUse">
      <rect width="14" height="12" fill={`url(#${g})`} />
      <path d="M0 0 L7 6 L0 12 M14 0 L7 6 L14 12" fill="none" stroke={ground} strokeWidth=".8" />
      {[[7, 3.3], [7, 8.7], [4.3, 6], [9.7, 6]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.5" fill={ground} />)}
      <circle cx="7" cy="6" r="1" fill={GOLD[0]} />
    </pattern>
  );
}

function Peacock({ ground }: { ground: string }) {
  return (
    <>
      <g fill="#E9C552" stroke={ground} strokeWidth="1" strokeLinejoin="round">
        <path d="M11 30 C7 34 5 38 4 44 L9.5 44 C10.5 38 12.5 34 15.5 31 Z" />
        <path d="M13 31 C11 36 11 40 12 44 L16 44 C15 40 15.5 36 17 32 Z" />
        <ellipse cx="18" cy="27" rx="7.5" ry="5" transform="rotate(-22 18 27)" />
        <path d="M21 24 C24 20 22.5 15 24.5 11 L26.5 11.8 C25 16 26.5 20 23.5 25.5 Z" />
        <circle cx="25.3" cy="10" r="2.4" />
        <path d="M27.5 9.6 L30.5 10.4 L27.5 11.4 Z" />
        <path d="M24.5 7.6 L22.6 3.8 M25.3 7.4 L25.3 3.2 M26.1 7.6 L28 3.8 M16.5 32 L15.5 38.5 M20 31.5 L21 38.5" fill="none" />
      </g>
      <g fill={ground}>
        <circle cx="6.6" cy="40.6" r="1.1" /><circle cx="13.6" cy="40" r="1.1" /><circle cx="25.6" cy="9.6" r=".7" />
        <circle cx="22.6" cy="3.8" r=".8" /><circle cx="25.3" cy="3.2" r=".8" /><circle cx="28" cy="3.8" r=".8" />
      </g>
    </>
  );
}

function Medallion({ ground }: { ground: string }) {
  return (
    <>
      <g fill="none" stroke={ground} strokeWidth="1.1">
        <ellipse cx="17" cy="22" rx="11.5" ry="18" /><ellipse cx="17" cy="22" rx="8" ry="13" />
        <path d="M17 11 C21 15 21 19 17 22 C13 19 13 15 17 11 Z M17 33 C21 29 21 25 17 22 C13 25 13 29 17 33 Z M8.5 22 C12 19 15 20 17 22 C15 24 12 25 8.5 22 Z M25.5 22 C22 19 19 20 17 22 C19 24 22 25 25.5 22 Z" />
      </g>
      <circle cx="17" cy="22" r="1.8" fill={ground} />
      <path d="M17 1.5 L19 4 L17 6.5 L15 4 Z M17 37.5 L19 40 L17 42.5 L15 40 Z" fill={ground} />
    </>
  );
}

const VESHTI: Record<'veshti-red' | 'veshti-blue', [string, string]> = { 'veshti-red': ['#B3122E', '#8E0C22'], 'veshti-blue': ['#1F3A93', '#142A6E'] };
const SAREE: Record<'saree-green' | 'saree-red', string> = { 'saree-green': '#0E4A2C', 'saree-red': '#B3122E' };

/**
 * Kanjeevaram saree border (peacock and medallion panels between creeper bands) for women,
 * mayil kann (peacock-eye) veshti border for men. `slim` is the thin band used under the breadcrumb bar.
 */
export function WovenBorder({ kind, slim = false }: { kind: Border; slim?: boolean }) {
  const id = sid(useId());
  if (!(kind in VESHTI) && !(kind in SAREE)) return <TextileBorder id={kind} slim={slim} />;
  const g = `z${id}`;
  if (kind === 'veshti-red' || kind === 'veshti-blue') {
    const [c, dk] = VESHTI[kind as keyof typeof VESHTI];
    const eye = (
      <pattern id={`e${id}`} width="9" height="9" patternUnits="userSpaceOnUse">
        <rect width="9" height="9" fill={dk} /><path d="M4.5 .6 L8.4 4.5 L4.5 8.4 L.6 4.5 Z" fill={`url(#${g})`} /><circle cx="4.5" cy="4.5" r="1.3" fill={dk} />
      </pattern>
    );
    if (slim) return (
      <svg className="weave slim" width="100%" height="16" aria-hidden="true"><defs><Zari id={g} />{eye}</defs>
        <rect width="100%" height="3" fill={c} /><rect y="3" width="100%" height="1" fill="#E9BE5C" /><rect y="4" width="100%" height="9" fill={`url(#e${id})`} />
        <rect y="13" width="100%" height="1" fill="#E9BE5C" /><rect y="14" width="100%" height="2" fill={c} />
      </svg>
    );
    return (
      <svg className="weave" width="100%" height="50" aria-hidden="true"><defs><Zari id={g} />{eye}
        <pattern id={`t${id}`} width="10" height="7" patternUnits="userSpaceOnUse"><rect width="10" height="7" fill="#FBF8F0" /><path d="M0 7 L5 0 L10 7 Z" fill={c} /></pattern></defs>
        <rect width="100%" height="8" fill="#FBF8F0" /><rect y="8" width="100%" height="7" fill={`url(#t${id})`} /><rect y="15" width="100%" height="8" fill={c} />
        <rect y="23" width="100%" height="1.5" fill="#E9BE5C" /><rect y="24.5" width="100%" height="18" fill={`url(#e${id})`} />
        <rect y="42.5" width="100%" height="1.5" fill="#E9BE5C" /><rect y="44" width="100%" height="6" fill={c} />
      </svg>
    );
  }
  const G = SAREE[kind as keyof typeof SAREE];
  if (slim) return (
    <svg className="weave slim" width="100%" height="18" aria-hidden="true"><defs><Zari id={g} /><Creeper id={`c${id}`} g={g} ground={G} /></defs>
      <rect width="100%" height="18" fill={G} /><rect y="2" width="100%" height="1.4" fill={`url(#${g})`} /><rect y="3.4" width="100%" height="12" fill={`url(#c${id})`} />
      <rect y="15.4" width="100%" height="1.4" fill={`url(#${g})`} />
    </svg>
  );
  return (
    <svg className="weave" width="100%" height="84" viewBox="0 0 1200 84" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <Zari id={g} /><Creeper id={`c${id}`} g={g} ground={G} />
        <pattern id={`p${id}`} width="76" height="44" patternUnits="userSpaceOnUse">
          <rect width="76" height="44" fill={`url(#${g})`} />
          <rect width="4" height="44" fill={G} /><rect x="1.4" width="1.2" height="44" fill={GOLD[0]} />
          <g transform="translate(4 0)"><Peacock ground={G} /></g>
          <rect x="38" width="4" height="44" fill={G} /><rect x="39.4" width="1.2" height="44" fill={GOLD[0]} />
          <g transform="translate(42 0)"><Medallion ground={G} /></g>
        </pattern>
        <linearGradient id={`s${id}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".16" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
      </defs>
      <rect width="1200" height="84" fill={G} />
      <rect y="3" width="1200" height="1.6" fill={`url(#${g})`} /><rect y="5.5" width="1200" height="12" fill={`url(#c${id})`} /><rect y="18.4" width="1200" height="1.6" fill={`url(#${g})`} />
      <rect y="20" width="1200" height="44" fill={`url(#p${id})`} />
      <rect y="64" width="1200" height="1.6" fill={`url(#${g})`} /><rect y="66.5" width="1200" height="12" fill={`url(#c${id})`} /><rect y="79.4" width="1200" height="1.6" fill={`url(#${g})`} />
      <rect width="1200" height="84" fill={`url(#s${id})`} />
    </svg>
  );
}

/** Mango leaves and marigolds strung across the top of the page; they sway gently (still under reduced motion). */
export function Thoranam() {
  const items = useMemo(() => Array.from({ length: 25 }, (_, i) => i), []);
  return (
    <div className="thoranam" aria-hidden="true">
      <span className="thoranam-string" />
      <div className="thoranam-row">
        {items.map((i) => (
          <svg key={i} className="thoranam-leaf" width="13" height="36" viewBox="0 0 22 58" style={{ animationDelay: `-${((i * 0.37) % 3.6).toFixed(2)}s`, animationDuration: `${3.2 + (i % 4) * 0.3}s` }}>
            {i % 3 === 1 ? <circle cx="11" cy="13" r="7" fill="#F28705" /> : <path d="M11 0 C20 14 20 40 11 58 C2 40 2 14 11 0 Z" fill={i % 2 ? '#2F6B2F' : '#3E7D3A'} />}
          </svg>
        ))}
      </div>
    </div>
  );
}

/* ---------- kolam ---------- */
/** A sikku (pulli) kolam: a woven diamond around every dot, crossing its neighbours; outer turns close in loops. */
export function kolamPaths(R = 5, s = 14) {
  const cells = new Set<string>();
  for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) if (Math.max(Math.abs(i), Math.abs(j)) <= R && Math.abs(i) + Math.abs(j) <= R + Math.floor(R / 2)) cells.add(`${i},${j}`);
  const h = s / 2, f = (n: number) => n.toFixed(2);
  const lines: string[] = [], dots: [number, number][] = [];
  for (const key of cells) {
    const [i, j] = key.split(',').map(Number);
    const cx = i * s, cy = j * s;
    dots.push([cx, cy]);
    const T: [number, number] = [cx, cy - h], B: [number, number] = [cx, cy + h], L: [number, number] = [cx - h, cy], Rt: [number, number] = [cx + h, cy];
    for (const [a, b] of [[T, Rt], [Rt, B], [B, L], [L, T]] as [[number, number], [number, number]][]) {
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      lines.push(`M${f(a[0])} ${f(a[1])}Q${f(mx + (cx - mx) * 0.18)} ${f(my + (cy - my) * 0.18)} ${f(b[0])} ${f(b[1])}`);
    }
    for (const [di, dj, [mx, my]] of [[0, -1, T], [0, 1, B], [-1, 0, L], [1, 0, Rt]] as [number, number, [number, number]][]) {
      if (cells.has(`${i + di},${j + dj}`)) continue;
      const r = s * 0.42, px = -dj, py = di;
      const a1 = [mx + px * r * 0.55 + di * r * 0.25, my + py * r * 0.55 + dj * r * 0.25];
      const a2 = [mx - px * r * 0.55 + di * r * 0.25, my - py * r * 0.55 + dj * r * 0.25];
      const tip = [mx + di * r * 2, my + dj * r * 2];
      lines.push(`M${f(mx)} ${f(my)}C${f(a1[0])} ${f(a1[1])} ${f(tip[0] + px * r * 1.1)} ${f(tip[1] + py * r * 1.1)} ${f(tip[0])} ${f(tip[1])}C${f(tip[0] - px * r * 1.1)} ${f(tip[1] - py * r * 1.1)} ${f(a2[0])} ${f(a2[1])} ${f(mx)} ${f(my)}`);
      dots.push([mx + di * r * 1.15, my + dj * r * 1.15]);
    }
  }
  const dr = 1.4;
  return { line: lines.join(''), dots: dots.map(([x, y]) => `M${f(x - dr)} ${f(y)}a${dr} ${dr} 0 1 0 ${dr * 2} 0a${dr} ${dr} 0 1 0 ${-dr * 2} 0`).join('') };
}

/** Faint kolams across the background, fixed while the page scrolls. Off in Theme → Kolam background. */
/** Faint floor art behind every page, from the member's traditions: kolam, rangoli, alpana, jali or vine (lib/motif.ts). */
export function KolamBackground() {
  const { kolam, motif } = useHeritage();
  const k = useMemo(() => kolamPaths(5, 14), []);
  const id = sid(useId());
  if (!kolam || !motif) return null;
  if (motif !== 'kolam') return <MotifBackground motif={motif} />;
  const T = 380;
  return (
    <div className="kolam-bg" aria-hidden="true">
      <svg>
        <defs>
          <g id={`k${id}`}><path d={k.line} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /><path d={k.dots} fill="currentColor" /></g>
          <pattern id={`kt${id}`} width={T} height={T} patternUnits="userSpaceOnUse">
            {[[T / 2, T / 2], [0, 0], [T, 0], [0, T], [T, T]].map(([x, y]) => <use key={`${x},${y}`} href={`#k${id}`} transform={`translate(${x} ${y}) rotate(45)`} />)}
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#kt${id})`} />
      </svg>
    </div>
  );
}

/** A small kolam that draws itself (Our roots tile). */
export function KolamMark({ size = 84 }: { size?: number }) {
  const k = useMemo(() => kolamPaths(2, 12), []);
  return (
    <svg className="kolam-mark" width={size} height={size} viewBox="-46 -46 92 92" aria-hidden="true">
      <g transform="rotate(45)"><path d={k.line} pathLength={1} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><path d={k.dots} fill="currentColor" /></g>
    </svg>
  );
}

/** A brass lamp (kuthuvilakku) with a flickering flame: remembrance days and the panchangam. */
export function Lamp({ size = 14 }: { size?: number }) {
  return (
    <svg className="lamp" width={size} height={size * 1.25} viewBox="0 0 16 20" aria-hidden="true">
      <path className="lamp-flame" d="M8 1 C11 5 11 8 8 10 C5 8 5 5 8 1 Z" fill="#F2B33D" />
      <rect x="3" y="11" width="10" height="3" rx="1.5" fill="#C9A24A" /><rect x="6" y="14" width="4" height="4" fill="#C9A24A" /><rect x="3" y="18" width="10" height="2" rx="1" fill="#C9A24A" />
    </svg>
  );
}
/** A marigold: birthdays. */
export const Marigold = () => <span className="marigold" aria-hidden="true" />;

