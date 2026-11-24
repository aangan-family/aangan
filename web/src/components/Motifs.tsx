// Floor art behind the pages for traditions that aren't South Indian (Nov 2026). Each is a small tile drawn in
// currentColor, repeated across the page at the same faint strength as the kolam (.kolam-bg sets colour and opacity).
import { useId, useMemo, type ReactNode } from 'react';
import type { Motif } from '../lib/motif';

const f = (n: number) => Math.round(n * 100) / 100;
const pt = (cx: number, cy: number, r: number, a: number) => `${f(cx + r * Math.cos(a))} ${f(cy + r * Math.sin(a))}`;

/** Rangoli: an eight-petal flower in a ring of dots and leaf points. */
function rangoli(T: number): ReactNode {
  const c = T / 2, petals: string[] = [], leaves: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, l = a - 0.32, r = a + 0.32;
    petals.push(`M${pt(c, c, 10, a)} Q${pt(c, c, 42, l)} ${pt(c, c, 52, a)} Q${pt(c, c, 42, r)} ${pt(c, c, 10, a)} Z`);
    const b = a + Math.PI / 8;
    leaves.push(`M${pt(c, c, 62, b)} L${pt(c, c, 80, b - 0.12)} L${pt(c, c, 92, b)} L${pt(c, c, 80, b + 0.12)} Z`);
  }
  return (
    <>
      <circle cx={c} cy={c} r="7" fill="currentColor" />
      <path d={petals.join(' ')} fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx={c} cy={c} r="58" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <path d={leaves.join(' ')} fill="currentColor" />
      {Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2; return <circle key={i} cx={f(c + 104 * Math.cos(a))} cy={f(c + 104 * Math.sin(a))} r="2.2" fill="currentColor" />; })}
    </>
  );
}

/** Alpana: a lotus with flowing scrolls, drawn in one white line as on a courtyard floor. */
function alpana(T: number): ReactNode {
  const c = T / 2, petals: string[] = [], scrolls: string[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    petals.push(`M${pt(c, c, 18, a - 0.2)} C${pt(c, c, 46, a - 0.34)} ${pt(c, c, 62, a - 0.08)} ${pt(c, c, 66, a)} C${pt(c, c, 62, a + 0.08)} ${pt(c, c, 46, a + 0.34)} ${pt(c, c, 18, a + 0.2)}`);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    scrolls.push(`M${pt(c, c, 74, a)} C${pt(c, c, 96, a - 0.25)} ${pt(c, c, 112, a + 0.1)} ${pt(c, c, 100, a + 0.22)} C${pt(c, c, 92, a + 0.3)} ${pt(c, c, 88, a + 0.12)} ${pt(c, c, 95, a + 0.06)}`);
  }
  return (
    <>
      <circle cx={c} cy={c} r="12" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx={c} cy={c} r="4" fill="currentColor" />
      <path d={petals.join(' ')} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d={scrolls.join(' ')} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </>
  );
}

/** Jali: an eight-pointed star lattice, as carved in stone screens. */
function jali(T: number): ReactNode {
  const c = T / 2, r = T * 0.36, star = (rot: number) => Array.from({ length: 4 }, (_, i) => pt(c, c, r, rot + (i / 4) * Math.PI * 2)).join(' L');
  return (
    <>
      <path d={`M${star(0)} Z M${star(Math.PI / 4)} Z`} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx={c} cy={c} r={f(r * 0.32)} fill="none" stroke="currentColor" strokeWidth="1.1" />
      <path d={`M0 0 L${f(c - r * 0.72)} ${f(c - r * 0.72)} M${T} 0 L${f(c + r * 0.72)} ${f(c - r * 0.72)} M0 ${T} L${f(c - r * 0.72)} ${f(c + r * 0.72)} M${T} ${T} L${f(c + r * 0.72)} ${f(c + r * 0.72)}`} stroke="currentColor" strokeWidth="1.1" />
    </>
  );
}

/** Vine: a leafy branch winding across, as on church doors and lace. */
function vine(T: number): ReactNode {
  const y = T / 2, a = T * 0.18, leaves: ReactNode[] = [];
  for (let i = 0; i < 6; i++) {
    const x = (i + 0.5) * (T / 6), up = i % 2 === 0, yy = y + (up ? -a * 0.62 : a * 0.62), d = up ? -1 : 1;
    leaves.push(<path key={i} d={`M${f(x)} ${f(yy)} q${f(8)} ${f(d * 14)} ${f(2)} ${f(d * 26)} q${f(-12)} ${f(-d * 8)} ${f(-2)} ${f(-d * 26)} Z`} fill="currentColor" />);
  }
  return (
    <>
      <path d={`M0 ${y} C${T / 4} ${y - a} ${T / 4} ${y - a} ${T / 2} ${y} S${(3 * T) / 4} ${y + a} ${T} ${y}`} fill="none" stroke="currentColor" strokeWidth="1.3" />
      {leaves}
      <circle cx={T / 4} cy={f(y - a * 0.75)} r="3" fill="currentColor" /><circle cx={(3 * T) / 4} cy={f(y + a * 0.75)} r="3" fill="currentColor" />
    </>
  );
}

const TILE: Record<Exclude<Motif, 'kolam'>, { T: number; draw: (T: number) => ReactNode; rotate?: number }> = {
  rangoli: { T: 300, draw: rangoli },
  alpana: { T: 320, draw: alpana },
  jali: { T: 140, draw: jali },
  vine: { T: 280, draw: vine, rotate: -18 },
};

export function MotifTile({ motif, size }: { motif: Exclude<Motif, 'kolam'>; size?: number }) {
  const t = TILE[motif];
  return <svg viewBox={`0 0 ${t.T} ${t.T}`} width={size} height={size} aria-hidden="true">{t.draw(t.T)}</svg>;
}

export function MotifBackground({ motif }: { motif: Exclude<Motif, 'kolam'> }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const t = TILE[motif];
  const tile = useMemo(() => t.draw(t.T), [t]);
  return (
    <div className={`kolam-bg motif-${motif}`} aria-hidden="true">
      <svg>
        <defs>
          <pattern id={`m${id}`} width={t.T} height={t.T} patternUnits="userSpaceOnUse" patternTransform={t.rotate ? `rotate(${t.rotate})` : undefined}>{tile}</pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#m${id})`} />
      </svg>
    </div>
  );
}
