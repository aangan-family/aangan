import { useId, type ReactNode } from 'react';

/*
 * Woven borders from each community's traditional dress (catalogue in lib/heritage.ts TEXTILES).
 * Each is an edge colour, thin gold or coloured lines, and a repeating motif tile; drawn, so it stays sharp.
 * The same drawings become the email PNGs (web/public/email/<id>.png, `npm run email-art`).
 */

interface Spec {
  edge: string;          // the outer bands
  line: string;          // the thin lines either side of the motif band
  ground: string;        // behind the motif
  w: number; h: number;  // motif tile size (h is the motif band height in the full border)
  tile: (c: Spec) => ReactNode;
}

const GOLD = '#D9AE45', GOLD_L = '#F3D77A';
const diamond = (cx: number, cy: number, r: number) => `M${cx} ${cy - r} L${cx + r} ${cy} L${cx} ${cy + r} L${cx - r} ${cy} Z`;
const petals = (cx: number, cy: number, r: number, n: number, pr: number, fill: string, key = '') =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return <ellipse key={key + i} cx={cx + Math.cos(a) * r} cy={cy + Math.sin(a) * r} rx={pr} ry={pr * 0.62} transform={`rotate(${(a * 180) / Math.PI} ${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r})`} fill={fill} />;
  });
/** a stepped (ikat) diamond made of small squares */
const stepped = (cx: number, cy: number, n: number, s: number, fill: string, key = '') => {
  const out: ReactNode[] = [];
  for (let y = -n; y <= n; y++) { const k = n - Math.abs(y); out.push(<rect key={`${key}${y}`} x={cx - (k + 0.5) * s} y={cy + y * s - s / 2} width={(2 * k + 1) * s} height={s} fill={fill} />); }
  return out;
};
const paisley = (x: number, y: number, s: number, fill: string, stroke?: string) =>
  <path d={`M${x} ${y + 9 * s} C${x - 7 * s} ${y + 9 * s} ${x - 7 * s} ${y - 3 * s} ${x} ${y - 3 * s} C${x + 4 * s} ${y - 3 * s} ${x + 6 * s} ${y - 7 * s} ${x + 3 * s} ${y - 10 * s} C${x + 9 * s} ${y - 7 * s} ${x + 8 * s} ${y + 9 * s} ${x} ${y + 9 * s} Z`} fill={fill} stroke={stroke} strokeWidth={stroke ? 0.8 : 0} />;

export const SPECS: Record<string, Spec> = {
  kasavu: { edge: GOLD, line: '#F6F0DD', ground: '#F6F0DD', w: 14, h: 22, tile: () => <>
    <rect y="3" width="14" height="5" fill={GOLD} /><rect y="9.5" width="14" height="1.2" fill={GOLD} />
    <path d={diamond(7, 16, 3)} fill={GOLD} /><rect y="21" width="14" height="1" fill={GOLD_L} /></> },
  pochampally: { edge: '#1F2F6B', line: '#B3122E', ground: '#FBF8F0', w: 24, h: 26, tile: () => <>
    {stepped(6, 13, 3, 2, '#B3122E', 'a')}{stepped(18, 13, 3, 2, '#1F2F6B', 'b')}{stepped(6, 13, 1, 2, '#FBF8F0', 'c')}{stepped(18, 13, 1, 2, '#FBF8F0', 'd')}</> },
  ilkal: { edge: '#A3121F', line: '#FBF8F0', ground: '#6E0F17', w: 12, h: 24, tile: () => <>
    <path d="M0 24 L6 8 L12 24 Z" fill="#FBF8F0" /><path d="M2.5 24 L6 14 L9.5 24 Z" fill="#A3121F" />
    {[[3, 4], [9, 4], [6, 1.5]].map(([x, y]) => <rect key={`${x}${y}`} x={x - 1} y={y - 1} width="2" height="2" fill="#F2C12E" />)}</> },
  'mysore-peta': { edge: '#7A1020', line: GOLD, ground: '#7A1020', w: 16, h: 22, tile: () => <>
    <rect y="4" width="16" height="2" fill={GOLD} /><rect y="16" width="16" height="2" fill={GOLD} />
    <circle cx="8" cy="11" r="2.4" fill={GOLD_L} /><circle cx="0" cy="11" r="1.2" fill={GOLD} /><circle cx="16" cy="11" r="1.2" fill={GOLD} /></> },
  banarasi: { edge: '#8B0E1A', line: GOLD, ground: '#8B0E1A', w: 26, h: 28, tile: () => <>
    {paisley(9, 15, 1, GOLD)}<circle cx="21" cy="7" r="1.4" fill={GOLD_L} /><circle cx="21" cy="21" r="1.4" fill={GOLD_L} /></> },
  leheriya: { edge: '#C2185B', line: GOLD, ground: '#F2C12E', w: 24, h: 24, tile: () => <>
    {['#E4407B', '#2E9E5B', '#2E6FC9'].map((c, i) => <path key={c} d={`M${-24 + i * 8} 24 L${i * 8} 0 L${i * 8 + 4} 0 L${-20 + i * 8} 24 Z M${i * 8} 24 L${24 + i * 8} 0 L${28 + i * 8} 0 L${4 + i * 8} 24 Z`} fill={c} />)}</> },
  phulkari: { edge: '#8E1B2C', line: '#F2B632', ground: '#8E1B2C', w: 26, h: 26, tile: () => <>
    <rect x="7" y="7" width="12" height="12" fill="#F2B632" /><rect x="7" y="7" width="12" height="12" fill="#E8762B" transform="rotate(45 13 13)" />
    <path d={diamond(13, 13, 4)} fill="#F7D774" /><circle cx="0" cy="0" r="2" fill="#F2B632" /><circle cx="26" cy="26" r="2" fill="#F2B632" /></> },
  khes: { edge: '#1F3A93', line: '#FBF8F0', ground: '#FBF8F0', w: 16, h: 24, tile: () => <>
    <rect x="3" width="2" height="24" fill="#1F3A93" /><rect x="11" width="2" height="24" fill="#1F3A93" />
    <rect y="5" width="16" height="2" fill="#1F3A93" /><rect y="17" width="16" height="2" fill="#1F3A93" />
    <rect x="7" y="10" width="2" height="4" fill="#C1121F" /></> },
  bandhani: { edge: '#9E1B32', line: '#F2C12E', ground: '#C2182B', w: 18, h: 24, tile: () => <>
    {[[9, 6], [5, 12], [13, 12], [9, 18], [9, 12]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === 4 ? 1.6 : 1.4} fill={i === 4 ? '#F2C12E' : '#FFF6E8'} />)}
    <circle cx="0" cy="0" r="1.1" fill="#FFF6E8" /><circle cx="18" cy="24" r="1.1" fill="#FFF6E8" /></> },
  ajrak: { edge: '#9E1B32', line: '#111', ground: '#1B2A55', w: 22, h: 22, tile: () => <>
    {[[11, 6], [16, 11], [11, 16], [6, 11]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="4" fill="#9E1B32" stroke="#111" strokeWidth=".8" />)}
    <path d={diamond(11, 11, 2.6)} fill="#FBF8F0" /><path d={diamond(0, 0, 2)} fill="#FBF8F0" /><path d={diamond(22, 22, 2)} fill="#FBF8F0" /></> },
  paithani: { edge: '#1E7A4B', line: GOLD, ground: '#5B2A86', w: 28, h: 28, tile: () => <>
    {petals(14, 14, 5, 8, 3.4, GOLD, 'p')}<circle cx="14" cy="14" r="2.6" fill="#E9423C" /><circle cx="0" cy="0" r="1.6" fill={GOLD_L} /><circle cx="28" cy="28" r="1.6" fill={GOLD_L} /></> },
  pheta: { edge: '#E8781E', line: GOLD, ground: '#E8781E', w: 12, h: 24, tile: () => <>
    <path d="M-6 24 L6 0 L9 0 L-3 24 Z M6 24 L18 0 L21 0 L9 24 Z" fill={GOLD_L} opacity=".9" /></> },
  'laal-paar': { edge: '#C1121F', line: '#C1121F', ground: '#FBF8F0', w: 16, h: 18, tile: () => <>
    <path d={diamond(8, 9, 2.4)} fill="#C1121F" /><rect y="16.5" width="16" height="1" fill="#C1121F" opacity=".45" /></> },
  dhuti: { edge: '#1F1F1F', line: '#C1121F', ground: '#FBF8F0', w: 12, h: 12, tile: () => <>
    <rect y="3" width="12" height="1.4" fill="#C1121F" /><rect y="8" width="12" height=".8" fill="#1F1F1F" /></> },
  chikankari: { edge: '#BFE3D3', line: '#FFFFFF', ground: '#DCEFE6', w: 24, h: 24, tile: () => <>
    {petals(12, 12, 3.6, 6, 2.4, '#FFFFFF', 'c')}<circle cx="12" cy="12" r="1.4" fill="#DCEFE6" stroke="#fff" strokeWidth=".6" />
    <path d="M0 22 C6 18 6 26 12 22 C18 18 18 26 24 22" fill="none" stroke="#fff" strokeWidth=".8" /></> },
  zardozi: { edge: '#5A0F1F', line: GOLD, ground: '#5A0F1F', w: 24, h: 24, tile: () => <>
    {petals(12, 12, 4, 6, 2.6, GOLD, 'z')}<circle cx="12" cy="12" r="1.8" fill={GOLD_L} />
    {[[0, 0], [24, 0], [0, 24], [24, 24]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.6" fill={GOLD} />)}</> },
  sambalpuri: { edge: '#1C1C1C', line: '#C1121F', ground: '#1C1C1C', w: 24, h: 26, tile: () => <>
    {stepped(12, 13, 4, 2, '#C1121F', 's')}{stepped(12, 13, 2, 2, '#FBF8F0', 't')}{stepped(12, 13, 0, 2, '#C1121F', 'u')}
    <path d="M0 0 L3 4 L6 0 Z M18 0 L21 4 L24 0 Z M0 26 L3 22 L6 26 Z M18 26 L21 22 L24 26 Z" fill="#FBF8F0" /></> },
  mekhela: { edge: '#A3121F', line: '#2B1B0E', ground: '#D8B25B', w: 24, h: 26, tile: () => <>
    <path d={diamond(12, 13, 8)} fill="#A3121F" stroke="#2B1B0E" strokeWidth=".8" /><path d={diamond(12, 13, 4)} fill="#D8B25B" />
    <path d={diamond(12, 13, 1.6)} fill="#2B1B0E" /></> },
  gamosa: { edge: '#C1121F', line: '#C1121F', ground: '#FBF8F0', w: 22, h: 24, tile: () => <>
    <path d={diamond(11, 12, 6)} fill="none" stroke="#C1121F" strokeWidth="1.6" /><path d={diamond(11, 12, 2)} fill="#C1121F" />
    <path d="M0 12 L4 8 L4 16 Z M22 12 L18 8 L18 16 Z" fill="#C1121F" /></> },
  kunbi: { edge: '#7E1418', line: '#FBF8F0', ground: '#B22222', w: 14, h: 22, tile: () => <>
    <rect x="6" width="2" height="22" fill="#7E1418" /><rect y="10" width="14" height="2" fill="#7E1418" />
    <rect x="2" width=".8" height="22" fill="#FBF8F0" opacity=".7" /><rect y="4" width="14" height=".8" fill="#FBF8F0" opacity=".7" /></> },
  kani: { edge: '#0F4C5C', line: GOLD, ground: '#0F4C5C', w: 26, h: 28, tile: () => <>
    {paisley(10, 15, 1, '#B3122E', GOLD)}<path d="M10 12 C8 13 8 16 10 17" fill="none" stroke={GOLD_L} strokeWidth=".9" />
    <circle cx="22" cy="6" r="1.4" fill={GOLD} /><circle cx="22" cy="22" r="1.4" fill="#E9A23B" /></> },
  gara: { edge: '#141414', line: '#7A5C9E', ground: '#141414', w: 26, h: 26, tile: () => <>
    {petals(9, 13, 3.4, 5, 2.4, '#F2A7C3', 'g')}<circle cx="9" cy="13" r="1.6" fill="#FBF8F0" />
    <path d="M14 15 C18 12 21 14 24 10" fill="none" stroke="#6DBE8C" strokeWidth="1" /><ellipse cx="19" cy="12" rx="2.2" ry="1.1" fill="#6DBE8C" transform="rotate(-30 19 12)" />
    <circle cx="22" cy="21" r="1.2" fill="#FBF8F0" /></> },
  // Nov 2026 (2): the north-east and Nepal
  dhaka: { edge: '#B3122E', line: '#1F2A44', ground: '#FBF8F0', w: 24, h: 24, tile: () => <>
    <path d="M0 24 L6 12 L12 24 Z" fill="#B3122E" /><path d="M12 24 L18 12 L24 24 Z" fill="#1F2A44" /><path d="M6 12 L12 0 L18 12 Z" fill="#E0A21B" />
    <path d={diamond(12, 17, 2.2)} fill="#2E7D4F" /><path d={diamond(0, 6, 2.2)} fill="#2E7D4F" /><path d={diamond(24, 6, 2.2)} fill="#2E7D4F" /></> },
  phanek: { edge: '#4A1A5C', line: '#C2185B', ground: '#5E1F78', w: 18, h: 24, tile: () => <>
    <rect y="3" width="18" height="2" fill="#C2185B" /><rect y="8" width="18" height="1" fill="#F3D77A" /><rect y="12" width="18" height="3" fill="#2B0F38" />
    <rect y="18" width="18" height="1" fill="#F3D77A" /><rect y="20" width="18" height="2" fill="#C2185B" /></> },
  puan: { edge: '#111111', line: '#D7263D', ground: '#111111', w: 24, h: 26, tile: () => <>
    <rect y="4" width="24" height="3" fill="#D7263D" /><rect y="19" width="24" height="3" fill="#D7263D" />
    <path d="M2 13 L6 9 L10 13 L6 17 Z M14 13 L18 9 L22 13 L18 17 Z" fill="none" stroke="#F2C14E" strokeWidth="1.2" /><path d={diamond(12, 13, 1.6)} fill="#2E8B57" /></> },
  jainsem: { edge: '#7A1F2B', line: '#E8C468', ground: '#9C2A36', w: 20, h: 22, tile: () => <>
    <rect x="9" width="2" height="22" fill="#7A1F2B" /><rect y="10" width="20" height="2" fill="#7A1F2B" />
    <rect x="3" width="1" height="22" fill="#E8C468" opacity=".8" /><rect y="4" width="20" height="1" fill="#E8C468" opacity=".8" /><rect x="15" width="1" height="22" fill="#E8C468" opacity=".8" /><rect y="17" width="20" height="1" fill="#E8C468" opacity=".8" /></> },
};

/** A border from a community's dress. `slim` is the thin band under the breadcrumb bar. `width` fixes the size (emails). */
export function TextileBorder({ id, slim = false, width }: { id: string; slim?: boolean; width?: number }) {
  const s = SPECS[id];
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  if (!s) return null;
  const W = width ?? '100%';
  const scale = slim ? 10 / s.h : 1;
  const tile = <pattern id={`m${uid}`} width={s.w} height={s.h} patternUnits="userSpaceOnUse" patternTransform={`translate(0 ${slim ? 3 : 10}) scale(${scale})`}>
    <rect width={s.w} height={s.h} fill={s.ground} />{s.tile(s)}
  </pattern>;
  if (slim) return (
    <svg className="weave slim" width={W} height="16" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><defs>{tile}</defs>
      <rect width="100%" height="2" fill={s.edge} /><rect y="2" width="100%" height="1" fill={s.line} /><rect y="3" width="100%" height="10" fill={`url(#m${uid})`} />
      <rect y="13" width="100%" height="1" fill={s.line} /><rect y="14" width="100%" height="2" fill={s.edge} />
    </svg>
  );
  const H = 10 + s.h + 10;
  return (
    <svg className="weave" width={W} height={H} aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><defs>{tile}</defs>
      <rect width="100%" height="7" fill={s.edge} /><rect y="7" width="100%" height="1.5" fill={s.line} /><rect y="8.5" width="100%" height="1.5" fill={s.edge} />
      <rect y="10" width="100%" height={s.h} fill={`url(#m${uid})`} />
      <rect y={10 + s.h} width="100%" height="1.5" fill={s.edge} /><rect y={11.5 + s.h} width="100%" height="1.5" fill={s.line} /><rect y={13 + s.h} width="100%" height="7" fill={s.edge} />
    </svg>
  );
}
