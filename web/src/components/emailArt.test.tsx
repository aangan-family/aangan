// Email borders: every textile has a PNG in web/public/email/ (580 wide at 2x, like the first four).
// `npm run email-art` draws the new ones from components/Textiles.tsx; the first four came from Heritage.tsx.
import { describe, expect, it } from 'vitest';
import { existsSync, writeFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { TEXTILES } from '../lib/heritage';
import { SPECS, TextileBorder } from './Textiles';

const dir = new URL('../../public/email/', import.meta.url);
const draw = !!process.env.EMAIL_ART;

describe('email borders', () => {
  for (const t of TEXTILES) {
    it(`${t.name} has an email image`, async () => {
      const file = new URL(`${t.id}.png`, dir);
      if (draw && SPECS[t.id]) {
        const { Resvg } = await import('@resvg/resvg-js');
        const svg = renderToStaticMarkup(<TextileBorder id={t.id} width={580} />);
        writeFileSync(file, new Resvg(svg, { fitTo: { mode: 'zoom', value: 2 }, background: '#ffffff' }).render().asPng());
      }
      expect(existsSync(file), `web/public/email/${t.id}.png is missing: run npm run email-art`).toBe(true);
    });
  }
});
