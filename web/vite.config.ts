import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import cfg from '../site.config.json';

// The preview data file holds family details. It must never ship in a real build.
function dropDemoData(): Plugin {
  let outDir = 'dist';
  return {
    name: 'drop-demo-data',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      if (process.env.VITE_DEMO === '1') return;
      const f = resolve(outDir, 'demo-data.json');
      if (existsSync(f)) rmSync(f);
    },
  };
}

// The family's own name and addresses (site.config.json) go into the few static files that can't
// import it: the page title, the app manifest, the privacy notice, security.txt and the CSP headers.
const strip = (u: string) => u.replace(/\/+$/, '');
const site = strip(cfg.siteUrl);
const VALUES: Record<string, string> = {
  '%FAMILY%': cfg.familyName,
  '%APP_NAME%': cfg.appName,
  '%DOMAIN%': new URL(site).host,
  '%SITE_URL%': site,
  '%API_URL%': strip(cfg.apiUrl),
  '%PRIVACY_EMAIL%': cfg.privacyEmail,
  '%ADMIN_NAME%': cfg.admin.name,
  '%CONFIG_DATE%': new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
};
const fill = (t: string) => Object.entries(VALUES).reduce((s, [k, v]) => s.split(k).join(v), t);
const TEMPLATED = ['privacy.html', 'manifest.webmanifest', '_headers', '.well-known/security.txt'];

// The app icon: South Indian traditions keep the gopuram; every other family gets the banyan (icons/banyan/,
// drawn by npm run icon-art). Keep this list in step with lib/motif.ts (iconArt.test.tsx checks it).
const SOUTH = ['kannada', 'malayalam', 'tamil', 'telugu'];
const BANYAN: [string, string][] = [['icon-192.png', 'icon-192.png'], ['icon-512.png', 'icon-512.png'], ['icon-maskable-512.png', 'icon-maskable-512.png'],
  ['apple-touch-icon.png', 'apple-touch-icon.png'], ['favicon-32.png', 'icons/favicon-32.png'], ['favicon-64.png', 'icons/favicon-64.png'], ['icon-192.png', 'icons/icon-192.png']];
const useBanyan = !SOUTH.includes((cfg as { community?: string }).community || '');

function familySettings(): Plugin {
  let outDir = 'dist';
  return {
    name: 'family-settings',
    configResolved(c) { outDir = c.build.outDir; },
    transformIndexHtml: (html) => fill(html),
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const f = TEMPLATED.find((t) => req.url === '/' + t);
        if (!f) return next();
        res.end(fill(readFileSync(resolve(__dirname, 'public', f), 'utf8')));
      });
    },
    closeBundle() {
      for (const f of TEMPLATED) {
        const p = resolve(outDir, f);
        if (existsSync(p)) writeFileSync(p, fill(readFileSync(p, 'utf8')));
      }
      if (useBanyan) for (const [from, to] of BANYAN) {
        const src = resolve(__dirname, 'public/icons/banyan', from);
        if (existsSync(src) && existsSync(resolve(outDir, to))) copyFileSync(src, resolve(outDir, to));
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), dropDemoData(), familySettings()],
  build: { sourcemap: false },
  server: { fs: { allow: ['..'] } },
  test: { environment: 'node' },
} as any);
