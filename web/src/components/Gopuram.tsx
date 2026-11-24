import { useMemo, useState, type ReactNode } from 'react';

/**
 * The family as a seven-tier temple gopuram: the founders on the top tier under the kalasams, each tier below a
 * later generation, the newest at the gateway. Tap a tier (or its button) to see who's in it.
 * Drawn in SVG so it stays sharp; colours are stone and gold in both light and dark.
 */
const BASE_Y = 478, TIER_H = 44, TOP_HALF = 58, BASE_HALF = 150, CX = 200;
const f = (n: number) => n.toFixed(1);

interface Tier { yb: number; yt: number; hb: number; ht: number }
function tiersOf(n: number): Tier[] {
  return Array.from({ length: n }, (_, i) => {
    const yb = BASE_Y - i * TIER_H;
    return { yb, yt: yb - TIER_H, hb: BASE_HALF - (BASE_HALF - TOP_HALF) * (i / n) ** 0.8, ht: BASE_HALF - (BASE_HALF - TOP_HALF) * ((i + 1) / n) ** 0.8 };
  });
}

function Tower({ tiers }: { tiers: Tier[] }) {
  const parts: ReactNode[] = [];
  tiers.forEach(({ yb, yt, hb, ht }, i) => {
    const wallTop = yt + 12, hw = hb - 4;
    parts.push(<path key={`w${i}`} d={`M${f(CX - hw)} ${yb} L${f(CX + hw)} ${yb} L${f(CX + ht + 2)} ${wallTop} L${f(CX - ht - 2)} ${wallTop} Z`} fill="url(#gpStone)" stroke="#6E4E26" strokeWidth=".8" />);
    const n = Math.max(3, Math.floor((hw * 2) / 24));
    for (let k = 0; k <= n; k++) {
      const fx = -hw + (2 * hw * k) / n, fxt = -(ht + 2) + (2 * (ht + 2) * k) / n;
      parts.push(<path key={`p${i}-${k}`} d={`M${f(CX + fx)} ${yb} L${f(CX + fxt)} ${wallTop}`} stroke="#7B5A2E" strokeWidth="1.6" opacity=".55" />);
    }
    for (let k = 0; k < n; k++) {
      const mid = (k + 0.5) / n;
      if (Math.abs(mid - 0.5) < 0.17) continue;
      const bx = CX - hw + 2 * hw * mid, tx = CX - (ht + 2) + 2 * (ht + 2) * mid;
      const nx = (bx + tx) / 2, ny = (yb + wallTop) / 2 + 2;
      parts.push(<path key={`n${i}-${k}`} d={`M${f(nx - 5)} ${f(ny + 12)} L${f(nx - 5)} ${f(ny - 5)} A5 6 0 0 1 ${f(nx + 5)} ${f(ny - 5)} L${f(nx + 5)} ${f(ny + 12)} Z`} fill="#6A4A22" opacity=".75" />);
      parts.push(k % 2 === 0
        ? <g key={`f${i}-${k}`} fill="#C9A06A"><circle cx={f(nx)} cy={f(ny - 4)} r="1.8" /><path d={`M${f(nx - 2.4)} ${f(ny - 1.8)} L${f(nx + 2.4)} ${f(ny - 1.8)} L${f(nx + 3.2)} ${f(ny + 8)} L${f(nx - 3.2)} ${f(ny + 8)} Z`} /></g>
        : <path key={`f${i}-${k}`} d={`M${f(nx)} ${f(ny - 5)} C${f(nx + 3)} ${f(ny - 1)} ${f(nx + 3)} ${f(ny + 4)} ${f(nx)} ${f(ny + 8)} C${f(nx - 3)} ${f(ny + 4)} ${f(nx - 3)} ${f(ny - 1)} ${f(nx)} ${f(ny - 5)} Z`} fill="#C9A06A" />);
    }
    // central projecting bay with a deity niche
    const bwb = hw * 0.3, bwt = (ht + 2) * 0.3, ny = (yb + wallTop) / 2;
    parts.push(<path key={`b${i}`} d={`M${f(CX - bwb)} ${yb} L${f(CX + bwb)} ${yb} L${f(CX + bwt)} ${wallTop} L${f(CX - bwt)} ${wallTop} Z`} fill="#E7CC9A" stroke="#6E4E26" strokeWidth=".8" />);
    parts.push(<path key={`bs${i}`} d={`M${f(CX + bwb)} ${yb} L${f(CX + bwt)} ${wallTop} L${f(CX + bwt + 3)} ${wallTop} L${f(CX + bwb + 3)} ${yb} Z`} fill="#6A4A22" opacity=".45" />);
    parts.push(<path key={`bn${i}`} d={`M${CX - 7} ${f(ny + 14)} L${CX - 7} ${f(ny - 6)} A7 8 0 0 1 ${CX + 7} ${f(ny - 6)} L${CX + 7} ${f(ny + 14)} Z`} fill="#5E3E18" />);
    parts.push(<g key={`bd${i}`} fill="#D9B27A"><circle cx={CX} cy={f(ny - 5)} r="2.4" /><path d={`M${CX - 2.4} ${f(ny - 8.5)} L${CX} ${f(ny - 12)} L${CX + 2.4} ${f(ny - 8.5)} Z`} /><path d={`M${CX - 3.2} ${f(ny - 2)} L${CX + 3.2} ${f(ny - 2)} L${CX + 4.5} ${f(ny + 11)} L${CX - 4.5} ${f(ny + 11)} Z`} /></g>);
    // cornice with kudu arches, its shadow, central sala and corner pavilions
    const cwb = ht + 8, cwt = ht + 3;
    parts.push(<path key={`c${i}`} d={`M${f(CX - cwb)} ${wallTop} L${f(CX + cwb)} ${wallTop} L${f(CX + cwt)} ${yt} L${f(CX - cwt)} ${yt} Z`} fill="url(#gpCorn)" stroke="#6E4E26" strokeWidth=".8" />);
    const m = Math.max(4, Math.floor((cwb * 2) / 13));
    for (let k = 0; k < m; k++) {
      const kx = CX - cwb + (2 * cwb * (k + 0.5)) / m;
      parts.push(<path key={`k${i}-${k}`} d={`M${f(kx - 3.4)} ${wallTop - 1} L${f(kx - 3.4)} ${wallTop - 6} A3.4 3.6 0 0 1 ${f(kx + 3.4)} ${wallTop - 6} L${f(kx + 3.4)} ${wallTop - 1}`} fill="none" stroke="#7B5A2E" strokeWidth="1" />);
    }
    parts.push(<path key={`sh${i}`} d={`M${f(CX - ht - 4)} ${wallTop} L${f(CX + ht + 4)} ${wallTop} L${f(CX + ht + 3)} ${wallTop + 4} L${f(CX - ht - 3)} ${wallTop + 4} Z`} fill="#3A2610" opacity=".35" />);
    for (const sg of [-1, 1]) {
      const px = CX + sg * (cwt - 4);
      parts.push(<path key={`kt${i}${sg}`} d={`M${f(px - 6)} ${yt} L${f(px - 6)} ${yt - 5} Q${f(px)} ${yt - 14} ${f(px + 6)} ${yt - 5} L${f(px + 6)} ${yt} Z`} fill="url(#gpCorn)" stroke="#6E4E26" strokeWidth=".8" />);
      parts.push(<circle key={`kg${i}${sg}`} cx={f(px)} cy={yt - 14} r="1.6" fill="url(#gpGold)" />);
    }
  });
  const st = tiers[tiers.length - 1].yt, sw = TOP_HALF + 6;
  return (
    <g>
      <rect x="34" y="478" width="332" height="30" fill="url(#gpStone)" stroke="#6E4E26" strokeWidth="1" />
      {[484, 492, 500].map((y) => <rect key={y} x="34" y={y} width="332" height="1.4" fill="#7E5A2C" opacity=".6" />)}
      {parts}
      {/* gateway */}
      <path d="M176 478 L176 430 A24 26 0 0 1 224 430 L224 478 Z" fill="#3A2610" stroke="#6E4E26" strokeWidth="1.2" />
      <path d="M180 478 L180 432 A20 22 0 0 1 199 412 L199 478 Z" fill="#6B3A1A" /><path d="M201 412 A20 22 0 0 1 220 432 L220 478 L201 478 Z" fill="#5A3014" />
      <circle cx="196" cy="452" r="1.8" fill="url(#gpGold)" /><circle cx="204" cy="452" r="1.8" fill="url(#gpGold)" />
      {/* shala (barrel vault) with kirtimukha ends and five kalasams */}
      <path d={`M${f(CX - sw)} ${st} L${f(CX - sw)} ${st - 18} Q${f(CX - sw)} ${st - 46} ${CX} ${st - 46} Q${f(CX + sw)} ${st - 46} ${f(CX + sw)} ${st - 18} L${f(CX + sw)} ${st} Z`} fill="url(#gpCorn)" stroke="#6E4E26" strokeWidth="1" />
      {[-2, -1, 0, 1, 2].map((k) => <path key={`sa${k}`} d={`M${CX + k * 22 - 7} ${st} L${CX + k * 22 - 7} ${st - 14} A7 8 0 0 1 ${CX + k * 22 + 7} ${st - 14} L${CX + k * 22 + 7} ${st}`} fill="#7B5A2E" opacity=".45" />)}
      {[-1, 1].map((sg) => <g key={`km${sg}`}><circle cx={f(CX + sg * (sw - 2))} cy={st - 26} r="9" fill="#C9A06A" stroke="#6E4E26" strokeWidth="1" /><circle cx={f(CX + sg * (sw - 2))} cy={st - 26} r="4" fill="#7B5A2E" /></g>)}
      {[-2, -1, 0, 1, 2].map((k) => {
        const kx = CX + k * 20, top = st - 46 + Math.abs(k) * 4;
        return <g key={`kl${k}`} fill="url(#gpGold)"><rect x={kx - 5} y={top - 4} width="10" height="4" /><ellipse cx={kx} cy={top - 10} rx="6.5" ry="6" /><path d={`M${kx - 3} ${top - 15} L${kx} ${top - 27} L${kx + 3} ${top - 15} Z`} /></g>;
      })}
    </g>
  );
}

export function Gopuram({ counts, mine, compact = false, describe }: {
  /** people per generation, founders first */ counts: number[];
  /** the viewer's generation (1-based), if known */ mine?: number;
  compact?: boolean;
  /** one line about a generation (e.g. who it starts with) */ describe?: (gen: number) => string;
}) {
  const n = Math.max(1, Math.min(counts.length, 9));
  const tiers = useMemo(() => tiersOf(n), [n]);
  const [sel, setSel] = useState(0);
  const tower = useMemo(() => <Tower tiers={tiers} />, [tiers]);
  const genOfTier = (i: number) => n - i; // tier 0 is the base, the newest generation
  const pick = (g: number) => setSel(sel === g ? 0 : g);
  const info = sel
    ? { title: `Generation ${sel}: ${counts[sel - 1]} ${counts[sel - 1] === 1 ? 'person' : 'people'}`, line: describe?.(sel) || '' }
    : { title: `${n} tiers, ${n} generations.`, line: mine ? `Your tier, the ${ordinal(mine)}, is glowing. Tap any tier.` : 'Tap any tier.' };
  return (
    <div className={`gopuram${compact ? ' compact' : ''}`}>
      <svg viewBox="-10 0 500 516" role="img" aria-label={`A ${n}-tier gopuram: the founders on the top tier, each tier below a later generation.`}>
        <defs>
          <linearGradient id="gpStone" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#E9CFA0" /><stop offset=".45" stopColor="#D2AE78" /><stop offset=".8" stopColor="#A9824F" /><stop offset="1" stopColor="#8A6638" /></linearGradient>
          <linearGradient id="gpCorn" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#F3DDB2" /><stop offset=".5" stopColor="#DDBB84" /><stop offset="1" stopColor="#97713F" /></linearGradient>
          <linearGradient id="gpGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFF0A8" /><stop offset=".45" stopColor="#E5B53C" /><stop offset="1" stopColor="#9A6E12" /></linearGradient>
          <linearGradient id="gpGlow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFD36B" stopOpacity="0" /><stop offset=".5" stopColor="#FFC94D" stopOpacity=".6" /><stop offset="1" stopColor="#FFD36B" stopOpacity="0" /></linearGradient>
        </defs>
        {tower}
        {tiers.map((t, i) => {
          const g = genOfTier(i), on = sel === g, you = !sel && g === mine;
          const d = `M${f(CX - t.hb)} ${t.yb} L${f(CX + t.hb)} ${t.yb} L${f(CX + t.ht + 8)} ${t.yt} L${f(CX - t.ht - 8)} ${t.yt} Z`;
          const py = (t.yb + t.yt) / 2 + 4;
          const label = !compact || on || you;
          return (
            <g key={g}>
              <path d={d} fill="url(#gpGlow)" className={`gp-glow${you ? ' you' : ''}`} style={{ opacity: on ? 1 : you ? 0.55 : 0 }} pointerEvents="none" />
              {label && <g pointerEvents="none"><rect x={f(CX + t.hb + 6)} y={f(py - 11)} rx="9" width="64" height="20" fill="#3A1A0C" opacity=".85" /><text x={f(CX + t.hb + 38)} y={f(py + 3)} textAnchor="middle" fontSize="11" fontWeight="700" fill="#FFE7B8">Gen {g} · {counts[g - 1]}</text></g>}
              <path d={d} className="gp-hit" onClick={(e) => { e.stopPropagation(); pick(g); }} />
            </g>
          );
        })}
      </svg>
      {!compact && (
        <div className="gp-side">
          <p className="gp-info" aria-live="polite"><b>{info.title}</b>{info.line && <><br /><span>{info.line}</span></>}</p>
          {counts.slice(0, n).map((c, i) => (
            <button key={i} className={sel === i + 1 ? 'on' : ''} aria-pressed={sel === i + 1} onClick={() => pick(i + 1)}>
              <span>Generation {i + 1}{mine === i + 1 ? ' · you' : ''}</span><span>{c} {c === 1 ? 'person' : 'people'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const ordinal = (n: number) => ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'][n - 1] || `${n}th`;
