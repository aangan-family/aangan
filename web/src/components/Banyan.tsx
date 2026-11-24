// Generations as a banyan tree (Nov 2026): India's national tree, which grows new trunks from its own branches,
// for families whose traditions aren't South Indian (they keep the gopuram). The founders are the roots; each band
// of the canopy, from the lowest to the crown, is a later generation. Same props and behaviour as Gopuram.
import { useMemo, useState } from 'react';

const CX = 250, CY = 250, RX = 215, RY = 190;      // the canopy dome
const TOP = CY - RY - 16, BASE = 330, GROUND = 418;  // canopy top and bottom, the ground line
const f = (n: number) => Math.round(n * 10) / 10;
const halfAt = (y: number) => RX * Math.sqrt(Math.max(0, 1 - ((y - CY) / RY) ** 2));
/** leaf clusters around the dome's edge, from one side round the top to the other */
const LEAVES: [number, number][] = Array.from({ length: 15 }, (_, i) => { const a = Math.PI * (1.02 + (i / 14) * 0.96); return [f(CX + Math.cos(a) * (RX - 22)), f(CY + Math.sin(a) * (RY - 22))]; });
const GREENS = ['#2F6B3A', '#3C7E45', '#4B9150', '#5BA35C', '#6CB268', '#7DBE73', '#8FCA80', '#A0D48C', '#B1DD99'];

/** The tree alone (used for the app icon too). */
export function BanyanArt({ bands, roots = true }: { bands: number; roots?: boolean }) {
  const h = (BASE - TOP) / Math.max(1, bands);
  const hang = [-170, -128, -84, 84, 128, 170];
  return (
    <g>
      <defs>
        {/* a leafy, bumpy outline: the dome plus a ring of leaf clusters on its upper edge */}
        <clipPath id="bnCanopy"><ellipse cx={CX} cy={CY} rx={RX - 14} ry={RY - 14} />{LEAVES.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="30" />)}</clipPath>
        <linearGradient id="bnBark" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#6B4426" /><stop offset=".5" stopColor="#8C5E36" /><stop offset="1" stopColor="#5A3820" /></linearGradient>
      </defs>
      {/* aerial roots that became trunks: the banyan's own sign */}
      {hang.map((x, i) => <path key={i} d={`M${CX + x} ${BASE - 6} C${CX + x * 0.98} ${BASE + 40} ${CX + x * 1.02} ${GROUND - 40} ${CX + x} ${GROUND}`} stroke="#7A5232" strokeWidth={i === 0 || i === 5 ? 5 : 3} fill="none" opacity=".85" />)}
      <path d={`M${CX - 34} ${GROUND} C${CX - 26} ${GROUND - 60} ${CX - 30} ${BASE + 20} ${CX - 18} ${BASE - 30} L${CX + 18} ${BASE - 30} C${CX + 30} ${BASE + 20} ${CX + 26} ${GROUND - 60} ${CX + 34} ${GROUND} Z`} fill="url(#bnBark)" />
      <g clipPath="url(#bnCanopy)">
        {Array.from({ length: bands }, (_, i) => <rect key={i} x={0} y={f(BASE - (i + 1) * h)} width={500} height={f(h + 0.6)} fill={GREENS[Math.min(i, GREENS.length - 1)]} />)}
        {LEAVES.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="30" fill="none" stroke="#1E4A26" strokeOpacity=".18" strokeWidth="2" />)}
      </g>
      <rect x="0" y={BASE} width="500" height={GROUND - BASE} fill="none" />
      <line x1="40" x2="460" y1={GROUND} y2={GROUND} stroke="#8C6A45" strokeWidth="3" strokeLinecap="round" />
      {roots && [-60, -30, 0, 30, 60].map((x, i) => <path key={i} d={`M${CX + x / 3} ${GROUND} C${CX + x / 2} ${GROUND + 14} ${CX + x} ${GROUND + 18} ${CX + x * 1.4} ${GROUND + 34}`} stroke="#8C6A45" strokeWidth="3" fill="none" strokeLinecap="round" />)}
    </g>
  );
}

export function Banyan({ counts, mine, compact = false, describe }: {
  /** people per generation, founders first */ counts: number[];
  /** the viewer's generation (1-based), if known */ mine?: number;
  compact?: boolean;
  /** one line about a generation (e.g. who it starts with) */ describe?: (gen: number) => string;
}) {
  const n = Math.max(1, Math.min(counts.length, 9));
  const bands = Math.max(1, n - 1);                 // generation 1 is the roots
  const [sel, setSel] = useState(0);
  const art = useMemo(() => <BanyanArt bands={bands} />, [bands]);
  const pick = (g: number) => setSel(sel === g ? 0 : g);
  const h = (BASE - TOP) / bands;
  const rows = [
    { g: 1, y0: GROUND - 2, y1: GROUND + 40, x: CX + 90 },
    ...Array.from({ length: n - 1 }, (_, i) => { const yb = BASE - i * h, yt = BASE - (i + 1) * h; return { g: i + 2, y0: yt, y1: yb, x: CX + halfAt((yb + yt) / 2) }; }),
  ];
  const info = sel
    ? { title: `Generation ${sel}: ${counts[sel - 1]} ${counts[sel - 1] === 1 ? 'person' : 'people'}`, line: describe?.(sel) || '' }
    : { title: `${n} generations, one tree.`, line: mine ? `Your generation, the ${ordinal(mine)}, is glowing. Tap any part of the tree.` : 'The founders are the roots. Tap any part of the tree.' };
  return (
    <div className={`gopuram banyan${compact ? ' compact' : ''}`}>
      <svg viewBox="0 20 500 460" role="img" aria-label={`A banyan tree of ${n} generations: the founders are the roots, each band of leaves above a later generation.`}>
        {art}
        {rows.map((r) => {
          const on = sel === r.g, you = !sel && r.g === mine, label = !compact || on || you, py = (r.y0 + r.y1) / 2 + 4;
          return (
            <g key={r.g}>
              <rect x="30" y={f(r.y0)} width="440" height={f(r.y1 - r.y0)} rx="10" fill="#FFD36B" className={`gp-glow${you ? ' you' : ''}`} style={{ opacity: on ? 0.45 : you ? 0.28 : 0 }} pointerEvents="none" />
              {label && <g pointerEvents="none"><rect x={f(Math.min(r.x + 6, 404))} y={f(py - 11)} rx="9" width="64" height="20" fill="#1E3B22" opacity=".88" /><text x={f(Math.min(r.x + 6, 404) + 32)} y={f(py + 3)} textAnchor="middle" fontSize="11" fontWeight="700" fill="#E9F7D8">Gen {r.g} · {counts[r.g - 1]}</text></g>}
              <rect x="30" y={f(r.y0)} width="440" height={f(r.y1 - r.y0)} className="gp-hit" onClick={(e) => { e.stopPropagation(); pick(r.g); }} />
            </g>
          );
        })}
      </svg>
      {!compact && (
        <div className="gp-side">
          <p className="gp-info" aria-live="polite"><b>{info.title}</b>{info.line && <><br /><span>{info.line}</span></>}</p>
          {counts.slice(0, n).map((c, i) => (
            <button key={i} className={sel === i + 1 ? 'on' : ''} aria-pressed={sel === i + 1} onClick={() => pick(i + 1)}>
              <span>Generation {i + 1}{i === 0 ? ' · roots' : ''}{mine === i + 1 ? ' · you' : ''}</span><span>{c} {c === 1 ? 'person' : 'people'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const ordinal = (n: number) => ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'][n - 1] || `${n}th`;
