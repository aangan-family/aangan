// The app icon for families whose traditions aren't South Indian: a banyan in a courtyard (South Indian families keep the
// gopuram). `npm run icon-art` draws the PNGs into web/public/icons/banyan/; vite.config.ts copies them over the
// standard icon names at build time when site.config.json's community isn't a South Indian one.
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { BanyanArt } from './Banyan';
import { MOTIF } from '../lib/motif';

const dir = new URL('../../public/icons/banyan/', import.meta.url);
const draw = !!process.env.ICON_ART;
// name, size, how much of the square the tree fills (maskable icons keep to the middle 80%)
const ICONS: [string, number, number][] = [['icon-192.png', 192, 0.86], ['icon-512.png', 512, 0.86], ['icon-maskable-512.png', 512, 0.66], ['apple-touch-icon.png', 180, 0.8], ['favicon-32.png', 32, 0.98], ['favicon-64.png', 64, 0.94]];

function icon(fill: number) {
  const s = 500 * fill, o = (500 - s) / 2;
  return renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
      <rect width="500" height="500" fill="#2a0906" />
      <circle cx="250" cy="250" r={f(s * 0.5)} fill="#FFF3E0" />
      <g transform={`translate(${o + s * 0.1} ${o + s * 0.06}) scale(${(s * 0.8) / 500})`}><BanyanArt bands={4} roots={false} /></g>
    </svg>,
  );
}
const f = (n: number) => Math.round(n * 10) / 10;

describe('banyan app icon', () => {
  it('south Indian traditions are the ones that keep the gopuram icon', () => {
    // vite.config.ts keeps its own copy of this list (it can't import the website's code); they must match
    const south = Object.entries(MOTIF).filter(([, m]) => m === 'kolam').map(([k]) => k).sort();
    expect(south).toEqual(['kannada', 'malayalam', 'tamil', 'telugu']);
  });
  for (const [name, size, fill] of ICONS) {
    it(`${name} exists`, async () => {
      const file = new URL(name, dir);
      if (draw) {
        mkdirSync(dir, { recursive: true });
        const { Resvg } = await import('@resvg/resvg-js');
        writeFileSync(file, new Resvg(icon(fill), { fitTo: { mode: 'width', value: size } }).render().asPng());
      }
      expect(existsSync(file), `web/public/icons/banyan/${name} is missing: run npm run icon-art`).toBe(true);
    });
  }
});
